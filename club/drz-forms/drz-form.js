import { trackEvent } from "../../assets/visitor-tracker.js";

const TOKEN_KEY = "drz-club-token";
const ADMIN_TOKEN_KEY = "drz-forms-export-token";
const WORKER_URL = "https://drz-club-portal.drz-academy.workers.dev";
const FORM_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SCHEMA_VERSION = "20260831j";

function workerEndpoint() {
  const params = new URLSearchParams(location.search);
  if (params.get("api")) return params.get("api").replace(/\/$/, "");
  const meta = document.querySelector('meta[name="club-portal-endpoint"]');
  const fromMeta = (meta?.getAttribute("content") || "").trim().replace(/\/$/, "");
  return fromMeta || WORKER_URL;
}

function $(id) {
  return document.getElementById(id);
}

function showStatus(el, message, kind = "") {
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
  el.classList.remove("error", "ok");
  if (kind) el.classList.add(kind);
}

function showView(id) {
  for (const view of ["view-loading", "view-error", "view-form", "view-done"]) {
    const el = $(view);
    if (!el) continue;
    const on = view === id;
    el.classList.toggle("hidden", !on);
    el.hidden = !on;
  }
}

function currentToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function qs(name) {
  return new URLSearchParams(location.search).get(name) || "";
}

function sanitizeId(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return FORM_ID_RE.test(value) ? value : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isRequired(question) {
  return question?.obligatoria !== false;
}

function formQuestions(schema) {
  if (Array.isArray(schema?.secciones) && schema.secciones.length) {
    return schema.secciones.flatMap((section) => section.preguntas || []);
  }
  return Array.isArray(schema?.preguntas) ? schema.preguntas : [];
}

function formSections(schema) {
  if (Array.isArray(schema?.secciones) && schema.secciones.length) return schema.secciones;
  return [{ id: "main", titulo: "", intro: "", preguntas: schema?.preguntas || [] }];
}

function loginRedirect() {
  const next = encodeURIComponent(`${location.pathname}${location.search}`);
  location.replace(`/club/?next=${next}`);
}

function takeTokenFromUrl() {
  const fromUrl = qs("TOKEN") || qs("token");
  if (fromUrl) {
    const url = new URL(location.href);
    url.searchParams.delete("TOKEN");
    url.searchParams.delete("token");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return fromUrl;
}

function storedAdminToken() {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function saveAdminToken(token) {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

let adminUnlocked = false;

function isAdmin() {
  return adminUnlocked;
}

async function verifyExportToken(token) {
  const value = String(token || "").trim();
  if (!value) return false;
  const endpoint = workerEndpoint();
  if (!endpoint) return false;
  try {
    const res = await fetch(`${endpoint}/forms/export-auth`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${value}` },
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.ok !== false;
  } catch {
    return false;
  }
}

async function unlockAdminIfPresent() {
  const fromUrl = takeTokenFromUrl();
  const candidate = fromUrl || storedAdminToken();
  if (!candidate) {
    adminUnlocked = false;
    return "";
  }
  const ok = await verifyExportToken(candidate);
  if (!ok) {
    saveAdminToken("");
    adminUnlocked = false;
    return "";
  }
  saveAdminToken(candidate);
  adminUnlocked = true;
  return candidate;
}

async function api(path, { method = "GET", body, token } = {}) {
  const endpoint = workerEndpoint();
  if (!endpoint) throw new Error("El formulario aún no está conectado al servidor.");
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.message || data.error || "request_failed");
    err.code = data.error;
    err.status = res.status;
    err.certificado_url = data.certificado_url || "";
    throw err;
  }
  return data;
}

function mapError(err) {
  const code = err.code || "";
  if (code === "unauthorized") return "Tu sesión venció. Entra de nuevo al Club para continuar.";
  if (code === "not_enrolled") return "No encontramos este curso en tu historial del Club.";
  if (code === "already_submitted") return "Ya enviaste esta evaluación.";
  if (code === "invalid_answers" || String(code).startsWith("missing:") || String(code).startsWith("invalid:")) {
    return "Falta responder alguna pregunta obligatoria, o una respuesta no es válida.";
  }
  if (code === "too_many_requests") return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (code === "schema_missing") return "Este formulario todavía no está publicado. Inténtalo más tarde.";
  return err.message || "No se pudo enviar el formulario.";
}

function scoreRange(question) {
  const min = Number.isFinite(Number(question.min)) ? Number(question.min) : 1;
  const max = Number.isFinite(Number(question.max)) ? Number(question.max) : 5;
  const step = Number.isFinite(Number(question.step)) && Number(question.step) > 0 ? Number(question.step) : 1;
  return { min, max, step };
}

function formatScaleValue(value, step) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const text = String(step);
  const decimals = text.includes(".") ? text.split(".")[1].length : 0;
  return n.toFixed(decimals);
}

function emotionIndexForValue(value, min, max, count) {
  if (count <= 1) return 0;
  const span = max - min;
  const t = span === 0 ? 0 : (Number(value) - min) / span;
  return Math.min(count - 1, Math.max(0, Math.round(t * (count - 1))));
}

function dropdownOptions(question, cursos) {
  if (question.fuente === "cursos") {
    return (cursos || []).map((curso) => ({
      value: String(curso.id || ""),
      label: String(curso.nombre || curso.id || ""),
    })).filter((opt) => opt.value);
  }
  return (question.opciones || []).map((opt) => {
    if (opt && typeof opt === "object") {
      const value = String(opt.value ?? opt.id ?? "");
      return { value, label: String(opt.label ?? opt.nombre ?? value) };
    }
    return { value: String(opt), label: String(opt) };
  }).filter((opt) => opt.value);
}

function isBlank(value) {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value) && !value.length) return true;
  return false;
}

function initialValue(question, prefill) {
  const id = String(question.id || "").trim();
  if (!isBlank(prefill[id])) return prefill[id];
  if (!isBlank(question.default)) return question.default;
  return "";
}

function initialList(question, prefill) {
  const raw = initialValue(question, prefill);
  if (isBlank(raw)) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

function inScaleRange(n, min, max, step) {
  if (!Number.isFinite(n) || n < min || n > max) return false;
  const ticks = (n - min) / step;
  return Math.abs(ticks - Math.round(ticks)) <= 1e-6;
}

function renderChoiceOptions(question, { name, id, labelId, required, selected, multiple, cursos }) {
  const reqAttr = !multiple && required ? "required" : "";
  const type = multiple ? "checkbox" : "radio";
  const picked = new Set((selected || []).map(String));
  return dropdownOptions(question, cursos).map((opt, i) => {
    const oid = `${name}-${i}`;
    const checked = picked.has(String(opt.value)) ? "checked" : "";
    return `<label class="option" for="${oid}"><input id="${oid}" type="${type}" name="${id}" value="${escapeHtml(opt.value)}" ${reqAttr} ${checked}> <span>${escapeHtml(opt.label)}</span></label>`;
  }).join("");
}

function renderQuestion(question, index, { cursos = [], prefill = {} } = {}) {
  const id = String(question.id || "").trim();
  const enunciado = escapeHtml(question.enunciado || `Pregunta ${index + 1}`);
  const tipo = String(question.tipo || "texto").trim();
  const required = isRequired(question);
  const name = `q-${id}`;
  const labelId = `label-${id}`;
  const reqAttr = required ? "required" : "";
  const filled = initialValue(question, prefill);
  let control = "";

  if (tipo === "parrafo") {
    control = `<textarea id="${name}" name="${id}" ${reqAttr} aria-labelledby="${labelId}">${escapeHtml(filled)}</textarea>`;
  } else if (tipo === "radio" || tipo === "seleccion_unica") {
    const selected = isBlank(filled) ? [] : [String(filled)];
    const opciones = renderChoiceOptions(question, {
      name, id, labelId, required, selected, multiple: false, cursos,
    });
    control = `<div class="options" role="radiogroup" aria-labelledby="${labelId}">${opciones}</div>`;
  } else if (tipo === "opciones" || tipo === "seleccion_multiple") {
    const selected = initialList(question, prefill);
    const opciones = renderChoiceOptions(question, {
      name, id, labelId, required, selected, multiple: true, cursos,
    });
    control = `<div class="options" data-multiple="${id}" aria-labelledby="${labelId}">${opciones}</div>`;
  } else if (tipo === "puntaje") {
    const { min, max } = scoreRange(question);
    const opts = [];
    for (let n = min; n <= max; n += 1) {
      const checked = String(filled) === String(n) ? "checked" : "";
      opts.push(
        `<label class="score-opt"><input type="radio" name="${id}" value="${n}" ${reqAttr} ${checked}><span>${n}</span></label>`,
      );
    }
    control = `<div class="score" role="radiogroup" aria-labelledby="${labelId}">${opts.join("")}</div>`;
  } else if (tipo === "escala_scroll") {
    const { min, max, step } = scoreRange(question);
    const mid = min + Math.round((max - min) / (2 * step)) * step;
    const minLabel = escapeHtml(question.min_label || String(min));
    const maxLabel = escapeHtml(question.max_label || String(max));
    const emotions = Array.isArray(question.emotions) ? question.emotions.map((item) => String(item)) : [];
    const candidate = Number(filled);
    const touched = !isBlank(filled) && inScaleRange(candidate, min, max, step);
    const value = touched ? candidate : mid;
    const activeEmotion = emotions.length ? emotionIndexForValue(value, min, max, emotions.length) : -1;
    const faces = emotions
      .map((face, i) => `<span class="scale-emotion${touched && i === activeEmotion ? " active" : ""}" data-i="${i}">${escapeHtml(face)}</span>`)
      .join("");
    const emotionRow = faces ? `<div class="scale-emotions" aria-hidden="true">${faces}</div>` : "";
    const flipped = Boolean(question.flip_aleatorio) && Math.random() < 0.5;
    const flipClass = flipped ? " flipped" : "";
    control = `<div class="scale-scroll${flipClass}" data-scale="${escapeHtml(id)}" data-required="${required ? "1" : "0"}" data-min="${min}" data-max="${max}" data-step="${step}" data-flipped="${flipped ? "1" : "0"}">
      <div class="scale-ends"><span>${minLabel}</span><span>${maxLabel}</span></div>
      ${emotionRow}
      <input type="range" id="${name}" name="${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-touched="${touched ? "1" : "0"}" aria-labelledby="${labelId}">
      <p class="scale-readout${touched ? "" : " pending"}">${touched ? formatScaleValue(value, step) : "Sin marcar — mueve la escala"}</p>
    </div>`;
  } else if (tipo === "lista_desplegable") {
    const options = dropdownOptions(question, cursos);
    const opts = [`<option value="">Selecciona…</option>`].concat(
      options.map((opt) => {
        const selected = String(filled) === String(opt.value) ? "selected" : "";
        return `<option value="${escapeHtml(opt.value)}" ${selected}>${escapeHtml(opt.label)}</option>`;
      }),
    );
    control = `<select id="${name}" name="${id}" ${reqAttr} aria-labelledby="${labelId}">${opts.join("")}</select>`;
  } else {
    control = `<input id="${name}" name="${id}" type="text" value="${escapeHtml(filled)}" ${reqAttr} aria-labelledby="${labelId}">`;
  }

  const mark = required
    ? `<span class="required" aria-hidden="true">*</span>`
    : `<span class="optional-tag">(opcional)</span>`;
  const helpText = question.explicacion || question.ayuda || "";
  const help = helpText ? `<span class="question-help">${escapeHtml(helpText)}</span>` : "";

  return `<div class="question" data-id="${escapeHtml(id)}" data-tipo="${escapeHtml(tipo)}" data-required="${required ? "1" : "0"}">
    <span class="question-label" id="${labelId}">${index + 1}. ${enunciado}${mark}</span>
    ${help}
    ${control}
  </div>`;
}

function renderForm(schema, { cursos = [], prefill = {} } = {}) {
  let index = 0;
  return formSections(schema)
    .map((section) => {
      const title = section.titulo ? `<h2 class="section-title">${escapeHtml(section.titulo)}</h2>` : "";
      const introText = section.explicacion || section.intro || "";
      const intro = introText ? `<p class="section-intro">${escapeHtml(introText)}</p>` : "";
      const questions = (section.preguntas || [])
        .map((question) => {
          const html = renderQuestion(question, index, { cursos, prefill });
          index += 1;
          return html;
        })
        .join("");
      return `<section class="form-section" data-section="${escapeHtml(section.id || "")}">${title}${intro}${questions}</section>`;
    })
    .join("");
}

function bindScales(root) {
  root.querySelectorAll("input[type='range']").forEach((input) => {
    const wrap = input.parentElement;
    const readout = wrap?.querySelector(".scale-readout");
    const faces = [...(wrap?.querySelectorAll(".scale-emotion") || [])];
    const min = Number(wrap?.dataset.min);
    const max = Number(wrap?.dataset.max);
    const step = Number(wrap?.dataset.step) || 1;
    const paint = () => {
      const touched = input.dataset.touched === "1";
      const value = Number(input.value);
      const active = faces.length ? emotionIndexForValue(value, min, max, faces.length) : -1;
      const face = touched && active >= 0 ? faces[active]?.textContent || "" : "";
      if (readout) {
        readout.textContent = touched
          ? `${formatScaleValue(value, step)}${face ? ` ${face}` : ""}`
          : "Sin marcar — mueve la escala";
        readout.classList.toggle("pending", !touched);
      }
      faces.forEach((el, i) => el.classList.toggle("active", touched && i === active));
    };
    const touch = () => {
      input.dataset.touched = "1";
      paint();
    };
    input.addEventListener("pointerdown", touch);
    input.addEventListener("input", touch);
    input.addEventListener("change", touch);
    paint();
  });
}

function collectAnswers(schema) {
  const answers = {};
  const missing = [];
  for (const question of formQuestions(schema)) {
    const id = String(question.id || "").trim();
    if (!id) continue;
    const tipo = String(question.tipo || "texto").trim();
    const required = isRequired(question);
    if (tipo === "opciones" || tipo === "seleccion_multiple") {
      const selected = [...document.querySelectorAll(`input[name="${CSS.escape(id)}"]:checked`)].map(
        (el) => el.value,
      );
      if (!selected.length) {
        if (required) missing.push(id);
      } else {
        answers[id] = selected;
      }
    } else if (tipo === "puntaje" || tipo === "radio" || tipo === "seleccion_unica") {
      const selected = document.querySelector(`input[name="${CSS.escape(id)}"]:checked`);
      if (!selected) {
        if (required) missing.push(id);
      } else {
        answers[id] = tipo === "puntaje" ? Number(selected.value) : selected.value;
      }
    } else if (tipo === "escala_scroll") {
      const el = document.querySelector(`input[name="${CSS.escape(id)}"]`);
      const touched = el?.dataset.touched === "1";
      if (!touched) {
        if (required) missing.push(id);
      } else {
        answers[id] = Number(el.value);
      }
    } else {
      const el = document.querySelector(`[name="${CSS.escape(id)}"]`);
      const value = String(el?.value || "").trim();
      if (!value) {
        if (required) missing.push(id);
      } else {
        answers[id] = value;
      }
    }
  }
  return { answers, missing };
}

function showDone(status) {
  const cursoNombre = status.curso_nombre || "";
  if (cursoNombre) {
    $("done-lead").textContent = `Ya registramos tus respuestas sobre ${cursoNombre}.`;
  }
  const certUrl = String(status.certificado_url || "").trim();
  if (certUrl) {
    $("cert-link").href = certUrl;
    $("cert-box").hidden = false;
    $("cert-pending").hidden = true;
    $("cert-link").onclick = () => {
      if (isAdmin()) return;
      trackEvent("club_form_certificado", { curso: cursoNombre, href: certUrl });
    };
  } else {
    $("cert-box").hidden = true;
    $("cert-pending").hidden = false;
  }
  showView("view-done");
}

function failBoot(message) {
  $("boot-error").textContent = message;
  $("form-intro").textContent = "No pudimos abrir el formulario.";
  showView("view-error");
}

async function loadSchema(formId) {
  const res = await fetch(`/club/drz-forms/${encodeURIComponent(formId)}.json?v=${SCHEMA_VERSION}`);
  if (!res.ok) throw new Error("form_not_found");
  const schema = await res.json();
  if (!schema || !formQuestions(schema).length) {
    throw new Error("form_empty");
  }
  return schema;
}

async function loadCursos() {
  try {
    const data = await api("/forms/catalog");
    if (Array.isArray(data.cursos) && data.cursos.length) return data.cursos;
  } catch {
    /* fall through */
  }
  for (const path of ["/club/drz-forms/cursos-opciones.json", "/club/cursos.json"]) {
    try {
      const res = await fetch(`${path}?v=${SCHEMA_VERSION}`);
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.cursos;
      if (!Array.isArray(list) || !list.length) continue;
      return list
        .filter((curso) => curso?.id && curso?.nombre && !curso.next_course)
        .map((curso) => ({ id: String(curso.id), nombre: String(curso.nombre) }));
    } catch {
      /* try next source */
    }
  }
  return [];
}

function stampFilename(formId) {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${formId}-${day}.csv`;
}

async function downloadCsv(formId) {
  const endpoint = workerEndpoint();
  const token = storedAdminToken();
  if (!token) throw new Error("No hay sesión de administrador.");
  showStatus($("admin-status"), "Preparando el CSV…");
  const res = await fetch(`${endpoint}/forms/export?form=${encodeURIComponent(formId)}`, {
    headers: { Accept: "text/csv", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 404 || data.error === "not_found") {
      throw new Error("El exportador CSV aún no está publicado en el Worker. Despliega el Worker y vuelve a intentar.");
    }
    throw new Error(data.message || data.error || "No se pudieron descargar las respuestas.");
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = stampFilename(formId);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

function enableAdminBar(formId) {
  const bar = $("admin-bar");
  if (!bar) return;
  bar.hidden = false;
  bar.classList.remove("hidden");
  const btn = $("admin-csv");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await downloadCsv(formId);
      showStatus($("admin-status"), "Descarga lista.", "ok");
    } catch (err) {
      showStatus($("admin-status"), err.message || "No se pudo descargar el CSV.", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function paintForm(schema, { cursos, prefill, submitMode }) {
  $("questions").innerHTML = renderForm(schema, { cursos, prefill });
  bindScales($("questions"));
  showView("view-form");
  const submit = $("submit-form");
  if (submitMode === "preview") {
    submit.disabled = true;
    submit.textContent = "Vista previa (no se envía)";
    showStatus($("form-status"), "Vista previa: las respuestas no se guardan.", "ok");
  } else if (submitMode === "admin-only") {
    submit.disabled = true;
    submit.textContent = "Enviar evaluación";
    showStatus($("form-status"), "Entra al Club para enviar una evaluación. El CSV sí está disponible.", "ok");
  } else {
    submit.disabled = false;
    submit.textContent = "Enviar evaluación";
  }
}

async function boot() {
  const formId = sanitizeId(qs("form") || "evaluacion-curso");
  const cursoId = sanitizeId(qs("curso"));
  const preview = qs("preview") === "1";
  const adminToken = await unlockAdminIfPresent();
  const admin = Boolean(adminToken);
  if (!formId) {
    failBoot("El enlace del formulario no es válido.");
    return;
  }

  let schema;
  try {
    schema = await loadSchema(formId);
  } catch {
    failBoot("No encontramos ese formulario.");
    return;
  }

  $("form-title").innerHTML = escapeHtml(schema.titulo || "Formulario").replace(
    /^(Evaluación del )(.*)$/i,
    "$1<em>$2</em>",
  );
  $("form-intro").textContent = schema.intro || "Las preguntas marcadas con * son obligatorias.";

  if (admin) enableAdminBar(formId);

  const cursos = await loadCursos();
  const sessionToken = currentToken();

  if (preview && !sessionToken) {
    paintForm(schema, {
      cursos,
      prefill: cursoId ? { curso: cursoId } : {},
      submitMode: admin ? "admin-only" : "preview",
    });
    return;
  }

  if (!sessionToken) {
    if (admin) {
      paintForm(schema, {
        cursos,
        prefill: cursoId ? { curso: cursoId } : {},
        submitMode: "admin-only",
      });
      return;
    }
    loginRedirect();
    return;
  }

  let status = {};
  try {
    const query = new URLSearchParams({ form: formId });
    if (cursoId) query.set("curso", cursoId);
    status = await api(`/forms/status?${query}`, { token: sessionToken });
  } catch (err) {
    if (err.status === 401 || err.code === "unauthorized") {
      loginRedirect();
      return;
    }
    failBoot(mapError(err));
    return;
  }

  const catalog = Array.isArray(status.cursos) && status.cursos.length ? status.cursos : cursos;

  if (schema.requiere_curso && cursoId && status.enrolled === false) {
    failBoot("Este curso no aparece en tu historial. Si crees que es un error, escríbenos.");
    return;
  }

  if (status.curso_nombre) {
    $("course-name").textContent = status.curso_nombre;
    $("course-name").hidden = false;
    document.title = `Evaluación: ${status.curso_nombre} — Dr. Z Academy Club`;
  }

  if (status.completed && cursoId) {
    showDone(status);
    return;
  }

  const prefill = {};
  if (cursoId) prefill.curso = cursoId;
  if (status.nombre) prefill.evaluador = status.nombre;

  paintForm(schema, { cursos: catalog, prefill, submitMode: "live" });

  $("drz-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = $("submit-form");
    const { answers, missing } = collectAnswers(schema);
    if (missing.length) {
      showStatus($("form-status"), "Revisa las preguntas obligatorias que faltan.", "error");
      const first = document.querySelector(`.question[data-id="${CSS.escape(missing[0])}"]`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    submit.disabled = true;
    showStatus($("form-status"), "Enviando…");
    const chosenCurso = sanitizeId(answers.curso) || cursoId;
    try {
      const data = await api("/forms/submit", {
        method: "POST",
        token: sessionToken,
        body: { formId, cursoId: chosenCurso, answers },
      });
      if (!isAdmin()) {
        trackEvent("club_form_submit", { form: formId, curso: status.curso_nombre || chosenCurso });
      }
      const chosen = catalog.find((item) => item.id === chosenCurso);
      showDone({
        curso_nombre: chosen?.nombre || status.curso_nombre,
        certificado_url: data.certificado_url || "",
      });
    } catch (err) {
      if (err.code === "already_submitted") {
        showDone({
          curso_nombre: status.curso_nombre,
          certificado_url: err.certificado_url || "",
        });
        return;
      }
      if (err.status === 401 || err.code === "unauthorized") {
        loginRedirect();
        return;
      }
      showStatus($("form-status"), mapError(err), "error");
    } finally {
      submit.disabled = false;
    }
  });
}

boot();

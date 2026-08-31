const ADMIN_TOKEN_KEY = "drz-forms-export-token";
const WORKER_URL = "https://drz-club-portal.drz-academy.workers.dev";
const FORM_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SCHEMA_VERSION = "20260831n";
const NAME_QUESTION_IDS = new Set(["evaluador", "nombre"]);
const PIE_COLORS = ["#F3D361", "#7eb8c9", "#e07a5f", "#81b29a", "#9b8ec4", "#f2cc8f", "#c9ae4a", "#888888"];
const CHOICE_TYPES = new Set([
  "radio",
  "opciones",
  "lista_desplegable",
  "seleccion_unica",
  "seleccion_multiple",
  "puntaje",
  "escala_scroll",
]);
const TEXT_TYPES = new Set(["texto", "parrafo"]);

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

async function verifyExportToken(token) {
  const value = String(token || "").trim();
  if (!value) return false;
  try {
    const res = await fetch(`${workerEndpoint()}/forms/export-auth`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${value}` },
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.ok !== false;
  } catch {
    return false;
  }
}

async function unlockAdminIfPresent() {
  const candidate = takeTokenFromUrl() || storedAdminToken();
  if (!candidate) return "";
  const ok = await verifyExportToken(candidate);
  if (!ok) {
    saveAdminToken("");
    return "";
  }
  saveAdminToken(candidate);
  return candidate;
}

function formQuestions(schema) {
  if (Array.isArray(schema?.secciones) && schema.secciones.length) {
    return schema.secciones.flatMap((section) => section.preguntas || []);
  }
  return Array.isArray(schema?.preguntas) ? schema.preguntas : [];
}

function formSections(schema) {
  if (Array.isArray(schema?.secciones) && schema.secciones.length) return schema.secciones;
  return [{ id: "main", titulo: "", preguntas: schema?.preguntas || [] }];
}

function isNameQuestion(question) {
  const id = String(question.id || "").trim();
  return NAME_QUESTION_IDS.has(id);
}

function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function parseFilters(raw) {
  return String(raw || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx <= 0) return null;
      return { key: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() };
    })
    .filter(Boolean);
}

function filtersToParam(rules) {
  return rules
    .filter((rule) => rule.key && rule.value)
    .map((rule) => `${rule.key}:${rule.value}`)
    .join(";");
}

function optionMap(question, cursos) {
  const map = new Map();
  if (question.fuente === "cursos") {
    for (const curso of cursos || []) {
      if (curso?.id) map.set(String(curso.id), String(curso.nombre || curso.id));
    }
  }
  for (const opt of question.opciones || []) {
    if (opt && typeof opt === "object") {
      const value = String(opt.value ?? opt.id ?? "");
      if (value) map.set(value, String(opt.label ?? opt.nombre ?? value));
    } else if (opt != null && opt !== "") {
      map.set(String(opt), String(opt));
    }
  }
  return map;
}

function labelFor(question, value, row, cursos) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (String(question.id) === "curso") {
    return row.cursoNombre || optionMap(question, cursos).get(raw) || raw;
  }
  return optionMap(question, cursos).get(raw) || raw;
}

function valuesFor(question, row) {
  const id = String(question.id || "").trim();
  const raw = row.answers?.[id];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (raw === undefined || raw === null || raw === "") return [];
  return [String(raw)];
}

function fieldValues(row, key, questions, cursos) {
  const k = fold(key).replaceAll(" ", "_");
  if (k === "curso" || k === "curso_nombre" || k === "cursonombre" || k === "course") {
    const names = [row.cursoNombre];
    const courseQ = questions.find((q) => q.id === "curso");
    if (courseQ) names.push(...valuesFor(courseQ, row).map((v) => labelFor(courseQ, v, row, cursos)));
    return names.filter(Boolean);
  }
  if (k === "curso_id" || k === "cursoid") {
    return [row.cursoId, row.answers?.curso].filter(Boolean).map(String);
  }
  const question = questions.find((q) => fold(q.id) === k);
  if (!question) return [row.answers?.[key]].filter((v) => v != null && v !== "").map(String);
  return valuesFor(question, row).flatMap((v) => [v, labelFor(question, v, row, cursos)]);
}

function matchesRule(row, rule, questions, cursos) {
  const loose = ["curso", "curso_nombre", "cursonombre", "course"].includes(fold(rule.key).replaceAll(" ", "_"));
  const needle = fold(rule.value);
  if (!needle) return true;
  return fieldValues(row, rule.key, questions, cursos).some((hay) => {
    const h = fold(hay);
    if (!h) return false;
    if (h === needle) return true;
    if (loose && (h.includes(needle) || needle.includes(h))) return true;
    return false;
  });
}

function applyFilters(rows, rules, questions, cursos) {
  if (!rules.length) return rows;
  return rows.filter((row) => rules.every((rule) => matchesRule(row, rule, questions, cursos)));
}

function setFilterInUrl(raw) {
  const url = new URL(location.href);
  if (raw) url.searchParams.set("filter", raw);
  else url.searchParams.delete("filter");
  url.searchParams.delete("TOKEN");
  url.searchParams.delete("token");
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function pieSvg(slices) {
  const total = slices.reduce((sum, item) => sum + item.count, 0);
  if (!total) return "";
  if (slices.length === 1) {
    return `<svg class="pie-svg" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="${slices[0].color}"></circle></svg>`;
  }
  let angle = -Math.PI / 2;
  const paths = slices.map((item) => {
    const sweep = (item.count / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    const x1 = 50 + 48 * Math.cos(start);
    const y1 = 50 + 48 * Math.sin(start);
    const x2 = 50 + 48 * Math.cos(angle);
    const y2 = 50 + 48 * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return `<path d="M 50 50 L ${x1.toFixed(3)} ${y1.toFixed(3)} A 48 48 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z" fill="${item.color}"></path>`;
  });
  return `<svg class="pie-svg" viewBox="0 0 100 100" aria-hidden="true">${paths.join("")}</svg>`;
}

function renderPie(slices, { denom = 0 } = {}) {
  const total = slices.reduce((sum, item) => sum + item.count, 0);
  const base = denom || total;
  const legend = slices
    .map(
      (item) => `<li>
        <span class="swatch" style="background:${item.color}"></span>
        <span>${escapeHtml(item.label)}</span>
        <span class="n">${item.count}</span>
        <span class="pct">${base ? Math.round((item.count / base) * 100) : 0}%</span>
      </li>`,
    )
    .join("");
  return `<div class="pie-row">${pieSvg(slices)}<ul class="legend">${legend}</ul></div>`;
}

function countChoices(question, rows, cursos) {
  const counts = new Map();
  const labels = optionMap(question, cursos);
  const add = (key, label) => {
    const prev = counts.get(key) || { label, count: 0 };
    prev.count += 1;
    counts.set(key, prev);
  };
  for (const row of rows) {
    for (const value of valuesFor(question, row)) {
      add(value, labelFor(question, value, row, cursos) || value);
    }
  }
  if (question.tipo === "opciones" || question.tipo === "seleccion_multiple") {
    for (const [id, label] of labels) {
      if (!counts.has(id)) counts.set(id, { label, count: 0 });
    }
  } else {
    for (const [id, label] of labels) {
      if (!counts.has(id)) counts.set(id, { label, count: 0 });
    }
  }
  return [...counts.values()]
    .filter((item) => item.count > 0 || labels.size <= 8)
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), "es"));
}

function scaleStats(question, rows) {
  const nums = [];
  for (const row of rows) {
    for (const value of valuesFor(question, row)) {
      const n = Number(value);
      if (Number.isFinite(n)) nums.push(n);
    }
  }
  if (!nums.length) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const counts = new Map();
  for (const n of nums) {
    const key = String(n);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const slices = [...counts.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([label, count], i) => ({ label, count, color: PIE_COLORS[i % PIE_COLORS.length] }));
  return { mean, slices, n: nums.length };
}

function textAnswers(question, rows) {
  const out = [];
  for (const row of rows) {
    for (const value of valuesFor(question, row)) {
      const text = String(value).trim();
      if (text) out.push(text);
    }
  }
  return out;
}

function renderQuestion(question, rows, cursos) {
  const id = String(question.id || "").trim();
  if (!id || isNameQuestion(question)) return "";
  const tipo = String(question.tipo || "texto").trim();
  const help = question.explicacion || question.ayuda || "";
  const head = `<h3>${escapeHtml(question.enunciado || id)}</h3>
    ${help ? `<span class="question-help">${escapeHtml(help)}</span>` : ""}`;

  if (tipo === "escala_scroll" || tipo === "puntaje") {
    const stats = scaleStats(question, rows);
    if (!stats) return `<article class="card question-block">${head}<p class="empty">Sin respuestas.</p></article>`;
    const meanText = stats.mean.toFixed(tipo === "escala_scroll" ? 1 : 0);
    const range = tipo === "escala_scroll"
      ? `${question.min_label || question.min || ""} → ${question.max_label || question.max || ""}`
      : "";
    return `<article class="card question-block">${head}
      <p class="mean">Promedio ${meanText} · ${stats.n} respuestas${range ? ` · ${escapeHtml(range)}` : ""}</p>
      ${renderPie(stats.slices, { denom: stats.n })}
    </article>`;
  }

  if (CHOICE_TYPES.has(tipo)) {
    const counted = countChoices(question, rows, cursos);
    if (!counted.length) return `<article class="card question-block">${head}<p class="empty">Sin respuestas.</p></article>`;
    const slices = counted.map((item, i) => ({ ...item, color: PIE_COLORS[i % PIE_COLORS.length] }));
    const multi = tipo === "opciones" || tipo === "seleccion_multiple";
    return `<article class="card question-block">${head}
      ${multi ? `<p class="mean">Porcentaje sobre ${rows.length} evaluaciones (se puede marcar más de una).</p>` : ""}
      ${renderPie(slices, { denom: multi ? rows.length : slices.reduce((s, i) => s + i.count, 0) })}
    </article>`;
  }

  if (TEXT_TYPES.has(tipo)) {
    const answers = textAnswers(question, rows);
    if (!answers.length) return `<article class="card question-block">${head}<p class="empty">Sin respuestas.</p></article>`;
    const items = answers.map((text) => `<blockquote>${escapeHtml(text)}</blockquote>`).join("");
    return `<article class="card question-block">${head}
      <p class="mean">${answers.length} comentario${answers.length === 1 ? "" : "s"}</p>
      <div class="answer-list">${items}</div>
    </article>`;
  }

  return "";
}

function uniqueCourses(rows) {
  const map = new Map();
  for (const row of rows) {
    const name = String(row.cursoNombre || "").trim();
    const id = String(row.cursoId || "").trim();
    const key = name || id;
    if (!key) continue;
    map.set(key, name || id);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "es"));
}

function paintChips(allRows, activeFilter) {
  const root = $("course-chips");
  if (!root) return;
  const courses = uniqueCourses(allRows);
  const active = fold(activeFilter);
  root.innerHTML = courses
    .map((name) => {
      const value = `curso:${name}`;
      const on = active === fold(value) || (active.startsWith("curso:") && fold(active.slice(6)).includes(fold(name)));
      return `<button type="button" class="chip${on ? " active" : ""}" data-filter="${escapeHtml(value)}">${escapeHtml(name)}</button>`;
    })
    .join("");
}

function renderStats(schema, rows, cursos) {
  const root = $("stats-root");
  if (!rows.length) {
    const empty = qs("filter")
      ? "No hay respuestas para este filtro."
      : "Aún no hay evaluaciones.";
    root.innerHTML = `<section class="card"><p class="empty">${empty}</p></section>`;
    return;
  }
  const html = formSections(schema)
    .map((section) => {
      const title = section.titulo ? `<h2 class="section-title">${escapeHtml(section.titulo)}</h2>` : "";
      const blocks = (section.preguntas || [])
        .map((question) => renderQuestion(question, rows, cursos))
        .join("");
      return `${title}${blocks}`;
    })
    .join("");
  root.innerHTML = html;
}

function showStatus(message, kind = "") {
  const el = $("boot-status");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
  el.classList.toggle("error", kind === "error");
}

async function loadSchema(formId) {
  const res = await fetch(`/club/drz-forms/${encodeURIComponent(formId)}.json?v=${SCHEMA_VERSION}`);
  if (!res.ok) throw new Error("No encontramos ese formulario.");
  return res.json();
}

async function loadCursos() {
  try {
    const res = await fetch(`${workerEndpoint()}/forms/catalog`);
    const data = await res.json();
    if (Array.isArray(data.cursos)) return data.cursos;
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(`/club/drz-forms/cursos-opciones.json?v=${SCHEMA_VERSION}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.cursos || [];
  } catch {
    return [];
  }
}

function demoSubmissions(cursos) {
  const curso = (cursos || []).find((item) => /extraterrestre/i.test(item.nombre || "")) || cursos?.[0] || {
    id: "demo",
    nombre: "Master Class Extraterrestre",
  };
  const base = {
    submittedAt: new Date().toISOString(),
    cursoId: String(curso.id || "demo"),
    cursoNombre: String(curso.nombre || "Demo"),
  };
  return [
    {
      ...base,
      answers: {
        curso: base.cursoId,
        finalizado: "si",
        apreciacion_general: 6,
        docente: 5.5,
        logistica: 5,
        dificultad: 4,
        lo_mejor: "Los ejemplos y el ritmo de la clase.",
        tema_futuro: "Agujeros negros",
        recomendaria: 7,
      },
    },
    {
      ...base,
      answers: {
        curso: base.cursoId,
        finalizado: "falto",
        apreciacion_general: 4.5,
        docente: 6,
        logistica: 4,
        dificultad: 5.5,
        lo_mejor: "La forma de explicar lo difícil.",
        cambiar: "Un poco más de tiempo para preguntas.",
        tema_futuro: "Historia de la ciencia",
        recomendaria: 6,
      },
    },
    {
      ...base,
      cursoNombre: "El Rompecabezas de la Materia",
      cursoId: "rompecabezas_materia",
      answers: {
        curso: "rompecabezas_materia",
        finalizado: "no",
        apreciacion_general: 3,
        docente: 4,
        logistica: 6,
        dificultad: 6.5,
        lo_mejor: "Los diagramas.",
        tema_futuro: "Python para datos",
        recomendaria: 4,
        observaciones: "Me gustaría una sesión extra de ejercicios.",
      },
    },
  ];
}

async function loadSubmissions(formId, token) {
  const res = await fetch(`${workerEndpoint()}/forms/stats?form=${encodeURIComponent(formId)}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 || data.error === "not_found") {
    throw new Error("El análisis aún no está publicado en el Worker. Despliega el Worker y vuelve a intentar.");
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || data.error || "No se pudieron cargar las respuestas.");
  }
  return Array.isArray(data.submissions) ? data.submissions : [];
}

async function boot() {
  const formId = sanitizeId(qs("form") || "evaluacion-curso");
  const back = $("back-form");
  if (back) back.href = `/club/drz-forms/drz-form.html?form=${encodeURIComponent(formId)}`;
  if (!formId) {
    showStatus("El enlace del formulario no es válido.", "error");
    return;
  }

  const token = await unlockAdminIfPresent();
  if (!token) {
    showStatus("Abre esta página con TOKEN=… o desde Analizar resultados en el formulario.", "error");
    $("count-line").textContent = "";
    return;
  }

  let schema;
  let submissions;
  let cursos = [];
  try {
    [schema, submissions, cursos] = await Promise.all([
      loadSchema(formId),
      loadSubmissions(formId, token),
      loadCursos(),
    ]);
  } catch (err) {
    showStatus(err.message || "No se pudieron cargar las estadísticas.", "error");
    $("count-line").textContent = "";
    return;
  }

  if (qs("demo") === "1") {
    submissions = demoSubmissions(cursos);
  }

  $("page-title").innerHTML = `Estadísticas de <em>${escapeHtml(schema.titulo || "la evaluación")}</em>`;

  const questions = formQuestions(schema);
  const input = $("filter-input");
  const refresh = () => {
    const raw = String(input.value || "").trim();
    const rules = parseFilters(raw);
    setFilterInUrl(raw);
    const filtered = applyFilters(submissions, rules, questions, cursos);
    $("count-line").textContent = raw
      ? `${filtered.length} de ${submissions.length} respuestas · filtro ${raw}`
      : `${submissions.length} respuesta${submissions.length === 1 ? "" : "s"} en total`;
    paintChips(submissions, raw);
    renderStats(schema, filtered, cursos);
  };

  input.value = qs("filter");
  $("filter-apply").addEventListener("click", refresh);
  $("filter-clear").addEventListener("click", () => {
    input.value = "";
    refresh();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      refresh();
    }
  });
  $("course-chips").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-filter]");
    if (!chip) return;
    input.value = chip.getAttribute("data-filter") || "";
    refresh();
  });
  refresh();
}

boot();

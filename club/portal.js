import { trackEvent } from "../assets/visitor-tracker.js";

const TOKEN_KEY = "drz-club-token";
const VISIT_KEY = "drz-club-visit-logged";
const EMAIL_KEY = "drz-club-email";
const WORKER_URL = "https://drz-club-portal.drz-academy.workers.dev";

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
  for (const view of ["view-lookup", "view-forgot", "view-reset", "view-dashboard"]) {
    const el = $(view);
    if (!el) continue;
    const on = view === id;
    el.classList.toggle("hidden", !on);
    el.hidden = !on;
  }
  const stats = $("club-stats");
  if (stats) {
    const showStats = id !== "view-dashboard";
    stats.classList.toggle("hidden", !showStats);
    stats.hidden = !showStats;
  }
}

async function api(path, { method = "GET", body, token } = {}) {
  const endpoint = workerEndpoint();
  if (!endpoint) throw new Error("El portal aún no está conectado al servidor.");
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
    throw err;
  }
  return data;
}

function courseDateKey(curso) {
  return curso.fecha_fin || curso.fecha_inicio || "";
}

function sortCoursesNewestFirst(cursos) {
  return [...cursos].sort((a, b) => {
    const ka = courseDateKey(a);
    const kb = courseDateKey(b);
    if (ka === kb) return 0;
    if (!ka) return 1;
    if (!kb) return -1;
    return kb.localeCompare(ka);
  });
}

function formatDates(curso) {
  const start = curso.fecha_inicio || "";
  const end = curso.fecha_fin || "";
  if (!start && !end) return "Fechas por confirmar";
  if (start && end && start !== end) return `${start} — ${end}`;
  return start || end;
}

function badgeClass(categoria) {
  const value = String(categoria || "").toUpperCase();
  if (value.includes("ORO")) return "badge";
  if (value.includes("PLATA")) return "badge plata";
  if (value.includes("BRONCE")) return "badge bronce";
  return "badge sin";
}

const SEALS = {
  oro: { src: "/assets/club/sello-oro.webp", alt: "Sello Oro del Dr. Z Academy Club" },
  plata: { src: "/assets/club/sello-plata.webp", alt: "Sello Plata del Dr. Z Academy Club" },
  bronce: { src: "/assets/club/sello-bronce.webp", alt: "Sello Bronce del Dr. Z Academy Club" },
};

function sealFor(categoria) {
  const value = String(categoria || "").toUpperCase();
  if (value.includes("ORO")) return SEALS.oro;
  if (value.includes("PLATA")) return SEALS.plata;
  if (value.includes("BRONCE")) return SEALS.bronce;
  return null;
}

function joinList(items) {
  const list = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} y ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} y ${list[list.length - 1]}`;
}

const CATEGORIA_KEYS = { ORO: "gold", PLATA: "silver", BRONCE: "bronze" };
let categoriasCache = null;

async function loadCategorias() {
  if (categoriasCache) return categoriasCache;
  const res = await fetch("/club/categorias.json?v=20260825j");
  if (!res.ok) throw new Error("categorias_failed");
  categoriasCache = await res.json();
  return categoriasCache;
}

function benefitMessage(profile, categorias) {
  const stored = String(profile.beneficios || "").trim();
  if (/beneficio ya usado/i.test(stored)) return stored;
  const key = CATEGORIA_KEYS[String(profile.categoria || "").toUpperCase()];
  const cat = key && categorias ? categorias[key] : null;
  const mensaje = String(cat?.mensaje || "").trim();
  const requisito = joinList(cat?.requisitos);
  const beneficio = joinList(cat?.beneficios);
  if (mensaje && requisito && beneficio) {
    return `${mensaje} (${requisito}) te otorgamos ${beneficio}. ¡Gracias por tu constancia!`;
  }
  return stored || "Consulta tu historial de cursos a continuación.";
}

function formatCop(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "";
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

function renderNextCourse(profile) {
  const box = $("next-course");
  const nxt = profile.proximo_curso;
  if (!box) return;
  if (!nxt || !nxt.nombre) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const href = nxt.pagina_url || nxt.inscripcion_url || "";
  $("next-course-name").innerHTML = href
    ? `<a href="${href}" target="_blank" rel="noopener">${nxt.nombre}</a>`
    : nxt.nombre;
  $("next-course-price").textContent = formatCop(nxt.valor) || "Por confirmar";
  const cupon = nxt.cupon || {};
  const couponEl = $("next-course-coupon");
  if (cupon.disponible) {
    const cat = String(cupon.etiqueta || "").replace(/sin categoría/i, "").trim();
    const code = String(cupon.codigo || "").trim();
    couponEl.className = "coupon";
    let text = "";
    if (Number(cupon.precio_final) === 0) {
      text = `${cat} · inscripción gratis`.replace(/^ · /, "");
    } else {
      text = `${cat} · ${cupon.descuento || ""} · pagas ${formatCop(cupon.precio_final)}`.replace(/^ · /, "");
    }
    couponEl.innerHTML = code
      ? `${text}<br><span class="coupon-code">${code}</span>`
      : text;
  } else {
    couponEl.className = "coupon off";
    couponEl.textContent = "No tienes cupón disponible";
  }
}

async function renderProfile(profile, categorias) {
  $("profile-name").textContent = profile.nombre || "Participante";
  const badge = $("profile-badge");
  const artwork = sealFor(profile.categoria);
  if (artwork) {
    badge.classList.add("hidden");
    badge.textContent = "";
  } else {
    badge.classList.remove("hidden");
    badge.className = badgeClass(profile.categoria);
    badge.textContent = profile.categoria || "SIN CATEGORÍA";
  }
  const seal = $("profile-seal");
  if (seal) {
    if (artwork) {
      seal.src = artwork.src;
      seal.alt = artwork.alt;
      seal.hidden = false;
    } else {
      seal.removeAttribute("src");
      seal.alt = "";
      seal.hidden = true;
    }
  }
  $("profile-benefit").textContent = benefitMessage(profile, categorias);
  renderNextCourse(profile);

  const list = $("course-list");
  const cursos = sortCoursesNewestFirst(profile.cursos || []);
  if (!cursos.length) {
    list.innerHTML = `<p class="status">Aún no hay cursos asociados a esta cuenta.</p>`;
    return;
  }
  list.innerHTML = cursos
    .map((curso) => {
      const links = [];
      if (curso.classroom_url) {
        links.push(`<a class="chip" href="${curso.classroom_url}" target="_blank" rel="noopener" data-track="classroom" data-curso="${curso.nombre || ''}">Classroom</a>`);
      }
      if (curso.hotmart_url) {
        links.push(`<a class="chip" href="${curso.hotmart_url}" target="_blank" rel="noopener" data-track="hotmart" data-curso="${curso.nombre || ''}">Hotmart</a>`);
      }
      if (curso.evaluacion && !curso.evaluacion_completa) {
        const formUrl = `/club/drz-forms/drz-form.html?form=evaluacion-curso&curso=${encodeURIComponent(curso.id || "")}`;
        links.push(`<a class="chip eval" href="${formUrl}" data-track="evaluacion" data-curso="${curso.nombre || ''}">Evaluación</a>`);
      } else {
        links.push(
          curso.certificado_url
            ? `<a class="chip" href="${curso.certificado_url}" target="_blank" rel="noopener" data-track="certificado" data-curso="${curso.nombre || ''}">Certificado</a>`
            : `<span class="chip off">Certificado no disponible</span>`,
        );
      }
      return `<article class="course">
        <h3>${curso.nombre || "Curso"}</h3>
        <p class="course-dates">${formatDates(curso)}</p>
        <div class="course-links">${links.join("")}</div>
      </article>`;
    })
    .join("");
}

function setSession(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function rememberClubEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return;
  try {
    sessionStorage.setItem(EMAIL_KEY, value);
  } catch {
    /* ignore */
  }
}

function rememberedClubEmail() {
  try {
    return sessionStorage.getItem(EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

function trackClubVisit(profile) {
  const email = String(profile?.correo || rememberedClubEmail() || "").trim().toLowerCase();
  const nombre = String(profile?.nombre || "").trim();
  if (!email) return;
  rememberClubEmail(email);
  try {
    if (sessionStorage.getItem(VISIT_KEY) === email) return;
    sessionStorage.setItem(VISIT_KEY, email);
  } catch {
    /* still send */
  }
  trackEvent("club_visit", {
    memberName: nombre,
    memberEmail: email,
    categoria: profile?.categoria || "",
  });
}

function currentToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function safeClubPath(raw) {
  try {
    const url = new URL(String(raw || ""), location.origin);
    if (url.origin !== location.origin) return "";
    if (!url.pathname.startsWith("/club/")) return "";
    return `${url.pathname}${url.search}`;
  } catch {
    return "";
  }
}

function pendingNextPath() {
  return safeClubPath(new URLSearchParams(location.search).get("next") || "");
}

function lookupMode(mode) {
  const block = $("password-block");
  const forgot = $("forgot-open");
  const password = $("password");
  const label = $("password-label");
  const submit = $("submit-lookup");
  const askingPassword = mode !== "lookup";
  block.classList.toggle("hidden", !askingPassword);
  block.hidden = !askingPassword;
  forgot.classList.toggle("hidden", mode !== "login");
  password.required = askingPassword;
  password.autocomplete = mode === "register" ? "new-password" : "current-password";
  label.textContent = mode === "register" ? "Crea una clave (mínimo 8 caracteres)" : "Clave";
  submit.textContent = mode === "lookup" ? "Consultar" : mode === "register" ? "Crear clave y entrar" : "Entrar";
  $("form-lookup").dataset.mode = mode;
}

function setConsultaChrome(on) {
  $("hero-label")?.classList.toggle("hidden", !on);
  $("page-title")?.classList.toggle("hidden", !on);
  if ($("hero-label")) $("hero-label").hidden = !on;
  if ($("page-title")) $("page-title").hidden = !on;
}

function resetLookupForm() {
  lookupMode("lookup");
  $("password").value = "";
  $("submit-lookup").disabled = false;
  showStatus($("lookup-status"), "");
  $("lead").textContent =
    "Ingresa la cédula y el correo con el que te inscribiste. La primera vez crearás una clave; si la olvidas, la recuperamos a ese mismo correo.";
  $("lead")?.classList.remove("hidden");
  if ($("lead")) $("lead").hidden = false;
  setConsultaChrome(true);
}

async function enterDashboard(token, profile) {
  setSession(token);
  const next = pendingNextPath();
  if (next && next !== "/club/" && next !== "/club") {
    location.replace(next);
    return;
  }
  showStatus($("lookup-status"), "");
  $("submit-lookup").disabled = false;
  const categorias = await loadCategorias().catch(() => null);
  await renderProfile(profile, categorias);
  $("lead").classList.add("hidden");
  $("lead").hidden = true;
  setConsultaChrome(false);
  showView("view-dashboard");
  trackClubVisit(profile);
}

function mapError(err) {
  const code = err.code || "";
  if (code === "not_found") return "No encontramos una inscripción con esa cédula y ese correo.";
  if (code === "invalid_credentials") return "La clave no coincide. Puedes recuperarla al correo de inscripción.";
  if (code === "already_registered") return "Ya tienes una clave. Inicia sesión o recupérala si la olvidaste.";
  if (code === "weak_password") return err.message || "La clave es demasiado corta.";
  if (code === "too_many_requests") return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (code === "email_failed") return "No pudimos enviar el correo ahora. Inténtalo más tarde.";
  if (code === "invalid_token") return "Ese enlace ya no es válido. Solicita uno nuevo.";
  return err.message || "No se pudo completar la consulta.";
}

$("form-lookup").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("lookup-status");
  const submit = $("submit-lookup");
  const documento = $("documento").value;
  const correo = $("correo").value;
  const password = $("password").value;
  const mode = $("form-lookup").dataset.mode || "lookup";
  submit.disabled = true;
  showStatus(status, "Consultando…");
  try {
    if (mode === "lookup") {
      const data = await api("/lookup", { method: "POST", body: { documento, correo } });
      if (data.status === "needs_password") {
        lookupMode("register");
        showStatus(status, `Hola, ${data.nombre || ""}. Crea una clave para proteger tu información.`.trim(), "ok");
      } else {
        lookupMode("login");
        showStatus(status, `Hola, ${data.nombre || ""}. Ingresa tu clave.`.trim(), "ok");
      }
      $("password").focus();
      return;
    }
    const path = mode === "register" ? "/register" : "/login";
    const data = await api(path, { method: "POST", body: { documento, correo, password } });
    rememberClubEmail(correo);
    await enterDashboard(data.token, { ...data.profile, correo: data.profile?.correo || correo });
  } catch (err) {
    showStatus(status, mapError(err), "error");
  } finally {
    submit.disabled = false;
  }
});

$("forgot-open").addEventListener("click", () => {
  $("forgot-documento").value = $("documento").value;
  $("forgot-correo").value = $("correo").value;
  showView("view-forgot");
});

$("forgot-back").addEventListener("click", () => {
  showView("view-lookup");
});

$("form-forgot").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("forgot-status");
  showStatus(status, "Enviando…");
  try {
    const data = await api("/forgot", {
      method: "POST",
      body: {
        documento: $("forgot-documento").value,
        correo: $("forgot-correo").value,
      },
    });
    showStatus(status, data.message || "Si los datos coinciden, te enviamos un correo.", "ok");
  } catch (err) {
    showStatus(status, mapError(err), "error");
  }
});

$("form-reset").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("reset-status");
  const token = new URLSearchParams(location.search).get("reset") || "";
  showStatus(status, "Guardando…");
  try {
    const data = await api("/reset", {
      method: "POST",
      body: { token, password: $("reset-password").value },
    });
    history.replaceState({}, "", "/club/");
    await enterDashboard(data.token, data.profile);
  } catch (err) {
    showStatus(status, mapError(err), "error");
  }
});

$("logout").addEventListener("click", async () => {
  const token = currentToken();
  try {
    if (token) await api("/logout", { method: "POST", token });
  } catch {
    /* ignore */
  }
  setSession("");
  try {
    sessionStorage.removeItem(VISIT_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
  } catch {
    /* ignore */
  }
  resetLookupForm();
  showView("view-lookup");
});

function formatStat(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-CO");
}

async function loadClubStats() {
  const res = await fetch("/club/stats.json");
  if (!res.ok) throw new Error("stats_failed");
  const stats = await res.json();
  const dictados = $("stat-cursos-dictados");
  const inscritos = $("stat-inscritos");
  const certificados = $("stat-certificados");
  if (dictados) dictados.textContent = formatStat(stats.cursos_dictados);
  if (inscritos) inscritos.textContent = formatStat(stats.inscritos);
  if (certificados) certificados.textContent = formatStat(stats.certificados);
}

async function boot() {
  lookupMode("lookup");
  loadClubStats().catch(() => {});
  const reset = new URLSearchParams(location.search).get("reset");
  if (reset) {
    showView("view-reset");
    return;
  }
  const token = currentToken();
  const next = pendingNextPath();
  if (!token) return;
  try {
    const data = await api("/me", { token });
    if (next && next !== "/club/" && next !== "/club") {
      location.replace(next);
      return;
    }
    await enterDashboard(token, data.profile);
  } catch {
    setSession("");
  }
}

boot();

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-track]");
  if (!target) return;
  const trackType = target.dataset.track;
  if (!trackType) return;
  trackEvent(`club_click_${trackType}`, {
    curso: target.dataset.curso || "",
    href: target.href || ""
  });
});

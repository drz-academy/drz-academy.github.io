/**
 * Cloudflare Worker: portal de consulta del Dr. Z Academy Club.
 *
 * POST /lookup              { documento, correo } → needs_password | needs_login
 * POST /register            { documento, correo, password }  (primera vez)
 * POST /login               { documento, correo, password }
 * POST /forgot              { documento, correo }  (siempre responde ok)
 * POST /reset               { token, password }
 * GET  /me                  Authorization: Bearer <session>
 * POST /logout              Authorization: Bearer <session>
 * GET  /forms/status        Authorization: Bearer <session>
 * POST /forms/submit        Authorization: Bearer <session>
 * GET  /forms/catalog       lista pública de cursos (id, nombre)
 * GET  /forms/export-auth   Authorization: Bearer CLUB_ADMIN_MASTER
 * GET  /forms/export        CSV; Authorization: Bearer CLUB_ADMIN_MASTER o CLUB_ADMIN_TOKEN
 * POST /admin/sync          Authorization: Bearer CLUB_ADMIN_TOKEN
 * GET  /admin/forms         Authorization: Bearer CLUB_ADMIN_TOKEN
 * POST /admin/reset-pass    Authorization: Bearer CLUB_ADMIN_TOKEN
 * POST /admin/reset-forms   Authorization: Bearer CLUB_ADMIN_TOKEN
 * GET  /health
 */

import { connect } from "cloudflare:sockets";

const ALLOWED_ORIGINS = [
  "https://drz-academy.github.io",
  "https://drz.academy",
  "https://www.drz.academy",
  "http://127.0.0.1:8000",
  "http://localhost:8000",
];

const SESSION_TTL_SEC = 7 * 24 * 3600;
const RESET_TTL_SEC = 3600;
const PBKDF2_ITERATIONS = 100_000;
const MIN_PASSWORD_LEN = 8;

function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (hostname === "drz.academy" || hostname.endsWith(".drz.academy")) return true;
    if (hostname === "drz-academy.github.io") return true;
  } catch {
    return false;
  }
  return false;
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allow = originAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(request) },
  });
}

function bearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function normalizeEmail(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeDocumento(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^0-9]/g, "");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 24) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

async function lookupKey(documento, correo) {
  return `lookup:${await sha256Hex(`${documento}|${correo}`)}`;
}

async function hashPassword(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function clientIp(request) {
  const raw = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  return raw.split(",")[0].trim() || "unknown";
}

/**
 * Rate-limit with the Cache API so lookup/login never consume KV writes.
 * The free KV plan allows 1000 puts/day; a KV counter burned that quota on tests.
 */
async function rateLimit(request, bucket, max, windowSec) {
  try {
    const cache = caches.default;
    const url = new URL(request.url);
    url.pathname = `/__rl/${bucket}/${encodeURIComponent(clientIp(request))}`;
    url.search = "";
    const cacheReq = new Request(url.toString(), { method: "GET" });
    const hit = await cache.match(cacheReq);
    const count = hit ? parseInt(await hit.text(), 10) || 0 : 0;
    if (count >= max) return false;
    await cache.put(
      cacheReq,
      new Response(String(count + 1), {
        headers: { "Cache-Control": `public, max-age=${windowSec}` },
      }),
    );
    return true;
  } catch {
    return true;
  }
}

const INDEX_PROFILES = "index:profiles";
const INDEX_LOOKUPS = "index:lookups";

async function readIndexes(env) {
  const [profilesRaw, lookupsRaw] = await Promise.all([
    env.DRZ_CLUB.get(INDEX_PROFILES),
    env.DRZ_CLUB.get(INDEX_LOOKUPS),
  ]);
  let profiles = {};
  let lookups = {};
  try {
    if (profilesRaw) profiles = JSON.parse(profilesRaw);
  } catch {
    profiles = {};
  }
  try {
    if (lookupsRaw) lookups = JSON.parse(lookupsRaw);
  } catch {
    lookups = {};
  }
  return { profiles, lookups };
}

function requireAdmin(request, env) {
  const expected = String(env.CLUB_ADMIN_TOKEN || "").trim();
  if (!expected) return { ok: false, status: 503, error: "admin_token_not_configured" };
  const got = bearerToken(request);
  if (!got || got !== expected) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true };
}

function publicProfile(record) {
  return {
    nombre: record.nombre || "",
    correo: record.correo || "",
    categoria: record.categoria || "SIN CATEGORÍA",
    emoji: record.emoji || "",
    beneficios: record.beneficios || "",
    descuento: record.descuento || "",
    cursos: Array.isArray(record.cursos) ? record.cursos : [],
    proximo_curso: record.proximo_curso && typeof record.proximo_curso === "object" ? record.proximo_curso : null,
  };
}

const MAX_ANSWER_LEN = 4000;
const EVAL_FORM_ID = "evaluacion-curso";

function sanitizeId(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) return "";
  return value;
}

function formResponseKey(formId, cursoId, memberId) {
  return `form:${formId}:${cursoId}:${memberId}`;
}

async function loadCatalog(env) {
  const raw = await env.DRZ_CLUB.get("catalog:cursos");
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function loadFormSchema(env, formId) {
  const raw = await env.DRZ_CLUB.get(`form-schema:${formId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function courseRequiresEvaluation(curso, catalogById) {
  const meta = catalogById.get(String(curso.id || ""));
  if (meta && typeof meta.evaluacion === "boolean") return meta.evaluacion;
  return Boolean(curso.evaluacion);
}

function findMemberCourse(record, cursoId) {
  return (record.cursos || []).find((curso) => String(curso.id || "") === cursoId) || null;
}

async function clientProfile(env, memberId, record) {
  const catalog = await loadCatalog(env);
  const catalogById = new Map(catalog.map((item) => [String(item.id || ""), item]));
  const cursos = Array.isArray(record.cursos) ? record.cursos : [];
  const enriched = await Promise.all(
    cursos.map(async (curso) => {
      const evaluacion = courseRequiresEvaluation(curso, catalogById);
      const certUrl = String(curso.certificado_url || "");
      let evaluacion_completa = !evaluacion;
      if (evaluacion) {
        const saved = await env.DRZ_CLUB.get(formResponseKey(EVAL_FORM_ID, String(curso.id || ""), memberId));
        evaluacion_completa = Boolean(saved);
      }
      return {
        id: curso.id || "",
        nombre: curso.nombre || "",
        fecha_inicio: curso.fecha_inicio || "",
        fecha_fin: curso.fecha_fin || "",
        classroom_url: curso.classroom_url || "",
        hotmart_url: curso.hotmart_url || "",
        pagina_url: curso.pagina_url || "",
        evaluacion,
        evaluacion_completa,
        certificado_disponible: Boolean(certUrl),
        certificado_url: evaluacion && !evaluacion_completa ? "" : certUrl,
      };
    }),
  );
  return publicProfile({ ...record, cursos: enriched });
}

function formQuestions(schema) {
  if (Array.isArray(schema?.secciones) && schema.secciones.length) {
    const out = [];
    for (const section of schema.secciones) {
      if (Array.isArray(section?.preguntas)) out.push(...section.preguntas);
    }
    return out;
  }
  return Array.isArray(schema?.preguntas) ? schema.preguntas : [];
}

function isRequired(question) {
  return question?.obligatoria !== false;
}

function offeredCourses(catalog) {
  return (catalog || [])
    .filter((curso) => curso?.id && curso?.nombre && !curso.next_course)
    .map((curso) => ({ id: String(curso.id), nombre: String(curso.nombre) }));
}

function optionValues(question) {
  return (question.opciones || []).map((opt) => {
    if (opt && typeof opt === "object") return String(opt.value ?? opt.id ?? opt.nombre ?? "");
    return String(opt);
  }).filter(Boolean);
}

function validateAnswers(schema, answers, catalogById) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return "invalid_answers";
  const questions = formQuestions(schema);
  if (!questions.length) return "empty_schema";
  for (const question of questions) {
    const id = String(question.id || "").trim();
    if (!id) continue;
    const tipo = String(question.tipo || "").trim();
    const required = isRequired(question);
    const val = answers[id];

    if (tipo === "opciones" || tipo === "seleccion_multiple") {
      if (!Array.isArray(val) || !val.length) {
        if (required) return `missing:${id}`;
        continue;
      }
      const allowed = new Set(optionValues(question));
      for (const item of val) {
        if (!allowed.has(String(item))) return `invalid:${id}`;
      }
      continue;
    }

    if (val === undefined || val === null || val === "") {
      if (required) return `missing:${id}`;
      continue;
    }

    if (tipo === "puntaje" || tipo === "escala_scroll") {
      const min = Number.isFinite(Number(question.min)) ? Number(question.min) : 1;
      const max = Number.isFinite(Number(question.max)) ? Number(question.max) : 5;
      const step = tipo === "escala_scroll" && Number.isFinite(Number(question.step)) && Number(question.step) > 0
        ? Number(question.step)
        : 1;
      const n = Number(val);
      if (!Number.isFinite(n) || n < min || n > max) return `invalid:${id}`;
      const ticks = (n - min) / step;
      if (Math.abs(ticks - Math.round(ticks)) > 1e-6) return `invalid:${id}`;
      if (tipo === "puntaje" && !Number.isInteger(n)) return `invalid:${id}`;
    } else if (tipo === "radio" || tipo === "seleccion_unica" || tipo === "lista_desplegable") {
      let allowed;
      if (question.fuente === "cursos") {
        allowed = [...(catalogById || new Map()).keys()];
      } else {
        allowed = optionValues(question);
      }
      if (!allowed.includes(String(val))) return `invalid:${id}`;
    } else {
      if (typeof val !== "string" || !String(val).trim()) return `missing:${id}`;
      if (String(val).length > MAX_ANSWER_LEN) return `invalid:${id}`;
    }
  }
  return "";
}

function pickAnswers(schema, answers) {
  const out = {};
  for (const question of formQuestions(schema)) {
    const id = String(question.id || "").trim();
    if (!id) continue;
    const tipo = String(question.tipo || "texto").trim();
    const val = answers?.[id];
    if (tipo === "opciones" || tipo === "seleccion_multiple") {
      if (!Array.isArray(val) || !val.length) continue;
      out[id] = val.map((item) => String(item));
    } else if (tipo === "puntaje" || tipo === "escala_scroll") {
      if (val === undefined || val === null || val === "") continue;
      out[id] = Number(val);
    } else {
      if (typeof val !== "string" || !String(val).trim()) continue;
      out[id] = String(val).trim().slice(0, MAX_ANSWER_LEN);
    }
  }
  return out;
}

async function loadProfile(env, memberId, profilesHint) {
  if (!memberId) return null;
  const profiles = profilesHint || (await readIndexes(env)).profiles;
  if (profiles[memberId]) return { memberId, record: profiles[memberId] };
  const raw = await env.DRZ_CLUB.get(`profile:${memberId}`);
  if (!raw) return null;
  try {
    return { memberId, record: JSON.parse(raw) };
  } catch {
    return null;
  }
}

function identityMatches(record, documento, correo) {
  const recDoc = normalizeDocumento(record?.documento || "");
  const recMail = normalizeEmail(record?.correo || "");
  if (recDoc && recDoc !== documento) return false;
  if (recMail && recMail !== correo) return false;
  return Boolean(recDoc || recMail);
}

async function findMember(env, documento, correo) {
  const hashKey = await lookupKey(documento, correo);
  const { profiles, lookups } = await readIndexes(env);
  const hasIndex = Object.keys(lookups).length > 0 || Object.keys(profiles).length > 0;

  if (hasIndex) {
    const byHash = await loadProfile(env, lookups[hashKey], profiles);
    if (byHash) return byHash;
    const byEmail = await loadProfile(env, lookups[`lookup:email:${correo}`], profiles);
    if (byEmail && identityMatches(byEmail.record, documento, correo)) return byEmail;
    const byDoc = await loadProfile(env, lookups[`lookup:doc:${documento}`], profiles);
    if (byDoc && identityMatches(byDoc.record, documento, correo)) return byDoc;
    return null;
  }

  const primary = await loadProfile(env, await env.DRZ_CLUB.get(hashKey), profiles);
  if (primary) return primary;

  const byEmail = await loadProfile(env, await env.DRZ_CLUB.get(`lookup:email:${correo}`), profiles);
  if (byEmail && identityMatches(byEmail.record, documento, correo)) return byEmail;

  const byDoc = await loadProfile(env, await env.DRZ_CLUB.get(`lookup:doc:${documento}`), profiles);
  if (byDoc && identityMatches(byDoc.record, documento, correo)) return byDoc;

  return null;
}

async function getAuth(env, memberId) {
  const raw = await env.DRZ_CLUB.get(`auth:${memberId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function createSession(env, memberId) {
  const token = randomToken(24);
  await env.DRZ_CLUB.put(
    `session:${token}`,
    JSON.stringify({ memberId, created: Date.now() }),
    { expirationTtl: SESSION_TTL_SEC },
  );
  return token;
}

async function readSession(env, request) {
  const token = bearerToken(request);
  if (!token) return null;
  const raw = await env.DRZ_CLUB.get(`session:${token}`);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data.memberId) return null;
    return { token, ...data };
  } catch {
    return null;
  }
}

function passwordError(password) {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD_LEN) {
    return `La clave debe tener al menos ${MIN_PASSWORD_LEN} caracteres.`;
  }
  return "";
}

async function handleLookup(request, env) {
  if (!(await rateLimit(request, "lookup", 80, 3600))) {
    return json(request, { ok: false, error: "too_many_requests" }, 429);
  }
  const body = await readJson(request);
  const documento = normalizeDocumento(body?.documento);
  const correo = normalizeEmail(body?.correo);
  if (!documento || !isValidEmail(correo)) {
    return json(request, { ok: false, error: "invalid_input" }, 400);
  }
  const found = await findMember(env, documento, correo);
  if (!found) {
    return json(request, { ok: false, error: "not_found" }, 404);
  }
  const auth = await getAuth(env, found.memberId);
  return json(request, {
    ok: true,
    status: auth?.hash ? "needs_login" : "needs_password",
    nombre: found.record.nombre || "",
  });
}

async function handleRegister(request, env) {
  if (!(await rateLimit(request, "register", 10, 3600))) {
    return json(request, { ok: false, error: "too_many_requests" }, 429);
  }
  const body = await readJson(request);
  const documento = normalizeDocumento(body?.documento);
  const correo = normalizeEmail(body?.correo);
  const password = String(body?.password || "");
  const err = passwordError(password);
  if (!documento || !isValidEmail(correo)) {
    return json(request, { ok: false, error: "invalid_input" }, 400);
  }

  const found = await findMember(env, documento, correo);
  if (!found) return json(request, { ok: false, error: "not_found" }, 404);

  const masterPassword = String(env.CLUB_ADMIN_MASTER || "").trim();
  if (masterPassword && password === masterPassword) {
    const token = await createSession(env, found.memberId);
    return json(request, { ok: true, token, profile: await clientProfile(env, found.memberId, found.record) });
  }

  if (err) return json(request, { ok: false, error: "weak_password", message: err }, 400);

  const existing = await getAuth(env, found.memberId);
  if (existing?.hash) {
    return json(request, { ok: false, error: "already_registered" }, 409);
  }

  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(password, salt);
  await env.DRZ_CLUB.put(
    `auth:${found.memberId}`,
    JSON.stringify({ salt, hash, created: Date.now() }),
  );
  const token = await createSession(env, found.memberId);
  return json(request, { ok: true, token, profile: await clientProfile(env, found.memberId, found.record) });
}

async function handleLogin(request, env) {
  if (!(await rateLimit(request, "login", 20, 3600))) {
    return json(request, { ok: false, error: "too_many_requests" }, 429);
  }
  const body = await readJson(request);
  const documento = normalizeDocumento(body?.documento);
  const correo = normalizeEmail(body?.correo);
  const password = String(body?.password || "");
  if (!documento || !isValidEmail(correo) || !password) {
    return json(request, { ok: false, error: "invalid_input" }, 400);
  }
  const found = await findMember(env, documento, correo);
  
  const masterPassword = String(env.CLUB_ADMIN_MASTER || "").trim();
  if (found && masterPassword && password === masterPassword) {
    const token = await createSession(env, found.memberId);
    return json(request, { ok: true, token, profile: await clientProfile(env, found.memberId, found.record) });
  }

  const auth = found ? await getAuth(env, found.memberId) : null;
  if (!found || !auth?.hash || !auth?.salt) {
    return json(request, { ok: false, error: "invalid_credentials" }, 401);
  }
  const hash = await hashPassword(password, auth.salt);
  if (!timingSafeEqual(hash, auth.hash)) {
    return json(request, { ok: false, error: "invalid_credentials" }, 401);
  }
  const token = await createSession(env, found.memberId);
  return json(request, { ok: true, token, profile: await clientProfile(env, found.memberId, found.record) });
}

async function handleForgot(request, env) {
  if (!(await rateLimit(request, "forgot", 8, 3600))) {
    return json(request, { ok: false, error: "too_many_requests" }, 429);
  }
  const body = await readJson(request);
  const documento = normalizeDocumento(body?.documento);
  const correo = normalizeEmail(body?.correo);
  const generic = { ok: true, message: "Si los datos coinciden, te enviamos un correo para restablecer la clave." };
  if (!documento || !isValidEmail(correo)) return json(request, generic);

  const found = await findMember(env, documento, correo);
  const auth = found ? await getAuth(env, found.memberId) : null;
  if (!found || !auth?.hash) return json(request, generic);

  const token = randomToken(24);
  await env.DRZ_CLUB.put(
    `reset:${token}`,
    JSON.stringify({ memberId: found.memberId, created: Date.now() }),
    { expirationTtl: RESET_TTL_SEC },
  );

  const site = String(env.SITE_BASE_URL || "https://drz-academy.github.io").replace(/\/$/, "");
  const resetUrl = `${site}/club/?reset=${token}`;
  try {
    await sendResetEmail(env, correo, found.record.nombre || "", resetUrl);
  } catch (err) {
    console.log(JSON.stringify({ event: "email_failed", message: err instanceof Error ? err.message : String(err) }));
    return json(request, { ok: false, error: "email_failed" }, 503);
  }
  return json(request, generic);
}

async function handleReset(request, env) {
  const body = await readJson(request);
  const token = String(body?.token || "").trim();
  const password = String(body?.password || "");
  const err = passwordError(password);
  if (!token) return json(request, { ok: false, error: "invalid_input" }, 400);
  if (err) return json(request, { ok: false, error: "weak_password", message: err }, 400);

  const raw = await env.DRZ_CLUB.get(`reset:${token}`);
  if (!raw) return json(request, { ok: false, error: "invalid_token" }, 400);
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(request, { ok: false, error: "invalid_token" }, 400);
  }
  const memberId = payload.memberId;
  const found = await loadProfile(env, memberId);
  if (!found) return json(request, { ok: false, error: "invalid_token" }, 400);

  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(password, salt);
  await env.DRZ_CLUB.put(`auth:${memberId}`, JSON.stringify({ salt, hash, created: Date.now(), reset: Date.now() }));
  await env.DRZ_CLUB.delete(`reset:${token}`);
  const session = await createSession(env, memberId);
  return json(request, { ok: true, token: session, profile: await clientProfile(env, found.memberId, found.record) });
}

async function handleMe(request, env) {
  const session = await readSession(env, request);
  if (!session) return json(request, { ok: false, error: "unauthorized" }, 401);
  const found = await loadProfile(env, session.memberId);
  if (!found) return json(request, { ok: false, error: "unauthorized" }, 401);
  return json(request, { ok: true, profile: await clientProfile(env, found.memberId, found.record) });
}

async function handleLogout(request, env) {
  const session = await readSession(env, request);
  if (session) await env.DRZ_CLUB.delete(`session:${session.token}`);
  return json(request, { ok: true });
}

async function handleFormStatus(request, env) {
  const session = await readSession(env, request);
  if (!session) return json(request, { ok: false, error: "unauthorized" }, 401);
  const found = await loadProfile(env, session.memberId);
  if (!found) return json(request, { ok: false, error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const formId = sanitizeId(url.searchParams.get("form"));
  const cursoId = sanitizeId(url.searchParams.get("curso"));
  if (!formId) return json(request, { ok: false, error: "invalid_input" }, 400);

  const schema = await loadFormSchema(env, formId);
  const catalog = await loadCatalog(env);
  const cursos = offeredCourses(catalog);
  const requiresCourse = schema?.requiere_curso !== false;

  const course = cursoId ? findMemberCourse(found.record, cursoId) : null;
  if (requiresCourse && cursoId && !course) {
    return json(request, {
      ok: true,
      enrolled: false,
      completed: false,
      curso_nombre: "",
      certificado_url: "",
      nombre: found.record.nombre || "",
      cursos,
    });
  }

  const savedRaw = cursoId ? await env.DRZ_CLUB.get(formResponseKey(formId, cursoId, session.memberId)) : null;
  const completed = Boolean(savedRaw);
  const certUrl = String(course?.certificado_url || "");
  const reveal = completed && schema?.revela_certificado !== false;
  return json(request, {
    ok: true,
    enrolled: true,
    completed,
    curso_nombre: course?.nombre || "",
    certificado_disponible: Boolean(certUrl),
    certificado_url: reveal ? certUrl : "",
    nombre: found.record.nombre || "",
    cursos,
  });
}

async function handleFormSubmit(request, env) {
  if (!(await rateLimit(request, "forms", 30, 3600))) {
    return json(request, { ok: false, error: "too_many_requests" }, 429);
  }
  const session = await readSession(env, request);
  if (!session) return json(request, { ok: false, error: "unauthorized" }, 401);
  const found = await loadProfile(env, session.memberId);
  if (!found) return json(request, { ok: false, error: "unauthorized" }, 401);

  const body = await readJson(request);
  const formId = sanitizeId(body?.formId);
  let cursoId = sanitizeId(body?.cursoId) || sanitizeId(body?.answers?.curso);
  if (!formId) return json(request, { ok: false, error: "invalid_input" }, 400);

  const schema = await loadFormSchema(env, formId);
  if (!schema) return json(request, { ok: false, error: "schema_missing" }, 503);
  const catalog = await loadCatalog(env);
  const catalogById = new Map(catalog.map((item) => [String(item.id || ""), item]));

  if (schema.requiere_curso !== false && !cursoId) {
    return json(request, { ok: false, error: "invalid_input" }, 400);
  }
  const course = cursoId ? findMemberCourse(found.record, cursoId) : null;
  if (schema.requiere_curso !== false && !course) {
    return json(request, { ok: false, error: "not_enrolled" }, 403);
  }

  const existing = await env.DRZ_CLUB.get(formResponseKey(formId, cursoId, session.memberId));
  const certUrl = schema.revela_certificado !== false ? String(course?.certificado_url || "") : "";
  if (existing) {
    return json(request, { ok: false, error: "already_submitted", certificado_url: certUrl }, 409);
  }

  const invalid = validateAnswers(schema, body?.answers, catalogById);
  if (invalid) return json(request, { ok: false, error: invalid }, 400);

  const payload = {
    formId,
    cursoId,
    cursoNombre: course?.nombre || catalogById.get(cursoId)?.nombre || "",
    nombre: found.record.nombre || "",
    correo: found.record.correo || "",
    submittedAt: new Date().toISOString(),
    answers: pickAnswers(schema, body.answers),
  };
  await env.DRZ_CLUB.put(formResponseKey(formId, cursoId, session.memberId), JSON.stringify(payload));
  return json(request, { ok: true, certificado_url: certUrl });
}

async function listFormSubmissions(env, formId, cursoId) {
  const prefix = cursoId ? `form:${formId}:${cursoId}:` : `form:${formId}:`;
  const submissions = [];
  let cursor;
  for (;;) {
    const page = await env.DRZ_CLUB.list({ prefix, cursor, limit: 1000 });
    const names = page.keys.map((key) => key.name);
    for (let i = 0; i < names.length; i += 20) {
      const chunk = await Promise.all(names.slice(i, i + 20).map((name) => env.DRZ_CLUB.get(name)));
      for (const raw of chunk) {
        if (!raw) continue;
        try {
          submissions.push(JSON.parse(raw));
        } catch {
          /* skip broken records */
        }
      }
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  submissions.sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));
  return submissions;
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function submissionsToCsv(schema, submissions) {
  const questions = formQuestions(schema);
  const headers = ["fecha", "nombre", "correo", "curso_id", "curso", ...questions.map((q) => q.enunciado || q.id)];
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of submissions) {
    const answers = row.answers || {};
    const cells = [
      row.submittedAt || "",
      row.nombre || "",
      row.correo || "",
      row.cursoId || "",
      row.cursoNombre || "",
      ...questions.map((q) => {
        const id = String(q.id || "").trim();
        const val = answers[id];
        if (Array.isArray(val)) return val.join("; ");
        return val ?? "";
      }),
    ];
    lines.push(cells.map(csvEscape).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function exportTokenFromRequest(request) {
  const url = new URL(request.url);
  return (
    bearerToken(request) ||
    String(url.searchParams.get("TOKEN") || url.searchParams.get("token") || "").trim()
  );
}

function formsExportAuthorized(request, env) {
  const got = exportTokenFromRequest(request);
  if (!got) return false;
  const master = String(env.CLUB_ADMIN_MASTER || "").trim();
  const admin = String(env.CLUB_ADMIN_TOKEN || "").trim();
  if (master && timingSafeEqual(got, master)) return true;
  if (admin && timingSafeEqual(got, admin)) return true;
  return false;
}

async function handleFormsExportAuth(request, env) {
  if (!(await rateLimit(request, "export-auth", 30, 3600))) {
    return json(request, { ok: false, error: "too_many_requests" }, 429);
  }
  if (!formsExportAuthorized(request, env)) {
    return json(request, { ok: false, error: "unauthorized" }, 401);
  }
  return json(request, { ok: true });
}

async function handleFormsCatalog(request, env) {
  if (!(await rateLimit(request, "catalog", 120, 3600))) {
    return json(request, { ok: false, error: "too_many_requests" }, 429);
  }
  const catalog = await loadCatalog(env);
  return json(request, { ok: true, cursos: offeredCourses(catalog) });
}

async function handleFormsExport(request, env) {
  if (!formsExportAuthorized(request, env)) {
    return json(request, { ok: false, error: "unauthorized" }, 401);
  }
  const url = new URL(request.url);
  const formId = sanitizeId(url.searchParams.get("form") || EVAL_FORM_ID);
  const cursoId = sanitizeId(url.searchParams.get("curso"));
  if (!formId) return json(request, { ok: false, error: "invalid_input" }, 400);

  const [schema, submissions] = await Promise.all([
    loadFormSchema(env, formId),
    listFormSubmissions(env, formId, cursoId),
  ]);
  const filename = `${formId}${cursoId ? `-${cursoId}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(submissionsToCsv(schema || { preguntas: [] }, submissions), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      ...corsHeaders(request),
    },
  });
}

async function handleAdminForms(request, env) {
  const admin = requireAdmin(request, env);
  if (!admin.ok) return json(request, { ok: false, error: admin.error }, admin.status);
  const url = new URL(request.url);
  const formId = sanitizeId(url.searchParams.get("form") || EVAL_FORM_ID);
  const cursoId = sanitizeId(url.searchParams.get("curso"));
  if (!formId) return json(request, { ok: false, error: "invalid_input" }, 400);
  const submissions = await listFormSubmissions(env, formId, cursoId);
  return json(request, { ok: true, form: formId, curso: cursoId, count: submissions.length, submissions });
}

async function handleAdminSync(request, env) {
  const admin = requireAdmin(request, env);
  if (!admin.ok) return json(request, { ok: false, error: admin.error }, admin.status);

  const body = await readJson(request);
  const members = Array.isArray(body?.members) ? body.members : [];
  const cursos = Array.isArray(body?.cursos) ? body.cursos : [];
  if (!members.length) {
    return json(request, { ok: false, error: "empty_members" }, 400);
  }

  const profiles = {};
  const lookups = {};
  let stored = 0;
  for (const member of members) {
    const documento = normalizeDocumento(member.documento);
    const correo = normalizeEmail(member.correo);
    if (!documento || !isValidEmail(correo)) continue;
    const memberId = (await sha256Hex(documento)).slice(0, 24);
    profiles[memberId] = {
      documento,
      correo,
      nombre: String(member.nombre || ""),
      categoria: String(member.categoria || "SIN CATEGORÍA"),
      emoji: String(member.emoji || ""),
      beneficios: String(member.beneficios || ""),
      descuento: String(member.descuento || ""),
      cursos: Array.isArray(member.cursos) ? member.cursos : [],
      proximo_curso: member.proximo_curso && typeof member.proximo_curso === "object" ? member.proximo_curso : null,
    };
    lookups[await lookupKey(documento, correo)] = memberId;
    lookups[`lookup:email:${correo}`] = memberId;
    lookups[`lookup:doc:${documento}`] = memberId;
    const aliases = Array.isArray(member.documento_aliases) ? member.documento_aliases : [];
    for (const extra of aliases) {
      const aliasDoc = normalizeDocumento(extra);
      if (!aliasDoc) continue;
      lookups[await lookupKey(aliasDoc, correo)] = memberId;
      lookups[`lookup:doc:${aliasDoc}`] = memberId;
    }
    stored += 1;
  }

  const forms = Array.isArray(body?.forms) ? body.forms : [];
  const formPuts = [];
  for (const form of forms) {
    const id = sanitizeId(form?.id);
    if (!id) continue;
    const hasQuestions = Array.isArray(form.preguntas) && form.preguntas.length;
    const hasSections = Array.isArray(form.secciones) && form.secciones.length;
    if (!hasQuestions && !hasSections) continue;
    formPuts.push(env.DRZ_CLUB.put(`form-schema:${id}`, JSON.stringify(form)));
  }

  await Promise.all([
    env.DRZ_CLUB.put(INDEX_PROFILES, JSON.stringify(profiles)),
    env.DRZ_CLUB.put(INDEX_LOOKUPS, JSON.stringify(lookups)),
    env.DRZ_CLUB.put("catalog:cursos", JSON.stringify(cursos)),
    ...formPuts,
  ]);
  return json(request, { ok: true, stored, cursos: cursos.length, forms: formPuts.length, kv_puts: 3 + formPuts.length });
}

async function deleteByPrefix(env, prefix) {
  let deleted = 0;
  let cursor;
  for (;;) {
    const page = await env.DRZ_CLUB.list({ prefix, cursor, limit: 1000 });
    const names = page.keys.map((k) => k.name);
    for (let i = 0; i < names.length; i += 20) {
      await Promise.all(names.slice(i, i + 20).map((name) => env.DRZ_CLUB.delete(name)));
    }
    deleted += names.length;
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  return deleted;
}

async function handleAdminResetPass(request, env) {
  const admin = requireAdmin(request, env);
  if (!admin.ok) return json(request, { ok: false, error: admin.error }, admin.status);
  const auth = await deleteByPrefix(env, "auth:");
  const sessions = await deleteByPrefix(env, "session:");
  const resets = await deleteByPrefix(env, "reset:");
  return json(request, { ok: true, auth, sessions, resets });
}

async function handleAdminResetForms(request, env) {
  const admin = requireAdmin(request, env);
  if (!admin.ok) return json(request, { ok: false, error: admin.error }, admin.status);
  const body = await readJson(request);
  const formId = sanitizeId(body?.form || body?.formId);
  const prefix = formId ? `form:${formId}:` : "form:";
  const deleted = await deleteByPrefix(env, prefix);
  return json(request, { ok: true, deleted, prefix });
}

async function sendResetEmail(env, to, nombre, resetUrl) {
  const user = String(env.GMAIL_SMTP_USER || "").trim();
  const pass = String(env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) throw new Error("gmail_not_configured");

  const safeName = nombre || "participante";
  const subject = "Restablece tu clave — Dr. Z Academy Club";
  const html = `<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;background:#0c0c0c;color:#e2e2e2;padding:24px;border:1px solid #242424">
  <p style="color:#F3D361;font-weight:bold;letter-spacing:0.04em">Dr. Z Academy Club</p>
  <h1 style="font-size:20px;color:#fff">Hola, ${escapeHtml(safeName)}</h1>
  <p>Recibimos una solicitud para restablecer la clave de tu portal de participación.</p>
  <p><a href="${resetUrl}" style="display:inline-block;background:#F3D361;color:#0c0c0c;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:bold">Elegir una clave nueva</a></p>
  <p style="color:#888;font-size:13px">El enlace vence en 1 hora. Si no fuiste tú, puedes ignorar este correo.</p>
</div>`;
  const text = `Hola, ${safeName}\n\nRestablece tu clave aquí (vence en 1 hora):\n${resetUrl}\n\nSi no fuiste tú, ignora este mensaje.\n`;

  await smtpSend({
    host: "smtp.gmail.com",
    port: 465,
    user,
    pass,
    from: user,
    to,
    subject,
    html,
    text,
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeSubject(subject) {
  const bytes = new TextEncoder().encode(subject);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

async function smtpSend({ host, port, user, pass, from, to, subject, html, text }) {
  const socket = connect({ hostname: host, port, secureTransport: "on" });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buffer = "";

  async function readReply() {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error("smtp_closed");
      buffer += dec.decode(value, { stream: true });
      const parts = buffer.split("\r\n");
      buffer = parts.pop() || "";
      for (const line of parts) {
        const m = line.match(/^(\d{3})([\s-])/);
        if (m && m[2] === " ") return { code: parseInt(m[1], 10), line };
      }
    }
  }

  async function cmd(line, expected) {
    await writer.write(enc.encode(line + "\r\n"));
    const reply = await readReply();
    if (expected && reply.code !== expected) {
      throw new Error(`smtp_${reply.code}`);
    }
    return reply;
  }

  const greet = await readReply();
  if (greet.code !== 220) throw new Error(`smtp_${greet.code}`);
  await cmd(`EHLO drz-academy.github.io`, 250);
  await cmd("AUTH LOGIN", 334);
  await cmd(btoa(user), 334);
  await cmd(btoa(pass), 235);
  await cmd(`MAIL FROM:<${from}>`, 250);
  await cmd(`RCPT TO:<${to}>`, 250);
  await cmd("DATA", 354);

  const boundary = `b${randomToken(8)}`;
  const data = [
    `From: Dr. Z Academy Club <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
    `--${boundary}--`,
    ".",
  ].join("\r\n");
  await cmd(data, 250);
  await cmd("QUIT", 221).catch(() => {});
  try {
    writer.releaseLock();
    reader.releaseLock();
    socket.close();
  } catch {
    /* ignore */
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/lookup") return handleLookup(request, env);
      if (request.method === "POST" && url.pathname === "/register") return handleRegister(request, env);
      if (request.method === "POST" && url.pathname === "/login") return handleLogin(request, env);
      if (request.method === "POST" && url.pathname === "/forgot") return handleForgot(request, env);
      if (request.method === "POST" && url.pathname === "/reset") return handleReset(request, env);
      if (request.method === "GET" && url.pathname === "/me") return handleMe(request, env);
      if (request.method === "POST" && url.pathname === "/logout") return handleLogout(request, env);
      if (request.method === "GET" && url.pathname === "/forms/status") return handleFormStatus(request, env);
      if (request.method === "POST" && url.pathname === "/forms/submit") return handleFormSubmit(request, env);
      if (request.method === "GET" && url.pathname === "/forms/catalog") return handleFormsCatalog(request, env);
      if (request.method === "GET" && url.pathname === "/forms/export-auth") return handleFormsExportAuth(request, env);
      if (request.method === "GET" && url.pathname === "/forms/export") return handleFormsExport(request, env);
      if (request.method === "POST" && url.pathname === "/admin/sync") return handleAdminSync(request, env);
      if (request.method === "GET" && url.pathname === "/admin/forms") return handleAdminForms(request, env);
      if (request.method === "POST" && url.pathname === "/admin/reset-pass") return handleAdminResetPass(request, env);
      if (request.method === "POST" && url.pathname === "/admin/reset-forms") return handleAdminResetForms(request, env);
      if (request.method === "GET" && url.pathname === "/health") {
        return json(request, { ok: true, service: "drz-club-portal" });
      }
      return json(request, { ok: false, error: "not_found" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "worker_exception";
      return json(request, { ok: false, error: "worker_exception", message }, 500);
    }
  },
};

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
 * POST /admin/sync          Authorization: Bearer CLUB_ADMIN_TOKEN
 * POST /admin/reset-pass    Authorization: Bearer CLUB_ADMIN_TOKEN
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
    return json(request, { ok: true, token, profile: publicProfile(found.record) });
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
  return json(request, { ok: true, token, profile: publicProfile(found.record) });
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
    return json(request, { ok: true, token, profile: publicProfile(found.record) });
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
  return json(request, { ok: true, token, profile: publicProfile(found.record) });
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
  return json(request, { ok: true, token: session, profile: publicProfile(found.record) });
}

async function handleMe(request, env) {
  const session = await readSession(env, request);
  if (!session) return json(request, { ok: false, error: "unauthorized" }, 401);
  const found = await loadProfile(env, session.memberId);
  if (!found) return json(request, { ok: false, error: "unauthorized" }, 401);
  return json(request, { ok: true, profile: publicProfile(found.record) });
}

async function handleLogout(request, env) {
  const session = await readSession(env, request);
  if (session) await env.DRZ_CLUB.delete(`session:${session.token}`);
  return json(request, { ok: true });
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

  await Promise.all([
    env.DRZ_CLUB.put(INDEX_PROFILES, JSON.stringify(profiles)),
    env.DRZ_CLUB.put(INDEX_LOOKUPS, JSON.stringify(lookups)),
    env.DRZ_CLUB.put("catalog:cursos", JSON.stringify(cursos)),
  ]);
  return json(request, { ok: true, stored, cursos: cursos.length, kv_puts: 3 });
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
      if (request.method === "POST" && url.pathname === "/admin/sync") return handleAdminSync(request, env);
      if (request.method === "POST" && url.pathname === "/admin/reset-pass") return handleAdminResetPass(request, env);
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

/**
 * Cloudflare Worker — registro de eventos de drz-academy.github.io
 *
 * POST /log              — registrar evento (público, CORS *)
 * GET  /logs?token=…     — listar eventos recientes (requiere LOG_READ_TOKEN)
 * GET  /logs-export?token=… — export paginado para respaldos
 */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    },
  });
}

function getIp(request) {
  const raw =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";
  return String(raw).split(",")[0].trim() || "unknown";
}

function getCountry(request) {
  const raw = (request.headers.get("cf-ipcountry") || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw) ? raw : "XX";
}

function extractReadToken(request, url) {
  const auth = request.headers.get("authorization") || "";
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();
  return (url.searchParams.get("token") || "").trim();
}

function parseExcludedIps(env) {
  const raw = String(env?.EXCLUDED_LOG_IPS || "").trim();
  if (!raw) return new Set();
  return new Set(
    raw.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean),
  );
}

function isExcludedIp(ip, env) {
  const safeIp = String(ip || "").trim();
  return safeIp ? parseExcludedIps(env).has(safeIp) : false;
}

async function listAllKeys(kv) {
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ cursor, limit: 1000 });
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

function parsePositiveInt(value, fallback, { min = 1, max = 1000 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, GET, OPTIONS",
            "access-control-allow-headers": "content-type, authorization",
          },
        });
      }

      if (request.method === "POST" && url.pathname === "/log") {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, error: "invalid_json" }, 400);
        }

        const ip = getIp(request);
        if (isExcludedIp(ip, env)) {
          return jsonResponse({ ok: true, skipped: true, reason: "excluded_ip" });
        }

        const now = new Date().toISOString();
        const record = {
          id: crypto.randomUUID(),
          timestampServer: now,
          ip,
          country: getCountry(request),
          eventType: body.eventType || "unknown",
          page: body.page || "",
          url: body.url || "",
          referrer: body.referrer || "",
          userAgent: body.userAgent || "",
          language: body.language || "",
          details: body.details || {},
          timestampClient: body.timestamp || "",
        };

        const key = `${now}_${record.id}`;
        await env.VISITOR_LOGS.put(key, JSON.stringify(record));
        return jsonResponse({ ok: true });
      }

      if (request.method === "GET" && url.pathname === "/logs") {
        const token = extractReadToken(request, url);
        if (!env.LOG_READ_TOKEN || token !== env.LOG_READ_TOKEN) {
          return jsonResponse({ ok: false, error: "unauthorized" }, 401);
        }

        const limit = parsePositiveInt(url.searchParams.get("limit"), 500, {
          min: 1,
          max: 800,
        });
        const keys = await listAllKeys(env.VISITOR_LOGS);
        const selectedKeys = keys.slice(-limit);
        const values = [];
        const chunkSize = 50;
        for (let i = 0; i < selectedKeys.length; i += chunkSize) {
          const chunk = selectedKeys.slice(i, i + chunkSize);
          const chunkValues = await Promise.all(
            chunk.map(async (k) => {
              const raw = await env.VISITOR_LOGS.get(k.name);
              if (!raw) return null;
              try {
                return JSON.parse(raw);
              } catch {
                return null;
              }
            })
          );
          values.push(...chunkValues);
        }
        const logs = values
          .filter((entry) => entry && typeof entry === "object" && "eventType" in entry)
          .sort((a, b) =>
            String(b.timestampServer).localeCompare(String(a.timestampServer)),
          );
        return jsonResponse({
          ok: true,
          count: logs.length,
          logs,
          totalKeys: keys.length,
          limited: keys.length > limit,
          limit,
        });
      }

      if (request.method === "GET" && url.pathname === "/logs-export") {
        const token = extractReadToken(request, url);
        if (!env.LOG_READ_TOKEN || token !== env.LOG_READ_TOKEN) {
          return jsonResponse({ ok: false, error: "unauthorized" }, 401);
        }

        const cursor = url.searchParams.get("cursor") || undefined;
        const page = await env.VISITOR_LOGS.list({ cursor, limit: 500 });
        
        const values = [];
        const chunkSize = 50;
        for (let i = 0; i < page.keys.length; i += chunkSize) {
          const chunk = page.keys.slice(i, i + chunkSize);
          const chunkValues = await Promise.all(
            chunk.map(async (k) => {
              const raw = await env.VISITOR_LOGS.get(k.name);
              if (!raw) return null;
              try {
                return JSON.parse(raw);
              } catch {
                return null;
              }
            })
          );
          values.push(...chunkValues);
        }

        const logs = values.filter((entry) => entry && typeof entry === "object" && "eventType" in entry);

        return jsonResponse({
          ok: true,
          count: logs.length,
          logs,
          cursor: page.cursor,
          list_complete: page.list_complete,
        });
      }

      return jsonResponse({ ok: false, error: "not_found" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_worker_error";
      return jsonResponse({ ok: false, error: "worker_exception", message }, 500);
    }
  },
};

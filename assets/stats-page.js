const TOKEN_KEY = "drzAcademyStatsToken";
const DEFAULT_LIMIT = 800;

const EVENT_LABELS = {
  page_view: "Vista de página",
  course_page_view: "Vista de curso",
  demo_page_view: "Vista de demo",
  app_click: "Click en app",
  demo_click: "Click en demo (índice)",
  course_click: "Click en curso (índice)",
  course_enroll_click: "Inscribirse ahora",
  club_visit: "Visita al Club",
  club_click_classroom: "Ir a Classroom",
  club_click_hotmart: "Ir a Hotmart",
  club_click_certificado: "Descargar Certificado",
  club_click_evaluacion: "Abrir evaluación del curso",
  club_form_submit: "Enviar evaluación",
  club_form_certificado: "Descargar certificado (evaluación)",
};

function endpointFromMeta() {
  const el = document.querySelector('meta[name="visitor-log-read-endpoint"]');
  return String(el?.getAttribute("content") ?? "").trim();
}

function notifyEndpointFromMeta() {
  const el = document.querySelector('meta[name="course-notify-endpoint"]');
  return String(el?.getAttribute("content") ?? "").trim();
}

function fmt(n) {
  return Number(n || 0).toLocaleString("es-CO");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function countBy(items, selector) {
  const map = new Map();
  for (const item of items) {
    const key = selector(item);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function uniqueIps(logs) {
  return new Set(logs.map((l) => l.ip).filter(Boolean)).size;
}

function eventLabel(type) {
  return EVENT_LABELS[type] || type;
}

function targetLabel(log) {
  const d = log.details || {};
  return d.targetName || d.courseName || d.demoName || d.pageName || d.curso || log.page || "—";
}

function renderClubRows(visitors) {
  const tbody = document.getElementById("by-club");
  if (!tbody) return;
  if (!visitors.length) {
    tbody.innerHTML = '<tr><td colspan="3">Sin datos</td></tr>';
    return;
  }
  tbody.innerHTML = visitors
    .map(
      (v) =>
        `<tr><td>${escapeHtml(v.name || "—")}</td><td class="stats-email">${escapeHtml(v.email)}</td><td>${fmt(v.visits)}</td></tr>`,
    )
    .join("");
}

function clubVisitors(logs) {
  const map = new Map();
  for (const log of logs) {
    if (log.eventType !== "club_visit") continue;
    const d = log.details || {};
    const email = String(d.memberEmail || d.email || d.correo || "").trim().toLowerCase();
    if (!email) continue;
    const name = String(d.memberName || d.nombre || "").trim();
    const prev = map.get(email) || { name: "", email, visits: 0 };
    if (name) prev.name = name;
    prev.visits += 1;
    map.set(email, prev);
  }
  return [...map.values()].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, "es"));
}

function renderRows(tbodyId, rows, valueFmt = fmt) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="2">Sin datos</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${valueFmt(v)}</td></tr>`)
    .join("");
}

function dateKeyLocal(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildTimeSeries(logs, days) {
  const safeDays = Math.max(1, Number(days) || 7);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (safeDays - 1));
  const byDay = new Map();

  for (let i = 0; i < safeDays; i += 1) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    byDay.set(dateKeyLocal(dt), { key: dateKeyLocal(dt), label: dt.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" }), events: 0, ips: new Set() });
  }

  for (const log of logs) {
    const raw = String(log.timestampServer || "");
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) continue;
    const key = dateKeyLocal(dt);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket.events += 1;
    if (log.ip) bucket.ips.add(log.ip);
  }

  return [...byDay.values()].map((b) => ({
    key: b.key,
    label: b.label,
    events: b.events,
    visitors: b.ips.size,
  }));
}

function renderChart(series) {
  const host = document.getElementById("stats-timeseries");
  if (!host) return;
  if (!series.length) {
    host.innerHTML = '<p class="stats-muted">Sin datos en el rango.</p>';
    return;
  }

  const width = 900;
  const height = 260;
  const padX = 36;
  const padTop = 16;
  const padBottom = 36;
  const maxY = Math.max(1, ...series.map((r) => Math.max(r.events, r.visitors)));

  function linePoints(selector) {
    const n = series.length;
    const plotW = width - padX * 2;
    const plotH = height - padTop - padBottom;
    return series
      .map((row, idx) => {
        const x = padX + (n === 1 ? plotW / 2 : (idx / (n - 1)) * plotW);
        const val = selector(row);
        const y = padTop + (1 - val / maxY) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  host.innerHTML = `
    <svg class="stats-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Eventos por día">
      <style>
        .promo-tooltip { opacity: 0; transition: opacity 0.15s ease-in-out; pointer-events: none; }
        .promo-group:hover .promo-tooltip { opacity: 1; }
      </style>
      <polyline fill="none" stroke="#F3D361" stroke-width="2.5" points="${linePoints((r) => r.events)}" />
      <polyline fill="none" stroke="#0d7693" stroke-width="2.5" points="${linePoints((r) => r.visitors)}" />
      ${series.map((row, idx) => {
        const n = series.length;
        const plotW = width - padX * 2;
        const plotH = height - padTop - padBottom;
        const x = padX + (n === 1 ? plotW / 2 : (idx / (n - 1)) * plotW);
        const yE = padTop + (1 - row.events / maxY) * plotH;
        const yV = padTop + (1 - row.visitors / maxY) * plotH;
        
        const promo = cachedPromoEvents.find(e => e.date === row.key);
        const promoSvg = promo ? `
          <g class="promo-group" style="cursor: pointer;">
            <line x1="${x.toFixed(1)}" y1="6" x2="${x.toFixed(1)}" y2="${height - padBottom}" stroke="transparent" stroke-width="20" />
            <line x1="${x.toFixed(1)}" y1="6" x2="${x.toFixed(1)}" y2="${height - padBottom}" stroke="#ff4757" stroke-width="2" stroke-dasharray="4" style="opacity: 0.7; pointer-events: none;" />
            <circle cx="${x.toFixed(1)}" cy="6" r="4.5" fill="#ff4757" style="pointer-events: none;" />
            
            <foreignObject x="${x > width / 2 ? x - 260 : x + 10}" y="10" width="250" height="150" class="promo-tooltip">
              <div xmlns="http://www.w3.org/1999/xhtml" style="background: rgba(25,25,25,0.95); border: 1px solid #444; border-radius: 6px; padding: 10px; color: #fff; font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.4; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                <div style="font-weight: 600; color: #ff4757; margin-bottom: 4px;">${escapeHtml(promo.name)}</div>
                <div style="color: #ccc; font-size: 12px;">${escapeHtml(promo.description || "")}</div>
              </div>
            </foreignObject>
          </g>
        ` : '';

        return `
          ${promoSvg}
          <text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle" fill="#888" font-size="11">${escapeHtml(row.label)}</text>
          <text x="${x.toFixed(1)}" y="${(yE - 10).toFixed(1)}" text-anchor="middle" fill="#F3D361" font-size="11" font-weight="bold">${fmt(row.events)}</text>
          <circle cx="${x.toFixed(1)}" cy="${yE.toFixed(1)}" r="5" fill="#F3D361" style="cursor: pointer; stroke: var(--bg); stroke-width: 2px;">
            <title>${escapeHtml(row.label)}: ${fmt(row.events)} eventos</title>
          </circle>
          <text x="${x.toFixed(1)}" y="${(yV + 15).toFixed(1)}" text-anchor="middle" fill="#0d7693" font-size="11" font-weight="bold">${fmt(row.visitors)}</text>
          <circle cx="${x.toFixed(1)}" cy="${yV.toFixed(1)}" r="5" fill="#0d7693" style="cursor: pointer; stroke: var(--bg); stroke-width: 2px;">
            <title>${escapeHtml(row.label)}: ${fmt(row.visitors)} IPs únicas</title>
          </circle>
        `;
      }).join("")}
    </svg>`;
}

function getToken() {
  try {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("LOG_READ_TOKEN") || params.get("token");
    if (fromUrl) {
      try { sessionStorage.setItem(TOKEN_KEY, fromUrl); } catch(e) {}
      if (params.has("LOG_READ_TOKEN") || params.has("token")) {
        const clean = new URL(location.href);
        clean.searchParams.delete("LOG_READ_TOKEN");
        clean.searchParams.delete("token");
        history.replaceState({}, "", clean.pathname + clean.search + clean.hash);
      }
      return fromUrl;
    }
    return sessionStorage.getItem(TOKEN_KEY) || window.__inMemoryToken || "";
  } catch (e) {
    console.warn("Error accediendo a token:", e);
    return window.__inMemoryToken || "";
  }
}

async function fetchLogs(token) {
  const base = endpointFromMeta();
  if (!base) throw new Error("Falta meta visitor-log-read-endpoint");
  const url = `${base}?token=${encodeURIComponent(token)}&limit=${DEFAULT_LIMIT}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    const errorMsg = data.message ? `${data.error}: ${data.message}` : data.error || `HTTP ${res.status}`;
    throw new Error(errorMsg);
  }
  return data.logs || [];
}

async function fetchSubsCount() {
  const base = notifyEndpointFromMeta();
  if (!base) return 0;
  try {
    const res = await fetch(`${base}/subscriber-count`, { headers: { Accept: "application/json" } });
    const data = await res.json();
    return data.count || 0;
  } catch {
    return 0;
  }
}

function renderDashboard(logs, subsCount = 0) {
  const enrollClicks = logs.filter((l) => l.eventType === "course_enroll_click");
  const appClicks = logs.filter((l) => l.eventType === "app_click");
  const demoClicks = logs.filter((l) => l.eventType === "demo_click" || l.eventType === "demo_page_view");
  const courseViews = logs.filter((l) => l.eventType === "course_page_view" || l.eventType === "course_click");
  const clubPeople = clubVisitors(logs);
  const clubVisitCount = logs.filter((l) => l.eventType === "club_visit").length;
  const clubClicks = logs.filter((l) => String(l.eventType).startsWith("club_click_"));

  const summary = document.getElementById("stats-summary");
  if (summary) {
    summary.innerHTML = [
      ["Eventos totales", logs.length],
      ["Visitantes únicos (IP)", uniqueIps(logs)],
      ["Clicks en apps", appClicks.length],
      ["Demos (clicks + vistas)", demoClicks.length],
      ["Cursos (clicks + vistas)", courseViews.length],
      ["Inscripciones", enrollClicks.length],
      ["Visitas al Club", clubVisitCount],
      ["Clicks en cursos (Club)", clubClicks.length],
      ["Miembros en el Club", clubPeople.length],
      ["Newsletters suscritos", subsCount],
    ]
      .map(
        ([k, v]) =>
          `<div class="stats-card"><div class="stats-card__k">${escapeHtml(k)}</div><div class="stats-card__v">${fmt(v)}</div></div>`,
      )
      .join("");
  }

  renderRows(
    "by-event",
    countBy(logs, (l) => eventLabel(l.eventType)),
  );
  renderRows(
    "by-app",
    countBy(appClicks, (l) => targetLabel(l)),
  );
  renderRows(
    "by-demo",
    countBy(demoClicks, (l) => targetLabel(l)),
  );
  renderRows(
    "by-course",
    countBy(courseViews, (l) => targetLabel(l)),
  );
  renderRows(
    "by-enroll",
    countBy(enrollClicks, (l) => targetLabel(l)),
  );
  renderClubRows(clubPeople);
  renderRows(
    "by-club-click",
    countBy(clubClicks, (l) => `${eventLabel(l.eventType)} - ${targetLabel(l)}`),
  );
  renderRows(
    "by-page",
    countBy(logs, (l) => l.page || "—"),
  );
  renderRows(
    "by-country",
    countBy(logs, (l) => l.country || "XX"),
  );

  const rangeDays = Number(document.querySelector(".stats-range-btn.active")?.dataset.rangeDays || 7);
  renderChart(buildTimeSeries(logs, rangeDays));

  const status = document.getElementById("stats-status");
  if (status) {
    const latest = logs[0]?.timestampServer;
    status.textContent = latest
      ? `${fmt(logs.length)} eventos cargados · último: ${new Date(latest).toLocaleString("es-CO")}`
      : `${fmt(logs.length)} eventos cargados`;
  }
}

let cachedLogs = [];
let cachedSubsCount = 0;
let cachedPromoEvents = [];

async function fetchPromoEvents() {
  try {
    const res = await fetch("/analytics/events.json", { cache: "no-store" });
    if (!res.ok) {
      console.error("Error fetch events.json:", res.status);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.error("Error parse events.json:", err);
    return [];
  }
}

async function fetchHistoricalLogs() {
  try {
    const res = await fetch("/analytics/historical-logs.json", { cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 404) console.error("Error fetch historical-logs.json:", res.status);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.error("Error parse historical-logs.json:", err);
    return [];
  }
}

async function loadLogs() {
  const errEl = document.getElementById("stats-error");
  const status = document.getElementById("stats-status");
  if (errEl) errEl.hidden = true;

  let token = getToken();
  if (!token) {
    token = prompt("Token de lectura (LOG_READ_TOKEN):") || "";
    if (!token) {
      if (status) status.textContent = "Sin token — no se pueden cargar los logs.";
      return;
    }
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch(e) {}
    window.__inMemoryToken = token;
  }

  if (status) status.textContent = "Cargando…";
  try {
    const [liveLogs, historicalLogs, subsCount, promoEvents] = await Promise.all([
      fetchLogs(token),
      fetchHistoricalLogs(),
      fetchSubsCount(),
      fetchPromoEvents()
    ]);
    
    const combinedMap = new Map();
    for (const log of historicalLogs) {
      if (log && log.id) combinedMap.set(log.id, log);
    }
    for (const log of liveLogs) {
      if (log && log.id) combinedMap.set(log.id, log);
    }
    
    cachedLogs = [...combinedMap.values()].sort((a, b) => 
      String(b.timestampServer).localeCompare(String(a.timestampServer))
    );
    
    cachedSubsCount = subsCount;
    cachedPromoEvents = promoEvents;
    renderDashboard(cachedLogs, cachedSubsCount);
  } catch (err) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = err instanceof Error ? err.message : String(err);
    }
    if (status) status.textContent = "Error al cargar.";
  }
}

function wireRangeButtons() {
  document.querySelectorAll(".stats-range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".stats-range-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderChart(buildTimeSeries(cachedLogs, Number(btn.dataset.rangeDays || 7)));
    });
  });
}

document.getElementById("stats-refresh")?.addEventListener("click", loadLogs);
wireRangeButtons();
loadLogs();

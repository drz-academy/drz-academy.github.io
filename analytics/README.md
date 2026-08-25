# Analytics — Dr.Z Academy Code

Registro de clicks e interacciones vía **Cloudflare Worker + KV**, igual que [jorgezuluaga.github.io](https://github.com/jorgezuluaga/jorgezuluaga).

## Qué se registra

| Evento | Cuándo |
|--------|--------|
| `page_view` | Vista del índice |
| `app_click` | Click en «Abrir aplicación» |
| `demo_click` | Click en demo desde el índice |
| `demo_page_view` | Apertura de página de demo |
| `course_click` | Click en tarjeta de curso |
| `course_page_view` | Vista de hoja de curso |
| `course_enroll_click` | «Inscribete ahora» o «Adquirir en Hotmart» |
| `club_visit` | Entrada al portal del Club (nombre y correo del miembro) |

Cada evento guarda IP, país (CF), ruta, referrer y detalles (`targetId`, `targetName`, `href`).

## Despliegue del Worker (una vez)

```bash
cd analytics/worker

# 1. Crear namespace KV
npx wrangler kv namespace create VISITOR_LOGS
# Copiar el id en wrangler.toml → [[kv_namespaces]].id

# 2. Token secreto para leer logs (panel /stats.html)
npx wrangler secret put LOG_READ_TOKEN

# 3. Desplegar
npx wrangler deploy
# o desde la raíz del repo:
make worker-deploy
```

URL del worker: `https://drz-academy-visitor-log.drz-academy.workers.dev`

Endpoints:
- `POST /log` — recibir eventos (público)
- `GET /logs?token=…` — leer eventos (requiere `LOG_READ_TOKEN`)

Opcional en `wrangler.toml`:
```toml
[vars]
EXCLUDED_LOG_IPS = "tu.ip.publica"
```

## Panel de estadísticas

Tras desplegar el sitio, abre:

```
https://drz-academy.github.io/stats.html
```

Pide el `LOG_READ_TOKEN` la primera vez (se guarda en `sessionStorage`). También puedes pasarlo en la URL:

```
https://drz-academy.github.io/stats.html?LOG_READ_TOKEN=TU_TOKEN
```

La página **no está enlazada** desde el menú público (`noindex`).

## Archivos del sitio

| Archivo | Rol |
|---------|-----|
| `assets/visitor-tracker.js` | Envío de eventos al worker |
| `assets/site-analytics.js` | Page views + clicks `[data-track]` |
| `assets/stats-page.js` | Panel de estadísticas |
| `stats.html` | UI del panel |
| `index.html` | Meta endpoint + tracking en apps/demos/cursos |
| `cursos/build_course.py` | Inyecta tracking en páginas de curso |
| `demos/build_demo.py` | Inyecta tracking en demos |

Tras cambiar los generadores, regenera:

```bash
make cursos demos sync-site
```

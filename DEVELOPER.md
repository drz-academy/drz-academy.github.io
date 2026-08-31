# Guía para desarrolladores

Instrucciones para trabajar en [drz-academy.github.io](https://drz-academy.github.io): sitio estático con la página principal, aplicaciones Next.js y hojas de curso generadas desde Markdown.

## Requisitos

- **Python 3.10+** (generador de cursos)
- **Node.js 20+** (apps en `apps/`)
- **Git**

## Configuración del entorno

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Dependencias Python (`requirements.txt`):

| Paquete | Uso |
|---------|-----|
| `pyyaml` | Frontmatter YAML de `curso.md` |
| `markdown` | Conversión Markdown → HTML |
| `qrcode[pil]` | Códigos QR de inscripción (cursos) y demos |

## Probar el sitio en local

```bash
make build    # compila apps Next.js y ensambla _site/
make start    # sirve _site/ en http://127.0.0.1:8000
make stop     # detiene el servidor
```

El sitio local replica lo que publica GitHub Pages: página principal, cursos en `/cursos/<id>/`, demos en `/demos/<id>/` y apps en `/apps/...`.

---

## Cursos: modelo de archivos

Cada curso vive en `cursos/<id>/`:

```
cursos/mi-curso/
├── curso.md              ← fuente de verdad (editar aquí)
├── index.html            ← generado; no editar a mano
└── images/
    ├── header.png        ← banner del curso (~2048×952 px)
    ├── qr-curso.png        ← afiche → hoja del curso (generado, con logo)
    ├── qr-inscripcion.png  ← página → URL de inscripción (generado)
    ├── foto1.jpg         ← opcional
    └── foto2.jpg         ← opcional
```

El índice de la página principal lee `cursos/courses.json`, también generado por el script.

---

## Publicar un curso nuevo

### 1. Crear el esqueleto

```bash
python3 cursos/build_course.py --new mi-curso
```

Esto crea `cursos/mi-curso/` desde la plantilla en `cursos/template/curso.md`, actualiza el `id` y genera el **QR de afiche** (`qr-curso.png`) apuntando a la hoja del curso.

### 2. Completar metadatos y contenido

Edita `cursos/mi-curso/curso.md`:

- **Frontmatter** (bloque YAML entre `---`): título, tagline, instructor, horarios, URL de inscripción, etc.
- **Cuerpo**: secciones con `## Título`. Usa `<!-- fotos -->` donde quieras la cuadrícula de fotos.

Campos importantes:

| Campo | Descripción |
|-------|-------------|
| `id` | Identificador único (= nombre del directorio) |
| `inscripcion_url` | Enlace de inscripción; codifica `qr-inscripcion.png` |
| `imagen_header` | Banner (`images/header.png`, ~2048×952 px) |
| `imagen_og` | Fuente opcional para `og:image` (genera `images/og-share.jpg`; siempre se crea también `images/og-preview.jpg` desde el banner) |
| `imagen_qr_curso` | QR de afiche → hoja del curso (generado) |
| `imagen_qr` | QR de inscripción en la página (generado) |
| `fotos`, `fotos1`, `fotos2`… | Listas de imágenes; insertar con `<!-- fotos -->`, `<!-- fotos1 -->`, etc. |
| `activo` | `true` para mostrar en el índice y mostrar bloque de inscripción |

En el cuerpo del markdown puedes usar cualquier campo escalar del frontmatter con `<!--campo-->`, por ejemplo:

```markdown
[enlace de inscripción](<!--inscripcion_url-->)
Las sesiones son los **<!--dia-->** de <!--horario-->.
```

### 3. Añadir imágenes

Copia el banner y fotos a `cursos/mi-curso/images/`:

- **header.png** — banner horizontal para la cabecera (~2048×952 px)
- **og-preview.jpg** — se genera solo; versión liviana del banner para WhatsApp/Twitter
- **foto1.jpg**, **foto2.jpg** — opcionales, referenciadas en `fotos:` del frontmatter

### 4. Generar la página y actualizar el índice

```bash
python3 cursos/build_course.py cursos/mi-curso/curso.md
```

Este comando:

1. **Regenera ambos QR** (`qr-curso.png` con logo → hoja del curso; `qr-inscripcion.png` → `inscripcion_url`)
2. Genera `cursos/mi-curso/index.html`
3. Actualiza `cursos/courses.json` para la tarjeta del índice

### 5. Revisar en local y publicar

```bash
make build && make start
# Abre http://127.0.0.1:8000/cursos/mi-curso/
```

Cuando esté listo, haz commit y push a `main`. GitHub Actions despliega automáticamente en unos minutos.

---

## Actualizar un curso existente

1. Edita `cursos/<id>/curso.md` (texto, metadatos o URL de inscripción).
2. Si cambiaste imágenes, reemplaza archivos en `cursos/<id>/images/`.
3. Regenera:

```bash
python3 cursos/build_course.py cursos/<id>/curso.md
```

4. Commit de `curso.md`, `index.html`, `courses.json` e imágenes (incluidos `qr-curso.png` y `qr-inscripcion.png` si cambiaron).
5. Push a `main`.

> **Nota:** En CI, cada deploy vuelve a generar todas las páginas desde `curso.md` con `--no-update-json`. El `courses.json` del repo debe estar commiteado tras un build local.

### Opciones del generador

```bash
# Sin tocar courses.json (útil en CI; ya lo hace el workflow)
python3 cursos/build_course.py cursos/mi-curso/curso.md --no-update-json

# Sin regenerar el QR
python3 cursos/build_course.py cursos/mi-curso/curso.md --no-qr
```

---

## Códigos QR

El script genera **dos QR** de 512×512 px cada vez que corres `build_course.py`:

| Archivo | Destino | Uso | Logo |
|---------|---------|-----|------|
| `images/qr-curso.png` | `https://drz-academy.github.io/cursos/<id>/` | Afiches, flyers, material impreso | Sí |
| `images/qr-inscripcion.png` | `inscripcion_url` del frontmatter | Bloque «Inscríbete ya» en la página web | Sí |

El QR de inscripción solo se genera si `inscripcion_url` tiene una URL real (no el placeholder `https://drz.academy`).

Regenera ambos al cambiar URLs o al crear el curso:

```bash
python3 cursos/build_course.py cursos/mi-curso/curso.md
```

### Previsualización en WhatsApp / redes

WhatsApp no acepta banners pesados (>300 KB). El script **siempre** genera **`images/og-preview.jpg`** (≈1200 px, JPEG) a partir de `imagen_header`.

Opcionalmente, en `curso.md` puedes definir **`imagen_og`** con otra imagen fuente (p. ej. un afiche vertical). El script genera además **`images/og-share.jpg`** en **1200×1500** (4:5, misma proporción que Instagram) comprimido a ≤300 KB para WhatsApp. El `og-preview.jpg` del banner se sigue creando igual.

Tras desplegar, si WhatsApp sigue mostrando la imagen vieja, borra la caché en el [Depurador de contenido compartido de Meta](https://developers.facebook.com/tools/debug/) (pega la URL del curso y pulsa «Scrape Again»).

---

## Sistema de Suscripciones y Newsletters

El sitio incluye un sistema básico para manejar suscriptores de cursos (guardados en Cloudflare KV) y enviarles newsletters en formato Markdown usando Gmail SMTP. El código vive en `notify/`.

### Configuración de Secretos

Crea el directorio `.secrets/` en la raíz (ignorado por Git) y añade los siguientes archivos:
- `notify-token`: Contraseña secreta para comunicarse con el Worker.
- `notify-worker-url`: URL del worker desplegado en Cloudflare (ej. `https://drz-course-notify-worker.tu-dominio.workers.dev`).
- `gmail-smtp-user`: Tu correo de envío (ej. `tucorreo@gmail.com`).
- `gmail-app-password`: [Contraseña de aplicación de Gmail](https://myaccount.google.com/apppasswords).

### 1. Desplegar el Worker de notificaciones

Para manejar la lista de correos y los links de desuscripción de forma segura, primero debes desplegar el backend:

```bash
# 1. Crear el KV namespace (solo la primera vez)
cd notify/worker
npx wrangler kv namespace create DRZ_NOTIFY
# (copiar el ID devuelto al wrangler.toml)

# 2. Configurar el token de seguridad
npx wrangler secret put NOTIFY_TOKEN

# 3. Desplegar el worker
make notify-worker-deploy
```

### 2. Importar y consultar suscriptores

```bash
# Importar desde un CSV (debe tener una columna 'email' o correo válido)
make notify-import-csv CSV=contrib/contacts-test.csv

# Consultar lista de correos suscritos
make notify-list
```

### 3. Crear, Probar y Enviar un Newsletter

Para enviar un boletín (newsletter), debes crear un archivo Markdown. El script convierte este archivo a HTML compatible con clientes de correo e inyecta un enlace único de desuscripción al final para cada destinatario.

**Paso 1: Preparar la newsletter**
Crea un archivo `.md` (p. ej. `notify/mi-newsletter.md`) con la siguiente estructura. Es importante incluir el `subject` en el frontmatter y usar HTML con CSS en línea (inline CSS) para garantizar compatibilidad con los clientes de correo:

```markdown
---
subject: "[Novedades Dr. Z Academy] Título de mi correo"
---
<div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
  <!-- Aquí va tu diseño, imágenes y contenido usando etiquetas HTML y CSS inline -->
</div>
```

**Paso 2: Previsualizar en el navegador**
Antes de enviar correos, revisa cómo se verá la newsletter generada:

```bash
make notify-preview-newsletter FILE=notify/mi-newsletter.md
```
Esto creará un archivo `notify/preview.html` y lo abrirá en tu navegador predeterminado para que lo revises.

**Paso 3: Prueba de envío real**
Envía una prueba a tu propio correo (o a varios separados por comas) para verificar cómo se ve en un cliente de correo real como Gmail:

```bash
make notify-send-newsletter FILE=notify/mi-newsletter.md TEST_EMAILS=tucorreo@gmail.com,otro@gmail.com
```

**Paso 4: Envío a todos los suscriptores**
Cuando estés satisfecho con el resultado, ejecuta el comando final (sin `TEST_EMAILS`) para enviar la newsletter a la base de datos completa guardada en Cloudflare:

```bash
make notify-send-newsletter FILE=notify/mi-newsletter.md
```

---

## Consulta del Dr. Z Academy Club

Los participantes consultan categoría, cursos, Classroom y certificados en `/club/`. Cómo funciona el Club, el catálogo y el flujo local están en [`club/README.md`](club/README.md). **Los datos personales no van a GitHub**: viven en `club/personal/` y se suben a un Cloudflare Worker + KV.

---

## Formularios del Club (`club/drz-forms/`)

El motor es genérico: una sola página (`drz-form.html` + `drz-form.js`) pinta cualquier esquema JSON. Las respuestas se guardan en Cloudflare KV (no en GitHub). El formulario de evaluación de cursos es el que desbloquea el certificado.

```
club/drz-forms/
├── drz-form.html              Motor (no hace falta tocarlo para un formulario nuevo)
├── drz-form.js
├── drz-stats.html             Estadísticas anónimas (TOKEN)
├── drz-stats.js
├── evaluacion-curso.json      Esquema de la evaluación de cursos
└── cursos-opciones.json       Lista pública id+nombre (se regenera en el build)
```

URL de un formulario:

```
/club/drz-forms/drz-form.html?form=<id-del-json>&curso=<id-del-curso>
```

Vista previa sin login: añade `&preview=1`.

El `id` del JSON (y del archivo) solo admite minúsculas, números, `_` y `-` (máx. 64 caracteres). El archivo tiene que llamarse `<id>.json`.

### 1. Crear un formulario

Copia `evaluacion-curso.json` o parte de cero. Estructura:

```json
{
  "id": "mi-formulario",
  "titulo": "Título que ve la persona",
  "intro": "Texto bajo el título.",
  "requiere_curso": true,
  "revela_certificado": true,
  "secciones": [
    {
      "id": "seccion_1",
      "titulo": "Nombre de la sección",
      "explicacion": "Opcional, bajo el título de sección.",
      "preguntas": [ ]
    }
  ]
}
```

| Campo del formulario | Qué hace |
|----------------------|----------|
| `requiere_curso` | `true`: hay que estar inscrito en el curso del enlace (o elegido en el desplegable). |
| `revela_certificado` | `true`: al enviar, si hay certificado, se muestra el enlace. |
| `prueba_certificado_url` | Solo modo `TOKEN`: enlace de certificado de ejemplo al enviar sin guardar. |
| `prueba_curso_nombre` | Nombre que acompaña ese certificado de ejemplo. |

Cada pregunta:

| Campo | Obligatorio | Notas |
|-------|-------------|--------|
| `id` | sí | Clave en el CSV (`curso`, `lo_mejor`, …) |
| `enunciado` | sí | Texto de la pregunta |
| `tipo` | sí | Ver tabla de tipos |
| `obligatoria` | no | Por defecto `true`. Pon `false` para opcional |
| `explicacion` | no | Texto gris bajo el enunciado |
| `default` | no | Valor inicial. Aplica a `lista_desplegable`, `escala_scroll`, `radio` y `opciones`. El prefill (p. ej. `?curso=`) gana si existe. En `opciones` puede ser un string o una lista. En `escala_scroll` deja la escala ya marcada. |

Tipos:

| `tipo` | Campos extra |
|--------|----------------|
| `texto` | Una línea |
| `parrafo` | Varias líneas |
| `radio` | Radio buttons. `opciones`: strings o `{ "id", "label" }`. `default`: id de la opción |
| `opciones` | Checkboxes (varias a la vez). `opciones` igual que `radio`. `default`: id o lista de ids |
| `seleccion_unica` | Alias de `radio` |
| `seleccion_multiple` | Alias de `opciones` |
| `puntaje` | `min`, `max` (enteros; por defecto 1–5) |
| `lista_desplegable` | `opciones`, o `"fuente": "cursos"` para el catálogo. `default`: id de la opción |
| `escala_scroll` | `min`, `max`, `step`, `min_label`, `max_label`, `emotions` (caras en los enteros, no tienen que coincidir con cada `step`), `flip_aleatorio` (`true` = al azar de menor a mayor o al revés; el valor guardado sigue siendo min→max), `default`: número dentro del rango |

Guarda el archivo en `club/drz-forms/<id>.json`.

Vista previa local (con el servidor de `make start` o sirviendo la raíz del repo):

```
http://127.0.0.1:8000/club/drz-forms/drz-form.html?form=mi-formulario&preview=1
```

### 2. Desplegarlo

Hay **tres capas**. Según lo que cambies:

| Qué cambiaste | Qué correr |
|---------------|------------|
| Preguntas JSON, HTML o JS del formulario | Commit + push a `main` (GitHub Pages copia `club/drz-forms/`) **y** `make club-sync` para subir el esquema a KV |
| `"evaluacion"` en `cursos.json` | `make club-sync` |
| Código del Worker (`club/worker/`) | `make club-worker-deploy` **y** luego `make club-sync` si también cambió el JSON |

```bash
make club-worker-deploy   # solo si todiste el Worker
make club-sync            # catálogo + miembros + esquemas de formularios → KV
```

Sin `club-sync` el portal no conoce el formulario nuevo y el Worker rechaza el envío (`schema_missing`).

El HTML público se publica con el deploy de GitHub Pages (unos minutos tras el push).

### 3. Asociarlo a un curso (evaluación + certificado)

El enlace **Evaluación** del Club y el candado del certificado usan **siempre** el formulario `evaluacion-curso`.

1. En `club/cursos.json`, en ese curso:

```json
"evaluacion": true
```

2. `make club-sync`

En el portal, ese curso muestra **Evaluación** y **no** muestra **Certificado** hasta que la persona envíe el formulario. El enlace que genera el Club es:

```
/club/drz-forms/drz-form.html?form=evaluacion-curso&curso=<id>
```

(`<id>` es el `id` del curso en `cursos.json`, p. ej. `masterclass_extraterrestre`.)

Otros JSON en `drz-forms/` sirven con el mismo motor, pero **no** desbloquean el certificado a menos que el portal apunte a ese `form=` (hoy está fijo a `evaluacion-curso`).

### 4. Probar el flujo de un miembro

Usuario de prueba (ver `club/README.md`): cédula `666666`, correo `puntobernal@gmail.com`.

1. Entra a `/club/`, abre **Evaluación** en un curso con `"evaluacion": true`.
2. Envía el formulario.
3. Debe aparecer el certificado (si ya está en `personal/certificados.csv`) y, al volver al Club, el chip **Certificado**.

Para volver a evaluar en pruebas, borra las respuestas en KV:

```bash
make club-forms-reset
```

Pide confirmación: *¿Estás completamente seguro de borrar todas las evaluaciones?* Responde `sí`. No borra esquemas ni perfiles.

### 5. Descargar las respuestas

**Desde el navegador (administrador):** abre el formulario con la clave maestra del Club en la URL (el secreto `CLUB_ADMIN_MASTER` del Worker; no está en el JavaScript):

```
/club/drz-forms/drz-form.html?form=evaluacion-curso&TOKEN=<CLUB_ADMIN_MASTER>
```

Aparece **Analizar resultados** y **Descargar resultados (CSV)**. También puedes **enviar el formulario en modo prueba**: valida las respuestas, no las guarda en KV/CSV y, en `evaluacion-curso`, muestra el certificado de ejemplo (El Rompecabezas de la Materia, Juan Manuel Montoya). El `TOKEN` se quita de la barra al cargar.

**Estadísticas (anónimas, sin nombres):**

```
/club/drz-forms/drz-stats.html?form=evaluacion-curso&TOKEN=<CLUB_ADMIN_MASTER>
/club/drz-forms/drz-stats.html?form=evaluacion-curso&filter=curso:Master Class Extraterrestre&TOKEN=<CLUB_ADMIN_MASTER>
```

`filter=` acepta `campo:valor` (varios unidos con `;`). `curso:` filtra por el nombre del curso (coincidencias flexibles). El nombre de quien evalúa no aparece. Requiere el Worker con `GET /forms/stats` (`make club-worker-deploy`).

**Desde la máquina (JSON en `club/personal/formularios/`, gitignored, y CSV de backup en git):**

```bash
make club-forms-export
make club-forms-export FORM=evaluacion-curso
make club-forms-export FORM=evaluacion-curso CURSO=masterclass_extraterrestre
```

Usa `.secrets/club-admin-token` y `.secrets/club-worker-url`. El CSV queda en `club/drz-forms/<id>-respuestas.csv` (p. ej. `evaluacion-curso-respuestas.csv`). Ese archivo **no** se publica en GitHub Pages.

**Backup diario en GitHub:** el workflow `Backup form responses` corre cada mañana (~7:50 AM COT), baja todas las respuestas y hace commit del CSV si cambió. Así un `make club-forms-reset` no borra el histórico en git. En el repo hace falta el secreto `CLUB_ADMIN_TOKEN` (el mismo del Worker; también vale `CLUB_ADMIN_MASTER`). Opcional: `CLUB_WORKER_URL` si no es el Worker por defecto.

También puedes lanzarlo a mano: **Actions** → **Backup form responses** → **Run workflow**.

### 6. Qué toca cada comando

| Comando | Efecto |
|---------|--------|
| `make club-sync` | Sube miembros, `cursos.json` y todos los `club/drz-forms/*.json` de formulario a KV |
| `make club-worker-deploy` | Publica `club/worker/club-portal-worker.js` |
| `make club-forms-export` | Baja respuestas a `club/personal/formularios/` (JSON) y `club/drz-forms/<id>-respuestas.csv` |
| `make club-forms-reset` | Borra respuestas de evaluación en KV (pide confirmación) |
| Push a `main` | Publica HTML/JS/JSON estáticos en GitHub Pages |

---

## Estadísticas de clicks

El sitio registra interacciones (apps, demos, cursos, botón «Inscribete ahora») en un **Cloudflare Worker** con KV. Ver [`analytics/README.md`](../analytics/README.md) para desplegar el worker y abrir el panel en `/stats.html`.

---

## Demos interactivos: modelo de archivos

Los demos son simulaciones didácticas ligeras (HTML/CSS/JS) que viven en `demos/<id>/`. Comparten una plantilla de página y una hoja de estilos común; el widget interactivo suele venir de fuera (p. ej. exportado desde Gemini) y se pega tal cual en `content.html`.

```
demos/
├── demo.css              ← estilos compartidos (topbar, hero, footer)
├── build_demo.py         ← generador de páginas + QR
├── demos.json            ← índice para la sección «Demos» del index (generado)
├── template/demo.json    ← plantilla para demos nuevos
└── mi-demo/
    ├── demo.json         ← metadatos del encabezado y tarjeta del índice
    ├── content.html      ← widget interactivo (editar aquí)
    ├── teoria.html       ← contexto teórico opcional
    ├── index.html        ← generado; no editar a mano
    └── images/
        └── qr-demo.png   ← QR → URL pública del demo (generado, con logo)
```

La página principal carga las tarjetas desde `demos/demos.json`, igual que los cursos usan `cursos/courses.json`.

---

## Publicar un demo nuevo

### 1. Crear el esqueleto

```bash
python3 demos/build_demo.py --new mi-demo
```

Esto crea `demos/mi-demo/` con `demo.json`, `content.html` (placeholder) y `teoria.html`.

### 2. Completar metadatos

Edita `demos/mi-demo/demo.json`:

| Campo | Descripción |
|-------|-------------|
| `id` | Identificador único (= nombre del directorio) |
| `titulo` | Primera parte del título del hero |
| `titulo_destacado` | Palabra resaltada en amarillo (p. ej. «Rayleigh») |
| `categoria` | Aparece en la etiqueta «Demo interactivo · …» |
| `breadcrumb` | Texto corto en la ruta de navegación (opcional) |
| `descripcion` | Párrafo bajo el título en la página del demo |
| `descripcion_corta` | Resumen para la tarjeta en el índice |
| `icono` | Emoji de la tarjeta (p. ej. `🔭`) |
| `etiquetas` | Tags en la tarjeta del índice |
| `activo` | `true` para mostrar en el índice |
| `teoria_titulo` | Título de la sección teórica (opcional) |
| `qr_imagen` | Ruta del QR generado (por defecto `images/qr-demo.png`) |

### 3. Pegar el widget interactivo

Copia el HTML/CSS/JS del demo en `demos/mi-demo/content.html`. Normalmente incluye un `<style>`, el markup del widget y un `<script>`.

El generador adapta estilos que apuntan a `body` para que no rompan el fondo blanco de la plantilla (los reescribe bajo `.demo-widget`).

**Importar desde HTML de WordPress o drz.academy** (bloque de código embebido):

```bash
python3 demos/build_demo.py --import "contrib/Mi demo – Dr. Z Academy.html" --into demos/mi-demo/
```

Extrae el contenido del bloque de código y lo guarda en `content.html`.

### 4. Añadir contexto teórico (opcional)

Edita `demos/mi-demo/teoria.html` con párrafos HTML. Aparece bajo el widget en la página del demo.

### 5. Generar la página, QR e índice

```bash
python3 demos/build_demo.py demos/mi-demo/demo.json
```

Este comando:

1. Genera `demos/mi-demo/index.html` (plantilla común + encabezado + widget + teoría)
2. Genera `images/qr-demo.png` apuntando a `https://drz-academy.github.io/demos/<id>/`
3. Actualiza `demos/demos.json` para la tarjeta del índice

Para regenerar **todos** los demos:

```bash
python3 demos/build_demo.py --all
# o
make demos
```

### 6. Revisar en local y publicar

```bash
make demos sync-site
cd _site && python3 -m http.server 8000
# Abre http://127.0.0.1:8000/demos/mi-demo/
```

Para el sitio completo (apps incluidas): `make build && make start`.

Cuando esté listo, haz commit de `demo.json`, `content.html`, `teoria.html`, `index.html`, `demos.json` e `images/qr-demo.png`, y push a `main`.

---

## Actualizar un demo existente

1. Edita `demos/<id>/demo.json` (texto del encabezado, tarjeta, etc.).
2. Si cambiaste el widget, edita `demos/<id>/content.html`.
3. Regenera:

```bash
python3 demos/build_demo.py demos/<id>/demo.json
```

4. Commit y push a `main`.

### Opciones del generador

```bash
# Sin regenerar QR
python3 demos/build_demo.py demos/mi-demo/demo.json --no-qr

# Sin tocar demos.json
python3 demos/build_demo.py demos/mi-demo/demo.json --no-update-json
```

---

## QR de demos

Cada demo genera un QR de 512×512 px con el logo de Dr. Z en el centro:

| Archivo | Destino | Uso |
|---------|---------|-----|
| `images/qr-demo.png` | `https://drz-academy.github.io/demos/<id>/` | Afiches, presentaciones, material impreso |

Regenera al crear o actualizar el demo:

```bash
python3 demos/build_demo.py demos/<id>/demo.json
```

---

## Despliegue en producción

El workflow `.github/workflows/deploy.yml` se ejecuta en cada push a `main`:

1. Instala dependencias Python (`requirements.txt`) y Node.js
2. Compila las apps Next.js
3. Regenera HTML de todos los cursos desde `cursos/*/curso.md`
4. Regenera HTML de todos los demos desde `demos/*/demo.json`
5. Ensambla `_site/` y publica en GitHub Pages

URL pública: **https://drz-academy.github.io**

También puedes lanzar el deploy manualmente desde la pestaña **Actions** → **Deploy to GitHub Pages** → **Run workflow**.

---

## Referencia rápida

| Tarea | Comando |
|-------|---------|
| Nuevo curso | `python3 cursos/build_course.py --new <id>` |
| Generar / actualizar curso | `python3 cursos/build_course.py cursos/<id>/curso.md` |
| Nuevo demo | `python3 demos/build_demo.py --new <id>` |
| Generar / actualizar demo | `python3 demos/build_demo.py demos/<id>/demo.json` |
| Regenerar todos los demos | `python3 demos/build_demo.py --all` o `make demos` |
| Sitio local | `make build && make start` |
| Formulario del Club (evaluación) | `club/drz-forms/` — ver sección *Formularios del Club* |
| Sync Club → Worker | `make club-sync` |
| Exportar respuestas | `make club-forms-export` |
| Borrar evaluaciones (pruebas) | `make club-forms-reset` |
| Plantilla de curso | `cursos/template/curso.md` |
| Plantilla de demo | `demos/template/demo.json` |
| Generador de cursos | `cursos/build_course.py` |
| Generador de demos | `demos/build_demo.py` |

## Estructura del repositorio

```
index.html              Página principal
assets/                 Logos, favicons
cursos/
  build_course.py       Generador de cursos + QR
  courses.json          Índice de cursos (generado)
  template/curso.md     Plantilla para cursos nuevos
  <id>/                 Un directorio por curso
demos/
  demo.css              Estilos compartidos de demos
  build_demo.py         Generador de demos + QR
  demos.json            Índice de demos (generado)
  template/demo.json    Plantilla para demos nuevos
  <id>/                 Un directorio por demo
notify/
  worker/               Backend en Cloudflare Workers + KV (suscripciones)
  client/               Scripts Python para importar contactos y enviar correos
club/
  README.md             Cómo funciona el Club, catálogo y flujo local
  index.html            Consulta de participación (sin datos personales)
  portal.js             Cliente del Worker
  cursos.json           Catálogo (incluye `"evaluacion": true` para pedir el formulario)
  drz-forms/            Motor de formularios + JSON de preguntas
  worker/               Backend en Cloudflare Workers + KV (perfiles, claves, respuestas)
  client/sync_members.py  Sube club/ + club/personal/ al Worker (personal/ no va a Git)
  client/export_forms.py  Descarga JSON a personal/formularios/ y CSV a drz-forms/
  client/reset_forms.py   Borra evaluaciones en KV
  bin/                  Scripts locales: base de datos, clasificación, boletines, informe
  personal/             Datos confidenciales (gitignored): miembros, boletines, inscripciones
apps/
  cloud_academy/        Cámara de burbujas (Next.js)
  lighting-black-holes/ Simulación agujeros negros (Next.js)
.github/workflows/      CI/CD GitHub Pages
Makefile                Build y servidor local
requirements.txt        Dependencias Python
```

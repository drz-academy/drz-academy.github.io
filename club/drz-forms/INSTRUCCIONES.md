# Formularios del Club (`drz-forms`)

Guía práctica para crear, publicar y sincronizar formularios. El motor es genérico: una sola página (`drz-form.html` + `drz-form.js`) pinta cualquier esquema JSON. Las respuestas viven en Cloudflare KV (no en GitHub).

Para el contexto del Club (miembros, certificados, categorías) ver [`club/README.md`](../README.md). Una versión resumida también está en [`DEVELOPER.md`](../../DEVELOPER.md#formularios-del-club-clubdrz-forms).

```
club/drz-forms/
├── INSTRUCCIONES.md           ← este archivo
├── drz-form.html / .js        Motor (casi nunca lo tocas para un form nuevo)
├── drz-stats.html / .js       Estadísticas anónimas (admin)
├── sheets-sync.gs             Apps Script: respuestas → Google Sheets
├── evaluacion-curso.json      Evaluación que desbloquea certificados
├── circulo-latino-c1-a1-casos.json   Actividad 1 (casos)
├── circulo-latino-c1-a2-casos.json   Actividad 2 (casos)
└── *-respuestas.csv           Backup local / CI (no se publica en Pages)
```

---

## 1. Crear un formulario

1. Elige un `id` (minúsculas, números, `_` y `-`; máx. 64 caracteres).
2. Crea `club/drz-forms/<id>.json` con el mismo `id` dentro del JSON.
3. Define título, secciones y preguntas (ver abajo).
4. Previsualiza en local y luego **sincroniza** (sección 3).

### Esqueleto

```json
{
  "id": "mi-formulario",
  "titulo": "Título que ve la persona",
  "intro": "Texto bajo el título. Admite **negrita**.",
  "fondo": "claro",
  "token": "clave-compartida",
  "requiere_curso": false,
  "revela_certificado": false,
  "boton": "Grabar",
  "titulo_gracias": "¡Listo!",
  "mensaje_gracias": "Ya registramos tus respuestas.",
  "mostrar_respuestas": true,
  "secciones": [
    {
      "id": "seccion_1",
      "titulo": "Nombre de la sección",
      "explicacion": "Opcional.",
      "preguntas": []
    }
  ]
}
```

### Campos del formulario

| Campo | Qué hace |
|-------|----------|
| `fondo` | `"claro"` u `"oscuro"` (por defecto oscuro). |
| `token` | Clave del enlace compartido (`?token=`). Si falta o no coincide, pide login al Club. |
| `token_docente` | Clave de revisión docente (`?token_docente=`). Lista y navega todas las respuestas. Al cambiar de estudiante, la URL se actualiza con `respuesta=<id>` y `correo=` para poder compartir ese envío con otro profesor. |
| `boton` | `"Grabar"` cambia las etiquetas del botón (útil en actividades). |
| `titulo_gracias` / `mensaje_gracias` | Pantalla final tras enviar. |
| `mostrar_respuestas` | `true`: tras enviar, muestra un resumen. |
| `requiere_curso` | `true`: hay que estar inscrito en el curso del enlace (o elegido en el desplegable). |
| `revela_certificado` | `true`: al enviar, si hay certificado, se muestra el enlace. |
| `numerar_preguntas` | `false` para no numerar (p. ej. frases de una actividad). |
| `listas` | Diccionario de opciones reutilizables (p. ej. casos gramaticales) para tipo `completar`. |
| `etiqueta` | Texto corto de contexto en la página (p. ej. «Actividad de Curso»). |
| `curso` | Slug de la carpeta del curso (`circulo-latino`). Sirve para la **imagen** del preview (usa `cursos/<curso>/images/og-share.jpg` o `og-preview.jpg`). |
| `og_imagen` | URL absoluta (o ruta del sitio) que anula la imagen del curso. Preferir **JPG/PNG** (WhatsApp a veces no muestra WebP). |
| `og_titulo` | Anula el título del preview / favorito. Si falta, se usa la línea «Actividad…» del `titulo`. |
| `og_descripcion` | Texto del preview; si falta, el resto del `titulo` o el `intro`. |
| `examen` | `true`: el formulario se califica. Guarda el puntaje (`36/62`) en el envío. Por defecto `false`. |
| `muestra_puntaje` | `true`: al terminar muestra el puntaje obtenido. |
| `muestra_respuestas` | Tras enviar: `"respuestas"` (solo lo enviado; sin corrección ni puntaje, también en vista docente), `"correctas"` (verde/rojo sin claves) o `"todas"` (igual + `[clave]` y `comentario`). `false` = no muestra el listado. Vacío = sin feedback de examen (sí puede mostrarse el resumen si `mostrar_respuestas` es `true`). Con `token_docente`, `"correctas"`/`false`/vacío se elevan a `"todas"`; `"respuestas"` se respeta. |
| `repeticiones` | `0` (default) = editar sin límite. Si es `N>0`, tras `N` envíos ya no aparece el enlace de edición. |

Cada envío recibe un `id` único. La persona puede reabrir el resumen con `?respuesta=<id>` o editar con `?respuesta=<id>&edit=true`.

### Examen: `puntaje`, `respuesta` y `comentario`

Con `"examen": true`, cada pregunta calificable lleva estos tres campos (opcionales; si faltan, esa pregunta no suma):

| Campo | Qué hace |
|-------|----------|
| `puntaje` | Puntos que vale la pregunta. `0` o ausente = no cuenta. En `completar`, es el valor **por cada hueco** (`puntaje: 1` y 6 huecos → máximo 6). |
| `respuesta` | Clave correcta. Comparación **sin distinguir mayúsculas**. Ver formato por tipo abajo. |
| `comentario` | Nota del profesor. Solo se muestra con `muestra_respuestas: "todas"` (o en la vista docente). |

**Formato de `respuesta` según el tipo:**

| Tipo | Valor de `respuesta` |
|------|----------------------|
| `texto`, `parrafo`, `radio`, `seleccion_unica`, `lista_desplegable` | El texto exacto o el `id` de la opción correcta. |
| `opciones` / `seleccion_multiple` | Los ids/valores correctos separados por `\|` (orden indiferente). |
| `completar` | Un valor por hueco, en orden, separados por `\|`. |

Ejemplo `radio`:

```json
{
  "id": "caso_sujeto",
  "enunciado": "¿Qué caso marca el sujeto?",
  "tipo": "radio",
  "opciones": [
    { "id": "nom", "label": "Nominativo" },
    { "id": "acu", "label": "Acusativo" },
    { "id": "dat", "label": "Dativo" }
  ],
  "puntaje": 2,
  "respuesta": "nom",
  "comentario": "El nominativo es el caso del sujeto."
}
```

Ejemplo `opciones` (varias correctas):

```json
{
  "id": "casos_oblicuos",
  "enunciado": "Marca los casos oblicuos",
  "tipo": "opciones",
  "opciones": ["Nominativo", "Genitivo", "Dativo", "Acusativo", "Ablativo"],
  "puntaje": 3,
  "respuesta": "Genitivo|Dativo|Acusativo|Ablativo",
  "comentario": "Oblicuos = todos menos nominativo (y vocativo)."
}
```

Ejemplo `completar` (un punto por hueco):

```json
{
  "id": "frase_01",
  "enunciado": "**Frase 1**",
  "tipo": "completar",
  "texto": "La gota [caso] horada [caso] la piedra [caso]",
  "puntaje": 1,
  "respuesta": "Nominativo|(Verbo)|Dativo",
  "comentario": "La gota [Nominativo] horada [(Verbo)] la piedra [Dativo]."
}
```

Con ese ejemplo el máximo de la pregunta es `3` (tres huecos × `puntaje: 1`). El total del examen es la suma de los máximos de todas las preguntas con `puntaje` > 0 y `respuesta` definida.

Referencia real: [`circulo-latino-c1-a1-casos.json`](circulo-latino-c1-a1-casos.json).

### Campos de cada pregunta

| Campo | Obligatorio | Notas |
|-------|-------------|--------|
| `id` | sí | Clave en el CSV |
| `enunciado` | sí | Texto de la pregunta |
| `tipo` | sí | Ver tabla de tipos |
| `obligatoria` | no | Por defecto `true`. Pon `false` para opcional |
| `explicacion` | no | Texto gris bajo el enunciado |
| `default` | no | Valor inicial (`lista_desplegable`, `escala_scroll`, `radio`, `opciones`) |
| `puntaje` | no | Solo con `examen: true`. Puntos; en `completar`, por hueco |
| `respuesta` | no | Solo con `examen: true`. Clave correcta (ver sección Examen) |
| `comentario` | no | Solo con `examen: true`. Nota visible con `muestra_respuestas: "todas"` |

### Tipos de pregunta (resumen)

| `tipo` | Qué es | Campos extra |
|--------|--------|----------------|
| `texto` | Una línea | — |
| `parrafo` | Varias líneas | — |
| `radio` / `seleccion_unica` | Una sola opción (botones) | `opciones`, `default` |
| `opciones` / `seleccion_multiple` | Varias a la vez (checkboxes) | `opciones`, `default` |
| `puntaje` | Estrellas / números enteros | `min`, `max` (por defecto 1–5) |
| `lista_desplegable` | Menú desplegable | `opciones` **o** `"fuente": "cursos"` |
| `escala_scroll` | Barra continua con etiquetas | `min`, `max`, `step`, `min_label`, `max_label`, `emotions`, `flip_aleatorio`, `default` |
| `completar` | Frase con huecos `[clave]` | `texto`; opciones en `listas` |

`seleccion_unica` es alias de `radio`. `seleccion_multiple` es alias de `opciones`.

### Ejemplos de cada tipo

#### `texto`

```json
{
  "id": "correo",
  "enunciado": "Correo electrónico",
  "explicacion": "El mismo con el que te inscribiste.",
  "tipo": "texto",
  "obligatoria": true
}
```

#### `parrafo`

```json
{
  "id": "lo_mejor",
  "enunciado": "¿Qué es lo que más te gustó?",
  "explicacion": "Un tema, un momento o un ejemplo.",
  "tipo": "parrafo",
  "obligatoria": true
}
```

#### `radio` / `seleccion_unica`

Opciones como objetos `{ "id", "label" }` (recomendado) o como strings:

```json
{
  "id": "finalizado",
  "enunciado": "¿Concluiste el curso?",
  "tipo": "radio",
  "opciones": [
    { "id": "si", "label": "Sí, todo" },
    { "id": "falto", "label": "Casi todo" },
    { "id": "no", "label": "Lo dejé a medias" }
  ],
  "default": "si",
  "obligatoria": true
}
```

```json
{
  "id": "turno",
  "enunciado": "¿En qué turno preferirías la próxima clase?",
  "tipo": "seleccion_unica",
  "opciones": ["Mañana", "Tarde", "Noche"],
  "obligatoria": true
}
```

#### `opciones` / `seleccion_multiple`

```json
{
  "id": "temas_interes",
  "enunciado": "¿Qué temas te interesan? (puedes marcar varios)",
  "tipo": "opciones",
  "opciones": [
    { "id": "astro", "label": "Astronomía" },
    { "id": "fisica", "label": "Física" },
    { "id": "latin", "label": "Latín" },
    { "id": "prog", "label": "Programación" }
  ],
  "default": ["astro", "latin"],
  "obligatoria": false
}
```

```json
{
  "id": "dias",
  "enunciado": "Días en los que puedes asistir",
  "tipo": "seleccion_multiple",
  "opciones": ["Lunes", "Miércoles", "Viernes"],
  "obligatoria": true
}
```

#### `puntaje`

Enteros; por defecto de 1 a 5 si no pones `min`/`max`:

```json
{
  "id": "claridad",
  "enunciado": "Claridad de las explicaciones",
  "tipo": "puntaje",
  "min": 1,
  "max": 5,
  "obligatoria": true
}
```

#### `lista_desplegable`

Con opciones fijas:

```json
{
  "id": "nivel",
  "enunciado": "Tu nivel con el tema",
  "tipo": "lista_desplegable",
  "opciones": [
    { "id": "nuevo", "label": "Empiezo de cero" },
    { "id": "medio", "label": "Algo de base" },
    { "id": "avanzado", "label": "Ya lo he estudiado" }
  ],
  "default": "nuevo",
  "obligatoria": true
}
```

Con el catálogo de cursos del Club (`cursos.json` vía sync):

```json
{
  "id": "curso",
  "enunciado": "Nombre del curso",
  "explicacion": "Selecciona el curso que evalúas.",
  "tipo": "lista_desplegable",
  "fuente": "cursos",
  "obligatoria": true
}
```

#### `escala_scroll`

Barra deslizante. `emotions` son caras en los enteros (no tienen que coincidir con cada `step`). `flip_aleatorio: true` invierte al azar la dirección visual (el valor guardado sigue siendo de `min` a `max`):

```json
{
  "id": "apreciacion_general",
  "enunciado": "Apreciación general del curso",
  "explicacion": "¿Qué tanto te gustó el curso, tomándolo en conjunto?",
  "tipo": "escala_scroll",
  "min": 1,
  "max": 7,
  "step": 0.5,
  "emotions": ["🤔", "😐", "🙂", "😊", "😍", "🤩", "🤯"],
  "flip_aleatorio": true,
  "min_label": "No me gustó nada",
  "max_label": "Me gustó muchísimo",
  "default": 4,
  "obligatoria": true
}
```

#### `completar`

Frase con huecos `[nombre_lista]`. Las opciones salen de `listas` del formulario (o de la pregunta). En pantalla, cada fragmento queda junto a su menú (`La gota [menú]`, `horada [menú]`, …).

En el formulario (una sola vez):

```json
"listas": {
  "caso": [
    "Nominativo",
    "Vocativo",
    "Genitivo",
    "Dativo",
    "Acusativo",
    "Ablativo",
    "(Verbo)"
  ]
}
```

En la pregunta (con calificación de examen):

```json
{
  "id": "frase_01",
  "enunciado": "**Frase 1**:\n*La gota horada la piedra, no por la fuerza…*",
  "tipo": "completar",
  "texto": "La gota [caso] horada [caso] la piedra [caso], no por la fuerza [caso]",
  "obligatoria": false,
  "puntaje": 1,
  "respuesta": "Nominativo|(Verbo)|Dativo|Ablativo",
  "comentario": "La gota [Nominativo] horada [(Verbo)] la piedra [Dativo], no por la fuerza [Ablativo]."
}
```

Ejemplo completo: [`circulo-latino-c1-a1-casos.json`](circulo-latino-c1-a1-casos.json). Más tipos en contexto real: [`evaluacion-curso.json`](evaluacion-curso.json) (`texto`, `parrafo`, `radio`, `lista_desplegable` + `fuente: cursos`, `escala_scroll`).

### Vista previa local

Con el servidor local (`make start` o sirviendo la raíz del repo):

```
http://127.0.0.1:8000/club/drz-forms/drz-form.html?form=mi-formulario&preview=1
http://127.0.0.1:8000/club/drz-forms/drz-form.html?form=mi-formulario&token=clave-compartida
```

`preview=1` no guarda. Sin `token` (si el JSON lo define), pide login al Club.

### URL en producción

```
https://drz-academy.github.io/club/drz-forms/drz-form.html?form=<id>&token=<clave>
https://drz-academy.github.io/club/drz-forms/drz-form.html?form=evaluacion-curso&curso=<id-curso>
```

---

## 2. Evaluación de curso (certificado)

El enlace **Evaluación** del Club y el candado del certificado usan **siempre** `evaluacion-curso`.

1. En `club/cursos.json`, en ese curso: `"evaluacion": true`
2. `make club-sync`

Otros JSON en `drz-forms/` usan el mismo motor, pero **no** desbloquean el certificado salvo que el portal apunte a ese `form=` (hoy está fijo a `evaluacion-curso`).

---

## 3. Sincronizar y publicar

Hay **tres capas**. Según lo que cambies:

| Qué cambiaste | Qué hacer |
|---------------|-----------|
| Preguntas JSON, HTML o JS | **Commit + push** a `main` (GitHub Pages copia `club/drz-forms/`) **y** `make club-sync` |
| `"evaluacion"` en `cursos.json` | `make club-sync` |
| Código del Worker (`club/worker/`) | `make club-worker-deploy` y luego `make club-sync` si también cambió el JSON |

```bash
# Desde la raíz del repo
make club-worker-deploy   # solo si tocaste el Worker
make club-sync            # catálogo + miembros + esquemas de formularios → KV
```

**Sin `club-sync` el Worker rechaza el envío** (`schema_missing`): el HTML público ya puede verse en Pages, pero el esquema no está en KV.

`make club-sync` sube a Cloudflare KV:

- miembros del Club  
- `cursos.json`  
- todos los `club/drz-forms/*.json` de formulario  

El HTML/JS/JSON estáticos se publican con el deploy de GitHub Pages (unos minutos tras el push).

### Checklist típico de un form nuevo

1. Crear `club/drz-forms/<id>.json` (incluye `curso` si quieres banner del curso en WhatsApp)
2. Probar en local con `?preview=1` o `?token=…`
3. Regenerar previews OG: `python3 club/bin/generar_forms_preview.py`
4. Commit + push a `main`
5. `make club-sync`
6. Abrir la URL de producción y enviar una respuesta de prueba
7. (Opcional) Conectar Google Sheets con `sheets-sync.gs` (sección 5)

### Preview en WhatsApp / redes

WhatsApp no ejecuta JavaScript: no puede leer el título del JSON desde `drz-form.html`. Por eso el build genera una página estática por formulario:

```
/club/drz-forms/p/<id>.html
```

Esa página lleva `og:title`, `og:description` y `og:image`, y redirige al formulario conservando `token`, `token_docente`, `respuesta`, `edit`, etc. Los enlaces de estudiante y la URL de revisión docente (barra de dirección) usan `/p/…` para que WhatsApp muestre la tarjeta correcta. Si pegas `drz-form.html?…` verás el preview genérico del Club.

```bash
python3 club/bin/generar_forms_preview.py
# o al armar el sitio:
make sync-site
```

Tras publicar, si WhatsApp sigue mostrando la tarjeta vieja, refresca la caché en el [Depurador de contenido compartido de Meta](https://developers.facebook.com/tools/debug/).

---

## 4. Ver y exportar respuestas

### Administrador en el navegador

Clave maestra del Club (secreto `CLUB_ADMIN_MASTER` / `.secrets/club-admin-master`; no está en el JS):

```
/club/drz-forms/drz-form.html?form=<id>&TOKEN=<CLUB_ADMIN_MASTER>
```

Aparece **Analizar resultados** y **Descargar resultados (CSV)**. Con `TOKEN` también puedes enviar en modo prueba (valida, no guarda).

Estadísticas anónimas:

```
/club/drz-forms/drz-stats.html?form=<id>&TOKEN=<CLUB_ADMIN_MASTER>
```

### Desde la máquina

```bash
make club-forms-export
make club-forms-export FORM=circulo-latino-c1-a1-casos
make club-forms-export FORM=evaluacion-curso CURSO=masterclass_extraterrestre
```

Usa `.secrets/club-admin-token` y `.secrets/club-worker-url`.

- JSON: `club/personal/formularios/` (gitignored)  
- CSV: `club/drz-forms/<id>-respuestas.csv` (no se publica en Pages)

### Recalificar tras cambiar claves

Si editaste `respuesta` / `puntaje` en el JSON de un examen, sincroniza el esquema y recalcula los puntajes ya guardados:

```bash
python3 club/drz-forms/recalificar.py circulo-latino-c1-a1-casos.json
# o:
make club-forms-recalificar FORM=circulo-latino-c1-a1-casos
```

Por defecto ejecuta `club-sync` y luego `POST /admin/regrade-forms`. Con `--solo-recalificar` omite el sync (usa el esquema que ya está en KV).

### Borrar respuestas (pruebas)

```bash
make club-forms-reset
# o solo un form:
make club-forms-reset FORM=circulo-latino-c1-a1-casos
```

Pide confirmación. No borra esquemas ni perfiles.

### Backup diario

El workflow **Backup form responses** baja los CSV cada mañana (~7:50 AM COT) y hace commit si cambiaron. En el repo: secreto `CLUB_ADMIN_TOKEN` (también vale `CLUB_ADMIN_MASTER`).

---

## 5. Sincronizar respuestas a Google Sheets (Apps Script)

El archivo [`sheets-sync.gs`](sheets-sync.gs) descarga el CSV del Worker y lo vuelca en una pestaña de una hoja de cálculo. Cada ejecución **reemplaza** el contenido de esa pestaña.

### Setup (recomendado: script ligado a la hoja)

1. Crea una hoja en [Google Sheets](https://sheets.google.com) (p. ej. «Círculo Latino — Casos»).
2. En **esa** hoja: **Extensiones → Apps Script**.
3. Borra el código por defecto y pega el contenido de `club/drz-forms/sheets-sync.gs`.
4. Guarda el proyecto.
5. Engranaje (**Configuración del proyecto**) → **Propiedades de la secuencia de comandos** → **Añadir propiedad**:

| Propiedad | Valor |
|-----------|--------|
| `CLUB_EXPORT_TOKEN` | Contenido de `.secrets/club-admin-token` (o el token admin del Worker) |
| `CLUB_FORM_ID` | Id del formulario, p. ej. `circulo-latino-c1-a1-casos` |
| `CLUB_WORKER_URL` | Opcional. Por defecto: `https://drz-club-portal.drz-academy.workers.dev` |
| `CLUB_SHEET_NAME` | Opcional. Pestaña destino; por defecto `Respuestas` |

6. Selecciona la función `syncClubFormResponses` (o `onOpen`) → **Ejecutar** → autoriza el acceso.
7. Vuelve a la hoja y **recarga** (F5). Debe aparecer el menú **Club Dr. Z** → **Actualizar respuestas**.
8. (Opcional) **Activadores** → añadir activador de reloj → `syncClubFormResponses` (cada hora o cada día).

### Botón en la hoja (además del menú)

1. En la hoja: **Insertar → Dibujo** (o una forma). Escribe «Actualizar respuestas» y guarda.
2. Clic en el dibujo → menú ⋮ → **Asignar secuencia de comandos**.
3. Escribe exactamente: `actualizarRespuestasDesdeMenu`
4. Acepta. Al hacer clic en el dibujo, baja de nuevo el CSV del Worker.

Si no ves el menú **Club Dr. Z**, abre Apps Script, ejecuta `onOpen` una vez y recarga la hoja.

### Si el proyecto Apps Script no está ligado a una hoja

Añade también:

| Propiedad | Valor |
|-----------|--------|
| `CLUB_SPREADSHEET_ID` | El id de la URL: `https://docs.google.com/spreadsheets/d/ESTE_ID/edit` |

### Qué hace el script

1. Llama a `GET {WORKER}/forms/export?form={CLUB_FORM_ID}` con `Authorization: Bearer …`.
2. Parsea el CSV.
3. Limpia la pestaña `CLUB_SHEET_NAME` y escribe todas las filas.
4. Actualiza una pestaña oculta `_sync` con `form_id`, fecha ISO y número de respuestas.

Si no hay respuestas, deja en la celda A1: `(Sin respuestas todavía)`.

### Varias formularios → varias hojas

Repite el setup en otra hoja (u otro proyecto Apps Script) con otro `CLUB_FORM_ID`. Un script = un formulario.

### Fallos frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| `Falta CLUB_EXPORT_TOKEN` | No configuraste la propiedad o el nombre está mal escrito |
| `Export falló (401/403)` | Token incorrecto o revocado |
| `Export falló (404)` / vacío | `CLUB_FORM_ID` no coincide con el `id` del JSON, o aún no hay envíos |
| `No hay hoja activa` | El script no está ligado a la hoja y falta `CLUB_SPREADSHEET_ID` |
| La hoja no se actualiza sola | Falta el activador de reloj |

---

## 6. Comandos rápidos

| Comando | Efecto |
|---------|--------|
| `make club-sync` | Sube miembros, `cursos.json` y esquemas `drz-forms/*.json` a KV |
| `make club-worker-deploy` | Publica el Worker |
| `make club-forms-export` | Baja respuestas (JSON en `personal/`, CSV en `drz-forms/`) |
| `make club-forms-recalificar FORM=…` | Sync + recalcula puntajes de un examen |
| `make club-forms-reset` | Borra respuestas en KV (pide confirmación) |
| Push a `main` | Publica HTML/JS/JSON estáticos en GitHub Pages |

---

## 7. Ejemplos en este repo

| Archivo | Uso |
|---------|-----|
| [`evaluacion-curso.json`](evaluacion-curso.json) | Evaluación post-curso; desbloquea certificado |
| [`circulo-latino-c1-a1-casos.json`](circulo-latino-c1-a1-casos.json) | Actividad 1: casos (`completar` + claves) |
| [`circulo-latino-c1-a2-casos.json`](circulo-latino-c1-a2-casos.json) | Actividad 2: casos (sin claves aún; no muestra puntaje ni respuestas) |
| [`sheets-sync.gs`](sheets-sync.gs) | Sync automático a Google Sheets |

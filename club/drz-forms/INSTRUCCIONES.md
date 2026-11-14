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
├── circulo-latino-c1-a1-casos.json   Ejemplo de actividad de curso
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
| `token_docente` | Clave de revisión docente (`?token_docente=`). Lista y navega todas las respuestas. |
| `boton` | `"Grabar"` cambia las etiquetas del botón (útil en actividades). |
| `titulo_gracias` / `mensaje_gracias` | Pantalla final tras enviar. |
| `mostrar_respuestas` | `true`: tras enviar, muestra un resumen. |
| `requiere_curso` | `true`: hay que estar inscrito en el curso del enlace (o elegido en el desplegable). |
| `revela_certificado` | `true`: al enviar, si hay certificado, se muestra el enlace. |
| `numerar_preguntas` | `false` para no numerar (p. ej. frases de una actividad). |
| `listas` | Diccionario de opciones reutilizables (p. ej. casos gramaticales) para tipo `completar`. |
| `etiqueta` | Texto corto de contexto (p. ej. «Actividad de Curso»). |

Cada envío recibe un `id` único. La persona puede reabrir el resumen con `?respuesta=<id>` o editar con `?respuesta=<id>&edit=true`.

### Campos de cada pregunta

| Campo | Obligatorio | Notas |
|-------|-------------|--------|
| `id` | sí | Clave en el CSV |
| `enunciado` | sí | Texto de la pregunta |
| `tipo` | sí | Ver tabla de tipos |
| `obligatoria` | no | Por defecto `true`. Pon `false` para opcional |
| `explicacion` | no | Texto gris bajo el enunciado |
| `default` | no | Valor inicial (`lista_desplegable`, `escala_scroll`, `radio`, `opciones`) |

### Tipos de pregunta

| `tipo` | Campos extra |
|--------|----------------|
| `texto` | Una línea |
| `parrafo` | Varias líneas |
| `radio` / `seleccion_unica` | `opciones`: strings o `{ "id", "label" }` |
| `opciones` / `seleccion_multiple` | Checkboxes. `opciones` igual que `radio` |
| `puntaje` | `min`, `max` (enteros; por defecto 1–5) |
| `lista_desplegable` | `opciones`, o `"fuente": "cursos"` para el catálogo |
| `escala_scroll` | `min`, `max`, `step`, `min_label`, `max_label`, `emotions`, `flip_aleatorio` |
| `completar` | Frase con huecos `[clave]`. Opciones en `listas` del form o de la pregunta. Ver abajo. |

### Tipo `completar` (frases con menús)

Útil para actividades (p. ej. casos en español). En `texto`, marca cada hueco con `[nombre_lista]`:

```json
{
  "id": "frase_01",
  "enunciado": "**Frase 1**:\n*La gota horada la piedra…*",
  "tipo": "completar",
  "texto": "La gota [caso] horada [caso] la piedra [caso]",
  "obligatoria": false
}
```

Las opciones de `[caso]` salen de `listas.caso` en el JSON del formulario. En pantalla, cada fragmento queda junto a su menú (`La gota [menú]`, `horada [menú]`, …).

Ejemplo completo: [`circulo-latino-c1-a1-casos.json`](circulo-latino-c1-a1-casos.json).

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

1. Crear `club/drz-forms/<id>.json`
2. Probar en local con `?preview=1` o `?token=…`
3. Commit + push a `main`
4. `make club-sync`
5. Abrir la URL de producción y enviar una respuesta de prueba
6. (Opcional) Conectar Google Sheets con `sheets-sync.gs` (sección 5)

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

6. Selecciona la función `syncClubFormResponses` (o `testSyncClubFormResponses`) → **Ejecutar** → autoriza el acceso.
7. (Opcional) **Activadores** → añadir activador de reloj → `syncClubFormResponses` (cada hora o cada día).

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
| `make club-forms-reset` | Borra respuestas en KV (pide confirmación) |
| Push a `main` | Publica HTML/JS/JSON estáticos en GitHub Pages |

---

## 7. Ejemplos en este repo

| Archivo | Uso |
|---------|-----|
| [`evaluacion-curso.json`](evaluacion-curso.json) | Evaluación post-curso; desbloquea certificado |
| [`circulo-latino-c1-a1-casos.json`](circulo-latino-c1-a1-casos.json) | Actividad con `token`, `completar` y `listas` |
| [`sheets-sync.gs`](sheets-sync.gs) | Sync automático a Google Sheets |

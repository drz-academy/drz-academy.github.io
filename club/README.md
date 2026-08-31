# Dr. Z Academy Club

Los participantes consultan su categoría, historial de cursos, Classroom y certificados en [`/club/`](https://drz-academy.github.io/club/) (en local: [http://127.0.0.1:8000/club/](http://127.0.0.1:8000/club/)).

El Club premia la participación consecutiva: Bronce, Plata u Oro, con descuento o inscripción gratis en el próximo curso.

## Cómo está organizado

Hay tres capas. **Los datos personales no van a GitHub ni a `_site/`.**

```
club/
  index.html, portal.js     Página pública de consulta (sin cédulas ni correos)
  cursos.json               Catálogo: fechas, Classroom, valor, página del curso
  worker/                   Cloudflare Worker + KV (perfiles y claves)
  client/sync_members.py    Sube catálogo + miembros al Worker
  bin/                      Scripts locales (base, clasificación, boletines, informe)
  personal/                 Confidencial (gitignored)
    inscripciones/          Excel de cada curso
    drz-club-members.json   Base de miembros
    cupones.json            Códigos de cupón del próximo curso (Bronce / Plata / Oro)
    certificados/fuentes/   PDFs originales (un folder por curso)
    certificados/           Un PDF por persona: CURSO-CEDULA-EMAIL-NOMBRE.pdf
    ClubDrZAcademy/         Acceso local a la carpeta de Google Drive
    boletines/              HTML personalizados + script de envío
    drz-club.md             Informe de clasificación
    beneficios_usados.csv   Quién ya redimió un beneficio
```

El HTML/JS público no incluye miembros. El Worker solo devuelve el perfil de quien se autentica.

## Cómo entra cada persona

1. Cédula y correo de inscripción.
2. Primera vez: crea una clave (mínimo 8 caracteres).
3. Siguientes veces: esa clave.
4. Si la olvida: enlace al mismo correo.

Adentro ve categoría, beneficios, el **próximo curso** (enlace, valor y cupón) y la lista de cursos con Classroom y certificado.

Solo entran quienes tienen **cédula y correo** en la base. Hoy hay ~100 miembros sin documento (sobre todo Cuántica a Pie y Astropython): hay que completar esas cédulas en las listas de inscripción y regenerar `personal/drz-club-members.json`.

Usuario de prueba: `puntobernal@gmail.com`, cédula `666666`, clave `prueba666`.

## Categorías

Se calculan con los cursos **ya dictados**, ordenados por fecha (`cursos.json`). Los permanentes no intercalan pausas. **Basta con aparecer en la lista de inscritos**: el certificado no es requisito para la categoría ni para el cupón.

| Categoría | Condición | Beneficio |
|-----------|-----------|-----------|
| Bronce | Último curso dictado | 15% (bono transferible) |
| Plata | 3 matrículas con máximo 1 pausa, **incluyendo el último** | 30% |
| Oro | Los últimos 5 consecutivos | Inscripción gratis + un producto permanente |

Quien ya usó un beneficio (registrado en `personal/beneficios_usados.csv`) pierde la categoría hasta volver a acumular.

## Flujo de trabajo local

Desde la raíz del repo:

```bash
make club-base-datos     # Excel de personal/inscripciones → personal/drz-club-members.json
make club-clasificar     # Oro / Plata / Bronce
make club-informe        # personal/drz-club.md
make generar-boletines   # HTML individuales + script de envío en personal/boletines/
make club-certificados         # Parte y nombra PDFs en personal/certificados/
make club-certificados-drive   # Enlaces de Drive → personal/certificados.csv
make club-sync                 # sube miembros + catálogo al Worker
make club-reset-pass           # borra todas las claves; cada quien crea una nueva
make club-forms-reset          # borra todas las evaluaciones (pide confirmación)
```

O, dentro de `club/`: `make todo` (base + clasificar + informe + boletines).

## Boletines personalizados (Oro / Plata / Bronce)

Antes de generar: clasifica (`make club-clasificar`) y revisa `personal/cupones.json` y el próximo curso en `cursos.json`. Los banners del correo son `assets/club/banner-{oro,plata,bronce}.png` (fondo blanco); tienen que estar publicados en GitHub Pages.

```bash
make generar-boletines          # desde la raíz, o: make -C club generar-boletines
```

Eso escribe en `personal/boletines/` (no va a GitHub):

- `html/oro/`, `html/plata/`, `html/bronce/` — un HTML por persona (nombre, banner de su categoría, mensaje, cupón, firma)
- `index.json` — lista para el envío
- `enviar-todos.py` — script para mandar todos (copia de `club/bin/enviar_boletines.py`)

Para mandarlos:

```bash
# ver a quién saldría, sin enviar
python3 club/personal/boletines/enviar-todos.py --dry-run

# un correo de prueba: el HTML de esa persona, a tu bandeja
python3 club/personal/boletines/enviar-todos.py --prueba tucorreo@gmail.com --correo jmmontoy@gmail.com

# solo una categoría
python3 club/personal/boletines/enviar-todos.py --categoria ORO --dry-run

# todos los reales (pide confirmación y-N)
python3 club/personal/boletines/enviar-todos.py
# o: make club-enviar-boletines

# reenviar aunque ya figuren en .enviados.log
python3 club/personal/boletines/enviar-todos.py --categoria PLATA --force
```

Usa las credenciales de Gmail en `.secrets/` (`gmail-smtp-user`, `gmail-app-password`). Los ya enviados se anotan en `personal/boletines/.enviados.log` y se saltan en el siguiente envío, salvo que pases `--force`.

`make club-sync` sube al Worker lo que cada persona verá al entrar: categoría, cupón, Classroom y certificados. La página pública **no lee** los JSON de `personal/`; solo habla con el Worker.

Tras editar `cursos.json`, `personal/cupones.json`, certificados o reclasificar:

```bash
make club-sync
```

## Catálogo de cursos

La fuente de fechas, Classroom, valor y página de cada curso es **`cursos.json`**. No se copia a `_site/` (el sitio público solo lleva `index.html` y `portal.js`).

### Cómo llenarlo

1. **Fechas**: `YYYY-MM-DD`. Si aún no las tienes, déjalas en blanco.
2. **Classroom**: pega en `classroom_url` el enlace del curso en Classroom (el que compartes con el grupo). Ejemplo: `https://classroom.google.com/c/XXXXXXXX`.
3. **Certificados individuales**: no van en el catálogo. Van en `personal/certificados.csv` (una fila por persona y curso, con el enlace de Google Drive). Se genera con `make club-certificados-drive` a partir de `personal/ClubDrZAcademy/Certificados`.
4. **Carpeta Drive**: `certificados_folder` en `cursos.json` apunta a esa carpeta compartida. El portal usa los enlaces individuales del CSV.
5. **Próximo curso**: el que tenga `numero_participantes` igual a `0`. Incluye `valor` e `inscripcion_url` para mostrar precio y cupón.
6. **Códigos de cupón**: en `personal/cupones.json`, una entrada por curso con `cupon_bronze`, `cupon_silver` y `cupon_gold`. El sync elige el código según la categoría de cada persona.

Tras editar, sincroniza:

```bash
make club-sync
```

### Cursos

| id | nombre | fecha_inicio | fecha_fin | pagina_url |
|----|--------|--------------|-----------|------------|
| cuantica_a_pie | Cuántica a Pie | 2024-06-22 | 2024-08-03 | https://drz-academy.github.io/cursos/cuantica-a-pie/ |
| catastrofisica | Catastrofísica | 2024-10-09 | 2024-10-30 |  |
| einstein | Einstein Relativamente Fácil | 2025-02-19 | 2025-04-10 |  |
| mundo_cuantico | Mundo Cuántico | 2025-07-23 | 2025-09-11 |  |
| rompecabezas_materia | El Rompecabezas de la Materia | 2025-10-15 | 2025-12-04 |  |
| astropython | Astropython | 2025-01-01 | 2025-01-01 | https://drz-academy.github.io/cursos/astropython/ |
| python_fin_mundo | Python para el fin del mundo | 2026-03-18 | 2026-04-29 | https://drz-academy.github.io/cursos/python-fin-del-mundo/ |
| masterclass_extraterrestre | Master Class Extraterrestre | 2026-08-03 | 2026-08-31 | https://drz-academy.github.io/cursos/extraterrestres/ |
| masterclass_cambio_climatico | Master Class Cambio Climático | 2026-09-14 | 2026-10-05 | https://drz-academy.github.io/cursos/cambio-climatico/ |

Los `id` de esa tabla son los `curso_id` de `personal/certificados.csv`.

Los PDF locales viven en `personal/certificados/fuentes/<Curso>/` (un archivo por persona, o un PDF con todos). Para partirlos y nombrarlos `CURSO-CEDULA-EMAIL-NOMBRE.pdf` en `personal/certificados/`:

```bash
make club-certificados
```

Si no hay cédula, el segundo campo del nombre es el **celular**. Luego, para escribir los enlaces de Drive en `personal/certificados.csv`:

```bash
make club-certificados-drive
```

### Cursos permanentes (Hotmart)

Cuando alguien termina AstroPython o Cuántica a Pie permanente, actualiza el CSV de Hotmart en `personal/` (`astropython_permanente.csv`, `cuantica_a_pie_permanente.csv`) y corre:

```bash
make club-certificados-hotmart
make club-certificados-drive
```

Solo crea PDF para correos que aún no tienen aviso. El PDF es una hoja blanca con nombre, correo y el enlace de `hotmart_url` en `cursos.json`. Para rehacer los existentes: `python3 club/bin/generar_certificados_hotmart.py --force`.

Las fuentes no se borran. El portal usa esos enlaces cuando el miembro entra al Club.

## Evaluación de cursos (certificado al final)

Si un curso tiene `"evaluacion": true` en `cursos.json`, el portal muestra **Evaluación** y no revela el certificado hasta que la persona complete el formulario `evaluacion-curso`.

La guía completa (crear un JSON, tipos de pregunta, desplegar, asociar a un curso, CSV y reset) está en [`DEVELOPER.md`](../DEVELOPER.md#formularios-del-club-clubdrz-forms).

Resumen operativo:

- Esquema: `club/drz-forms/evaluacion-curso.json`
- Página: `/club/drz-forms/drz-form.html?form=evaluacion-curso&curso=<id>` (`&preview=1` sin login)
- Admin CSV: el mismo enlace con `TOKEN=` y `CLUB_ADMIN_MASTER`
- Export local: `make club-forms-export CURSO=masterclass_extraterrestre`
- Pruebas: `make club-forms-reset`

Tras cambiar preguntas o el flag `evaluacion`: `make club-worker-deploy` (si cambió el Worker) y `make club-sync`.

## Worker (primera vez)

```bash
cd club/worker
npx wrangler kv namespace create DRZ_CLUB
# copiar el id a wrangler.toml
npx wrangler secret put CLUB_ADMIN_TOKEN
npx wrangler secret put GMAIL_SMTP_USER
npx wrangler secret put GMAIL_APP_PASSWORD
make club-worker-deploy
```

Guarda la URL en `.secrets/club-worker-url` y, si cambió, el meta `club-portal-endpoint` en `index.html`.

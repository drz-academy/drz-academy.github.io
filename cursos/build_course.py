#!/usr/bin/env python3
"""
build_course.py – Convierte una hoja de curso en Markdown a una página HTML
estilizada con el diseño de Dr. Z Academy y actualiza cursos/courses.json.

Uso:
    # Crear nuevo curso desde la plantilla
    python3 cursos/build_course.py --new mi-curso

    # Generar/regenerar la página HTML de un curso
    python3 cursos/build_course.py cursos/mi-curso/curso.md

    # Opciones adicionales
    python3 cursos/build_course.py cursos/mi-curso/curso.md --no-update-json

Dependencias:
    pip install -r requirements.txt
"""

import re
import sys
import json
import html
import shutil
import argparse
from pathlib import Path

# ── Dependencias opcionales ──────────────────────────────────────────────────
try:
    import yaml
except ImportError:
    sys.exit("❌  Falta pyyaml.  Instala con:  pip install -r requirements.txt")

try:
    import markdown as md_lib
    _md = md_lib.Markdown(extensions=["extra", "nl2br"])
    HAS_MARKDOWN = True
except ImportError:
    HAS_MARKDOWN = False
    print("⚠️  markdown no instalado. Usando conversión básica.  pip install -r requirements.txt")

try:
    import qrcode
    from PIL import Image
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

# ── Rutas base ───────────────────────────────────────────────────────────────
REPO_ROOT   = Path(__file__).resolve().parent.parent   # drz-academy.github.io/
CURSOS_DIR  = REPO_ROOT / "cursos"
TEMPLATE_MD = CURSOS_DIR / "template" / "curso.md"
COURSES_JSON= CURSOS_DIR / "courses.json"
TEMPLATE_DIR= CURSOS_DIR / "template"
SITE_URL    = "https://drz-academy.github.io"
QR_CURSO    = "images/qr-curso.png"          # afiche → hoja del curso
QR_INSCRIPCION = "images/qr-inscripcion.png"  # página → URL de inscripción
OG_PREVIEW  = "images/og-preview.jpg"         # banner optimizado para redes sociales
OG_MAX_WIDTH = 1200
OG_MAX_BYTES = 300_000
INSCRIPCION_PLACEHOLDERS = {"", "#", "https://drz.academy"}
LOGO_QR     = REPO_ROOT / "assets/DrZ-Logos/Dr_Z_Logo_Blanco_marquesina_fondo_transparente.png"
QR_SIZE     = 512
LOGO_RATIO  = 0.28


# ─────────────────────────────────────────────────────────────────────────────
# MARKDOWN → HTML
# ─────────────────────────────────────────────────────────────────────────────

def md_to_html(text: str) -> str:
    """Convierte markdown a HTML. Usa la librería markdown si está disponible."""
    if HAS_MARKDOWN:
        _md.reset()
        return _md.convert(text)
    # Fallback básico: solo párrafos y negritas
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*",     r"<em>\1</em>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    paragraphs = [f"<p>{p.strip()}</p>" for p in text.split("\n\n") if p.strip()]
    return "\n".join(paragraphs)


def parse_frontmatter(source: str) -> tuple[dict, str]:
    """Separa el YAML frontmatter del cuerpo markdown. Devuelve (meta, cuerpo)."""
    if not source.startswith("---"):
        return {}, source
    parts = source.split("---", 2)
    if len(parts) < 3:
        return {}, source
    meta = yaml.safe_load(parts[1]) or {}
    body = parts[2].lstrip("\n")
    return meta, body


def split_sections(body: str) -> list[tuple[str, str]]:
    """
    Divide el cuerpo en secciones: [(heading, contenido), ...].
    La primera sección sin heading se llama '' (cadena vacía).
    """
    sections: list[tuple[str, str]] = []
    current_heading = ""
    current_lines: list[str] = []

    for line in body.splitlines():
        m = re.match(r"^##\s+(.+)$", line)
        if m:
            if current_lines:
                sections.append((current_heading, "\n".join(current_lines).strip()))
            current_heading = m.group(1).strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        sections.append((current_heading, "\n".join(current_lines).strip()))

    return sections


def render_blockquote_as_topics(html: str) -> str:
    """Envuelve cada <blockquote> con la clase topics-list."""
    return re.sub(
        r"<blockquote>(.*?)</blockquote>",
        r'<div class="topics-list">\1</div>',
        html, flags=re.DOTALL
    )


def render_ul_as_checklist(html: str) -> str:
    """Convierte <ul> en listas con clase checklist."""
    return html.replace("<ul>", '<ul class="checklist">')


def photo_grid_html(fotos: list[str]) -> str:
    """Genera el HTML de la cuadrícula de fotos."""
    if not fotos:
        return ""
    n = len(fotos)
    if n == 1:
        cls = "photo-grid photo-grid--single"
    elif n == 2:
        cls = "photo-grid photo-grid--pair"
    else:
        cls = "photo-grid photo-grid--many"
    imgs = "\n".join(
        f'      <img src="{f}" alt="Foto del curso" loading="lazy">'
        for f in fotos
    )
    return f'<div class="{cls}">\n{imgs}\n    </div>'


PHOTO_MARKER_RE = re.compile(r"<!--\s*fotos(\d*)\s*-->")
META_VAR_RE = re.compile(r"<!--([a-zA-Z_][a-zA-Z0-9_]*)-->")


def substitute_meta_vars(content: str, meta: dict) -> str:
    """Reemplaza <!--campo--> por el valor escalar del frontmatter."""
    skip_keys = {"fotos"} | {k for k in meta if re.fullmatch(r"fotos\d+", k)}

    def replacer(match: re.Match) -> str:
        key = match.group(1)
        if key in skip_keys:
            return match.group(0)
        if key not in meta:
            print(f"⚠️  Variable de metadatos desconocida: <!--{key}-->")
            return match.group(0)
        value = meta[key]
        if isinstance(value, (list, dict, bool)) or value is None:
            print(f"⚠️  <!--{key}--> no es un valor escalar sustituible")
            return match.group(0)
        return str(value)

    return META_VAR_RE.sub(replacer, content)


def collect_photo_sets(meta: dict) -> dict[str, list[str]]:
    """Recoge fotos, fotos1, fotos2… del frontmatter."""
    sets: dict[str, list[str]] = {}
    for key, value in meta.items():
        if key == "fotos" or re.fullmatch(r"fotos\d+", key):
            sets[key] = value or []
    return sets


def render_section_content(content: str, photo_sets: dict[str, list[str]], meta: dict) -> str:
    """
    Convierte el contenido de una sección markdown a HTML limpio,
    reemplazando marcadores <!-- fotos -->, <!-- fotos1 -->, etc.
    con la cuadrícula correspondiente del frontmatter.
    Sustituye <!--campo--> por valores del frontmatter (p. ej. inscripcion_url).
    """
    content = substitute_meta_vars(content, meta)

    placeholders: dict[str, str] = {}

    def marker_replacer(match: re.Match) -> str:
        suffix = match.group(1)
        key = f"fotos{suffix}" if suffix else "fotos"
        placeholder = f"FOTOS_PLACEHOLDER_{key.upper()}_{len(placeholders)}"
        fotos = photo_sets.get(key, [])
        placeholders[placeholder] = photo_grid_html(fotos)
        return placeholder

    content = PHOTO_MARKER_RE.sub(marker_replacer, content)

    html = md_to_html(content)
    html = render_blockquote_as_topics(html)
    html = render_ul_as_checklist(html)

    for placeholder, grid in placeholders.items():
        html = html.replace(placeholder, grid)

    # Evitar <p><div class="photo-grid">…</div></p> inválido
    html = re.sub(
        r"<p>\s*(<div class=\"photo-grid\">.*?</div>)\s*</p>",
        r"\1",
        html,
        flags=re.S,
    )

    return html


# ─────────────────────────────────────────────────────────────────────────────
# CÓDIGO QR
# ─────────────────────────────────────────────────────────────────────────────

def course_page_url(course_id: str) -> str:
    return f"{SITE_URL}/cursos/{course_id}/"


def load_qr_logo() -> Image.Image:
    """Recorta márgenes transparentes para que el logo llene el espacio central."""
    logo = Image.open(LOGO_QR).convert("RGBA")
    bbox = logo.split()[3].getbbox()
    if bbox:
        logo = logo.crop(bbox)
    return logo


def embed_logo_on_qr(qr_img: Image.Image) -> Image.Image:
    """Superpone el logo de Dr. Z en el centro del QR (fondo blanco de respaldo)."""
    qr = qr_img.convert("RGBA")
    logo = load_qr_logo()

    qr_w, _ = qr.size
    logo_size = int(qr_w * LOGO_RATIO)
    logo = logo.resize((logo_size, logo_size), Image.LANCZOS)

    pad = int(logo_size * 0.12)
    bg_size = logo_size + pad * 2
    bg = Image.new("RGBA", (bg_size, bg_size), (255, 255, 255, 255))

    lx = (qr_w - bg_size) // 2
    ly = (qr_w - bg_size) // 2
    qr.paste(bg, (lx, ly), bg)
    qr.paste(logo, (lx + pad, ly + pad), logo)
    return qr.convert("RGB")


def make_qr_image(url: str, *, embed_logo: bool = False) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img = img.resize((QR_SIZE, QR_SIZE), Image.NEAREST)
    if embed_logo:
        if LOGO_QR.exists():
            img = embed_logo_on_qr(img)
        else:
            print(f"⚠️  Logo QR no encontrado: {LOGO_QR.relative_to(REPO_ROOT)}")
    return img


def generate_qrs(meta: dict, course_dir: Path) -> None:
    """Genera los dos QR: afiche (hoja del curso) e inscripción."""
    if not HAS_QRCODE:
        print("⚠️  qrcode no instalado.  pip install -r requirements.txt")
        return

    course_id = meta.get("id", course_dir.name)
    course_dir.mkdir(parents=True, exist_ok=True)

    # 1. QR para afiche → página de información del curso (con logo)
    rel_curso = meta.get("imagen_qr_curso") or QR_CURSO
    dest_curso = course_dir / rel_curso
    url_curso = course_page_url(course_id)
    dest_curso.parent.mkdir(parents=True, exist_ok=True)
    make_qr_image(url_curso, embed_logo=True).save(dest_curso)
    print(f"✅  QR curso (afiche)  →  {dest_curso.relative_to(REPO_ROOT)}  ({url_curso})")

    # 2. QR para la página → URL de inscripción (con logo)
    inscripcion = str(meta.get("inscripcion_url", "")).strip()
    if inscripcion in INSCRIPCION_PLACEHOLDERS:
        print("⚠️  QR inscripción omitido: define inscripcion_url en curso.md")
        return

    rel_insc = meta.get("imagen_qr") or QR_INSCRIPCION
    dest_insc = course_dir / rel_insc
    dest_insc.parent.mkdir(parents=True, exist_ok=True)
    make_qr_image(inscripcion, embed_logo=True).save(dest_insc)
    print(f"✅  QR inscripción  →  {dest_insc.relative_to(REPO_ROOT)}  ({inscripcion})")


def generate_og_preview(course_dir: Path, header_rel: str) -> tuple[int, int] | None:
    """Genera JPEG liviano del banner para WhatsApp, Twitter, etc. (≤300 KB)."""
    if not HAS_QRCODE:
        return None

    header_path = course_dir / header_rel
    if not header_path.exists():
        print(f"⚠️  Banner no encontrado: {header_path.relative_to(REPO_ROOT)}")
        return None

    dest = course_dir / OG_PREVIEW
    img = Image.open(header_path).convert("RGB")
    w, h = img.size
    if w > OG_MAX_WIDTH:
        h = int(h * OG_MAX_WIDTH / w)
        w = OG_MAX_WIDTH
        img = img.resize((w, h), Image.LANCZOS)

    dest.parent.mkdir(parents=True, exist_ok=True)
    for quality in (85, 75, 65, 55, 45):
        img.save(dest, "JPEG", quality=quality, optimize=True)
        if dest.stat().st_size <= OG_MAX_BYTES:
            break

    kb = dest.stat().st_size // 1024
    print(f"✅  OG preview  →  {dest.relative_to(REPO_ROOT)}  ({w}×{h}, {kb} KB)")
    return w, h


# ─────────────────────────────────────────────────────────────────────────────
# PLANTILLA HTML
# ─────────────────────────────────────────────────────────────────────────────

def hotmart_top_block(meta: dict) -> str:
    """Banner de inscripción para cursos en Hotmart (arriba del contenido)."""
    url = meta.get("inscripcion_url", "#")
    return f'''
    <div class="hotmart-banner">
      <p class="hotmart-banner-lead">Este curso se realiza en la plataforma <strong>Hotmart</strong>. En el siguiente enlace puedes adquirirlo:</p>
      <a class="hotmart-btn" href="{url}" target="_blank" rel="noopener">Adquirir en Hotmart →</a>
    </div>'''


def cta_block(meta: dict) -> str:
    """Genera el bloque de inscripción al final del contenido."""
    url    = meta.get("inscripcion_url", "#")
    qr     = meta.get("imagen_qr", "")
    email  = meta.get("email_contacto", "soydoctorz@gmail.com")
    wa     = meta.get("whatsapp", "")

    qr_html = ""
    if qr:
        qr_html = f'''
      <div class="qr-wrap">
        <img src="{qr}" alt="Código QR para inscripción">
        <span>Comparte el enlace de inscripción con este QR</span>
      </div>'''

    wa_html = ""
    if wa:
        wa_html = f'<a href="{wa}" target="_blank" rel="noopener">WhatsApp</a>'

    return f'''
    <div class="enroll-section">
      <a class="enroll-btn" href="{url}" target="_blank" rel="noopener">
        Inscribete ahora →
      </a>{qr_html}
      <div class="contact-links" style="margin-top:1.5rem;">
        <a href="mailto:{email}">{email}</a>
        {wa_html}
        <a href="https://drz.academy" target="_blank" rel="noopener">drz.academy</a>
      </div>
    </div>
    <p class="closing">¡Nos vemos!</p>'''


def escape_attr(text: str) -> str:
    return html.escape(str(text or ""), quote=True)


def absolute_asset(path: str, course_id: str) -> str:
    """Convierte una ruta relativa de imagen del curso en URL absoluta."""
    if path.startswith("http"):
        return path
    return f"{SITE_URL}/cursos/{course_id}/{path.lstrip('/')}"


def head_meta(
    meta: dict,
    *,
    page_url: str,
    og_image: str,
    og_width: int | None = None,
    og_height: int | None = None,
    og_type: str = "website",
) -> str:
    titulo = meta.get("titulo", "Dr. Z Academy")
    tagline = meta.get("tagline", meta.get("descripcion", ""))
    full_title = f"{titulo} – Dr. Z Academy"

    og_dims = ""
    if og_width and og_height:
        og_dims = f"""
  <meta property="og:image:width" content="{og_width}">
  <meta property="og:image:height" content="{og_height}">
  <meta property="og:image:type" content="image/jpeg">"""

    return f"""  <title>{escape_attr(full_title)}</title>
  <meta name="description" content="{escape_attr(tagline)}">
  <link rel="icon" href="{SITE_URL}/assets/favicon.ico" sizes="any">
  <link rel="icon" href="{SITE_URL}/assets/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="icon" href="{SITE_URL}/assets/favicon-16.png" type="image/png" sizes="16x16">
  <link rel="apple-touch-icon" href="{SITE_URL}/assets/apple-touch-icon.png">
  <meta property="og:type" content="{og_type}">
  <meta property="og:site_name" content="Dr. Z Academy">
  <meta property="og:locale" content="es_CO">
  <meta property="og:title" content="{escape_attr(full_title)}">
  <meta property="og:description" content="{escape_attr(tagline)}">
  <meta property="og:url" content="{page_url}">
  <meta property="og:image" content="{og_image}">{og_dims}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{escape_attr(full_title)}">
  <meta name="twitter:description" content="{escape_attr(tagline)}">
  <meta name="twitter:image" content="{og_image}">"""


def render_html(meta: dict, sections: list[tuple[str, str]]) -> str:
    """Genera la página HTML completa a partir de los metadatos y secciones."""
    titulo      = meta.get("titulo", "Curso Dr. Z Academy")
    tagline     = meta.get("tagline", "")
    instructor  = meta.get("instructor", "")
    header_img  = meta.get("imagen_header", "images/header.png")
    fotos       = collect_photo_sets(meta)
    activo      = meta.get("activo", False)
    course_id   = meta.get("id", "curso")
    page_url    = f"{SITE_URL}/cursos/{course_id}/"
    og_rel      = meta.get("imagen_og", OG_PREVIEW)
    og_image    = absolute_asset(og_rel, course_id)
    og_width    = meta.get("_og_width")
    og_height   = meta.get("_og_height")
    meta_tags   = head_meta(
        meta, page_url=page_url, og_image=og_image,
        og_width=og_width, og_height=og_height,
    )

    # Construir el cuerpo de secciones
    body_html_parts: list[str] = []
    if meta.get("plataforma") == "hotmart":
        body_html_parts.append(hotmart_top_block(meta))
    first = True
    for heading, content in sections:
        if not content and not heading:
            continue
        html_content = render_section_content(content, fotos, meta)
        if heading:
            tag = "h1" if first else "h2"
            body_html_parts.append(
                f'    <{tag} class="section-title">{heading}</{tag}>\n'
                f'    <div class="section-body">{html_content}</div>'
            )
            first = False
        else:
            body_html_parts.append(f'    <div class="section-body">{html_content}</div>')

    if activo:
        body_html_parts.append(cta_block(meta))

    body_html = "\n\n".join(body_html_parts)

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
{meta_tags}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Pacifico&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Roboto:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{
      --gold: #F3D361;
      --teal: #0d7693;
      --link: #1155cc;
      --text: #1a1a1a;
      --text-light: #444;
      --bg: #ffffff;
      --bg-alt: #f8f9fa;
      --border: #e0e0e0;
      --gap: 2.5rem;
      --width: 740px;
      --r: 10px;
    }}
    html {{ scroll-behavior: smooth; }}
    body {{
      background: var(--bg); color: var(--text);
      font-family: 'Nunito', sans-serif; font-size: 1.0625rem; line-height: 1.8;
    }}
    a {{ color: var(--link); }} a:hover {{ text-decoration: underline; }}

    /* Header banner */
    .page-header {{ width: 100%; line-height: 0; background: #000; }}
    .page-header img {{ width: 100%; height: auto; display: block; }}

    /* Breadcrumb */
    .topbar {{
      background: #fff; border-bottom: 1px solid var(--border);
      padding: 0.6rem 1.5rem; display: flex; align-items: center;
      gap: 0.5rem; font-size: 0.8rem; color: #888;
    }}
    .topbar a {{ color: #555; text-decoration: none; }}
    .topbar a:hover {{ color: var(--teal); }}
    .topbar .sep::before {{ content: "›"; margin: 0 0.3rem; }}

    /* Content */
    main {{ max-width: var(--width); margin: 0 auto; padding: 3rem 1.5rem 5rem; }}

    /* Section titles (Pacifico) */
    h1.section-title, h2.section-title {{
      font-family: 'Pacifico', cursive; font-weight: 400;
      font-size: clamp(1.6rem, 5vw, 2.25rem); line-height: 1.2;
      color: var(--text); margin-top: var(--gap); margin-bottom: 1.25rem;
    }}
    h1.section-title {{ margin-top: 0; }}

    /* Section body */
    .section-body p {{
      font-family: 'Roboto', sans-serif; margin-bottom: 1.1rem;
      text-align: justify; color: var(--text-light);
    }}
    .section-body p:last-child {{ margin-bottom: 0; }}
    .section-body p strong, .section-body b {{ color: var(--text); font-weight: 700; }}

    /* Topics list (blockquote) */
    .topics-list {{
      background: var(--bg-alt); border-left: 4px solid var(--teal);
      border-radius: 0 var(--r) var(--r) 0; padding: 1.25rem 1.5rem; margin: 1.25rem 0;
    }}
    .topics-list p {{
      color: #1a4fa8; font-size: 1rem; font-weight: 600;
      text-align: center; margin: 0; line-height: 1.9;
    }}

    /* Photo grid */
    .photo-grid {{ display: grid; gap: 1rem; margin: 1.5rem 0; width: 100%; }}
    .photo-grid--single {{
      grid-template-columns: minmax(0, 400px);
      justify-content: center;
      margin-left: auto;
      margin-right: auto;
    }}
    .photo-grid--pair {{ grid-template-columns: 1fr 1fr; }}
    .photo-grid--many {{ grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }}
    .photo-grid img {{ width: 100%; height: auto; border-radius: var(--r); display: block; object-fit: cover; }}

    /* Checklist */
    ul.checklist {{ list-style: none; padding: 0; margin: 1rem 0; }}
    ul.checklist li {{
      font-family: 'Nunito', sans-serif; font-size: 1rem; color: var(--text-light);
      padding: 0.6rem 0 0.6rem 2rem; position: relative;
      border-bottom: 1px solid var(--border); line-height: 1.6;
    }}
    ul.checklist li:last-child {{ border-bottom: none; }}
    ul.checklist li::before {{
      content: "●"; position: absolute; left: 0.4rem;
      color: var(--gold); font-size: 0.55rem; top: 0.9rem;
    }}

    /* Hotmart banner (arriba del contenido) */
    .hotmart-banner {{
      background: linear-gradient(135deg, #fff8e6 0%, #fff3cd 100%);
      border: 2px solid #f5a623;
      border-radius: var(--r);
      padding: 1.75rem 2rem;
      margin-bottom: 2rem;
      text-align: center;
    }}
    .hotmart-banner-lead {{
      font-family: 'Nunito', sans-serif;
      font-size: 1.1rem;
      color: var(--text);
      margin-bottom: 1.25rem;
      text-align: center;
    }}
    .hotmart-btn {{
      display: inline-block;
      background: #f5a623;
      color: #1a1a1a;
      font-family: 'Nunito', sans-serif;
      font-size: 1.05rem;
      font-weight: 800;
      padding: 0.75rem 2rem;
      border-radius: 100px;
      text-decoration: none;
      transition: background 0.2s;
    }}
    .hotmart-btn:hover {{ background: #e09410; text-decoration: none; color: #1a1a1a; }}

    /* CTA / Enroll */
    .enroll-section {{
      background: var(--bg-alt); border: 2px solid var(--teal);
      border-radius: var(--r); padding: 2rem; margin-top: var(--gap); text-align: center;
    }}
    .enroll-section p {{ text-align: center; font-family: 'Nunito', sans-serif; font-size: 1.1rem; color: var(--text); margin-bottom: 1.25rem; }}
    .enroll-btn {{
      display: inline-block; background: var(--teal); color: #fff;
      font-family: 'Nunito', sans-serif; font-size: 1.1rem; font-weight: 800;
      padding: 0.8rem 2.2rem; border-radius: 100px; text-decoration: none;
      transition: background 0.2s; margin-bottom: 1.5rem;
    }}
    .enroll-btn:hover {{ background: #0a5f77; text-decoration: none; color: #fff; }}
    .qr-wrap {{ display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }}
    .qr-wrap img {{ width: 140px; height: 140px; border: 1px solid var(--border); border-radius: var(--r); }}
    .qr-wrap span {{ font-size: 0.8rem; color: #888; }}
    .contact-links {{ display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }}
    .contact-links a {{ color: var(--teal); font-weight: 700; font-size: 0.9rem; }}

    /* Closing */
    .closing {{
      text-align: center; font-family: 'Nunito', sans-serif;
      font-size: 1.5rem; font-weight: 800; color: var(--teal);
      margin-top: 2.5rem; padding-top: 2rem; border-top: 2px solid var(--border);
    }}

    /* Footer */
    footer {{ background: var(--bg-alt); border-top: 1px solid var(--border); padding: 1.5rem; text-align: center; font-size: 0.8rem; color: #888; }}
    footer a {{ color: #555; }}

    /* Print */
    @media print {{
      .topbar, .enroll-section, footer {{ display: none; }}
      body {{ font-size: 11pt; }}
      .section-body p {{ text-align: left; color: #000; }}
      h1.section-title, h2.section-title {{ color: #000; }}
    }}

    /* Mobile */
    @media (max-width: 600px) {{
      main {{ padding: 2rem 1rem 4rem; }}
      .photo-grid--pair {{ grid-template-columns: 1fr; }}
      .enroll-section {{ padding: 1.25rem 1rem; }}
    }}
  </style>
</head>
<body>

  <div class="page-header">
    <img src="{header_img}" alt="{titulo} – Dr. Z Academy" width="2048" height="952">
  </div>

  <nav class="topbar" aria-label="Breadcrumb">
    <a href="{SITE_URL}/">Dr. Z Academy</a>
    <span class="sep">Cursos</span>
    <span class="sep" aria-current="page">{titulo}</span>
  </nav>

  <main>
{body_html}
  </main>

  <footer>
    <p>© 2026 <a href="https://drz.academy" target="_blank" rel="noopener">Dr. Z Academy</a>
    · Medellín, Colombia
    · <a href="mailto:{meta.get('email_contacto', 'soydoctorz@gmail.com')}">{meta.get('email_contacto', 'soydoctorz@gmail.com')}</a></p>
  </footer>

</body>
</html>
"""


# ─────────────────────────────────────────────────────────────────────────────
# COURSES.JSON
# ─────────────────────────────────────────────────────────────────────────────

def update_courses_json(meta: dict, course_dir: Path) -> None:
    """Inserta o actualiza la entrada del curso en cursos/courses.json."""
    cid = meta.get("id", course_dir.name)

    # Ruta relativa del directorio del curso desde la raíz del repo
    rel_dir = course_dir.relative_to(REPO_ROOT).as_posix() + "/"

    # Imagen de cabecera para la tarjeta
    header = meta.get("imagen_header", "images/header.png")
    if not header.startswith("http"):
        header = rel_dir + header

    entry = {
        "id":          cid,
        "titulo":      meta.get("titulo", ""),
        "tagline":     meta.get("tagline", ""),
        "descripcion": meta.get("descripcion", ""),
        "url":         rel_dir,
        "imagen":      header,
        "etiquetas":   meta.get("etiquetas", []),
        "instructor":  meta.get("instructor", ""),
        "sesiones":    meta.get("sesiones", 0),
        "activo":      meta.get("activo", False),
    }

    data: dict = {"cursos": []}
    if COURSES_JSON.exists():
        with open(COURSES_JSON, encoding="utf-8") as f:
            data = json.load(f)

    cursos = data.get("cursos", [])
    # Reemplazar si ya existe, insertar al principio si es nuevo
    idx = next((i for i, c in enumerate(cursos) if c.get("id") == cid), None)
    if idx is not None:
        cursos[idx] = entry
    else:
        cursos.insert(0, entry)

    data["cursos"] = cursos
    with open(COURSES_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"✅  courses.json actualizado  →  {COURSES_JSON.relative_to(REPO_ROOT)}")


# ─────────────────────────────────────────────────────────────────────────────
# COMANDOS
# ─────────────────────────────────────────────────────────────────────────────

def cmd_new(course_id: str) -> None:
    """Crea un nuevo directorio de curso copiando la plantilla."""
    dest_dir = CURSOS_DIR / course_id
    dest_md  = dest_dir / "curso.md"
    dest_img = dest_dir / "images"

    if dest_dir.exists():
        sys.exit(f"❌  Ya existe el directorio  {dest_dir.relative_to(REPO_ROOT)}")

    dest_dir.mkdir(parents=True)
    dest_img.mkdir()
    shutil.copy(TEMPLATE_MD, dest_md)

    # Actualizar el id en el frontmatter
    text = dest_md.read_text(encoding="utf-8")
    text = re.sub(r'^id:\s*"[^"]*"', f'id: "{course_id}"', text, flags=re.MULTILINE)
    dest_md.write_text(text, encoding="utf-8")

    meta, _ = parse_frontmatter(dest_md.read_text(encoding="utf-8"))
    generate_qrs(meta, dest_dir)

    print(f"✅  Nuevo curso creado en:  {dest_dir.relative_to(REPO_ROOT)}/")
    print(f"   1. Edita el frontmatter y el contenido en:  {dest_md.relative_to(REPO_ROOT)}")
    print(f"   2. Copia las imágenes a:  {dest_img.relative_to(REPO_ROOT)}/")
    print(f"      · header.png (banner, ~2048×952 px)")
    print(f"      · fotos opcionales para la sección «¿Cómo lo vamos a hacer?»")
    print(f"   3. Pon la URL real de inscripción en inscripcion_url y vuelve a generar:")
    print(f"      python3 cursos/build_course.py {dest_md.relative_to(REPO_ROOT)}")


def cmd_build(md_path: Path, update_json: bool = True, generate_qr_code: bool = True) -> None:
    """Genera el index.html del curso a partir del markdown."""
    md_path = md_path.resolve()
    if not md_path.exists():
        sys.exit(f"❌  No se encuentra el archivo:  {md_path}")

    if md_path.parent == TEMPLATE_DIR.resolve():
        print("⏭️  Omitiendo plantilla (no es un curso publicable): cursos/template/curso.md")
        return

    source    = md_path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(source)

    if not meta.get("id"):
        meta["id"] = md_path.parent.name

    if generate_qr_code:
        generate_qrs(meta, md_path.parent)

    og_dims = generate_og_preview(
        md_path.parent, meta.get("imagen_header", "images/header.png")
    )
    if og_dims:
        meta["_og_width"], meta["_og_height"] = og_dims

    sections  = split_sections(body)
    html      = render_html(meta, sections)

    out_file  = md_path.parent / "index.html"
    out_file.write_text(html, encoding="utf-8")
    print(f"✅  Página generada  →  {out_file.relative_to(REPO_ROOT)}")

    if update_json:
        update_courses_json(meta, md_path.parent)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Dr. Z Academy – generador de páginas de curso",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python3 cursos/build_course.py --new cuantica-para-curiosos
  python3 cursos/build_course.py cursos/cuantica-para-curiosos/curso.md
  python3 cursos/build_course.py cursos/extraterrestres/curso.md --no-update-json
""",
    )
    parser.add_argument(
        "markdown", nargs="?", type=Path,
        help="Ruta al archivo curso.md (ej: cursos/mi-curso/curso.md)",
    )
    parser.add_argument(
        "--new", metavar="ID",
        help="Crear nuevo directorio de curso desde la plantilla",
    )
    parser.add_argument(
        "--no-update-json", action="store_true",
        help="No actualizar cursos/courses.json",
    )
    parser.add_argument(
        "--no-qr", action="store_true",
        help="No regenerar el código QR de inscripción",
    )
    args = parser.parse_args()

    if args.new:
        cmd_new(args.new)
    elif args.markdown:
        cmd_build(
            args.markdown,
            update_json=not args.no_update_json,
            generate_qr_code=not args.no_qr,
        )
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

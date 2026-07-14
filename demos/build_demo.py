#!/usr/bin/env python3
"""
build_demo.py – Genera páginas HTML de demos a partir de demo.json + content.html.

Uso:
    # Crear carpeta de un demo nuevo
    python3 demos/build_demo.py --new optica-activa

    # Construir un demo concreto
    python3 demos/build_demo.py demos/difraccion/demo.json

    # Construir todos los demos y actualizar demos/demos.json
    python3 demos/build_demo.py --all

    # Importar widget desde HTML de WordPress/Gemini (contrib/)
    python3 demos/build_demo.py --import "contrib/Óptica activa – Dr. Z Academy.html" demos/optica-activa/

Dependencias:
    pip install -r requirements.txt
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
import textwrap
from pathlib import Path

try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

REPO_ROOT = Path(__file__).resolve().parent.parent
DEMOS_DIR = REPO_ROOT / "demos"
TEMPLATE_DIR = DEMOS_DIR / "template"
DEMOS_JSON = DEMOS_DIR / "demos.json"
SITE_URL = "https://drz-academy.github.io"
ANALYTICS_LOG_URL = "https://drz-academy-visitor-log.drz-academy.workers.dev/log"
LOGO_QR = REPO_ROOT / "assets/DrZ-Logos/Dr_Z_Logo_Blanco_marquesina_fondo_transparente.png"
LOGO_OG = REPO_ROOT / "assets/DrZ-Logos/Dr_Z_Logo_Blanco_marquesina_fondo_transparente.png"
QR_SIZE = 512
LOGO_RATIO = 0.28
QR_DEMO = "images/qr-demo.png"
OG_DEMO = "images/og-preview.jpg"

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
{meta_tags}
  <meta name="visitor-log-endpoint" content="{analytics_log_url}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Raleway:wght@700;900&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/demos/demo.css">
</head>
<body data-track-page="demo" data-track-id="{demo_id}" data-track-name="{demo_name_attr}">

  <nav class="topbar" aria-label="Navegación">
    <div class="topbar-left">
      <a href="/" class="logo">Dr. Z <span>Academy</span></a>
      <div class="breadcrumb" aria-label="Ruta">
        <span class="sep">›</span>
        <span><a href="/#demos">Demos</a></span>
        <span class="sep">›</span>
        <span>{breadcrumb}</span>
      </div>
    </div>
    <a href="/#demos" class="topbar-back" aria-label="Volver a demos">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9.5 6h-7M5.5 9L2.5 6l3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Volver
    </a>
  </nav>

  <header class="demo-hero">
    <div class="demo-hero-inner">
      <span class="demo-label">Demo interactivo · {categoria}</span>
      <h1>{titulo_html}</h1>
      <p>{descripcion}</p>
    </div>
  </header>

  <main class="demo-body">
    <div class="demo-widget">
{content}
    </div>
{teoria_block}
  </main>

  <footer class="demo-footer">
    © 2026 <a href="https://drz.academy" target="_blank" rel="noopener">Dr. Z Academy</a>
    · <a href="/#demos">Más demos</a>
    · <a href="https://github.com/drz-academy/drz-academy.github.io" target="_blank" rel="noopener">GitHub</a>
  </footer>

  <script type="module" src="/assets/site-analytics.js"></script>
</body>
</html>
"""


def escape_attr(text: str) -> str:
    return html.escape(str(text), quote=True)


def demo_page_url(demo_id: str) -> str:
    return f"{SITE_URL}/demos/{demo_id}/"


def load_qr_logo() -> Image.Image:
    logo = Image.open(LOGO_QR).convert("RGBA")
    bbox = logo.split()[3].getbbox()
    if bbox:
        logo = logo.crop(bbox)
    return logo


def embed_logo_on_qr(qr_img: Image.Image) -> Image.Image:
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


def make_qr_image(url: str) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").resize(
        (QR_SIZE, QR_SIZE), Image.NEAREST
    )
    return embed_logo_on_qr(img)


def generate_qr(meta: dict, demo_dir: Path) -> None:
    if not HAS_QRCODE:
        print("⚠️  qrcode no instalado.  pip install -r requirements.txt")
        return
    demo_id = meta.get("id", demo_dir.name)
    rel = meta.get("qr_imagen", QR_DEMO)
    dest = demo_dir / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = demo_page_url(demo_id)
    make_qr_image(url).save(dest)
    print(f"✅  QR demo  →  {dest.relative_to(REPO_ROOT)}  ({url})")


def head_meta(meta: dict, page_url: str, og_image: str) -> str:
    titulo = meta.get("titulo", "Demo")
    destacado = meta.get("titulo_destacado", "")
    full_title = f"{titulo} {destacado}".strip() + " – Dr. Z Academy"
    desc = meta.get("descripcion", meta.get("descripcion_corta", ""))
    return f"""  <title>{escape_attr(full_title)}</title>
  <meta name="description" content="{escape_attr(desc)}">
  <link rel="icon" href="{SITE_URL}/assets/favicon.ico" sizes="any">
  <link rel="icon" href="{SITE_URL}/assets/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="{SITE_URL}/assets/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Dr. Z Academy">
  <meta property="og:locale" content="es_CO">
  <meta property="og:title" content="{escape_attr(full_title)}">
  <meta property="og:description" content="{escape_attr(desc)}">
  <meta property="og:url" content="{page_url}">
  <meta property="og:image" content="{og_image}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{escape_attr(full_title)}">
  <meta name="twitter:description" content="{escape_attr(desc)}">
  <meta name="twitter:image" content="{og_image}">"""


def titulo_html(meta: dict) -> str:
    titulo = escape_attr(meta.get("titulo", "Demo"))
    destacado = meta.get("titulo_destacado", "").strip()
    if destacado:
        return f'{titulo} <em>{escape_attr(destacado)}</em>'
    return titulo


def sanitize_widget_content(raw: str) -> str:
    """Adapta HTML importado para convivir con la plantilla común."""
    content = raw.strip()
    content = re.sub(r"<meta[^>]*>\s*", "", content, flags=re.I)
    content = re.sub(r"<title>[^<]*</title>\s*", "", content, flags=re.I)

    def _scope_body_styles(match: re.Match) -> str:
        block = match.group(0)
        block = re.sub(r"\bbody\b", ".demo-widget", block)
        return block

    content = re.sub(r"<style[^>]*>.*?</style>", _scope_body_styles, content, flags=re.S | re.I)
    return content


def plain_text_from_html(raw: str) -> str:
    text = re.sub(r"<script[^>]*>.*?</script>", " ", raw, flags=re.S | re.I)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def wrap_text_to_width(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    max_width: int,
    max_lines: int,
) -> list[str]:
    words = text.split()
    if not words:
        return []

    lines: list[str] = []
    current = words[0]

    for word in words[1:]:
        test = f"{current} {word}"
        w = draw.textbbox((0, 0), test, font=font)[2]
        if w <= max_width:
            current = test
            continue

        lines.append(current)
        current = word
        if len(lines) >= max_lines:
            break

    if len(lines) < max_lines:
        lines.append(current)

    if len(lines) > max_lines:
        lines = lines[:max_lines]

    # Si recortamos contenido, ajustamos la última línea con ellipsis respetando el ancho.
    consumed = sum(len(line.split()) for line in lines)
    if consumed < len(words):
        last = lines[-1].rstrip(" .,:;")
        while last:
            candidate = last + "…"
            w = draw.textbbox((0, 0), candidate, font=font)[2]
            if w <= max_width:
                lines[-1] = candidate
                break
            last = last[:-1]
        if not last:
            lines[-1] = "…"

    return lines


def generate_og_preview(meta: dict, demo_dir: Path, content: str) -> Path | None:
    if not HAS_PIL:
        print("⚠️  PIL no disponible. Omitiendo OG preview del demo")
        return None

    rel = meta.get("imagen_og", OG_DEMO)
    if rel.startswith("http://") or rel.startswith("https://"):
        return None

    out = demo_dir / rel
    out.parent.mkdir(parents=True, exist_ok=True)

    w, h = 1200, 630
    img = Image.new("RGB", (w, h), "#0c0c0c")
    draw = ImageDraw.Draw(img)

    # Fondo base + panel para mantener legibilidad del texto.
    draw.rectangle((0, 0, w, h), fill="#0b1020")
    draw.rectangle((0, 0, w, int(h * 0.35)), fill="#111a34")
    draw.ellipse((820, -180, 1360, 360), fill="#1b2c5a")
    draw.rectangle((50, 70, w - 50, h - 70), fill="#0f172d")
    draw.rectangle((50, 70, w - 50, h - 70), outline="#2f457f", width=2)

    # Logo academia en la esquina superior derecha del panel.
    logo_reserved_left: int | None = None
    if LOGO_OG.exists():
        try:
            logo = Image.open(LOGO_OG).convert("RGBA")
            max_logo_w = 250
            ratio = max_logo_w / max(logo.width, 1)
            logo_h = int(logo.height * ratio)
            logo = logo.resize((max_logo_w, logo_h), Image.LANCZOS)
            lx = w - 70 - max_logo_w
            ly = 92
            img.paste(logo, (lx, ly), logo)
            logo_reserved_left = lx - 28
        except OSError:
            pass

    label_font = get_font(26, bold=True)
    title_font = get_font(64, bold=True)
    body_font = get_font(30, bold=False)
    meta_font = get_font(22, bold=False)

    label = f"Demo interactivo · {meta.get('categoria', 'Ciencia')}"
    title = f"{meta.get('titulo', 'Demo')} {meta.get('titulo_destacado', '').strip()}".strip()
    desc = meta.get("descripcion", "")
    body_text = plain_text_from_html(content)
    snippet = f"Contenido: {body_text}"

    x = 86
    max_text_w = w - x - 86
    if logo_reserved_left is not None:
        max_text_w = min(max_text_w, logo_reserved_left - x)
    max_text_w = max(max_text_w, 520)
    y = 110
    draw.text((x, y), label, fill="#f3d361", font=label_font)
    y += 52

    title_lines = wrap_text_to_width(draw, title, title_font, max_text_w, 2)
    for line in title_lines:
        draw.text((x, y), line, fill="#f5f7ff", font=title_font)
        y += 70

    y += 8
    desc_lines = wrap_text_to_width(draw, desc, body_font, max_text_w, 3)
    for line in desc_lines:
        draw.text((x, y), line, fill="#d8def0", font=body_font)
        y += 40

    y = max(y + 12, 482)
    snippet_lines = wrap_text_to_width(draw, snippet, meta_font, max_text_w, 2)
    for line in snippet_lines:
        draw.text((x, y), line, fill="#9fb0dd", font=meta_font)
        y += 30

    draw.text((x, h - 70), "drz-academy.github.io", fill="#6f84bd", font=meta_font)

    img.save(out, format="JPEG", quality=88, optimize=True)
    print(f"✅  OG preview demo  →  {out.relative_to(REPO_ROOT)}")
    return out


def resolve_og_image_url(meta: dict, demo_dir: Path) -> str:
    rel = meta.get("imagen_og", OG_DEMO)
    if rel.startswith("http://") or rel.startswith("https://"):
        return rel
    if (demo_dir / rel).exists():
        demo_id = meta.get("id", demo_dir.name)
        return f"{SITE_URL}/demos/{demo_id}/{rel}"
    return f"{SITE_URL}/assets/og-drz.png"


def load_teoria(demo_dir: Path, meta: dict) -> str:
    teoria_file = demo_dir / "teoria.html"
    if teoria_file.exists():
        body = teoria_file.read_text(encoding="utf-8").strip()
    else:
        body = meta.get("teoria", "").strip()
    if not body:
        return ""
    titulo = escape_attr(meta.get("teoria_titulo", "¿Qué estás viendo?"))
    return f"""
    <section class="demo-teoria">
      <h2>{titulo}</h2>
      {body}
    </section>"""


def extract_from_contrib(html_path: Path) -> str:
    text = html_path.read_text(encoding="utf-8")
    m = re.search(
        r'<div class="bde-code-block[^"]*">\s*(.*?)\s*</div>\s*</div>\s*</div>\s*</section>',
        text,
        re.S,
    )
    if not m:
        sys.exit(f"❌  No se encontró bloque de código en {html_path}")
    return sanitize_widget_content(m.group(1))


def load_demo_meta(path: Path) -> tuple[dict, Path]:
    path = path.resolve()
    if path.is_dir():
        json_path = path / "demo.json"
        demo_dir = path
    else:
        json_path = path
        demo_dir = path.parent
    if not json_path.exists():
        sys.exit(f"❌  No existe {json_path}")
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    meta.setdefault("id", demo_dir.name)
    return meta, demo_dir


def build_demo(path: Path, *, no_qr: bool = False, no_json: bool = False) -> dict:
    meta, demo_dir = load_demo_meta(path)

    if demo_dir.name == "template":
        print("⏭  Omitiendo plantilla")
        return {}

    content_path = demo_dir / "content.html"
    if not content_path.exists():
        sys.exit(f"❌  Falta {content_path.relative_to(REPO_ROOT)}")

    content = sanitize_widget_content(content_path.read_text(encoding="utf-8"))
    demo_id = meta["id"]
    page_url = demo_page_url(demo_id)

    generate_og_preview(meta, demo_dir, content)
    og_image = resolve_og_image_url(meta, demo_dir)

    page = PAGE_TEMPLATE.format(
        meta_tags=head_meta(meta, page_url, og_image),
        analytics_log_url=ANALYTICS_LOG_URL,
        demo_id=escape_attr(demo_id),
        demo_name_attr=escape_attr(meta.get("titulo", demo_id)),
        breadcrumb=escape_attr(meta.get("breadcrumb") or meta.get("titulo_destacado") or demo_id),
        categoria=escape_attr(meta.get("categoria", "Ciencia")),
        titulo_html=titulo_html(meta),
        descripcion=escape_attr(meta.get("descripcion", "")),
        content=content,
        teoria_block=load_teoria(demo_dir, meta),
    )

    out = demo_dir / "index.html"
    out.write_text(page, encoding="utf-8")
    print(f"✅  Página generada  →  {out.relative_to(REPO_ROOT)}")

    if not no_qr:
        generate_qr(meta, demo_dir)

    catalog_entry = {
        "id": demo_id,
        "titulo": f"{meta.get('titulo', '')} {meta.get('titulo_destacado', '')}".strip(),
        "descripcion": meta.get("descripcion_corta") or meta.get("descripcion", ""),
        "url": f"demos/{demo_id}/",
        "icono": meta.get("icono", "🔬"),
        "etiquetas": meta.get("etiquetas", []),
        "categoria": meta.get("categoria", ""),
        "activo": meta.get("activo", True),
    }
    if not no_json:
        update_demos_json(catalog_entry)
    return catalog_entry


def update_demos_json(entry: dict) -> None:
    data: dict = {"demos": []}
    if DEMOS_JSON.exists():
        data = json.loads(DEMOS_JSON.read_text(encoding="utf-8"))

    demos = [d for d in data.get("demos", []) if d.get("id") != entry["id"]]
    demos.append(entry)
    demos.sort(key=lambda d: d.get("titulo", "").lower())
    data["demos"] = demos
    DEMOS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✅  demos.json actualizado  →  {DEMOS_JSON.relative_to(REPO_ROOT)}")


def rebuild_demos_json() -> None:
    entries = []
    for json_path in sorted(DEMOS_DIR.glob("*/demo.json")):
        if json_path.parent.name == "template":
            continue
        meta = json.loads(json_path.read_text(encoding="utf-8"))
        demo_id = meta.get("id", json_path.parent.name)
        entries.append({
            "id": demo_id,
            "titulo": f"{meta.get('titulo', '')} {meta.get('titulo_destacado', '')}".strip(),
            "descripcion": meta.get("descripcion_corta") or meta.get("descripcion", ""),
            "url": f"demos/{demo_id}/",
            "icono": meta.get("icono", "🔬"),
            "etiquetas": meta.get("etiquetas", []),
            "categoria": meta.get("categoria", ""),
            "activo": meta.get("activo", True),
        })
    entries.sort(key=lambda d: d.get("titulo", "").lower())
    DEMOS_JSON.write_text(
        json.dumps({"demos": entries}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"✅  demos.json reconstruido ({len(entries)} demos)")


def cmd_new(slug: str) -> None:
    demo_dir = DEMOS_DIR / slug
    if demo_dir.exists():
        sys.exit(f"❌  Ya existe {demo_dir.relative_to(REPO_ROOT)}")
    demo_dir.mkdir(parents=True)
    (demo_dir / "images").mkdir(exist_ok=True)

    template_json = TEMPLATE_DIR / "demo.json"
    meta = json.loads(template_json.read_text(encoding="utf-8"))
    meta["id"] = slug
    (demo_dir / "demo.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (demo_dir / "content.html").write_text(
        "<!-- Pega aquí el HTML/CSS/JS del widget (p. ej. exportado desde Gemini) -->\n"
        "<div class=\"widget\">\n  <p>Widget pendiente…</p>\n</div>\n",
        encoding="utf-8",
    )
    (demo_dir / "teoria.html").write_text(
        "<p>Contexto teórico del demo (opcional).</p>\n", encoding="utf-8"
    )
    print(f"✅  Demo creado en demos/{slug}/")
    print(f"   1. Edita demos/{slug}/demo.json")
    print(f"   2. Pega el widget en demos/{slug}/content.html")
    print(f"   3. python3 demos/build_demo.py demos/{slug}/demo.json")


def cmd_import(src: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "images").mkdir(exist_ok=True)
    content = extract_from_contrib(src)
    (dest / "content.html").write_text(content + "\n", encoding="utf-8")
    print(f"✅  Widget importado  →  {(dest / 'content.html').relative_to(REPO_ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera páginas de demos Dr. Z Academy")
    parser.add_argument("path", nargs="?", help="Ruta a demo.json o carpeta del demo")
    parser.add_argument("--all", action="store_true", help="Construir todos los demos")
    parser.add_argument("--new", metavar="SLUG", help="Crear carpeta de demo nuevo")
    parser.add_argument("--import", dest="import_src", metavar="HTML", help="Importar widget desde HTML")
    parser.add_argument("--into", dest="import_dest", metavar="DIR", help="Carpeta destino del import")
    parser.add_argument("--no-qr", action="store_true", help="No generar QR")
    parser.add_argument("--no-update-json", action="store_true", help="No actualizar demos.json")
    args = parser.parse_args()

    if args.new:
        cmd_new(args.new)
        return

    if args.import_src:
        if not args.import_dest:
            sys.exit("❌  Usa --into demos/mi-demo/ con --import")
        cmd_import(Path(args.import_src), Path(args.import_dest))
        return

    if args.all:
        for json_path in sorted(DEMOS_DIR.glob("*/demo.json")):
            if json_path.parent.name == "template":
                continue
            print(f"▶  {json_path.parent.name}")
            build_demo(json_path, no_qr=args.no_qr, no_json=True)
        rebuild_demos_json()
        return

    if not args.path:
        parser.print_help()
        sys.exit(1)

    build_demo(Path(args.path), no_qr=args.no_qr, no_json=args.no_update_json)


if __name__ == "__main__":
    main()

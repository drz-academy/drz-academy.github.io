#!/usr/bin/env python3
"""
Genera páginas estáticas de previsualización OG para cada formulario del Club.

WhatsApp / Facebook no ejecutan JavaScript: leen meta tags del HTML. Como
drz-form.html es una SPA, cada formulario necesita un HTML propio con
og:title, og:description y og:image.

Uso:
    python3 club/bin/generar_forms_preview.py
    python3 club/bin/generar_forms_preview.py --out _site/club/drz-forms/p

En el JSON del formulario:
    "curso": "circulo-latino"          # carpeta bajo cursos/ → images/og-share.jpg o og-preview.jpg
    "og_imagen": "https://..."         # opcional, anula la imagen del curso
    "og_descripcion": "texto corto"    # opcional; si falta usa etiqueta o intro
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FORMS_DIR = ROOT / "club" / "drz-forms"
CURSOS_DIR = ROOT / "cursos"
SITE = "https://drz-academy.github.io"

SKIP_NAMES = {"cursos-opciones.json"}


def flatten_text(value: str) -> str:
    text = re.sub(r"[*_`]+", "", str(value or ""))
    text = re.sub(r"\s*\n+\s*", " — ", text)
    text = re.sub(r"\s+", " ", text).strip(" —")
    return text


def first_sentence(value: str, limit: int = 180) -> str:
    text = flatten_text(value)
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0]
    return (cut or text[: limit - 1]).rstrip(".,;:") + "…"


def resolve_course_image(curso_slug: str) -> str:
    slug = str(curso_slug or "").strip().strip("/")
    if not slug:
        return ""
    course_dir = CURSOS_DIR / slug / "images"
    for name in ("og-share.jpg", "og-preview.jpg", "header.png", "header.jpg"):
        if (course_dir / name).is_file():
            return f"{SITE}/cursos/{slug}/images/{name}"
    return ""


def resolve_image(schema: dict) -> str:
    explicit = str(schema.get("og_imagen") or schema.get("og_image") or "").strip()
    if explicit:
        if explicit.startswith("http://") or explicit.startswith("https://"):
            return explicit
        return f"{SITE}/{explicit.lstrip('/')}"
    curso = str(schema.get("curso") or schema.get("curso_slug") or "").strip()
    return resolve_course_image(curso) or f"{SITE}/assets/og-drz.png"


def resolve_title(schema: dict) -> str:
    """Línea principal del preview (negrita en WhatsApp)."""
    etiqueta = flatten_text(schema.get("etiqueta") or "")
    if etiqueta:
        return etiqueta
    curso = str(schema.get("curso") or "").strip().replace("-", " ").title()
    if curso:
        return f"Dr. Z Academy · {curso}"
    return "Dr. Z Academy Club"


def resolve_description(schema: dict) -> str:
    """Texto bajo el título: el título del formulario (lo que pedimos en WhatsApp)."""
    custom = str(schema.get("og_descripcion") or schema.get("og_description") or "").strip()
    if custom:
        return first_sentence(custom)
    titulo = flatten_text(schema.get("titulo") or "")
    if titulo:
        return first_sentence(titulo, limit=200)
    intro = first_sentence(schema.get("intro") or "")
    if intro:
        return intro
    return "Formulario del Dr. Z Academy Club"


def render_page(schema: dict) -> str:
    form_id = str(schema.get("id") or "").strip()
    title = resolve_title(schema)
    description = resolve_description(schema)
    image = resolve_image(schema)
    page_url = f"{SITE}/club/drz-forms/p/{form_id}.html"
    safe_title = html.escape(title, quote=True)
    safe_desc = html.escape(description, quote=True)
    safe_image = html.escape(image, quote=True)
    safe_url = html.escape(page_url, quote=True)
    safe_id_js = json.dumps(form_id)

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
  <meta name="description" content="{safe_desc}">
  <meta name="robots" content="noindex, nofollow">
  <link rel="canonical" href="{safe_url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Dr. Z Academy Club">
  <meta property="og:title" content="{safe_title}">
  <meta property="og:description" content="{safe_desc}">
  <meta property="og:url" content="{safe_url}">
  <meta property="og:image" content="{safe_image}">
  <meta property="og:image:alt" content="{safe_title}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{safe_title}">
  <meta name="twitter:description" content="{safe_desc}">
  <meta name="twitter:image" content="{safe_image}">
  <meta http-equiv="refresh" content="0;url=../drz-form.html?form={html.escape(form_id, quote=True)}">
  <script>
    (function () {{
      var formId = {safe_id_js};
      var q = new URLSearchParams(window.location.search);
      q.set("form", formId);
      window.location.replace("../drz-form.html?" + q.toString() + window.location.hash);
    }})();
  </script>
</head>
<body>
  <p><a href="../drz-form.html?form={html.escape(form_id, quote=True)}">Abrir formulario</a></p>
</body>
</html>
"""


def iter_schemas():
    for path in sorted(FORMS_DIR.glob("*.json")):
        if path.name in SKIP_NAMES or path.name.endswith("-respuestas.csv"):
            continue
        if path.name.endswith("-respuestas.json"):
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"  ⚠️  No se pudo leer {path.name}: {exc}")
            continue
        form_id = str(data.get("id") or "").strip()
        if not form_id or form_id != path.stem:
            print(f"  ⚠️  Saltando {path.name}: id inválido o distinto del nombre del archivo")
            continue
        yield path, data


def main():
    parser = argparse.ArgumentParser(description="Genera HTML de previsualización OG por formulario")
    parser.add_argument(
        "--out",
        type=Path,
        default=FORMS_DIR / "p",
        help="Directorio de salida (default: club/drz-forms/p)",
    )
    args = parser.parse_args()
    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    # Limpiar HTML previos del generador
    for old in out_dir.glob("*.html"):
        old.unlink()

    count = 0
    for path, schema in iter_schemas():
        form_id = schema["id"]
        target = out_dir / f"{form_id}.html"
        target.write_text(render_page(schema), encoding="utf-8")
        title = resolve_title(schema)
        image = resolve_image(schema)
        print(f"  ✓ {form_id}.html")
        print(f"      title: {title}")
        print(f"      image: {image}")
        count += 1

    print(f"Generadas {count} página(s) en {out_dir}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Dr. Z Academy Club - Generación de Boletines Personalizados

Genera boletines personalizados por correo electrónico para informar
a los miembros del club sobre el próximo curso y sus beneficios.

Uso:
    python3 club/bin/generar_boletines.py --nombre-curso "Nombre del curso" [--precio 350000]

Ejemplo:
    python3 club/bin/generar_boletines.py --nombre-curso "Cosmología para todos" --precio 350000
"""

import argparse
import csv
import html
import json
import os
import re
import shutil
import sys
from datetime import datetime

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

CLUB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSONAL_DIR = os.path.join(CLUB_DIR, "personal")
BOLETINES_DIR = os.path.join(PERSONAL_DIR, "boletines")
CURSOS_JSON = os.path.join(CLUB_DIR, "cursos.json")
CATEGORIAS_JSON = os.path.join(CLUB_DIR, "categorias.json")
CUPONES_JSON = os.path.join(PERSONAL_DIR, "cupones.json")
SITE_URL = "https://drz-academy.github.io"
CLUB_URL = f"{SITE_URL}/club/"
LOGO_URL = f"{SITE_URL}/assets/DrZ-Logos/logo-firma.webp"

CATEGORIA_META = {
    "ORO": {
        "key": "gold",
        "slug": "oro",
        "accent": "#c9ae4a",
        "bg": "#fbf8ea",
        "ink": "#8a7310",
        "banner": f"{SITE_URL}/assets/club/banner-oro.png",
    },
    "PLATA": {
        "key": "silver",
        "slug": "plata",
        "accent": "#888888",
        "bg": "#f6f6f6",
        "ink": "#555555",
        "banner": f"{SITE_URL}/assets/club/banner-plata.png",
    },
    "BRONCE": {
        "key": "bronze",
        "slug": "bronce",
        "accent": "#b87333",
        "bg": "#fbf7f2",
        "ink": "#8a5a2b",
        "banner": f"{SITE_URL}/assets/club/banner-bronce.png",
    },
}

# Determinar próximo curso
PROXIMO_CURSO_ID = ""
PROXIMO_CURSO_NOMBRE = "Próximo curso"
PROXIMO_CURSO_PRECIO = 0
PROXIMO_CURSO_INSCRIPCION = ""
PROXIMO_CURSO_PAGINA = ""
_cursos_data = []

if os.path.exists(CURSOS_JSON):
    with open(CURSOS_JSON, "r", encoding="utf-8") as f:
        _cursos_data = json.load(f)
    candidatos = []
    for c in _cursos_data:
        try:
            n = int(c.get("numero_participantes", 0) or 0)
        except (TypeError, ValueError):
            n = 0
        if n != 0:
            continue
        cid = str(c.get("id") or "")
        if "permanente" in cid:
            continue
        candidatos.append(c)
    preferidos = [c for c in candidatos if c.get("inscripcion_url") or c.get("valor")]
    elegido = (preferidos or candidatos or [None])[0]
    if elegido:
        PROXIMO_CURSO_ID = elegido.get("id") or ""
        PROXIMO_CURSO_NOMBRE = elegido.get("nombre") or PROXIMO_CURSO_NOMBRE
        PROXIMO_CURSO_PRECIO = float(elegido.get("valor", 0) or 0)
        PROXIMO_CURSO_INSCRIPCION = str(elegido.get("inscripcion_url") or elegido.get("pagina_url") or "")
        PROXIMO_CURSO_PAGINA = str(elegido.get("pagina_url") or PROXIMO_CURSO_INSCRIPCION)

CATEGORIAS = {}
if os.path.exists(CATEGORIAS_JSON):
    with open(CATEGORIAS_JSON, "r", encoding="utf-8") as f:
        CATEGORIAS = json.load(f)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generar_stats import build_stats

CLUB_STATS = build_stats(_cursos_data) if _cursos_data else {
    "cursos_dictados": 0,
    "certificados": 0,
}


def load_cupones():
    if not os.path.exists(CUPONES_JSON):
        return {}
    with open(CUPONES_JSON, "r", encoding="utf-8") as f:
        raw = json.load(f)
    items = raw if isinstance(raw, list) else [raw]
    by_id = {}
    for item in items:
        curso_id = str(item.get("id") or "").strip()
        if not curso_id:
            continue
        by_id[curso_id] = {
            "ORO": str(item.get("cupon_gold") or item.get("cupon_oro") or "").strip(),
            "PLATA": str(item.get("cupon_silver") or item.get("cupon_plata") or "").strip(),
            "BRONCE": str(item.get("cupon_bronze") or item.get("cupon_bronce") or "").strip(),
        }
    return by_id


def codigo_cupon(categoria, cupones, curso_id):
    cat = str(categoria or "").strip().upper()
    if "ORO" in cat:
        key = "ORO"
    elif "PLATA" in cat:
        key = "PLATA"
    elif "BRONCE" in cat:
        key = "BRONCE"
    else:
        return ""
    return (cupones.get(curso_id) or {}).get(key) or ""


def slug_correo(correo: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(correo or "").strip().lower()).strip("_") or "sin_correo"


def primer_correo(raw) -> str:
    for part in re.split(r"[;,\s]+", str(raw or "").strip()):
        if "@" in part and "." in part.split("@")[-1]:
            return part.strip()
    return str(raw or "").strip()


def join_es(items) -> str:
    values = [str(item).strip() for item in (items or []) if str(item).strip()]
    if not values:
        return ""
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} y {values[1]}"
    return f"{', '.join(values[:-1])} y {values[-1]}"


def texto_categoria(cat: str) -> tuple[str, str, str]:
    meta = CATEGORIA_META.get(cat) or {}
    data = CATEGORIAS.get(meta.get("key") or "") or {}
    mensaje = str(data.get("mensaje") or "").strip()
    requisito = join_es(data.get("requisitos"))
    beneficio = join_es(data.get("beneficios"))
    return mensaje, requisito, beneficio


def html_boletin(row, cat, codigo, nombre_curso, precio, inscripcion_url, pagina_url) -> str:
    meta = CATEGORIA_META[cat]
    nombre = html.escape(str(row.get("nombre") or "participante").strip())
    mensaje, requisito, beneficio = texto_categoria(cat)
    frase = html.escape(mensaje)
    if requisito:
        frase = f"{frase} ({html.escape(requisito)})"
    if beneficio:
        frase = f"{frase} te otorgamos {html.escape(beneficio)}."
    if not frase.endswith("."):
        frase += "."
    frase += " ¡Gracias por tu constancia!"

    cursos = row.get("cursos_participados") or []
    if isinstance(cursos, str):
        cursos = [c.strip() for c in cursos.split(";") if c.strip()]
    cursos_li = "".join(
        f'<li style="margin:0 0 6px 0;">{html.escape(str(c))}</li>' for c in cursos
    )
    cursos_block = (
        f'<p style="margin:0 0 8px 0;">Has participado en <strong>{html.escape(str(row.get("total_cursos") or len(cursos)))}</strong> cursos con nosotros:</p>'
        f'<ul style="margin:0 0 16px 0; padding-left: 18px; color:#555;">{cursos_li}</ul>'
        if cursos_li
        else ""
    )

    transferible = str(row.get("bono_transferible") or "").lower().startswith("sí") or cat == "BRONCE"
    extra_bronce = ""
    if cat == "BRONCE" and transferible:
        extra_bronce = (
            '<p style="margin:12px 0 0 0; font-size:14px; color:#555;">'
            "Este bono es <strong>transferible</strong>: puedes compartirlo con alguien cercano."
            "</p>"
        )
    extra_oro = ""
    if cat == "ORO":
        extra_oro = (
            '<p style="margin:12px 0 0 0; font-size:14px; color:#555;">'
            "Como miembro Oro también tienes acceso a un <strong>producto permanente</strong>."
            "</p>"
        )

    cupon_html = ""
    if codigo:
        cupon_html = f"""
  <p style="margin:16px 0 8px 0;">Tu cupón para el próximo curso:</p>
  <p style="margin:0 0 8px 0; text-align:center;">
    <span style="display:inline-block; border:1px solid {meta['accent']}; color:{meta['ink']}; letter-spacing:0.08em; padding:8px 16px; font-family:ui-monospace,Menlo,monospace; font-weight:bold;">{html.escape(codigo)}</span>
  </p>
"""

    precio_html = ""
    if precio:
        precio_html = f'<p style="margin:0 0 8px 0; font-size:14px; color:#555;">Valor: ${precio:,.0f}</p>'.replace(",", ".")

    n_cursos = CLUB_STATS.get("cursos_dictados") or 0
    n_certs = CLUB_STATS.get("certificados") or 0
    pagina = pagina_url or inscripcion_url or f"{SITE_URL}/cursos/cambio-climatico/"
    inscribe = inscripcion_url or pagina

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dr. Z Academy Club</title>
</head>
<body style="margin:0; padding:0; background:#ffffff;">
<div style="max-width:600px; margin:0 auto; font-family:Arial,sans-serif; color:#333; line-height:1.6; background:#ffffff;">

  <div style="text-align:center; margin:0; background:#ffffff;">
    <img src="{meta['banner']}" alt="Dr. Z Academy Club {html.escape(cat.title())}" style="max-width:100%; height:auto; display:block; background:#ffffff;">
  </div>

  <div style="padding:24px 28px 8px 28px;">
    <p style="text-align:center; color:#777; font-style:italic; margin:0 0 24px 0;">Novedades del 25 de agosto de 2026</p>
    <h1 style="color:#2c3e50; font-size:22px; margin:0 0 16px 0; border-bottom:2px solid #f0f0f0; padding-bottom:10px;">Hola {nombre}</h1>
    <p>Este semestre cumplimos <strong>2 años</strong> (desde 2024) de poner a la gente a ñoñiar. Después de <strong>{n_cursos} cursos</strong> y <strong>{n_certs} personas certificadas</strong>, y a modo de celebración, nace el <strong>Dr. Z Academy Club</strong>: beneficios para quienes nos apoyan participando en los cursos.</p>
    <p>Según tu historial, tu categoría es <strong style="color:{meta['ink']};">{html.escape(cat.title())}</strong>.</p>
    {cursos_block}
    <div style="border-left:4px solid {meta['accent']}; background:{meta['bg']}; padding:14px 16px; margin:16px 0; border-radius:0 6px 6px 0;">
      <p style="margin:0;">{frase}</p>
      {extra_bronce}{extra_oro}
    </div>
    {cupon_html}
    <p>Para consultar tu categoría, el cupón, los espacios de formación y tus certificados, entra a tu página del Club con la cédula y el correo con el que te inscribiste:</p>
    <p style="text-align:center; font-size:16px; margin:18px 0;"><a href="{CLUB_URL}" style="color:#0056b3; font-weight:bold;">{CLUB_URL}</a></p>
    <div style="text-align:center; margin:24px 0 8px 0;">
      <a href="{CLUB_URL}" style="background-color:{meta['accent']}; color:#1a1a1a; text-decoration:none; padding:12px 25px; border-radius:5px; font-weight:bold; display:inline-block;">Consultar mi Club</a>
    </div>
  </div>

  <div style="padding:8px 28px 24px 28px;">
    <h2 style="text-align:center; color:#2c3e50; font-size:18px; margin:16px 0 12px 0;">El próximo curso</h2>
    <p style="margin:0 0 4px 0;"><strong>{html.escape(nombre_curso)}</strong></p>
    {precio_html}
    <p style="margin:0 0 16px 0; font-size:14px; color:#555;">Si el Club te otorgó un cupón, este es el curso para usarlo.</p>
    <p style="margin:0;"><a href="{html.escape(inscribe)}" style="color:#0056b3; font-weight:bold; text-decoration:none;">Inscribirse →</a>
      &nbsp;·&nbsp;
      <a href="{html.escape(pagina)}" style="color:#0056b3; text-decoration:none;">Ver la hoja del curso</a></p>
  </div>

  <div style="text-align:center; padding:24px 28px 32px 28px; border-top:1px solid #eee;">
    <a href="{SITE_URL}/">
      <img src="{LOGO_URL}" alt="Dr. Z Academy" width="150" style="margin-bottom:15px;">
    </a>
    <div>
      <a href="https://instagram.com/dr.zacademy" style="text-decoration:none; color:#0056b3; display:inline-block; margin-right:15px;">
        <img src="{SITE_URL}/assets/instagram-25x25.png" alt="Instagram" width="25" style="vertical-align:middle; margin-right:5px;">
        <span style="vertical-align:middle; font-weight:bold;">@dr.zacademy</span>
      </a>
      <a href="https://wa.me/573002422052" style="text-decoration:none; color:#0056b3; display:inline-block;">
        <img src="{SITE_URL}/assets/whatsapp-25x25.png" alt="WhatsApp" width="25" style="vertical-align:middle; margin-right:5px;">
        <span style="vertical-align:middle; font-weight:bold;">+57 300 2422052</span>
      </a>
    </div>
  </div>

</div>
</body>
</html>
"""


def instalar_enviar_script():
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "enviar_boletines.py")
    dst = os.path.join(BOLETINES_DIR, "enviar.py")
    shutil.copy2(src, dst)
    os.chmod(dst, 0o755)
    return dst

# Productos permanentes disponibles para miembros Oro
PRODUCTOS_PERMANENTES = [
    "Cuántica a Pie",
    "Python para el fin del mundo",
    "Astropython",
]


# ============================================================================
# PLANTILLAS DE BOLETÍN
# ============================================================================

def _format_cursos(cursos_lista):
    """Formatea la lista de cursos con viñetas y newlines."""
    if isinstance(cursos_lista, str):
        cursos_lista = cursos_lista.split('; ')
    return '\n  ✅ '.join(cursos_lista)


def _bloque_cupon(codigo, inscripcion_url=""):
    if not codigo:
        return "Para hacer efectivo tu beneficio, responde a este correo o comunícate con nosotros."
    enlace = f"\nInscríbete aquí: {inscripcion_url}" if inscripcion_url else ""
    return f"""🎟️ Tu cupón: {codigo}
Úsalo al inscribirte en el próximo curso.{enlace}"""


def plantilla_oro(row, nombre_curso, precio, codigo="", inscripcion_url=""):
    """Genera el texto del boletín para miembros Oro."""
    precio_str = f"${precio:,.0f}" if precio else "precio regular"
    cursos_fmt = _format_cursos(row.get('cursos_participados', []))

    return f"""Hola {row['nombre']},

🥇 ¡Felicidades! Eres miembro ORO del Dr. Z Academy Club.

Has participado en {int(row['total_cursos'])} cursos con nosotros:
  ✅ {cursos_fmt}

Por tu fidelidad y compromiso, tienes los siguientes beneficios para el próximo curso:

📚 PRÓXIMO CURSO: {nombre_curso}
💰 Precio regular: {precio_str}

🎁 TUS BENEFICIOS ORO:
  1. ✨ INSCRIPCIÓN GRATIS al curso "{nombre_curso}"
  2. 🎓 Acceso GRATIS a un producto permanente a elegir:
     • {'\n     • '.join(PRODUCTOS_PERMANENTES)}

{_bloque_cupon(codigo, inscripcion_url)}

¡Gracias por ser parte de la familia Dr. Z Academy!

---
Dr. Z Academy Club | Miembro Oro 🥇
"""


def plantilla_plata(row, nombre_curso, precio, codigo="", inscripcion_url=""):
    """Genera el texto del boletín para miembros Plata."""
    precio_str = f"${precio:,.0f}" if precio else "precio regular"
    cursos_fmt = _format_cursos(row.get('cursos_participados', []))
    descuento = precio * 0.30 if precio else 0
    precio_final = precio - descuento if precio else 0

    precio_info = ""
    if precio:
        precio_info = f"""
💰 Precio regular: {precio_str}
💎 Tu descuento (30%): -${descuento:,.0f}
✅ Tu precio: ${precio_final:,.0f}
"""
    else:
        precio_info = f"""
💰 Tu descuento: 30% sobre el precio regular
"""

    return f"""Hola {row['nombre']},

🥈 ¡Eres miembro PLATA del Dr. Z Academy Club!

Has participado en {int(row['total_cursos'])} cursos con nosotros:
  ✅ {cursos_fmt}

📚 PRÓXIMO CURSO: {nombre_curso}
{precio_info}
🎁 TU BENEFICIO PLATA:
  • 30% de descuento en la inscripción al próximo curso

📌 Nota: Al aprovechar este beneficio, el conteo de cursos se reinicia.

{_bloque_cupon(codigo, inscripcion_url)}

¡Gracias por ser parte de la familia Dr. Z Academy!

---
Dr. Z Academy Club | Miembro Plata 🥈
"""


def plantilla_bronce(row, nombre_curso, precio, codigo="", inscripcion_url=""):
    """Genera el texto del boletín para miembros Bronce."""
    precio_str = f"${precio:,.0f}" if precio else "precio regular"
    cursos_fmt = _format_cursos(row.get('cursos_participados', []))
    descuento = precio * 0.15 if precio else 0
    precio_final = precio - descuento if precio else 0

    precio_info = ""
    if precio:
        precio_info = f"""
💰 Precio regular: {precio_str}
💎 Tu descuento (15%): -${descuento:,.0f}
✅ Tu precio: ${precio_final:,.0f}
"""
    else:
        precio_info = f"""
💰 Tu descuento: 15% sobre el precio regular
"""

    return f"""Hola {row['nombre']},

🥉 ¡Eres miembro BRONCE del Dr. Z Academy Club!

Participaste recientemente en un curso con nosotros y eso te da un beneficio especial.

Cursos realizados:
  ✅ {cursos_fmt}

📚 PRÓXIMO CURSO: {nombre_curso}
{precio_info}
🎁 TU BENEFICIO BRONCE:
  • 15% de descuento en la inscripción al próximo curso
  • 🔄 ¡Este bono es TRANSFERIBLE! Puedes compartirlo con un amigo o familiar.

{_bloque_cupon(codigo, inscripcion_url)}

Si deseas transferir tu bono, envíanos el nombre y correo de la persona que lo recibirá.

¡Gracias por ser parte de la familia Dr. Z Academy!

---
Dr. Z Academy Club | Miembro Bronce 🥉
"""


def plantilla_informativo(row, nombre_curso, precio, codigo="", inscripcion_url=""):
    """Genera el texto del boletín informativo (sin cupón)."""
    precio_str = f"${precio:,.0f}" if precio else ""

    precio_info = f"\n💰 Precio: {precio_str}" if precio else ""

    cursos_info = ""
    if row.get('cursos_participados'):
        cursos_fmt = _format_cursos(row['cursos_participados'])
        cursos_info = f"""
Ya has participado en cursos con nosotros:
  ✅ {cursos_fmt}

"""

    return f"""Hola {row['nombre']},

¡Tenemos un nuevo curso preparado para ti!

📚 PRÓXIMO CURSO: {nombre_curso}{precio_info}
{cursos_info}
💡 ¿Sabías que al inscribirte en nuestros cursos acumulas beneficios?

  🥉 Bronce: Al inscribirte obtienes 15% de descuento en el siguiente curso (transferible)
  🥈 Plata: Al completar 3 cursos obtienes 30% de descuento
  🥇 Oro: Al completar 5 cursos obtienes inscripción GRATIS + acceso a productos permanentes

¡Inscríbete y empieza a acumular beneficios con el Dr. Z Academy Club!

Para más información, responde a este correo.

---
Dr. Z Academy
"""


PLANTILLAS = {
    "ORO": plantilla_oro,
    "PLATA": plantilla_plata,
    "BRONCE": plantilla_bronce,
    "SIN CATEGORÍA": plantilla_informativo,
}


# ============================================================================
# GENERACIÓN DE BOLETINES
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Generar boletines personalizados del Dr. Z Academy Club"
    )
    parser.add_argument(
        "--base-datos",
        default=os.path.join(PERSONAL_DIR, "drz-club-members.json"),
        help="Archivo JSON de la base de datos (default: drz-club-members.json)",
    )
    args = parser.parse_args()

    nombre_curso = PROXIMO_CURSO_NOMBRE
    precio = PROXIMO_CURSO_PRECIO
    inscripcion_url = PROXIMO_CURSO_INSCRIPCION
    cupones = load_cupones()

    print("=" * 70)
    print("  Dr. Z Academy Club - Generación de Boletines")
    print("=" * 70)

    db_file = args.base_datos
    if not os.path.exists(db_file):
        print(f"\n❌ No se encontró la base de datos: {db_file}")
        print("   Ejecuta primero: python3 club/bin/clasificar_miembros.py")
        sys.exit(1)

    print(f"\n📁 Base de datos: {db_file}")
    print(f"📚 Próximo curso: {nombre_curso}")
    if precio:
        print(f"💰 Precio: ${precio:,.0f}")
    for cat, label in (("ORO", "Oro"), ("PLATA", "Plata"), ("BRONCE", "Bronce")):
        codigo = codigo_cupon(cat, cupones, PROXIMO_CURSO_ID)
        if codigo:
            print(f"🎟️ Cupón {label}: {codigo}")

    with open(db_file, "r", encoding="utf-8") as f:
        members = json.load(f)

    # Filtrar solo los que tienen correo
    miembros_con_correo = [m for m in members if primer_correo(m.get("correo", ""))]
    miembros_sin_correo = [m for m in members if str(m.get("correo", "")).strip() == ""]

    print(f"\n📊 Total miembros: {len(members)}")
    print(f"📬 Con correo electrónico: {len(miembros_con_correo)}")
    print(f"❌ Sin correo: {len(miembros_sin_correo)}")

    # Crear directorio de boletines
    os.makedirs(BOLETINES_DIR, exist_ok=True)
    html_root = os.path.join(BOLETINES_DIR, "html")
    if os.path.isdir(html_root):
        shutil.rmtree(html_root)
    os.makedirs(html_root, exist_ok=True)

    # Generar boletines por categoría
    boletines_todos = []
    index_items = []
    fecha = datetime.now().strftime("%Y-%m-%d")
    pagina_url = PROXIMO_CURSO_PAGINA

    for cat in ["ORO", "PLATA", "BRONCE"]:
        subset = [m for m in miembros_con_correo if m.get("categoria") == cat]
        if len(subset) == 0:
            continue

        plantilla = PLANTILLAS[cat]
        boletines_cat = []
        html_cat_dir = os.path.join(html_root, CATEGORIA_META[cat]["slug"])
        os.makedirs(html_cat_dir, exist_ok=True)

        for row in subset:
            codigo = codigo_cupon(cat, cupones, PROXIMO_CURSO_ID)
            texto = plantilla(row, nombre_curso, precio, codigo, inscripcion_url)
            correo = primer_correo(row.get("correo"))
            rel_html = os.path.join("html", CATEGORIA_META[cat]["slug"], f"{slug_correo(correo)}.html")
            html_path = os.path.join(BOLETINES_DIR, rel_html)
            html_body = html_boletin(
                row, cat, codigo, nombre_curso, precio, inscripcion_url, pagina_url
            )
            with open(html_path, "w", encoding="utf-8") as fh:
                fh.write(html_body)
            asunto = f"[Dr. Z Academy Club] {row.get('nombre', '').strip()}, eres miembro {cat.title()}"
            boletin = {
                "nombre": row.get("nombre", ""),
                "correo": correo,
                "celular": row.get("celular", ""),
                "categoria": cat,
                "descuento": row.get("descuento", "0%"),
                "cupon": codigo,
                "asunto": asunto,
                "archivo": rel_html.replace("\\", "/"),
                "mensaje": texto,
                "fecha_generacion": fecha,
            }
            boletines_cat.append(boletin)
            boletines_todos.append(boletin)
            index_items.append({
                "nombre": boletin["nombre"],
                "correo": correo,
                "categoria": cat,
                "asunto": asunto,
                "archivo": boletin["archivo"],
            })

        cat_filename = cat.lower()
        cat_filepath = os.path.join(BOLETINES_DIR, f"boletines_{cat_filename}.csv")
        keys = boletines_cat[0].keys()
        with open(cat_filepath, "w", encoding="utf-8-sig", newline="") as output_file:
            dict_writer = csv.DictWriter(output_file, fieldnames=keys)
            dict_writer.writeheader()
            dict_writer.writerows(boletines_cat)
        emoji = subset[0].get("emoji", "📝")
        print(f"\n  {emoji} {cat}: {len(boletines_cat)} boletín(es) → html/{CATEGORIA_META[cat]['slug']}/")

    todos_filepath = ""
    if boletines_todos:
        todos_filepath = os.path.join(BOLETINES_DIR, "boletines_todos.csv")
        keys = boletines_todos[0].keys()
        with open(todos_filepath, "w", encoding="utf-8-sig", newline="") as output_file:
            dict_writer = csv.DictWriter(output_file, fieldnames=keys)
            dict_writer.writeheader()
            dict_writer.writerows(boletines_todos)
        print(f"  • CSV: {todos_filepath}")

    index_path = os.path.join(BOLETINES_DIR, "index.json")
    with open(index_path, "w", encoding="utf-8") as fh:
        json.dump({"fecha": fecha, "items": index_items}, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    enviar_path = instalar_enviar_script()

    print(f"\n{'=' * 70}")
    print(f"  ARCHIVOS GENERADOS")
    print(f"{'=' * 70}")
    print(f"  📋 Índice:              {index_path}")
    print(f"  📤 Envío:               {enviar_path}")
    print(f"  📂 Carpeta:             {BOLETINES_DIR}")
    print(f"  📋 Total boletines:     {len(boletines_todos)}")
    print()
    print("  Prueba un correo:")
    print(f"    python3 {enviar_path} --prueba tucorreo@gmail.com")
    print("  Enviar todos:")
    print(f"    python3 {enviar_path}")

    print(f"\n{'=' * 70}")
    print(f"  EJEMPLO DE BOLETINES")
    print(f"{'=' * 70}")

    for cat in ["ORO", "PLATA", "BRONCE"]:
        ejemplos = [b for b in boletines_todos if b["categoria"] == cat]
        if ejemplos:
            print(f"\n{'─' * 50}")
            print(f"  Ejemplo {cat}:")
            print(f"{'─' * 50}")
            print(f"  Para: {ejemplos[0]['nombre']} <{ejemplos[0]['correo']}>")
            print(f"  Asunto: {ejemplos[0]['asunto']}")
            print(f"  HTML: {ejemplos[0]['archivo']}")
            print(f"{'─' * 50}")
            print(ejemplos[0]["mensaje"])

    print()


if __name__ == "__main__":
    main()

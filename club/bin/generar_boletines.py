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
import os
import sys
import json
from datetime import datetime

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

CLUB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSONAL_DIR = os.path.join(CLUB_DIR, "personal")
BOLETINES_DIR = os.path.join(PERSONAL_DIR, "boletines")
CURSOS_JSON = os.path.join(CLUB_DIR, "cursos.json")
CUPONES_JSON = os.path.join(PERSONAL_DIR, "cupones.json")

# Determinar próximo curso
PROXIMO_CURSO_ID = ""
PROXIMO_CURSO_NOMBRE = "Próximo curso"
PROXIMO_CURSO_PRECIO = 0
PROXIMO_CURSO_INSCRIPCION = ""

if os.path.exists(CURSOS_JSON):
    with open(CURSOS_JSON, "r", encoding="utf-8") as f:
        _cursos_data = json.load(f)
        for c in _cursos_data:
            if int(c.get("numero_participantes", 0)) == 0:
                PROXIMO_CURSO_ID = c.get("id") or ""
                PROXIMO_CURSO_NOMBRE = c["nombre"]
                PROXIMO_CURSO_PRECIO = float(c.get("valor", 0) or 0)
                PROXIMO_CURSO_INSCRIPCION = str(c.get("inscripcion_url") or c.get("pagina_url") or "")
                break


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
    miembros_con_correo = [m for m in members if str(m.get("correo", "")).strip() != ""]
    miembros_sin_correo = [m for m in members if str(m.get("correo", "")).strip() == ""]

    print(f"\n📊 Total miembros: {len(members)}")
    print(f"📬 Con correo electrónico: {len(miembros_con_correo)}")
    print(f"❌ Sin correo: {len(miembros_sin_correo)}")

    # Crear directorio de boletines
    os.makedirs(BOLETINES_DIR, exist_ok=True)

    # Generar boletines por categoría
    boletines_todos = []
    fecha = datetime.now().strftime("%Y-%m-%d")

    for cat in ["ORO", "PLATA", "BRONCE", "SIN CATEGORÍA"]:
        subset = [m for m in miembros_con_correo if m.get("categoria") == cat]
        if len(subset) == 0:
            continue

        plantilla = PLANTILLAS[cat]
        boletines_cat = []

        for row in subset:
            codigo = codigo_cupon(cat, cupones, PROXIMO_CURSO_ID)
            texto = plantilla(row, nombre_curso, precio, codigo, inscripcion_url)
            boletin = {
                "nombre": row.get("nombre", ""),
                "correo": row.get("correo", ""),
                "celular": row.get("celular", ""),
                "categoria": cat,
                "descuento": row.get("descuento", "0%"),
                "cupon": codigo,
                "asunto": f"🎓 Dr. Z Academy Club | {nombre_curso}" + (
                    f" | Tu cupón {codigo or cat}" if cat != "SIN CATEGORÍA" else ""
                ),
                "mensaje": texto,
                "fecha_generacion": fecha,
            }
            boletines_cat.append(boletin)
            boletines_todos.append(boletin)

        # Guardar CSV por categoría para envío
        import csv
        cat_filename = cat.lower().replace(" ", "_").replace("í", "i")
        cat_filepath = os.path.join(BOLETINES_DIR, f"boletines_{cat_filename}.csv")
        
        # En vez de pandas, usamos el módulo csv de Python
        keys = boletines_cat[0].keys() if boletines_cat else []
        with open(cat_filepath, 'w', encoding='utf-8-sig', newline='') as output_file:
            dict_writer = csv.DictWriter(output_file, fieldnames=keys)
            dict_writer.writeheader()
            dict_writer.writerows(boletines_cat)
        emoji = row.get('emoji', '📝')
        print(f"\n  {emoji} {cat}: {len(boletines_cat)} boletín(es) → {cat_filepath}")

    # Guardar todos los boletines en un solo archivo
    if boletines_todos:
        todos_filepath = os.path.join(BOLETINES_DIR, "boletines_todos.csv")
        keys = boletines_todos[0].keys()
        import csv
        with open(todos_filepath, 'w', encoding='utf-8-sig', newline='') as output_file:
            dict_writer = csv.DictWriter(output_file, fieldnames=keys)
            dict_writer.writeheader()
            dict_writer.writerows(boletines_todos)
        print(f"  • Todos: {todos_filepath}")

    print(f"\n{'=' * 70}")
    print(f"  ARCHIVOS GENERADOS")
    print(f"{'=' * 70}")
    print(f"  📋 Boletín consolidado: {todos_filepath if boletines_todos else 'N/A'}")
    print(f"  📂 Carpeta: {BOLETINES_DIR}")
    print(f"  📋 Total boletines:     {len(boletines_todos)}")

    # Mostrar ejemplo de cada categoría
    print(f"\n{'=' * 70}")
    print(f"  EJEMPLO DE BOLETINES")
    print(f"{'=' * 70}")

    for cat in ["ORO", "PLATA", "BRONCE", "SIN CATEGORÍA"]:
        ejemplos = [b for b in boletines_todos if b["categoria"] == cat]
        if ejemplos:
            print(f"\n{'─' * 50}")
            print(f"  Ejemplo {cat}:")
            print(f"{'─' * 50}")
            print(f"  Para: {ejemplos[0]['nombre']} <{ejemplos[0]['correo']}>")
            print(f"  Asunto: {ejemplos[0]['asunto']}")
            print(f"{'─' * 50}")
            print(ejemplos[0]['mensaje'])

    print()


if __name__ == "__main__":
    main()

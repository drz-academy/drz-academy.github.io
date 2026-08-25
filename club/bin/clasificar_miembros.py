#!/usr/bin/env python3
"""
Dr. Z Academy Club - Clasificación de Miembros y Generación de Cupones

Clasifica a los miembros del club según su participación CONSECUTIVA
en los cursos más recientes y genera cupones de descuento.

La inscripción en la lista del curso **habilita** la categoría. El certificado
es opcional: no se exige diploma para Bronce, Plata u Oro.

Categorías (requieren cursos CONSECUTIVOS desde el último):
  - Bronce: participó en el último curso → 15% descuento (transferible)
  - Plata:  participó en los últimos 3 cursos consecutivos → 30% descuento
  - Oro:    participó en los últimos 5 cursos consecutivos → curso gratis + producto permanente

Los miembros que ya usaron un beneficio pierden su categoría automáticamente.
El registro de beneficios usados se lleva en beneficios_usados.csv.

Uso:
    python3 club/bin/clasificar_miembros.py [--nombre-curso "Nombre del próximo curso"]

Ejemplo:
    python3 club/bin/clasificar_miembros.py --nombre-curso "Cosmología para todos"
"""

import pandas as pd
import argparse
import os
import sys
from datetime import datetime

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

CLUB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSONAL_DIR = os.path.join(CLUB_DIR, "personal")
DATABASE_JSON = os.path.join(PERSONAL_DIR, "drz-club-members.json")
BENEFICIOS_CSV = os.path.join(PERSONAL_DIR, "beneficios_usados.csv")

CURSOS_JSON = os.path.join(CLUB_DIR, "cursos.json")
CATEGORIAS_JSON = os.path.join(CLUB_DIR, "categorias.json")

# Orden cronológico de los cursos y el próximo curso
# Se cargarán dinámicamente desde cursos.json
CURSOS_ORDEN = []
PROXIMO_CURSO_NOMBRE = "Próximo curso"
PROXIMO_CURSO_PRECIO = 0

import json
if os.path.exists(CURSOS_JSON):
    with open(CURSOS_JSON, "r", encoding="utf-8") as f:
        _cursos_data = json.load(f)
        for c in _cursos_data:
            if int(c.get("numero_participantes", 0)) > 0:
                CURSOS_ORDEN.append(c["nombre"])
            elif PROXIMO_CURSO_NOMBRE == "Próximo curso":
                # Tomar el primer curso con 0 inscritos como el próximo
                PROXIMO_CURSO_NOMBRE = c["nombre"]
                PROXIMO_CURSO_PRECIO = float(c.get("valor", 0))

CATEGORIAS = {}
if os.path.exists(CATEGORIAS_JSON):
    with open(CATEGORIAS_JSON, "r", encoding="utf-8") as f:
        CATEGORIAS = json.load(f)


def mensaje_categoria(clave):
    cat = CATEGORIAS.get(clave) or {}
    mensaje = str(cat.get("mensaje") or "").strip()
    requisitos = [str(item).strip() for item in cat.get("requisitos") or [] if str(item).strip()]
    beneficios = [str(item).strip() for item in cat.get("beneficios") or [] if str(item).strip()]
    requisito = " y ".join(requisitos) if len(requisitos) <= 2 else f"{', '.join(requisitos[:-1])} y {requisitos[-1]}"
    beneficio = " y ".join(beneficios) if len(beneficios) <= 2 else f"{', '.join(beneficios[:-1])} y {beneficios[-1]}"
    if mensaje and requisito and beneficio:
        return (
            f"{mensaje} ({requisito}) "
            f"te otorgamos {beneficio}. ¡Gracias por tu constancia!"
        )
    return ""

# Productos permanentes disponibles para miembros Oro
PRODUCTOS_PERMANENTES = [
    "Cuántica a Pie (producto permanente)",
    "Python para el fin del mundo (producto permanente)",
    "Astropython (producto permanente)",
]


# ============================================================================
# LÓGICA DE CLASIFICACIÓN (CURSOS CONSECUTIVOS)
# ============================================================================

def evaluar_historial(cursos_participados, total_cursos_existentes):
    """
    Evalúa el historial de cursos de la persona (listas de inscripción).
    Tener o no certificado no cambia el resultado.
    Retorna (es_oro, es_plata, es_bronce).
    """
    cursos_existentes = CURSOS_ORDEN[:total_cursos_existentes]
    
    # Bronce: participó en el último curso
    ultimo_curso = cursos_existentes[-1]
    es_bronce = ultimo_curso in cursos_participados

    # Oro: 5 últimos consecutivos
    es_oro = False
    if len(cursos_existentes) >= 5:
        ultimos_5 = cursos_existentes[-5:]
        if all(c in cursos_participados for c in ultimos_5):
            es_oro = True

    # Plata: 3 cursos con máximo 1 interrupción hacia atrás
    es_plata = False
    asistidos = 0
    interrupciones = 0
    for curso in reversed(cursos_existentes):
        if curso in cursos_participados:
            asistidos += 1
        else:
            interrupciones += 1
            
        if asistidos == 3:
            if interrupciones <= 1:
                es_plata = True
            break
        
        # Si ya acumuló más de 1 interrupción antes de llegar a 3, ya no es plata
        if interrupciones > 1:
            break

    return es_oro, es_plata, es_bronce


def clasificar_miembro(member, total_cursos_existentes, beneficio_usado=False, fecha_beneficio=""):
    """
    Clasifica a un miembro según reglas actualizadas.
    """
    cursos_participados = member.get("cursos_participados", [])
    es_oro, es_plata, es_bronce = evaluar_historial(cursos_participados, total_cursos_existentes)

    # Si usó un beneficio, pierde la categoría
    if beneficio_usado:
        return {
            "categoria": "SIN CATEGORÍA",
            "descuento": "0%",
            "descuento_valor": 0,
            "beneficios": f"Beneficio ya usado el {fecha_beneficio}. Debe acumular cursos nuevamente.",
            "bono_transferible": "N/A",
            "emoji": "🔄",
            "nota": "Beneficio ya redimido",
        }

    # Clasificar (Oro > Plata > Bronce > Sin categoría)
    if es_oro:
        return {
            "categoria": "ORO",
            "descuento": "100%",
            "descuento_valor": 100,
            "beneficios": mensaje_categoria("gold")
            or "Inscripción GRATIS al próximo curso + acceso gratis a un producto permanente",
            "bono_transferible": "No (beneficio personal)",
            "emoji": "🥇",
            "nota": "",
        }
    elif es_plata:
        return {
            "categoria": "PLATA",
            "descuento": "30%",
            "descuento_valor": 30,
            "beneficios": mensaje_categoria("silver") or "30% de descuento en el próximo curso",
            "bono_transferible": "No",
            "emoji": "🥈",
            "nota": "",
        }
    elif es_bronce:
        return {
            "categoria": "BRONCE",
            "descuento": "15%",
            "descuento_valor": 15,
            "beneficios": mensaje_categoria("bronze")
            or "15% de descuento en el próximo curso (bono transferible)",
            "bono_transferible": "Sí",
            "emoji": "🥉",
            "nota": "",
        }
    else:
        return {
            "categoria": "SIN CATEGORÍA",
            "descuento": "0%",
            "descuento_valor": 0,
            "beneficios": "Información sobre el próximo curso",
            "bono_transferible": "N/A",
            "emoji": "📧",
            "nota": "",
        }


# ============================================================================
# GESTIÓN DE BENEFICIOS USADOS
# ============================================================================

def cargar_beneficios_usados():
    """Carga el registro de beneficios ya redimidos."""
    if not os.path.exists(BENEFICIOS_CSV):
        return set()

    df = pd.read_csv(BENEFICIOS_CSV)
    # Usar correo como identificador (normalizado)
    usados = {}
    for _, row in df.iterrows():
        correo = str(row.get("correo", "")).strip().lower()
        fecha = str(row.get("fecha", "")).strip()
        if correo and correo != "nan":
            usados[correo] = fecha
    return usados


def crear_archivo_beneficios_si_no_existe():
    """Crea el archivo de beneficios usados si no existe."""
    if not os.path.exists(BENEFICIOS_CSV):
        df = pd.DataFrame(columns=["nombre", "correo", "categoria", "beneficio", "fecha", "curso_aplicado"])
        df.to_csv(BENEFICIOS_CSV, index=False, encoding='utf-8-sig')
        print(f"\n📋 Archivo de beneficios creado: {BENEFICIOS_CSV}")
        print("   (Edítalo para registrar beneficios usados)")


# ============================================================================
# EJECUCIÓN PRINCIPAL
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Clasificar miembros del Dr. Z Academy Club"
    )
    parser.add_argument(
        "--ultimo-curso",
        type=int,
        default=len(CURSOS_ORDEN),
        help=f"Número del último curso dictado (1-{len(CURSOS_ORDEN)}, default: {len(CURSOS_ORDEN)})",
    )
    args = parser.parse_args()

    # Usar dinámico si existe
    nombre_curso = PROXIMO_CURSO_NOMBRE

    print("=" * 70)
    print("  Dr. Z Academy Club - Clasificación de Miembros")
    print("  (Modo: JSON unificado)")
    print("=" * 70)

    import json
    # Leer base de datos JSON
    if not os.path.exists(DATABASE_JSON):
        print(f"\n❌ No se encontró la base de datos: {DATABASE_JSON}")
        print("   Ejecuta primero: python3 club/bin/build_database.py")
        sys.exit(1)

    with open(DATABASE_JSON, "r", encoding="utf-8") as f:
        members = json.load(f)

    print(f"\n📊 Base de datos cargada: {len(members)} miembros")
    print(f"📖 Último curso dictado: {CURSOS_ORDEN[args.ultimo_curso - 1]} (#{args.ultimo_curso})")
    print(f"🎯 Próximo curso: {nombre_curso}")
    print("📌 Criterio: inscripción en el curso (el certificado no es requisito)")

    # Cargar beneficios usados
    crear_archivo_beneficios_si_no_existe()
    beneficios_usados = cargar_beneficios_usados()
    if beneficios_usados:
        print(f"\n🔄 Beneficios ya redimidos: {len(beneficios_usados)} persona(s)")
    else:
        print(f"\n✅ No hay beneficios redimidos registrados")

    # Clasificar cada miembro y actualizar el JSON
    for member in members:
        correo = str(member.get("correo", "")).strip().lower()
        uso_beneficio = correo in beneficios_usados
        fecha_beneficio = beneficios_usados.get(correo, "")

        clasif = clasificar_miembro(member, args.ultimo_curso, beneficio_usado=uso_beneficio, fecha_beneficio=fecha_beneficio)
        
        # Actualizar campos en el miembro
        member["categoria"] = clasif["categoria"]
        member["emoji"] = clasif["emoji"]
        member["descuento"] = clasif["descuento"]
        member["descuento_valor"] = clasif["descuento_valor"]
        member["beneficios"] = clasif["beneficios"]
        member["bono_transferible"] = clasif["bono_transferible"]
        member["beneficio_usado"] = "SÍ" if uso_beneficio else "NO"
        member["fecha_beneficio"] = fecha_beneficio
        member["proximo_curso"] = nombre_curso
        member["nota"] = clasif["nota"]

    # Ordenar: Oro primero, luego Plata, Bronce, Sin categoría
    cat_order = {"ORO": 0, "PLATA": 1, "BRONCE": 2, "SIN CATEGORÍA": 3}
    members.sort(key=lambda x: (cat_order.get(x["categoria"], 99), x["nombre"]))

    # Guardar clasificación sobrescribiendo el JSON maestro
    with open(DATABASE_JSON, "w", encoding="utf-8") as f:
        json.dump(members, f, indent=2, ensure_ascii=False)

    # Resumen
    print(f"\n{'=' * 70}")
    print(f"  RESULTADOS DE CLASIFICACIÓN (JSON Actualizado)")
    print(f"{'=' * 70}")

    for cat in ["ORO", "PLATA", "BRONCE", "SIN CATEGORÍA"]:
        subset = [m for m in members if m["categoria"] == cat]
        emoji = subset[0]["emoji"] if len(subset) > 0 else ""
        print(f"\n  {emoji} {cat}: {len(subset)} miembro(s)")
        if len(subset) > 0 and cat != "SIN CATEGORÍA":
            for r in subset:
                nota = f" ⚠️ {r['nota']}" if r.get('nota') else ""
                print(f"    • {r['nombre']} ({r['correo']}) - {r['descuento']}{nota}")

    # Miembros que perdieron categoría por usar beneficio
    usados = [m for m in members if m["beneficio_usado"] == "SÍ"]
    if len(usados) > 0:
        print(f"\n  🔄 Miembros que perdieron categoría por beneficio usado: {len(usados)}")
        for r in usados:
            print(f"    • {r['nombre']} ({r['correo']})")

    # Resumen de contactables
    con_correo = [m for m in members if str(m.get("correo", "")).strip() != ""]
    sin_correo = [m for m in members if str(m.get("correo", "")).strip() == ""]
    print(f"\n  📬 Contactables por correo: {len(con_correo)}")
    print(f"  ❌ Sin correo electrónico: {len(sin_correo)}")

    print(f"\n  📁 Clasificación guardada en: {DATABASE_JSON}")
    print(f"  📁 Registro de beneficios:    {BENEFICIOS_CSV}")
    print()


if __name__ == "__main__":
    main()

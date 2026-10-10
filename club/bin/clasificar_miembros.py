#!/usr/bin/env python3
"""
Dr. Z Academy Club - Clasificación de Miembros y Generación de Cupones

Clasifica a los miembros del club según su participación CONSECUTIVA
en los cursos más recientes y genera cupones de descuento.

La inscripción en la lista del curso **habilita** la categoría. El certificado
es opcional: no se exige diploma para Bronce, Plata u Oro.

Categorías (desde el último curso dictado, en orden de fechas):
  - Bronce: participó en el último curso → 15% descuento (transferible)
  - Plata:  3 cursos con máximo 1 pausa, incluyendo el último → 30% descuento
  - Oro:    los últimos 5 cursos consecutivos → curso gratis + producto permanente

Los miembros que ya usaron un beneficio pierden su categoría automáticamente.
El registro de beneficios usados se lleva en beneficios_usados.csv.

Uso:
    python3 club/bin/clasificar_miembros.py [--nombre-curso "Nombre del próximo curso"]

Ejemplo:
    python3 club/bin/clasificar_miembros.py --nombre-curso "Cosmología para todos"
"""

import pandas as pd
import argparse
import json
import os
import re
import sys
from datetime import datetime

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

import config

CLUB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSONAL_DIR = os.path.join(CLUB_DIR, "personal")
INFO_DIR = config.get_info_dir(CLUB_DIR)
DATABASE_JSON = os.path.join(INFO_DIR, "drz-club-members.json")
BENEFICIOS_CSV = os.path.join(INFO_DIR, "beneficios_usados.csv")

CURSOS_JSON = os.path.join(CLUB_DIR, "cursos.json")
CATEGORIAS_JSON = os.path.join(CLUB_DIR, "categorias.json")

def as_int(value, default=0):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return default


def load_cursos_catalog():
    if not os.path.exists(CURSOS_JSON):
        return []
    with open(CURSOS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def _cursos_unicos(cursos_data):
    """Un curso por id. Ignora permanentes (no intercalan pausas en la racha)."""
    by_id = {}
    for curso in cursos_data or []:
        cid = str(curso.get("id") or "").strip()
        if not cid or "permanente" in cid:
            continue
        prev = by_id.get(cid)
        if prev is None or as_int(curso.get("numero_participantes")) > as_int(prev.get("numero_participantes")):
            by_id[cid] = curso
    return list(by_id.values())


def cursos_dictados_ordenados(cursos_data=None):
    """Cursos ya dictados, únicos, ordenados por fecha de inicio."""
    items = [
        c for c in _cursos_unicos(cursos_data if cursos_data is not None else load_cursos_catalog())
        if as_int(c.get("numero_participantes")) > 0
    ]
    items.sort(
        key=lambda c: (
            str(c.get("fecha_inicio") or "9999"),
            str(c.get("fecha_fin") or "9999"),
            str(c.get("nombre") or ""),
        )
    )
    return items


def proximo_curso(cursos_data=None):
    data = cursos_data if cursos_data is not None else load_cursos_catalog()
    for c in _cursos_unicos(data):
        if c.get("next_course"):
            return c

    pendientes = [
        c for c in _cursos_unicos(data)
        if as_int(c.get("numero_participantes")) == 0
    ]
    pendientes.sort(key=lambda c: str(c.get("fecha_inicio") or "9999"))
    return pendientes[0] if pendientes else None


_cursos_data = load_cursos_catalog()
CURSOS_ORDEN = [c["nombre"] for c in cursos_dictados_ordenados(_cursos_data)]
_proximo = proximo_curso(_cursos_data)
PROXIMO_CURSO_NOMBRE = (_proximo or {}).get("nombre") or "Próximo curso"
PROXIMO_CURSO_PRECIO = float((_proximo or {}).get("valor") or 0)

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

def calcular_consecutivos_y_regulares(cursos_participados, bonos_usados=None, orden_cursos=CURSOS_ORDEN):
    """
    Calcula el número de cursos consecutivos y cursos regulares (con máx. 1 pausa)
    comenzando desde el último curso dictado de la academia e incluyéndolo.
    - Si el miembro no participó en el último curso dictado, consecutivos = 0 y regulares = 0.
    - Si usó un bono (oro o plata), el conteo se reinicia: solo se cuentan los cursos posteriores
      a dicho bono, sin incluir el curso donde se usó el bono.
    """
    if not orden_cursos or not cursos_participados:
        return 0, 0

    last_idx = len(orden_cursos) - 1
    ultimo_dictado = orden_cursos[last_idx]

    # Debe haber participado en el último curso dictado
    if ultimo_dictado not in cursos_participados:
        return 0, 0

    min_idx = 0
    if bonos_usados:
        bono_indices = [orden_cursos.index(b) for b in bonos_usados if b in orden_cursos]
        if bono_indices:
            min_idx = max(bono_indices) + 1

    if last_idx < min_idx:
        return 0, 0

    # Consecutivos (0 pausas)
    consecutivos = 0
    for i in range(last_idx, min_idx - 1, -1):
        if orden_cursos[i] in cursos_participados:
            consecutivos += 1
        else:
            break

    # Regulares (tolerando hasta 1 pausa)
    regulares = 0
    pausas = 0
    for i in range(last_idx, min_idx - 1, -1):
        if orden_cursos[i] in cursos_participados:
            regulares += 1
        else:
            pausas += 1
            if pausas > 1:
                break
    return consecutivos, regulares


def evaluar_historial(cursos_participados, total_cursos_existentes, bonos_usados=None):
    """
    Evalúa el historial de cursos de la persona (listas de inscripción).
    Tener o no certificado no cambia el resultado.
    Retorna (es_oro, es_plata, es_bronce).

    Plata y Oro se cuentan hacia atrás desde el último dictado e incluyen
    ese último curso. Si usó un bono, el conteo se reinicia.
    """
    cursos_existentes = CURSOS_ORDEN[:total_cursos_existentes]
    if not cursos_existentes:
        return False, False, False

    ultimo_curso = cursos_existentes[-1]
    es_bronce = ultimo_curso in cursos_participados
    if not es_bronce:
        return False, False, False

    consecutivos, regulares = calcular_consecutivos_y_regulares(cursos_participados, bonos_usados, cursos_existentes)
    es_oro = (consecutivos >= 5)
    es_plata = (regulares >= 3)

    return es_oro, es_plata, es_bronce


def clasificar_miembro(member, total_cursos_existentes, beneficio_usado=False, info_beneficio=None):
    """
    Clasifica a un miembro según reglas actualizadas.
    """
    if info_beneficio is None:
        info_beneficio = {}
    cursos_participados = member.get("cursos_participados", [])
    es_oro, es_plata, es_bronce = evaluar_historial(cursos_participados, total_cursos_existentes)

    fecha_beneficio = info_beneficio.get("fecha", "")
    curso_beneficio = info_beneficio.get("curso_aplicado", "")

    # Si usó un beneficio de Oro o Plata:
    # Pierde Oro/Plata. Si participó en el último curso dictado, pasa automáticamente
    # a ser BRONCE y se le reinicia el conteo de cursos hacia Plata/Oro.
    if beneficio_usado:
        if es_bronce:
            return {
                "categoria": "BRONCE",
                "descuento": "15%",
                "descuento_valor": 15,
                "beneficios": mensaje_categoria("bronze")
                or "15% de descuento en el próximo curso (bono transferible)",
                "bono_transferible": "Sí",
                "emoji": "🥉",
                "nota": f"Beneficio redimido en {curso_beneficio or 'último curso'} (reinicio de conteo)",
            }
        else:
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
    """Carga el registro de beneficios ya redimidos indexado por correos y como lista completa."""
    if not os.path.exists(BENEFICIOS_CSV):
        return {}, []

    df = pd.read_csv(BENEFICIOS_CSV)
    usados = {}
    lista = []
    for _, row in df.iterrows():
        nombre = str(row.get("nombre", "")).strip()
        correo_raw = str(row.get("correo", "")).strip().lower()
        categoria = str(row.get("categoria", "")).strip().upper()
        beneficio = str(row.get("beneficio", "")).strip()
        fecha = str(row.get("fecha", "")).strip()
        curso = str(row.get("curso_aplicado", "")).strip()
        info = {
            "nombre": nombre,
            "correo": correo_raw,
            "categoria": categoria,
            "beneficio": beneficio,
            "fecha": fecha,
            "curso_aplicado": curso,
        }
        lista.append(info)
        for c in re.split(r"[\s,;]+", correo_raw):
            c_norm = c.strip().lower()
            if c_norm and c_norm != "nan":
                usados[c_norm] = info
    return usados, lista


def bonos_usados_miembro(member, lista_beneficios):
    """
    Retorna la lista de nombres de cursos en los que el miembro usó un bono
    de categoría ORO o PLATA.
    """
    id_to_nombre = {c["id"]: c["nombre"] for c in cursos_dictados_ordenados()}
    bonos = list(member.get("bonos_usados") or [])

    correos = [c.strip().lower() for c in re.split(r"[\s,;]+", str(member.get("correo", "")).strip().lower()) if c.strip()]
    for b in lista_beneficios:
        cat = str(b.get("categoria", "")).strip().upper()
        if cat not in ["ORO", "PLATA", "GOLD", "SILVER"]:
            continue
        b_correos = [c.strip().lower() for c in re.split(r"[\s,;]+", str(b.get("correo", "")).strip().lower()) if c.strip()]
        if any(c in correos for c in b_correos):
            curso_raw = str(b.get("curso_aplicado", "")).strip()
            curso_nombre = id_to_nombre.get(curso_raw, curso_raw)
            if curso_nombre and curso_nombre not in bonos:
                bonos.append(curso_nombre)
    return bonos


def info_beneficio_miembro(member, beneficios_usados):
    """Determina si algún correo del miembro está en beneficios usados."""
    correos = re.split(r"[\s,;]+", str(member.get("correo", "")).strip().lower())
    for c in correos:
        if c and c in beneficios_usados:
            return True, beneficios_usados[c]
    return False, {}


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
    print("📌 Orden (fechas): " + " → ".join(CURSOS_ORDEN))
    print("📌 Plata: 3 matrículas con máx. 1 pausa, incluyendo el último dictado")

    # Cargar beneficios usados
    crear_archivo_beneficios_si_no_existe()
    beneficios_usados, lista_beneficios = cargar_beneficios_usados()
    if beneficios_usados:
        print(f"\n🔄 Beneficios ya redimidos: {len(beneficios_usados)} persona(s)")
    else:
        print(f"\n✅ No hay beneficios redimidos registrados")

    # Clasificar cada miembro y actualizar el JSON
    updated_members = []
    for member in members:
        uso_beneficio, info_b = info_beneficio_miembro(member, beneficios_usados)
        fecha_beneficio = info_b.get("fecha", "")
        curso_aplicado = info_b.get("curso_aplicado", "")

        bonos_usados = bonos_usados_miembro(member, lista_beneficios)

        # Calcular cursos consecutivos y regulares
        consecutivos, regulares = calcular_consecutivos_y_regulares(
            member.get("cursos_participados", []),
            bonos_usados,
            CURSOS_ORDEN[:args.ultimo_curso]
        )

        # Estímulo de Fidelidad: miembros que alcanzan al menos una vez la categoría Plata u Oro
        # 1. Si alcanzaron Oro o Plata en este historial
        es_oro, es_plata, _ = evaluar_historial(member.get("cursos_participados", []), args.ultimo_curso, bonos_usados)
        # 2. Si ya redimieron un beneficio previo de Plata u Oro
        beneficio_plata_oro = (uso_beneficio and (info_b.get("categoria") in ["ORO", "PLATA"])) or bool(bonos_usados)
        # 3. Si ya tenían el estímulo registrado previamente
        tenia_fidelidad = bool(member.get("fidelidad"))

        es_fiel = bool(es_oro or es_plata or beneficio_plata_oro or tenia_fidelidad)

        clasif = clasificar_miembro(member, args.ultimo_curso, beneficio_usado=uso_beneficio, info_beneficio=info_b)

        # Construir diccionario con 'consecutivos' y 'regulares' directamente debajo de 'total_cursos'
        total_c = member.get("total_cursos")
        if total_c is None:
            total_c = len(member.get("cursos_participados", []))

        m_dict = {
            "nombre": member.get("nombre", ""),
            "documento": member.get("documento", ""),
            "correo": member.get("correo", ""),
            "celular": member.get("celular", ""),
            "cursos_participados": member.get("cursos_participados", []),
            "total_cursos": total_c,
            "consecutivos": consecutivos,
            "regulares": regulares,
            "bonos_usados": bonos_usados,
            "categoria": clasif["categoria"],
            "beneficio_usado": "SÍ" if uso_beneficio else "NO",
            "fecha_beneficio": fecha_beneficio,
            "curso_aplicado": curso_aplicado,
            "emoji": clasif["emoji"],
            "descuento": clasif["descuento"],
            "descuento_valor": clasif["descuento_valor"],
            "beneficios": clasif["beneficios"],
            "bono_transferible": clasif["bono_transferible"],
            "proximo_curso": nombre_curso,
            "nota": clasif["nota"],
            "fidelidad": es_fiel,
        }
        updated_members.append(m_dict)

    members = updated_members

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
                fiel_tag = " [Cliente fiel 🌟]" if r.get("fidelidad") else ""
                stats = f" (total: {r.get('total_cursos')}, cons: {r.get('consecutivos')}, reg: {r.get('regulares')})"
                print(f"    • {r['nombre']} ({r['correo']}) - {r['descuento']}{stats}{fiel_tag}{nota}")

    # Miembros que usaron beneficio
    usados = [m for m in members if m["beneficio_usado"] == "SÍ"]
    if len(usados) > 0:
        print(f"\n  🔄 Miembros que redimieron beneficio (conteo reiniciado): {len(usados)}")
        for r in usados:
            print(f"    • {r['nombre']} ({r['correo']}) - Pasa a: {r['categoria']}")

    # Clientes fieles
    fieles = [m for m in members if m.get("fidelidad")]
    print(f"\n  🌟 Clientes fieles (Estímulo Fidelidad): {len(fieles)} persona(s)")
    for r in fieles:
        print(f"    • {r['nombre']} ({r['correo']}) - Categoría actual: {r['categoria']}")

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

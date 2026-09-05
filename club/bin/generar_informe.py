#!/usr/bin/env python3
"""
Dr. Z Academy Club - Generador del Informe drz-club.md

Lee la clasificación más reciente y genera un informe markdown
con las categorías y miembros del club.

Uso:
    python3 club/bin/generar_informe.py
    make -C club informe
"""

import pandas as pd
import os
import sys
from datetime import datetime

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

import config

CLUB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSONAL_DIR = os.path.join(CLUB_DIR, "personal")
INFO_DIR = config.get_info_dir(CLUB_DIR)
OUTPUT_MD = os.path.join(INFO_DIR, "drz-club.md")
BENEFICIOS_CSV = os.path.join(INFO_DIR, "beneficios_usados.csv")
DATABASE_JSON = os.path.join(INFO_DIR, "drz-club-members.json")
CURSOS_JSON = os.path.join(CLUB_DIR, "cursos.json")


# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

def safe_str(val):
    """Convierte un valor a string limpio, manejando NaN y saltos de línea."""
    if pd.isna(val) or str(val).strip() == "nan":
        return ""
    # Reemplazar saltos de línea por ' / ' para no romper las tablas markdown
    return str(val).strip().replace("\n", " / ").replace("\r", "")


def cargar_cursos():
    """Lee el catálogo de cursos."""
    import json
    if not os.path.exists(CURSOS_JSON):
        return []
    with open(CURSOS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def contar_beneficios_usados():
    """Cuenta beneficios ya redimidos."""
    if not os.path.exists(BENEFICIOS_CSV):
        return 0, []
    df = pd.read_csv(BENEFICIOS_CSV)
    registros = []
    for _, row in df.iterrows():
        nombre = safe_str(row.get("nombre", ""))
        correo = safe_str(row.get("correo", ""))
        if nombre or correo:
            registros.append({
                "nombre": nombre,
                "correo": correo,
                "categoria": safe_str(row.get("categoria", "")),
                "beneficio": safe_str(row.get("beneficio", "")),
                "fecha": safe_str(row.get("fecha", "")),
                "curso_aplicado": safe_str(row.get("curso_aplicado", "")),
            })
    return len(registros), registros


# ============================================================================
# GENERADOR DEL INFORME
# ============================================================================

def generar_informe():
    import json
    if not os.path.exists(DATABASE_JSON):
        print("❌ No se encontró archivo de base de datos JSON.")
        print("   Ejecuta primero: python3 club/bin/clasificar_miembros.py")
        sys.exit(1)

    with open(DATABASE_JSON, "r", encoding="utf-8") as f:
        members = json.load(f)
        
    fecha = datetime.now().strftime("%d de %B de %Y").replace(
        "January", "enero").replace("February", "febrero").replace(
        "March", "marzo").replace("April", "abril").replace(
        "May", "mayo").replace("June", "junio").replace(
        "July", "julio").replace("August", "agosto").replace(
        "September", "septiembre").replace("October", "octubre").replace(
        "November", "noviembre").replace("December", "diciembre")

    # Categorías
    oro = [m for m in members if m.get("categoria") == "ORO"]
    plata = [m for m in members if m.get("categoria") == "PLATA"]
    bronce = [m for m in members if m.get("categoria") == "BRONCE"]
    sin_cat = [m for m in members if m.get("categoria") == "SIN CATEGORÍA"]

    # Ordenar por nombre
    oro.sort(key=lambda x: x.get("nombre", ""))
    plata.sort(key=lambda x: x.get("nombre", ""))
    bronce.sort(key=lambda x: x.get("nombre", ""))
    sin_cat.sort(key=lambda x: x.get("nombre", ""))

    total_beneficiarios = len(oro) + len(plata) + len(bronce)
    con_correo_sin_cat = [m for m in sin_cat if str(m.get("correo", "")).strip() != ""]
    sin_correo_sin_cat = [m for m in sin_cat if str(m.get("correo", "")).strip() == ""]

    # Beneficios usados
    n_beneficios, beneficios_lista = contar_beneficios_usados()

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from clasificar_miembros import cursos_dictados_ordenados

    cursos = cargar_cursos()
    total_cursos = len(cursos)
    cursos_dictados = cursos_dictados_ordenados(cursos)
    ultimo_curso = cursos_dictados[-1] if cursos_dictados else None
    ultimo_curso_nombre = ultimo_curso["nombre"] if ultimo_curso else "?"

    # ===================== CONSTRUIR MARKDOWN =====================
    lines = []

    # Encabezado
    lines.append("# 🏆 Dr. Z Academy Club — Informe de Categorías")
    lines.append("")
    lines.append(f"> **Fecha**: {fecha}  ")
    lines.append(f"> **Cursos dictados**: {total_cursos}  ")
    lines.append(f"> **Miembros registrados**: {len(members)}  ")
    lines.append(f"> **Miembros con beneficios activos**: {total_beneficiarios}  ")
    lines.append(f"> **Criterio**: desde el último dictado ({ultimo_curso_nombre}); Plata admite 1 pausa si igual se llega a 3 matrículas. El certificado no es requisito.")
    lines.append("")
    lines.append("---")
    lines.append("")

    # ── ORO ──
    lines.append(f"## 🥇 Categoría ORO ({len(oro)} miembro{'s' if len(oro) != 1 else ''})")
    lines.append("")
    lines.append("**Requisito**: 5+ cursos consecutivos desde el último.  ")
    lines.append("**Beneficio**: Inscripción **GRATIS** al próximo curso + acceso gratis a un producto permanente.")
    lines.append("")

    if len(oro) > 0:
        lines.append("| # | Nombre | Correo | Cursos |")
        lines.append("|---|--------|--------|--------|")
        for i, r in enumerate(oro, 1):
            correo = safe_str(r.get("correo", ""))
            cursos_str = ", ".join(r.get("cursos_participados", []))
            lines.append(f"| {i} | {r.get('nombre', '')} | {correo} | {cursos_str} |")
    else:
        lines.append("*Ningún miembro cumple el requisito actualmente.*")

    lines.append("")
    lines.append("---")
    lines.append("")

    # ── PLATA ──
    lines.append(f"## 🥈 Categoría PLATA ({len(plata)} miembro{'s' if len(plata) != 1 else ''})")
    lines.append("")
    lines.append("**Requisito**: 3 matrículas con máximo 1 pausa, incluyendo el último dictado.  ")
    lines.append("**Beneficio**: **30%** de descuento en el próximo curso. Al aprovechar el beneficio se reinicia el conteo.")
    lines.append("")

    if len(plata) > 0:
        lines.append("| # | Nombre | Correo | Cursos |")
        lines.append("|---|--------|--------|--------|")
        for i, r in enumerate(plata, 1):
            correo = safe_str(r.get("correo", ""))
            cursos_str = ", ".join(r.get("cursos_participados", []))
            lines.append(f"| {i} | {r.get('nombre', '')} | {correo} | {cursos_str} |")
    else:
        lines.append("*Ningún miembro cumple el requisito actualmente.*")

    lines.append("")
    lines.append("---")
    lines.append("")

    # ── BRONCE ──
    lines.append(f"## 🥉 Categoría BRONCE ({len(bronce)} miembro{'s' if len(bronce) != 1 else ''})")
    lines.append("")
    lines.append(f"**Requisito**: Participó en el último curso dictado ({ultimo_curso_nombre}).  ")
    lines.append("**Beneficio**: **15%** de descuento en el próximo curso. **Bono transferible**.")
    lines.append("")

    if len(bronce) > 0:
        lines.append("| # | Nombre | Correo | Total cursos |")
        lines.append("|---|--------|--------|:------------:|")
        for i, r in enumerate(bronce, 1):
            correo = safe_str(r.get("correo", ""))
            total = int(r.get("total_cursos", 0))
            lines.append(f"| {i} | {r.get('nombre', '')} | {correo} | {total} |")
    else:
        lines.append("*Ningún miembro cumple el requisito actualmente.*")

    lines.append("")
    lines.append("---")
    lines.append("")

    # ── SIN CATEGORÍA ──
    lines.append(f"## 📧 Sin categoría ({len(sin_cat)} miembros)")
    lines.append("")
    lines.append(f"Miembros que **no participaron** en el último curso dictado ({ultimo_curso_nombre}). Reciben un boletín informativo sin cupón de descuento.")
    lines.append("")
    lines.append(f"De estos {len(sin_cat)} miembros:")
    lines.append(f"- **{len(con_correo_sin_cat)}** tienen correo electrónico registrado")
    lines.append(f"- **{len(sin_correo_sin_cat)}** no tienen correo (principalmente de Cuántica a Pie)")
    lines.append("")
    lines.append("---")
    lines.append("")

    # ── BENEFICIOS USADOS ──
    lines.append("## 🔄 Beneficios usados")
    lines.append("")
    lines.append("Archivo de control: `beneficios_usados.csv`")
    lines.append("")
    lines.append("Cuando un miembro use su beneficio, se registra en este archivo con:")
    lines.append("- nombre, correo, categoría, beneficio usado, fecha, curso en el que lo aplicó")
    lines.append("")
    lines.append("Al registrar un beneficio usado, la persona **pierde automáticamente su categoría** en la siguiente clasificación.")
    lines.append("")

    if n_beneficios > 0:
        lines.append(f"**Beneficios redimidos: {n_beneficios}**")
        lines.append("")
        lines.append("| # | Nombre | Correo | Categoría | Beneficio | Fecha | Curso |")
        lines.append("|---|--------|--------|-----------|-----------|-------|-------|")
        for i, b in enumerate(beneficios_lista, 1):
            lines.append(f"| {i} | {b['nombre']} | {b['correo']} | {b['categoria']} | {b['beneficio']} | {b['fecha']} | {b['curso_aplicado']} |")
    else:
        lines.append("**Estado actual**: No hay beneficios redimidos.")

    lines.append("")
    lines.append("---")
    lines.append("")

    # ── RESUMEN ──
    lines.append("## 📊 Resumen")
    lines.append("")
    lines.append("```")
    lines.append("┌─────────────┬──────────┬─────────────────────────────────────────────────┐")
    lines.append("│ Categoría   │ Miembros │ Beneficio                                       │")
    lines.append("├─────────────┼──────────┼─────────────────────────────────────────────────┤")
    lines.append(f"│ 🥇 Oro      │ {len(oro):>4}     │ Inscripción GRATIS + producto permanente        │")
    lines.append(f"│ 🥈 Plata    │ {len(plata):>4}     │ 30% descuento                                   │")
    lines.append(f"│ 🥉 Bronce   │ {len(bronce):>4}     │ 15% descuento (transferible)                    │")
    lines.append(f"│ 📧 Sin cat. │ {len(sin_cat):>4}     │ Boletín informativo                             │")
    lines.append("├─────────────┼──────────┼─────────────────────────────────────────────────┤")
    lines.append(f"│ TOTAL       │ {len(members):>4}     │                                                 │")
    lines.append("└─────────────┴──────────┴─────────────────────────────────────────────────┘")
    lines.append("```")
    lines.append("")

    # Criterios
    lines.append("### Criterios de clasificación")
    lines.append("")
    lines.append("- **Oro**: los últimos 5 cursos **consecutivos** (incluye el último dictado)")
    lines.append("- **Plata**: 3 matrículas con máximo **1 pausa**, incluyendo el último dictado")
    lines.append("- **Bronce**: participó en el último curso dictado")
    lines.append("- Se aplica siempre la **mejor categoría** (Oro > Plata > Bronce)")
    lines.append("- Si un miembro **usa su beneficio**, pierde la categoría y debe acumular de nuevo")
    lines.append("")

    # Historial de cursos
    lines.append("### Historial de cursos")
    lines.append("")
    lines.append("Archivo de catálogo: `cursos.json`")
    lines.append("")
    lines.append("| # | Curso | Inicio | Fin | Inscritos |")
    lines.append("|---|-------|:------:|:---:|:---------:|")
    for i, curso in enumerate(cursos, 1):
        lines.append(f"| {i} | {curso['nombre']} | {curso['fecha_inicio']} | {curso['fecha_fin']} | {curso['numero_participantes']} |")
    lines.append("")

    # ===================== ESCRIBIR ARCHIVO =====================
    contenido = "\n".join(lines)
    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write(contenido)

    print(f"✅ Informe generado: {OUTPUT_MD}")
    print(f"   Oro: {len(oro)} | Plata: {len(plata)} | Bronce: {len(bronce)} | Sin cat: {len(sin_cat)}")


if __name__ == "__main__":
    generar_informe()

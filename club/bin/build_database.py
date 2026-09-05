#!/usr/bin/env python3
"""
Dr. Z Academy Club - Construcción de Base de Datos Unificada

Lee los archivos de inscripción de 8 cursos, cruza participantes por
documento → correo → nombre normalizado, y genera una base de datos CSV
con la información de todos los miembros.

Uso:
    python3 club/bin/build_database.py
    make -C club base-datos
"""

import pandas as pd
import unicodedata
import re
import os
import sys

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

import config

CLUB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSONAL_DIR = os.path.join(CLUB_DIR, "personal")
INFO_DIR = config.get_info_dir(CLUB_DIR)
INSCRIPCIONES_DIR = os.path.join(PERSONAL_DIR, "inscripciones")
OUTPUT_JSON = os.path.join(INFO_DIR, "drz-club-members.json")
CURSOS_JSON = os.path.join(CLUB_DIR, "cursos.json")

# Orden cronológico de los cursos
CURSOS = [
    {
        "id": "cuantica_a_pie",
        "nombre": "Cuántica a Pie",
        "archivo": "CuánticaAPie.xlsx",
        "sheet": "Tablero Matriculas Dr. Z Academ",
        "tipo": "cuantica",  # formato especial
    },
    {
        "id": "catastrofisica",
        "nombre": "Catastrofísica",
        "archivo": "Curso Catastrofísica - Inscripción (Respuestas).xlsx",
        "sheet": "Respuestas de formulario 1",
        "tipo": "formulario",  # formato Google Forms
    },
    {
        "id": "einstein",
        "nombre": "Einstein Relativamente Fácil",
        "archivo": "Inscripciones - Curso Einstein Relativamente Fácil - 2025.xlsx",
        "sheet": "Inscritos",
        "tipo": "estandar",
    },
    {
        "id": "mundo_cuantico",
        "nombre": "Mundo Cuántico",
        "archivo": "Inscripciones - Curso Mundo Cuántico - 2025.xlsx",
        "sheet": "Inscritos",
        "tipo": "estandar",
    },
    {
        "id": "rompecabezas_materia",
        "nombre": "El Rompecabezas de la Materia",
        "archivo": "Inscripciones - Curso El Rompecabezas De La Materia - 2025.xlsx",
        "sheet": "Inscritos",
        "tipo": "estandar",
    },
    {
        "id": "astropython",
        "nombre": "Astropython",
        "archivo": "AstroPython - 2025-1 - Lista de Inscritos.xlsx",
        "sheet": "INSCRITOS FINAL",
        "tipo": "astropython",  # formato especial
    },
    {
        "id": "python_fin_mundo",
        "nombre": "Python para el fin del mundo",
        "archivo": "Inscripciones - Curso Python para el fin del mundo - 2026.xlsx",
        "sheet": "Inscritos",
        "tipo": "estandar",
    },
    {
        "id": "masterclass_extraterrestre",
        "nombre": "Master Class Extraterrestre",
        "archivo": "Inscripciones - Master Class Extraterrestre - 2026-2.xlsx",
        "sheet": "Inscritos",
        "tipo": "estandar",
    },
]


# ============================================================================
# FUNCIONES DE NORMALIZACIÓN
# ============================================================================

def strip_accents(text):
    """Elimina acentos/tildes de un texto."""
    if not isinstance(text, str):
        return ""
    nfkd = unicodedata.normalize('NFKD', text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalize_name(name):
    """Normaliza un nombre para comparación: minúsculas, sin tildes, sin espacios extra."""
    if not isinstance(name, str) or not name.strip():
        return ""
    name = strip_accents(name.strip().lower())
    # Eliminar caracteres no alfanuméricos excepto espacios
    name = re.sub(r'[^a-z0-9\s]', '', name)
    # Colapsar espacios múltiples
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def normalize_email(email):
    """Normaliza un correo electrónico."""
    if not isinstance(email, str) or not email.strip():
        return ""
    # Reemplazar saltos de línea por un espacio (o limpiarlos)
    clean_email = str(email).replace("\n", " ").replace("\r", " ")
    # Eliminar múltiples espacios si quedaron
    clean_email = re.sub(r'\s+', ' ', clean_email).strip().lower()
    return clean_email


def normalize_document(doc):
    """Normaliza un documento de identidad: solo dígitos."""
    if pd.isna(doc):
        return ""
    doc_str = str(doc).strip()
    # Eliminar todo lo que no sea dígito
    digits = re.sub(r'[^0-9]', '', doc_str)
    # Si empieza con punto flotante (ej: 1.03592e+09), convertir
    if not digits and '.' in doc_str:
        try:
            digits = str(int(float(doc_str)))
        except (ValueError, OverflowError):
            pass
    return digits


def normalize_phone(phone):
    """Normaliza un número de celular."""
    if pd.isna(phone):
        return ""
    phone_str = str(phone).strip()
    # Si es notación científica, convertir primero
    try:
        phone_val = float(phone_str)
        if phone_val > 1e9:
            phone_str = str(int(phone_val))
    except (ValueError, OverflowError):
        pass
    # Solo dígitos
    digits = re.sub(r'[^0-9]', '', phone_str)
    # Si empieza con 57 y tiene más de 10 dígitos, quitar prefijo país
    if digits.startswith('57') and len(digits) > 10:
        digits = digits[2:]
    return digits


def format_name_proper(name):
    """Formatea un nombre en Title Case apropiado."""
    if not isinstance(name, str) or not name.strip():
        return ""
    # Si está todo en mayúsculas, convertir a Title Case
    name = name.strip()
    if name == name.upper():
        name = name.title()
    return re.sub(r'\s+', ' ', name).strip()


# ============================================================================
# LECTORES POR TIPO DE ARCHIVO
# ============================================================================

def _cuantica_responses_path():
    for name in (
        "Curso Cuántica a Pie - Inscripción (Responses).xlsx",
        "Curso Cuántica a Pie - Inscripción (Respuestas).xlsx",
    ):
        for folder in (INSCRIPCIONES_DIR, PERSONAL_DIR):
            path = os.path.join(folder, name)
            if os.path.exists(path):
                return path
    return ""


def _name_score(a, b):
    ta = [t for t in normalize_name(a).split() if len(t) > 1]
    tb = [t for t in normalize_name(b).split() if len(t) > 1]
    if not ta or not tb:
        return 0.0
    sa, sb = set(ta), set(tb)
    inter = sa & sb
    if not inter:
        return 0.0
    return 0.7 * len(inter) / min(len(sa), len(sb)) + 0.3 * len(inter) / len(sa | sb)


def load_cuantica_contacts():
    """Correo y celular del formulario de inscripción de Cuántica a Pie."""
    path = _cuantica_responses_path()
    if not path:
        return []
    contacts = []

    def add_row(nombre, correo, celular):
        nombre = str(nombre or "").strip()
        if not nombre or nombre.lower() == "nan":
            return
        contacts.append(
            {
                "nombre": format_name_proper(nombre),
                "nombre_normalizado": normalize_name(nombre),
                "correo": normalize_email(correo or ""),
                "celular": normalize_phone(celular),
            }
        )

    try:
        df = pd.read_excel(path, sheet_name="Form Responses 1")
        for _, row in df.iterrows():
            add_row(
                row.get("Nombre completo"),
                row.get("Correo electrónico"),
                row.get("Número celular para contacto y WhatsApp"),
            )
    except Exception:
        pass
    try:
        df = pd.read_excel(path, sheet_name="LISTADO PARTICIPANTES", header=1)
        for _, row in df.iterrows():
            add_row(row.get("Nombre completo"), row.get("E-mail"), row.get("Celular"))
    except Exception:
        pass
    return contacts


def match_cuantica_contact(nombre, contacts):
    if not contacts:
        return None
    key = normalize_name(nombre)
    exact = [c for c in contacts if c["nombre_normalizado"] == key]
    pool = exact or []
    if not pool:
        ranked = sorted(((_name_score(nombre, c["nombre"]), c) for c in contacts), key=lambda x: x[0], reverse=True)
        pool = [c for s, c in ranked if s >= 0.72]
    if not pool:
        return None
    pool.sort(key=lambda c: (bool(c["celular"]), bool(c["correo"])), reverse=True)
    return pool[0]


def read_cuantica(curso_config):
    """Lee la lista de matriculados y la cruza con el formulario (correo y celular)."""
    path = os.path.join(INSCRIPCIONES_DIR, curso_config["archivo"])
    df = pd.read_excel(path, sheet_name=curso_config["sheet"])
    contacts = load_cuantica_contacts()

    records = []
    for _, row in df.iterrows():
        apellidos = str(row.get("APELLIDOS", "")).strip()
        nombres = str(row.get("NOMBRES", "")).strip()
        if apellidos == "nan":
            apellidos = ""
        if nombres == "nan":
            nombres = ""
        nombre_completo = f"{nombres} {apellidos}".strip()
        if not nombre_completo:
            continue

        contact = match_cuantica_contact(nombre_completo, contacts)
        records.append({
            "nombre": format_name_proper(nombre_completo),
            "documento": "",
            "correo": contact["correo"] if contact else "",
            "celular": contact["celular"] if contact else "",
            "nombre_normalizado": normalize_name(nombre_completo),
        })
    return records


def read_formulario(curso_config):
    """Lee el formato Google Forms (Catastrofísica)."""
    path = os.path.join(INSCRIPCIONES_DIR, curso_config["archivo"])
    df = pd.read_excel(path, sheet_name=curso_config["sheet"])

    records = []
    for _, row in df.iterrows():
        nombre = str(row.get("Nombre completo", "")).strip()
        if nombre == "nan" or not nombre:
            continue

        correo = normalize_email(row.get("Correo electrónico", ""))
        documento = normalize_document(row.get("Número de Identificación", ""))
        celular = normalize_phone(row.get("Número celular para contacto y WhatsApp", ""))

        records.append({
            "nombre": format_name_proper(nombre),
            "documento": documento,
            "correo": correo,
            "celular": celular,
            "nombre_normalizado": normalize_name(nombre),
        })
    return records


def read_estandar(curso_config):
    """Lee el formato estándar (Einstein, Mundo Cuántico, Rompecabezas, Python, Master Class)."""
    path = os.path.join(INSCRIPCIONES_DIR, curso_config["archivo"])
    df = pd.read_excel(path, sheet_name=curso_config["sheet"])

    records = []
    for _, row in df.iterrows():
        nombre = str(row.get("Nombre", "")).strip()
        if nombre == "nan" or not nombre:
            continue

        correo = normalize_email(row.get("Correo", ""))
        documento = normalize_document(row.get("Documento", ""))
        celular = normalize_phone(row.get("Celular", ""))

        records.append({
            "nombre": format_name_proper(nombre),
            "documento": documento,
            "correo": correo,
            "celular": celular,
            "nombre_normalizado": normalize_name(nombre),
        })
    return records


def read_astropython(curso_config):
    """Lee el formato especial de AstroPython."""
    path = os.path.join(INSCRIPCIONES_DIR, curso_config["archivo"])
    df = pd.read_excel(path, sheet_name=curso_config["sheet"])

    records = []
    for _, row in df.iterrows():
        nombre = str(row.get("Nombre", "")).strip()
        if nombre == "nan" or not nombre:
            continue

        correo = normalize_email(row.get("E-mail", ""))
        # Teléfono en formato numérico largo (ej: 5.731361e+11)
        celular = normalize_phone(row.get("Teléfono", ""))

        records.append({
            "nombre": format_name_proper(nombre),
            "documento": "",
            "correo": correo,
            "celular": celular,
            "nombre_normalizado": normalize_name(nombre),
        })
    return records


READERS = {
    "cuantica": read_cuantica,
    "formulario": read_formulario,
    "estandar": read_estandar,
    "astropython": read_astropython,
}


# ============================================================================
# MOTOR DE CRUCE DE DATOS
# ============================================================================

class MemberDatabase:
    """Base de datos de miembros con deduplicación inteligente."""

    def __init__(self):
        # Lista de miembros únicos
        # Cada miembro: {nombre, documento, correo, celular, nombre_normalizado, cursos: set()}
        self.members = []

        # Índices para búsqueda rápida
        self.by_document = {}   # documento -> índice en self.members
        self.by_email = {}      # correo -> índice en self.members
        self.by_name = {}       # nombre_normalizado -> índice en self.members

    def _find_member(self, record):
        """Busca un miembro existente por documento → correo → nombre normalizado.
        Retorna el índice o None."""

        # 1. Buscar por documento (más confiable)
        doc = record.get("documento", "")
        if doc and doc in self.by_document:
            return self.by_document[doc]

        # 2. Buscar por correo
        email = record.get("correo", "")
        if email and email in self.by_email:
            return self.by_email[email]

        # 3. Buscar por nombre normalizado
        name = record.get("nombre_normalizado", "")
        if name and name in self.by_name:
            return self.by_name[name]

        return None

    def _update_indices(self, idx, member):
        """Actualiza los índices de búsqueda para un miembro."""
        if member["documento"]:
            self.by_document[member["documento"]] = idx
        if member["correo"]:
            self.by_email[member["correo"]] = idx
        if member["nombre_normalizado"]:
            self.by_name[member["nombre_normalizado"]] = idx

    def add_record(self, record, curso_id):
        """Agrega un registro. Si ya existe, actualiza datos faltantes y agrega el curso."""
        idx = self._find_member(record)

        if idx is not None:
            # Miembro existente: completar datos faltantes y agregar curso
            member = self.members[idx]
            member["cursos"].add(curso_id)

            # Actualizar datos faltantes con la info nueva
            if not member["documento"] and record.get("documento"):
                member["documento"] = record["documento"]
            if not member["correo"] and record.get("correo"):
                member["correo"] = record["correo"]
            if not member["celular"] and record.get("celular"):
                member["celular"] = record["celular"]
            # Preferir el nombre con más caracteres (probablemente más completo)
            if len(record.get("nombre", "")) > len(member.get("nombre", "")):
                member["nombre"] = record["nombre"]
                member["nombre_normalizado"] = record["nombre_normalizado"]

            # Actualizar índices (por si se completaron datos)
            self._update_indices(idx, member)
        else:
            # Nuevo miembro
            member = {
                "nombre": record.get("nombre", ""),
                "documento": record.get("documento", ""),
                "correo": record.get("correo", ""),
                "celular": record.get("celular", ""),
                "nombre_normalizado": record.get("nombre_normalizado", ""),
                "cursos": {curso_id},
            }
            idx = len(self.members)
            self.members.append(member)
            self._update_indices(idx, member)

    def to_list_of_dicts(self):
        """Convierte la base de datos a una lista de diccionarios con los cursos como lista de nombres."""
        rows = []
        for member in self.members:
            # Lista de nombres de cursos (ordenados cronológicamente)
            cursos_nombres = [c["nombre"] for c in CURSOS if c["id"] in member["cursos"]]
            
            row = {
                "nombre": member["nombre"],
                "documento": member["documento"] or member["celular"] or "",
                "correo": member["correo"] if member["correo"] else "",
                "celular": member["celular"] if member["celular"] else "",
                "cursos_participados": cursos_nombres,
                "total_cursos": len(member["cursos"]),
                "categoria": "SIN CATEGORÍA",
                "beneficio_usado": "NO",
                "fecha_beneficio": "",
                "curso_aplicado": ""
            }
            rows.append(row)

        # Ordenar por total de cursos (descendente) y luego por nombre
        rows.sort(key=lambda x: (-x["total_cursos"], x["nombre"]))
        return rows


# ============================================================================
# EJECUCIÓN PRINCIPAL
# ============================================================================

def main():
    print("=" * 70)
    print("  Dr. Z Academy Club - Construcción de Base de Datos")
    print("=" * 70)

    db = MemberDatabase()
    total_registros = 0

    for curso in CURSOS:
        print(f"\n📖 Leyendo: {curso['nombre']}")
        print(f"   Archivo: {curso['archivo']}")

        reader = READERS[curso["tipo"]]
        try:
            records = reader(curso)
        except FileNotFoundError:
            print(f"   ⚠️  Archivo no encontrado, saltando...")
            continue
        except Exception as e:
            print(f"   ❌ Error: {e}")
            continue

        print(f"   📝 Registros encontrados: {len(records)}")
        total_registros += len(records)

        for record in records:
            db.add_record(record, curso["id"])

        print(f"   👥 Miembros únicos acumulados: {len(db.members)}")

    # Generar JSON de miembros
    import json
    rows = db.to_list_of_dicts()
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)

    print(f"\n{'=' * 70}")
    print(f"  RESUMEN")
    print(f"{'=' * 70}")
    print(f"  Total registros procesados:  {total_registros}")
    print(f"  Miembros únicos encontrados: {len(db.members)}")
    print(f"  Base de datos guardada en:   {OUTPUT_JSON}")
    print()

    # Estadísticas por curso y actualizar cursos.json
    print("  Participación por curso:")
    
    # Cargar cursos.json si existe para preservar fechas
    cursos_meta = {}
    if os.path.exists(CURSOS_JSON):
        try:
            with open(CURSOS_JSON, "r", encoding="utf-8") as f:
                cursos_meta_list = json.load(f)
                for c in cursos_meta_list:
                    cursos_meta[c["nombre"]] = c
        except Exception:
            pass

    cursos_output = []
    
    cursos_procesados = set()
    for curso in CURSOS:
        cursos_procesados.add(curso["nombre"])
        # Contar cuántos participaron
        count = sum(1 for m in db.members if curso["id"] in m["cursos"])
        print(f"    - {curso['nombre']}: {count} participantes")
        
        # Generar metadata para cursos.json (preservando otros campos como 'valor')
        meta = dict(cursos_meta.get(curso["nombre"], {}))
        meta["id"] = curso["id"]
        meta["nombre"] = curso["nombre"]
        meta["fecha_inicio"] = meta.get("fecha_inicio", "2025-01-01")
        meta["fecha_fin"] = meta.get("fecha_fin", "2025-01-01")
        meta["classroom_url"] = meta.get("classroom_url", "")
        meta["certificados_folder"] = meta.get("certificados_folder", "")
        meta["pagina_url"] = meta.get("pagina_url", "")
        meta["numero_participantes"] = count
        cursos_output.append(meta)

    # Agregar cualquier curso extra que estaba en cursos.json (cursos futuros)
    for nombre_curso, meta in cursos_meta.items():
        if nombre_curso not in cursos_procesados:
            cursos_output.append(meta)
        
    with open(CURSOS_JSON, "w", encoding="utf-8") as f:
        json.dump(cursos_output, f, indent=2, ensure_ascii=False)
    print(f"  Catálogo actualizado en:     {CURSOS_JSON}")

    print(f"\n  Distribución por número de cursos:")
    # Calculate distribution
    dist = {}
    for r in rows:
        dist[r["total_cursos"]] = dist.get(r["total_cursos"], 0) + 1
    for n in sorted(dist.keys(), reverse=True):
        print(f"    {n} curso(s): {dist[n]} persona(s)")

    # Mostrar personas con más cursos
    print(f"\n  Top 10 participantes más activos:")
    top_10 = rows[:10]
    for row in top_10:
        print(f"    {row['nombre']} ({row['total_cursos']} cursos): {', '.join(row['cursos_participados'])}")

    print()

if __name__ == "__main__":
    main()

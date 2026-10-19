#!/usr/bin/env python3
"""Procesa archivos de seguimiento de certificaciones de cursos de Dr. Z Academy.

Funcionalidades:
1. Lee una lista Excel de certificación (hoja 'Certificaciones', columna 'Certifica' = SI).
   Detecta automáticamente la fila de encabezados aunque haya filas de títulos previas.
2. Identifica los participantes certificados y los que no certifican.
3. Busca los diplomas PDF correspondientes en la carpeta del curso.
4. Copia los diplomas de quienes certifican a CertificadosPublicos/ con el nombre estándar:
   CURSO-CEDULA-CORREO-NOMBRE.pdf
5. Actualiza club/cursos.json con el conteo de certificados y participantes.
6. Actualiza personal/certificados.csv con los enlaces de Google Drive.
7. Actualiza club/stats.json y el Excel maestro de miembros (drz-club-members.xlsx).

Uso:
    python3 club/bin/actualizar_certificados.py "club/personal/ClubDrZAcademy/Certificados/CambioClimatico-Certificación-ElaboraciónCertificados/Lista Certificación - Master Class Cambio Climático - 2026-2.xlsx"
    python3 club/bin/actualizar_certificados.py --dry-run ruta/lista.xlsx
    python3 club/bin/actualizar_certificados.py --curso masterclass_cambio_climatico ruta/lista.xlsx
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

from openpyxl import load_workbook

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
CLUB_DIR = SCRIPT_DIR.parent
PERSONAL_DIR = CLUB_DIR / "personal"
CURSOS_JSON = CLUB_DIR / "cursos.json"
STATS_JSON = CLUB_DIR / "stats.json"
CSV_PATH = PERSONAL_DIR / "certificados.csv"
INFO_DIR = PERSONAL_DIR / "ClubDrZAcademy" / "info"
MEMBERS_JSON = INFO_DIR / "drz-club-members.json"
DRIVE_CERTS_DIR = PERSONAL_DIR / "ClubDrZAcademy" / "Certificados" / "CertificadosPublicos"
DRIVE_XATTR = "com.google.drivefs.item-id#S"

CURSO_HINTS = (
    ("extraterrestre", "masterclass_extraterrestre"),
    ("cambio climatico", "masterclass_cambio_climatico"),
    ("cambio climatic", "masterclass_cambio_climatico"),
    ("python fin", "python_fin_mundo"),
    ("rompecabezas", "rompecabezas_materia"),
    ("mundo cuantico", "mundo_cuantico"),
    ("catastrofisica", "catastrofisica"),
    ("einstein", "einstein"),
    ("astropython", "astropython"),
    ("cuantica a pie", "cuantica_a_pie"),
    ("circulo latino", "circulo_latino"),
)

ILLEGAL = re.compile(r'[\\/:*?"<>|\n\r\t]')
EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
SI_VALUES = {"si", "sí", "yes", "true", "1", "x", "ok"}

HEADER_ALIASES = {
    "nombre": ("nombre", "name", "participante", "estudiante", "persona", "nombre completo"),
    "documento": ("cedula", "cédula", "documento", "doc", "identificacion", "identificación", "cc"),
    "correo": ("correo", "email", "e-mail", "mail", "correo electrónico", "correo electronico"),
    "certifica": ("certifica", "certificado", "certificados", "emite", "emite certificado", "estado"),
}


def fold(text: str) -> str:
    raw = unicodedata.normalize("NFKD", str(text or ""))
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    raw = raw.lower().replace("ñ", "n")
    raw = re.sub(r"[^a-z0-9@._+\-]+", " ", raw)
    return re.sub(r"\s+", " ", raw).strip()


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", str(text or ""))


def digits(text) -> str:
    raw = str(text or "").strip()
    try:
        val = float(raw)
        if val == int(val) and abs(val) >= 1:
            raw = str(int(val))
    except ValueError:
        pass
    out = re.sub(r"\D", "", raw)
    if out.startswith("57") and len(out) > 10:
        out = out[2:]
    return out


def first_email(value: str) -> str:
    found = EMAIL_RE.search(str(value or ""))
    return found.group(0).lower() if found else ""


def format_name(name: str) -> str:
    value = re.sub(r"\s+", " ", nfc(name or "").strip())
    words = value.split()
    messy = value.isupper() or value.islower() or sum(1 for w in words if w.islower()) >= 2
    if messy:
        value = value.title()
    return value


def safe_part(text: str, fallback: str) -> str:
    value = ILLEGAL.sub(" ", str(text or "").strip())
    value = nfc(value)
    value = re.sub(r"\s+", " ", value).strip(" .-_")
    return value or fallback


def dest_name(curso_id: str, documento: str, email: str, nombre: str) -> str:
    return (
        f"{safe_part(curso_id, 'curso')}-"
        f"{safe_part(documento, 'sincedula')}-"
        f"{safe_part((email or '').lower(), 'sincorreo')}-"
        f"{safe_part(nombre, 'sinnombre')}.pdf"
    )


def name_score(a: str, b: str) -> float:
    ta = [t for t in fold(a).split() if len(t) > 1]
    tb = [t for t in fold(b).split() if len(t) > 1]
    if not ta or not tb:
        return 0.0
    sa, sb = set(ta), set(tb)
    inter = sa & sb
    if not inter:
        return 0.0
    cover = len(inter) / min(len(sa), len(sb))
    jaccard = len(inter) / len(sa | sb)
    return cover * 0.7 + jaccard * 0.3


def header_key(value: str) -> str | None:
    folded = fold(value)
    for key, aliases in HEADER_ALIASES.items():
        if folded in aliases:
            return key
    return None


def colmap(headers: list) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for i, header in enumerate(headers):
        key = header_key(str(header or ""))
        if key and key not in mapping:
            mapping[key] = i
    return mapping


def is_si(value) -> bool:
    return fold(value) in SI_VALUES


def resolve_xlsx(raw: str) -> Path:
    given = Path(raw).expanduser()
    candidates = []
    if given.is_absolute():
        candidates.append(given)
    else:
        candidates.extend([
            Path.cwd() / given,
            CLUB_DIR / given,
            PERSONAL_DIR / given,
            DRIVE_CERTS_DIR.parent / given,
            DRIVE_CERTS_DIR / given,
        ])
    for path in candidates:
        if path.is_file():
            return path.resolve()
    # Try normalized unicode matching
    raw_norm = fold(raw)
    certs_parent = DRIVE_CERTS_DIR.parent
    if certs_parent.exists():
        for p in certs_parent.glob("**/*.xlsx"):
            if fold(p.name) == raw_norm or fold(str(p)).endswith(raw_norm):
                return p.resolve()
    raise FileNotFoundError(
        "No encuentro el archivo Excel. Se probó en:\n  " + "\n  ".join(str(p) for p in candidates)
    )


def load_cursos_dict() -> dict[str, dict]:
    if not CURSOS_JSON.is_file():
        return {}
    data = json.loads(CURSOS_JSON.read_text(encoding="utf-8"))
    return {c["id"]: c for c in data if c.get("id")}


def load_members() -> list[dict]:
    if not MEMBERS_JSON.is_file():
        return []
    raw = json.loads(MEMBERS_JSON.read_text(encoding="utf-8"))
    members = []
    for item in raw:
        correo = first_email(item.get("correo") or "")
        extra = [first_email(p) for p in re.split(r"[\s,;]+", str(item.get("correo") or ""))]
        emails = [e for e in [correo, *extra] if e]
        members.append(
            {
                "nombre": str(item.get("nombre") or "").strip(),
                "documento": digits(item.get("documento") or ""),
                "celular": digits(item.get("celular") or ""),
                "correo": correo,
                "emails": sorted(set(emails)),
                "cursos": set(item.get("cursos_participados") or []),
            }
        )
    return members


def infer_curso(xlsx: Path, cursos: dict[str, dict]) -> str:
    blob = fold(f"{xlsx.stem} {xlsx.parent.name}")
    ranked: list[tuple[int, str]] = []
    for curso_id, meta in cursos.items():
        nombre = fold(meta.get("nombre") or "")
        cid = fold(curso_id.replace("_", " "))
        if nombre and nombre in blob:
            ranked.append((len(nombre), curso_id))
        elif cid and cid in blob:
            ranked.append((len(cid), curso_id))
        else:
            token = cid.replace("masterclass ", "").strip()
            if token and token in blob:
                ranked.append((len(token), curso_id))
    if not ranked:
        for hint, curso_id in CURSO_HINTS:
            if hint in blob:
                ranked.append((len(hint), curso_id))
    if not ranked:
        raise SystemExit(
            f"No se pudo inferir el curso desde '{xlsx.name}'. Especifica --curso <id>\n"
            f"  Cursos disponibles: {', '.join(sorted(cursos))}"
        )
    ranked.sort(reverse=True)
    return ranked[0][1]


def read_certificados(xlsx: Path) -> tuple[list[dict], list[dict], int]:
    """Lee el Excel buscando la fila de encabezados con 'nombre' y 'certifica'.
    
    Devuelve (certified_people, not_certified_people, total_participants).
    """
    wb = load_workbook(xlsx, data_only=True, read_only=True)
    sheet = None
    for name in wb.sheetnames:
        if fold(name).startswith("certific"):
            sheet = wb[name]
            break
    if sheet is None:
        sheet = wb[wb.sheetnames[0]]

    rows_iter = sheet.iter_rows(values_only=True)
    header_row = None
    cols = {}
    
    # Scan first 50 rows for headers
    for r in rows_iter:
        if not r or not any(v is not None for v in r):
            continue
        c = colmap(list(r))
        if "nombre" in c and "certifica" in c:
            header_row = list(r)
            cols = c
            break

    if not cols:
        raise SystemExit(
            f"En la hoja '{sheet.title}' de {xlsx.name} no se encontraron los encabezados 'nombre' y 'certifica'."
        )

    def cell(row: tuple, key: str) -> str:
        idx = cols.get(key)
        if idx is None or idx >= len(row):
            return ""
        val = row[idx]
        return "" if val is None else str(val).strip()

    certified = []
    not_certified = []

    for row in rows_iter:
        if not row or not any(v not in (None, "") for v in row):
            continue
        nombre = nfc(cell(row, "nombre"))
        if not nombre or fold(nombre) in ("total", "promedio", "suma", "porcentaje"):
            continue
        # Avoid summary rows
        doc = digits(cell(row, "documento"))
        correo = first_email(cell(row, "correo"))
        cert_val = cell(row, "certifica")
        
        entry = {
            "nombre": nombre,
            "documento": doc,
            "correo": correo,
            "certifica_raw": cert_val,
        }

        if is_si(cert_val):
            certified.append(entry)
        else:
            not_certified.append(entry)

    total = len(certified) + len(not_certified)
    return certified, not_certified, total


def pick_member(nombre: str, documento: str, email: str, members: list[dict], curso_nombre: str) -> dict | None:
    scoped = [m for m in members if curso_nombre in m["cursos"]] or members
    if email:
        hits = [m for m in scoped if email in m["emails"] and name_score(nombre, m["nombre"]) >= 0.4]
        if hits:
            hits.sort(key=lambda m: name_score(nombre, m["nombre"]), reverse=True)
            return hits[0]
    if documento:
        hits = [
            m for m in scoped
            if (m["documento"] == documento or m["documento"].startswith(documento) or m["celular"] == documento)
            and name_score(nombre, m["nombre"]) >= 0.4
        ]
        if hits:
            hits.sort(key=lambda m: name_score(nombre, m["nombre"]), reverse=True)
            return hits[0]
    ranked = sorted(((name_score(nombre, m["nombre"]), m) for m in scoped), key=lambda x: x[0], reverse=True)
    good = [(s, m) for s, m in ranked if s >= 0.65]
    if good:
        return good[0][1]
    return None


def pick_pdf(person: dict, pdfs: list[Path]) -> Path | None:
    doc = person.get("documento", "")
    email = person.get("correo", "")
    nombre = person.get("nombre", "")

    # 1. Exact document match in filename
    if doc and len(doc) >= 5:
        for p in pdfs:
            if f"-{doc}-" in p.name or p.name.startswith(f"{doc}-") or f"-{doc}." in p.name:
                return p

    # 2. Exact email match in filename
    if email and "@" in email:
        for p in pdfs:
            if email.lower() in p.name.lower():
                return p

    # 3. Name score ranking
    ranked = sorted(((name_score(nombre, p.stem), p) for p in pdfs), key=lambda x: x[0], reverse=True)
    if ranked and ranked[0][0] >= 0.65:
        return ranked[0][1]

    return None


def copy_pdf(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Get Drive xattr from src if present
    src_drive_id = ""
    try:
        res = subprocess.run(["xattr", "-p", DRIVE_XATTR, str(src)], capture_output=True, text=True)
        if res.returncode == 0 and res.stdout.strip():
            src_drive_id = res.stdout.strip()
    except Exception:
        pass

    shutil.copyfile(src, dest)
    
    # If source had drive ID, write it to dest; otherwise clear xattr for DriveFS sync
    if src_drive_id:
        try:
            subprocess.run(["xattr", "-w", DRIVE_XATTR, src_drive_id, str(dest)], check=False, capture_output=True)
        except Exception:
            pass
    else:
        subprocess.run(["xattr", "-c", str(dest)], check=False, capture_output=True)


def update_cursos_json(curso_id: str, num_certificados: int, num_participantes: int) -> bool:
    if not CURSOS_JSON.exists():
        print(f"  [!] No existe {CURSOS_JSON}", file=sys.stderr)
        return False

    cursos = json.loads(CURSOS_JSON.read_text(encoding="utf-8"))
    updated = False
    for c in cursos:
        if c.get("id") == curso_id:
            old_certs = c.get("numero_certificados", 0)
            old_parts = c.get("numero_participantes", 0)
            c["numero_certificados"] = num_certificados
            if num_participantes > old_parts:
                c["numero_participantes"] = num_participantes
            updated = True
            print(f"  ✓ cursos.json actualizado para '{curso_id}':")
            print(f"    - Certificados: {old_certs} -> {c['numero_certificados']}")
            print(f"    - Participantes: {old_parts} -> {c['numero_participantes']}")
            break

    if updated:
        CURSOS_JSON.write_text(json.dumps(cursos, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        print(f"  [!] No se encontró el curso '{curso_id}' en cursos.json", file=sys.stderr)
    return updated


def run_post_updates():
    """Ejecuta enlazar_certificados, generar_stats y generar_maestro_excel."""
    enlazar_script = SCRIPT_DIR / "enlazar_certificados.py"
    if enlazar_script.exists():
        print("\n▶ Actualizando personal/certificados.csv con enlaces de Drive...")
        subprocess.run([sys.executable, str(enlazar_script)], check=False)

    stats_script = SCRIPT_DIR / "generar_stats.py"
    if stats_script.exists() and STATS_JSON.parent.exists():
        print("\n▶ Regenerando estadísticas públicas (stats.json)...")
        subprocess.run([sys.executable, str(stats_script), "--out", str(STATS_JSON)], check=False)

    maestro_script = SCRIPT_DIR / "generar_maestro_excel.py"
    if maestro_script.exists():
        print("\n▶ Actualizando Excel maestro de miembros...")
        subprocess.run([sys.executable, str(maestro_script)], check=False)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Lee la lista de certificaciones de un curso, actualiza cursos.json y copia diplomas a CertificadosPublicos."
    )
    parser.add_argument("excel", help="Ruta al archivo Excel de certificación (.xlsx)")
    parser.add_argument("--curso", help="id del curso en club/cursos.json (opcional, se infiere automáticamente)")
    parser.add_argument("--dry-run", action="store_true", help="Simula el proceso sin copiar archivos ni actualizar JSON")
    parser.add_argument("--force", action="store_true", help="Sobrescribe diplomas que ya existan en la carpeta pública")
    parser.add_argument("--skip-post", action="store_true", help="No ejecuta enlazar_certificados ni actualización de maestros")
    args = parser.parse_args()

    try:
        xlsx = resolve_xlsx(args.excel)
    except FileNotFoundError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    cursos = load_cursos_dict()
    curso_id = args.curso or infer_curso(xlsx, cursos)
    curso_meta = cursos.get(curso_id, {})
    curso_nombre = curso_meta.get("nombre", curso_id)

    src_dir = xlsx.parent
    certified_people, not_certified_people, total_participants = read_certificados(xlsx)
    pdfs = [p for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() == ".pdf" and not p.name.startswith(".")]
    members = load_members()

    print("=" * 70)
    print("PROCESAMIENTO DE CERTIFICACIONES")
    print("=" * 70)
    print(f"Archivo Excel:   {xlsx.name}")
    print(f"Ruta:            {xlsx}")
    print(f"Curso ID:        {curso_id} ({curso_nombre})")
    print(f"Inscritos total: {total_participants}")
    print(f"Certifican (SI): {len(certified_people)}")
    print(f"No certifican:   {len(not_certified_people)}")
    print(f"PDFs en carpeta: {len(pdfs)}")
    print(f"Destino público: {DRIVE_CERTS_DIR}")
    if args.dry_run:
        print("MODO:            DRY-RUN (solo simulación)")
    print("-" * 70)

    print("\nLista de personas que certifican:")
    for i, p in enumerate(certified_people, 1):
        print(f"  {i:2d}. {p['nombre']} (Doc: {p['documento'] or 'sin doc'}, Email: {p['correo'] or 'sin email'})")

    print("\nCopiando diplomas a CertificadosPublicos/...")
    copied = 0
    skipped = 0
    missing = 0

    for person in certified_people:
        member = pick_member(person["nombre"], person["documento"], person["correo"], members, curso_nombre)
        
        # Use clean doc from Excel if 6-10 digits, otherwise from member
        doc_candidate = person["documento"] or (member["documento"] if member else "") or (member["celular"] if member else "")
        email_candidate = person["correo"] or (member["correo"] if member else "")
        name_candidate = member["nombre"] if member else format_name(person["nombre"])

        pdf = pick_pdf(person, pdfs)
        if pdf is None:
            print(f"  [X] Sin PDF encontrado para: {person['nombre']}")
            missing += 1
            continue

        # If source PDF is already named standard CURSO-DOC-EMAIL-NOMBRE.pdf, preserve its clean stem
        if pdf.name.startswith(f"{curso_id}-"):
            target_filename = pdf.name
        else:
            target_filename = dest_name(curso_id, doc_candidate, email_candidate, name_candidate)

        dest_file = DRIVE_CERTS_DIR / target_filename

        if not args.force and dest_file.exists() and dest_file.stat().st_size > 1000:
            print(f"  [=] Ya existía: {dest_file.name}")
            skipped += 1
            continue

        print(f"  [+] Copiar: {pdf.name}")
        print(f"       -> {target_filename}")

        if not args.dry_run:
            copy_pdf(pdf, dest_file)
            size = dest_file.stat().st_size
            if size < 1000:
                print(f"       ⚠ Advertencia: tamaño inusualmente pequeño ({size} bytes)")

        copied += 1

    print("\nResumen de diplomas:")
    print(f"  Copiados:   {copied}{' (simulados)' if args.dry_run else ''}")
    print(f"  Ya estaban: {skipped}")
    print(f"  Sin PDF:    {missing}")

    if not args.dry_run:
        # Update cursos.json
        print("\nActualizando club/cursos.json...")
        update_cursos_json(curso_id, num_certificados=len(certified_people), num_participantes=total_participants)

        # Run post updates
        if not args.skip_post:
            run_post_updates()

    print("\n" + "=" * 70)
    print("PROCESO COMPLETADO EXITOSAMENTE")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())

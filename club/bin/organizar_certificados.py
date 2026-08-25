#!/usr/bin/env python3
"""Organiza certificados PDF en club/personal/certificados/.

Lee las carpetas de club/personal/certificados/fuentes/ (un folder por curso):
  - un PDF por persona → lo copia con nombre estándar
  - un PDF con todos → lo parte (una página = un diploma) y nombra cada uno

Nombre de salida:
  CURSO-CEDULA-EMAIL-NOMBRE COMPLETO.pdf
  (si no hay cédula, el segundo campo es el celular; si no hay ninguno, sincedula)

Uso:
    python3 club/bin/organizar_certificados.py
    python3 club/bin/organizar_certificados.py --curso rompecabezas_materia
    python3 club/bin/organizar_certificados.py --dry-run
    make -C club certificados
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import unicodedata
from pathlib import Path

from pypdf import PdfReader, PdfWriter

CLUB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSONAL_DIR = os.path.join(CLUB_DIR, "personal")
MEMBERS_JSON = os.path.join(PERSONAL_DIR, "drz-club-members.json")
CURSOS_JSON = os.path.join(CLUB_DIR, "cursos.json")
FUENTES_DIR = os.path.join(PERSONAL_DIR, "certificados", "fuentes")
DEST_DIR = os.path.join(PERSONAL_DIR, "certificados")

FOLDER_TO_CURSO = {
    "cuanticaapie-2024": "cuantica_a_pie",
    "catastrofisica-2024": "catastrofisica",
    "einsteinrelativamentefacil-2024": "einstein",
    "mundocuantico-2025": "mundo_cuantico",
    "rompecabezaamateria-2025": "rompecabezas_materia",
    "rompecabezasmateria-2025": "rompecabezas_materia",
    "pythonfinmundo-2026": "python_fin_mundo",
    "astropython-2025": "astropython",
    "masterclassextraterrestre-2026": "masterclass_extraterrestre",
}

BOILERPLATE = {
    "dr z academy",
    "dr z academy y el colegio la ensenanza certifican que",
    "certifica que",
    "certifican que",
    "identificado con cedula de ciudadania numero",
    "identificado con pasaporte",
    "identificado con",
    "asistio",
    "asistio al modulo",
    "asistio a el curso",
    "asistio el curso",
    "del diplomado de fronteras de la fisica",
    "realizado entre el",
    "con una duracion de",
    "jorge i zuluaga c",
    "jorge i zuluaga",
    "director academico y profesor del curso",
    "participacion",
    "destacada",
    "participacion destacada",
}

ILLEGAL = re.compile(r'[\\/:*?"<>|\n\r\t]')
EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
ID_RE = re.compile(
    r"\b((?:T\.?I\.?|C\.?C\.?|C\.?E\.?|PPT|P)?\s*\d{1,3}(?:[.\s]\d{3}){1,3}|(?:T\.?I\.?|C\.?C\.?|C\.?E\.?|PPT|P)?\d{6,14})\b",
    re.I,
)
NAME_NOISE = (
    "duracion",
    "asistio",
    "realizado",
    "modulo",
    "diplomado",
    "director",
    "horas",
    "identificad",
    "certifica",
    "ensenanza",
    "academy",
    "participacion",
    "destacada",
    "fronteras",
    "colegio",
    "semipresencial",
)


def fold(text: str) -> str:
    raw = unicodedata.normalize("NFKD", str(text or ""))
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    raw = raw.lower().replace("ñ", "n")
    raw = re.sub(r"[^a-z0-9@._+\-]+", " ", raw)
    return re.sub(r"\s+", " ", raw).strip()


def digits(text: str) -> str:
    return re.sub(r"\D", "", str(text or ""))


def first_email(value: str) -> str:
    for part in re.split(r"[\s,;]+", str(value or "").strip().lower()):
        if EMAIL_RE.fullmatch(part):
            return part
    found = EMAIL_RE.search(str(value or ""))
    return found.group(0).lower() if found else ""


def safe_part(text: str, fallback: str) -> str:
    value = ILLEGAL.sub(" ", str(text or "").strip())
    value = unicodedata.normalize("NFC", value)
    value = re.sub(r"\s+", " ", value).strip(" .-_")
    return value or fallback


def load_cursos() -> dict[str, dict]:
    data = json.loads(Path(CURSOS_JSON).read_text(encoding="utf-8"))
    return {c["id"]: c for c in data if c.get("id")}


def load_members() -> list[dict]:
    raw = json.loads(Path(MEMBERS_JSON).read_text(encoding="utf-8"))
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
                "nombre_fold": fold(item.get("nombre") or ""),
                "cursos": set(item.get("cursos_participados") or []),
            }
        )
    return members


def members_for_curso(members: list[dict], curso_nombre: str) -> list[dict]:
    return [m for m in members if curso_nombre in m["cursos"]]


def name_score(a: str, b: str) -> float:
    ta = [t for t in fold(a).split() if len(t) > 1]
    tb = [t for t in fold(b).split() if len(t) > 1]
    if not ta or not tb:
        return 0.0
    sa, sb = set(ta), set(tb)
    inter = sa & sb
    if not inter:
        return 0.0
    # prefer covering the shorter name
    cover = len(inter) / min(len(sa), len(sb))
    jaccard = len(inter) / len(sa | sb)
    return cover * 0.7 + jaccard * 0.3


def pick_member(candidates: list[dict], *, documento: str = "", emails: list[str] | None = None, nombre: str = "") -> dict | None:
    emails = [e.lower() for e in (emails or []) if e]
    if documento:
        hits = [m for m in candidates if m["documento"] and m["documento"] == documento]
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1 and nombre:
            hits.sort(key=lambda m: name_score(nombre, m["nombre"]), reverse=True)
            if name_score(nombre, hits[0]["nombre"]) >= 0.6:
                return hits[0]
        elif len(hits) > 1:
            return hits[0]
    if emails:
        hits = [m for m in candidates if set(m["emails"]) & set(emails)]
        if hits:
            return hits[0]
    if nombre:
        ranked = sorted(
            ((name_score(nombre, m["nombre"]), m) for m in candidates),
            key=lambda x: x[0],
            reverse=True,
        )
        good = [(s, m) for s, m in ranked if s >= 0.72]
        if not good:
            return None
        best = good[0][0]
        tight = [m for s, m in good if s >= best - 0.05]
        if len(tight) == 1:
            return tight[0]
        # unique best score
        if good[0][0] > (good[1][0] if len(good) > 1 else 0) + 0.08:
            return good[0][1]
    return None


def extract_from_text(text: str) -> tuple[str, str]:
    """Return (documento, nombre) guessed from diploma text."""
    documento = ""
    ids = []
    for match in ID_RE.finditer(text.replace("\u00a0", " ")):
        token = re.sub(r"[\s.]", "", match.group(1)).upper()
        d = digits(token)
        if 6 <= len(d) <= 14 and not (len(d) == 4 and d.startswith("20")):
            ids.append(token if re.search(r"[A-Z]", token) else d)
    if ids:
        ids.sort(key=lambda t: (len(digits(t)), len(t)), reverse=True)
        documento = ids[0]

    lines = [re.sub(r"\s+", " ", ln).strip(" :") for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    candidates = []
    for ln in lines:
        folded = fold(ln)
        if not folded or folded in BOILERPLATE:
            continue
        if any(noise in folded for noise in NAME_NOISE):
            continue
        if EMAIL_RE.search(ln):
            continue
        letters = re.sub(r"[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\- ]", "", ln)
        words = [w for w in letters.replace("-", " ").split() if len(w) > 1]
        if len(words) < 2:
            continue
        candidates.append(ln)

    nombre = ""
    joined = fold(text)
    # Prefer the line right after "certifican que" / "certifica que"
    for i, ln in enumerate(lines):
        fl = fold(ln)
        if "certifican que" in fl or fl.endswith("certifica que"):
            for nxt in lines[i + 1 : i + 4]:
                if nxt in candidates:
                    nombre = nxt
                    break
            if nombre:
                break
    if not nombre and candidates:
        candidates.sort(key=lambda s: (len(s.split()), len(s)), reverse=True)
        nombre = candidates[0]
    return documento, nombre


def is_combined(path: Path, n_files_in_folder: int) -> bool:
    if path.suffix.lower() != ".pdf" and not path.name.lower().endswith(".pdf"):
        # odd names still readable as pdf
        pass
    try:
        pages = len(PdfReader(str(path)).pages)
    except Exception:
        return False
    name = fold(path.stem)
    if pages > 1:
        return True
    if n_files_in_folder == 1 and ("diploma" in name or "diplomas" in name or "certificado" in name):
        return True
    return False


def dest_name(curso_id: str, member: dict | None, documento: str, email: str, nombre: str) -> str:
    celular = ""
    if member:
        documento = member["documento"] or documento
        email = member["correo"] or email
        nombre = member["nombre"] or nombre
        celular = member.get("celular") or ""
    curso = safe_part(curso_id, "curso")
    doc = safe_part(documento or celular, "sincedula")
    mail = safe_part(email.lower() if email else "", "sincorreo")
    nom = safe_part(nombre.title() if nombre.islower() else nombre, "sinnombre")
    # keep member name casing if we have it
    if member and member["nombre"]:
        nom = safe_part(member["nombre"], "sinnombre")
    return f"{curso}-{doc}-{mail}-{nom}.pdf"


def unique_path(dest_dir: Path, filename: str) -> Path:
    base = dest_dir / filename
    if not base.exists():
        return base
    stem = Path(filename).stem
    n = 2
    while True:
        candidate = dest_dir / f"{stem}-{n}.pdf"
        if not candidate.exists():
            return candidate
        n += 1


def write_page(reader: PdfReader, index: int, dest: Path) -> None:
    writer = PdfWriter()
    writer.add_page(reader.pages[index])
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as fh:
        writer.write(fh)


def copy_pdf(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def process_folder(folder: Path, curso_id: str, curso_nombre: str, members: list[dict], dest_dir: Path, dry_run: bool) -> list[dict]:
    files = [p for p in folder.iterdir() if p.is_file() and not p.name.startswith(".")]
    scoped = members_for_curso(members, curso_nombre) or members
    report = []
    combined = [p for p in files if is_combined(p, len(files))]
    singles = [p for p in files if p not in combined]

    for src in sorted(singles, key=lambda p: p.name.lower()):
        stem = src.stem if src.suffix.lower() == ".pdf" else src.name.rstrip("._")
        emails = [m.group(0).lower() for m in EMAIL_RE.finditer(stem)]
        nombre_file = EMAIL_RE.sub("", stem).replace("_", " ").strip(" .")
        documento, nombre_pdf = "", ""
        try:
            text = PdfReader(str(src)).pages[0].extract_text() or ""
            documento, nombre_pdf = extract_from_text(text)
        except Exception:
            text = ""
        nombre = nombre_file if (nombre_file and not emails) else (nombre_pdf or nombre_file)
        member = (
            pick_member(scoped, documento=digits(documento), emails=emails, nombre=nombre_file or nombre)
            or pick_member(scoped, documento=digits(documento), emails=emails, nombre=nombre_pdf)
            or pick_member(members, documento=digits(documento), emails=emails, nombre=nombre_file or nombre)
            or pick_member(members, documento=digits(documento), emails=emails, nombre=nombre_pdf)
        )
        filename = dest_name(curso_id, member, documento, emails[0] if emails else "", nombre)
        dest = unique_path(dest_dir, filename) if not dry_run else dest_dir / filename
        how = "member" if member else "pdf-only"
        report.append({"src": str(src.relative_to(folder.parent)), "dest": dest.name, "how": how, "kind": "single"})
        if not dry_run:
            copy_pdf(src, dest)

    for src in sorted(combined, key=lambda p: p.name.lower()):
        reader = PdfReader(str(src))
        used = set()
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if len(text.strip()) < 40 or fold(text) in {"no van", "blank"}:
                report.append(
                    {
                        "src": f"{src.relative_to(folder.parent)}#p{i+1}",
                        "dest": "",
                        "how": "skipped",
                        "kind": "split",
                        "nombre_pdf": text.strip()[:40],
                        "documento_pdf": "",
                    }
                )
                continue
            documento, nombre = extract_from_text(text)
            member = (
                pick_member(scoped, documento=digits(documento), nombre=nombre)
                or pick_member(members, documento=digits(documento), nombre=nombre)
            )
            if member and id(member) in used:
                # same person twice: still write, unique_path will suffix
                pass
            if member:
                used.add(id(member))
            filename = dest_name(curso_id, member, documento, "", nombre)
            dest = unique_path(dest_dir, filename) if not dry_run else dest_dir / filename
            how = "member" if member else "pdf-only"
            report.append(
                {
                    "src": f"{src.relative_to(folder.parent)}#p{i+1}",
                    "dest": dest.name,
                    "how": how,
                    "kind": "split",
                    "nombre_pdf": nombre,
                    "documento_pdf": documento,
                }
            )
            if not dry_run:
                write_page(reader, i, dest)
    return report


def resolve_curso_id(folder_name: str, cursos: dict[str, dict]) -> str | None:
    key = fold(folder_name).replace(" ", "")
    if key in FOLDER_TO_CURSO:
        return FOLDER_TO_CURSO[key]
    for cid, meta in cursos.items():
        if fold(cid).replace("_", "") in key.replace("-", ""):
            return cid
        if fold(meta.get("nombre") or "").replace(" ", "") in key:
            return cid
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Organiza certificados PDF del Club")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--curso", help="Solo este curso_id (ej. rompecabezas_materia)")
    args = parser.parse_args()

    fuentes = Path(FUENTES_DIR)
    dest = Path(DEST_DIR)
    if not fuentes.is_dir():
        print(f"No está {fuentes}", file=sys.stderr)
        return 1
    cursos = load_cursos()
    members = load_members()
    only = (args.curso or "").strip()

    if not args.dry_run:
        dest.mkdir(parents=True, exist_ok=True)
        pattern = f"{only}-*.pdf" if only else "*.pdf"
        for old in dest.glob(pattern):
            old.unlink()

    reports: list[dict] = []
    folders = [p for p in sorted(fuentes.iterdir()) if p.is_dir()]
    if not folders:
        print(f"No hay carpetas de curso en {fuentes}", file=sys.stderr)
        return 1

    for folder in folders:
        curso_id = resolve_curso_id(folder.name, cursos)
        if not curso_id:
            print(f"⚠  No supe el curso de {folder.name}, se omite")
            continue
        if only and curso_id != only:
            continue
        nombre = cursos[curso_id]["nombre"]
        print(f"▶  {folder.name} → {curso_id} ({nombre})")
        reports.extend(process_folder(folder, curso_id, nombre, members, dest, args.dry_run))

    if only and not reports:
        print(f"No se procesó nada para --curso {only}", file=sys.stderr)
        return 1

    matched = sum(1 for r in reports if r["how"] == "member")
    skipped = [r for r in reports if r["how"] == "skipped"]
    written = [r for r in reports if r["how"] != "skipped"]
    split_n = sum(1 for r in written if r["kind"] == "split")
    single_n = sum(1 for r in written if r["kind"] == "single")
    print()
    print(f"  Archivos individuales: {single_n}")
    print(f"  Páginas partidas:      {split_n}")
    print(f"  Cruzados con la base:  {matched}/{len(written)}")
    if skipped:
        print(f"  Páginas omitidas:      {len(skipped)}")
        for r in skipped:
            print(f"    {r['src']} ({r.get('nombre_pdf','')})")
    unmatched = [r for r in written if r["how"] != "member"]
    if unmatched:
        print("  Sin miembro (se nombró con lo que decía el PDF):")
        for r in unmatched:
            extra = f"  [{r.get('nombre_pdf','')} {r.get('documento_pdf','')}]".rstrip()
            print(f"    {r['src']} → {r['dest']}{extra}")
    if args.dry_run:
        print("  (dry-run: no se escribió nada)")
    else:
        print(f"  Destino: {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

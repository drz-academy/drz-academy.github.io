#!/usr/bin/env python3
"""Genera personal/certificados.csv con enlaces de Google Drive.

Lee los PDF en personal/ClubDrZAcademy/Certificados (Drive para escritorio),
saca el file id de los xattr, y escribe una fila por diploma.

Si el nombre dice sincedula y el miembro tiene celular, renombra el archivo
(en Drive y en personal/certificados/) poniendo el celular en ese campo.

Uso:
    python3 club/bin/enlazar_certificados.py
    python3 club/bin/enlazar_certificados.py --dry-run
    make -C club certificados-drive
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import config

CLUB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSONAL_DIR = os.path.join(CLUB_DIR, "personal")
INFO_DIR = config.get_info_dir(CLUB_DIR)
MEMBERS_JSON = os.path.join(INFO_DIR, "drz-club-members.json")
CSV_PATH = os.path.join(PERSONAL_DIR, "certificados.csv")
DRIVE_DIR = os.path.join(PERSONAL_DIR, "ClubDrZAcademy", "Certificados")
LOCAL_DIR = os.path.join(PERSONAL_DIR, "certificados")
INSCRIPCIONES_DIR = os.path.join(PERSONAL_DIR, "inscripciones")
DRIVE_XATTR = "com.google.drivefs.item-id#S"

EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)


def fold(text: str) -> str:
    raw = unicodedata.normalize("NFKD", str(text or ""))
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    raw = raw.lower().replace("ñ", "n")
    raw = re.sub(r"[^a-z0-9@._+\-]+", " ", raw)
    return re.sub(r"\s+", " ", raw).strip()


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", str(text or ""))


def digits(text: str) -> str:
    raw = str(text or "").strip()
    try:
        val = float(raw)
        if val > 1e9:
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


def drive_id(path: Path) -> str:
    result = subprocess.run(
        ["xattr", "-p", DRIVE_XATTR, str(path)],
        capture_output=True,
        text=True,
    )
    return (result.stdout or "").strip() if result.returncode == 0 else ""


def drive_url(file_id: str) -> str:
    return f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"


def parse_filename(name: str) -> dict | None:
    stem = name[:-4] if name.lower().endswith(".pdf") else name
    parts = stem.split("-")
    if len(parts) < 4:
        return None
    curso = parts[0]
    doc = parts[1]
    rest = parts[2:]
    email_idx = next(
        (i for i, part in enumerate(rest) if part.lower() == "sincorreo" or "@" in part),
        None,
    )
    if email_idx is None:
        return None
    email_raw = rest[email_idx]
    nombre = "-".join(rest[email_idx + 1 :]).strip()
    email = "" if email_raw.lower() == "sincorreo" else email_raw.lower()
    return {
        "curso_id": curso,
        "doc_slot": doc,
        "correo": email,
        "nombre": nombre,
    }


def load_cuantica_phones() -> dict[str, str]:
    """email → celular from the Cuántica a Pie Google Form."""
    candidates = [
        Path(INSCRIPCIONES_DIR) / "Curso Cuántica a Pie - Inscripción (Responses).xlsx",
        Path(PERSONAL_DIR) / "Curso Cuántica a Pie - Inscripción (Responses).xlsx",
    ]
    path = next((p for p in candidates if p.exists()), None)
    if not path:
        return {}
    try:
        import pandas as pd
    except ImportError:
        return {}
    by_email: dict[str, str] = {}

    def add(email, phone):
        mail = first_email(email)
        cel = digits(phone)
        if mail and cel:
            by_email.setdefault(mail, cel)

    try:
        df = pd.read_excel(path, sheet_name="Form Responses 1")
        for _, row in df.iterrows():
            add(row.get("Correo electrónico"), row.get("Número celular para contacto y WhatsApp"))
    except Exception:
        pass
    try:
        df = pd.read_excel(path, sheet_name="LISTADO PARTICIPANTES", header=1)
        for _, row in df.iterrows():
            add(row.get("E-mail"), row.get("Celular"))
    except Exception:
        pass
    return by_email


def load_members() -> list[dict]:
    raw = json.loads(Path(MEMBERS_JSON).read_text(encoding="utf-8"))
    members = []
    for item in raw:
        correo = first_email(item.get("correo") or "")
        extra = [first_email(p) for p in re.split(r"[\s,;]+", str(item.get("correo") or ""))]
        members.append(
            {
                "nombre": str(item.get("nombre") or "").strip(),
                "documento": digits(item.get("documento") or ""),
                "correo": correo,
                "emails": sorted({e for e in [correo, *extra] if e}),
                "celular": digits(item.get("celular") or ""),
            }
        )
    return members


def pick_member(members: list[dict], parsed: dict) -> dict | None:
    correo = parsed.get("correo") or ""
    if correo:
        hits = [m for m in members if correo in m["emails"]]
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1:
            hits.sort(key=lambda m: name_score(parsed.get("nombre") or "", m["nombre"]), reverse=True)
            return hits[0]
    doc = digits(parsed.get("doc_slot") or "")
    if doc and parsed.get("doc_slot", "").lower() != "sincedula":
        hits = [m for m in members if m["documento"] == doc or m["celular"] == doc]
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1:
            hits.sort(key=lambda m: name_score(parsed.get("nombre") or "", m["nombre"]), reverse=True)
            if name_score(parsed.get("nombre") or "", hits[0]["nombre"]) >= 0.5:
                return hits[0]
    nombre = parsed.get("nombre") or ""
    if nombre:
        ranked = sorted(
            ((name_score(nombre, m["nombre"]), m) for m in members),
            key=lambda x: x[0],
            reverse=True,
        )
        good = [(s, m) for s, m in ranked if s >= 0.72]
        with_data = [(s, m) for s, m in good if m["documento"] or m["celular"] or m["correo"]]
        pool = with_data or good
        if pool:
            best = pool[0][0]
            tight = [m for s, m in pool if s >= best - 0.05]
            if len(tight) == 1:
                return tight[0]
            if len(pool) == 1 or best > (pool[1][0] if len(pool) > 1 else 0) + 0.08:
                return pool[0][1]
    return None


def find_same_name(folder: Path, filename: str) -> Path | None:
    target = nfc(filename)
    if not folder.is_dir():
        return None
    for path in folder.glob("*.pdf"):
        if nfc(path.name) == target:
            return path
    return None


def rename_keep_id(src: Path, new_name: str) -> Path:
    dest = src.with_name(new_name)
    if nfc(src.name) == nfc(new_name):
        return src
    if dest.exists() and nfc(dest.name) != nfc(src.name):
        raise FileExistsError(str(dest))
    src.rename(dest)
    return dest


def main() -> int:
    parser = argparse.ArgumentParser(description="Enlaza certificados de Drive al CSV del Club")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    drive = Path(DRIVE_DIR)
    if not drive.is_dir():
        print(f"No está la carpeta de Drive: {drive}", file=sys.stderr)
        return 1

    members = load_members()
    cuantica_phones = load_cuantica_phones()
    rows = []
    renamed = 0
    missing_id = 0
    still_sincedula = []

    files = sorted((p for p in drive.glob("*.pdf") if not p.name.startswith(".")), key=lambda p: nfc(p.name).lower())
    for src in files:
        parsed = parse_filename(src.name)
        if not parsed:
            print(f"⚠  Nombre raro, se omite: {src.name}")
            continue
        file_id = drive_id(src)
        if not file_id:
            missing_id += 1
            print(f"⚠  Sin ID de Drive: {src.name}")
            continue
        member = pick_member(members, parsed)
        doc_slot = parsed["doc_slot"]
        correo = ((member["correo"] if member else "") or parsed["correo"] or "").lower()
        documento = (member["documento"] if member else "") or (
            digits(doc_slot) if doc_slot.lower() not in {"sincedula", "sincorreo", "hotmart"} else ""
        )
        celular = (member["celular"] if member else "") or cuantica_phones.get(parsed["correo"] or "", "")
        archivo = src.name
        if doc_slot.lower() == "sincedula" and celular:
            new_name = src.name.replace("-sincedula-", f"-{celular}-", 1)
            if not args.dry_run:
                old_name = src.name
                src = rename_keep_id(src, new_name)
                local_old = find_same_name(Path(LOCAL_DIR), old_name)
                if local_old is not None:
                    rename_keep_id(local_old, new_name)
            archivo = new_name
            doc_slot = celular
            renamed += 1
            print(f"  sincedula → {celular}  {nfc(new_name)}")
        elif doc_slot.lower() == "sincedula":
            still_sincedula.append(nfc(src.name))

        if not celular and doc_slot.lower() not in {"sincedula", "sincorreo", "hotmart"}:
            maybe_phone = digits(doc_slot)
            if maybe_phone and not documento:
                celular = maybe_phone

        rows.append(
            {
                "documento": documento,
                "correo": correo,
                "celular": celular,
                "curso_id": parsed["curso_id"],
                "url": drive_url(file_id),
                "archivo": archivo,
            }
        )

    rows.sort(key=lambda r: (r["curso_id"], r["correo"] or r["documento"], r["archivo"]))

    if not args.dry_run:
        Path(CSV_PATH).parent.mkdir(parents=True, exist_ok=True)
        with Path(CSV_PATH).open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(
                fh,
                fieldnames=["documento", "correo", "celular", "curso_id", "url", "archivo"],
            )
            writer.writeheader()
            writer.writerows(rows)

    by_curso: dict[str, int] = {}
    with_url = sum(1 for r in rows if r["url"])
    for row in rows:
        by_curso[row["curso_id"]] = by_curso.get(row["curso_id"], 0) + 1

    print()
    print(f"  Diplomas en Drive:     {len(files)}")
    print(f"  Filas en CSV:          {len(rows)} ({with_url} con enlace)")
    print(f"  Renombrados sincedula: {renamed}")
    if missing_id:
        print(f"  Sin ID de Drive:       {missing_id}")
    for curso_id, n in sorted(by_curso.items()):
        print(f"    {curso_id}: {n}")
    if still_sincedula:
        print(f"  Siguen sincedula (no hay celular en la base): {len(still_sincedula)}")
        for name in still_sincedula:
            print(f"    {name}")
    if args.dry_run:
        print("  (dry-run: no se escribió CSV, ni se renombró, ni se actualizó cursos.json)")
    else:
        print(f"  CSV: {CSV_PATH}")
        # Actualizar cursos.json con los nuevos conteos
        cursos_json_path = Path(CLUB_DIR) / "cursos.json"
        if cursos_json_path.exists():
            cursos_data = json.loads(cursos_json_path.read_text(encoding="utf-8"))
            changed = False
            for c in cursos_data:
                cid = c.get("id")
                if cid and not c.get("next_course"):
                    nuevo_conteo = by_curso.get(cid, 0)
                    if c.get("numero_certificados") != nuevo_conteo:
                        c["numero_certificados"] = nuevo_conteo
                        changed = True
            if changed:
                cursos_json_path.write_text(json.dumps(cursos_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                print("  cursos.json: actualizado con los nuevos conteos de certificados")
    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())

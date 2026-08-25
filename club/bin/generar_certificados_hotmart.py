#!/usr/bin/env python3
"""Genera avisos PDF de Hotmart para quienes aún no tienen uno.

Cursos actuales: astropython y cuantica_a_pie_permanente.
Si más adelante hay otro curso permanente, basta con:
  1. poner hotmart_url en club/cursos.json
  2. guardar club/personal/<curso_id>.csv (export de Hotmart)

Cada corrida solo crea PDF nuevos (por correo). No borra ni reescribe
los que ya están, salvo que pases --force.

Uso:
    python3 club/bin/generar_certificados_hotmart.py
    python3 club/bin/generar_certificados_hotmart.py --curso astropython
    python3 club/bin/generar_certificados_hotmart.py --force
    make -C club certificados-hotmart
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from io import BytesIO
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

CLUB_DIR = Path(__file__).resolve().parent.parent
REPO = CLUB_DIR.parent
PERSONAL = CLUB_DIR / "personal"
CURSOS_JSON = CLUB_DIR / "cursos.json"
DRIVE_DIR = PERSONAL / "ClubDrZAcademy" / "Certificados"
LOGO = REPO / "assets" / "DrZ-Logos" / "logo-firma.webp"

PAGE_W, PAGE_H = letter
LINK_BLUE = HexColor("#0B57D0")

pdfmetrics.registerFont(TTFont("Arial", "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))

EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
ILLEGAL = re.compile(r'[\\/:*?"<>|\n\r\t]')


def first_email(value: str) -> str:
    found = EMAIL_RE.search(str(value or ""))
    return found.group(0).lower() if found else ""


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", str(text or ""))


def safe_part(text: str, fallback: str) -> str:
    value = ILLEGAL.sub(" ", str(text or "").strip())
    value = nfc(value)
    value = re.sub(r"\s+", " ", value).strip(" .-_")
    return value or fallback


def format_name(name: str) -> str:
    value = re.sub(r"\s+", " ", str(name or "").strip())
    words = value.split()
    messy = value.isupper() or value.islower() or sum(1 for w in words if w.islower()) >= 2
    if messy:
        value = value.title()
    return value


def load_cursos_list() -> list[dict]:
    return json.loads(CURSOS_JSON.read_text(encoding="utf-8"))


def load_cursos() -> dict[str, dict]:
    return {str(item.get("id") or ""): item for item in load_cursos_list()}


def csv_path_for(curso_id: str) -> Path | None:
    names = [f"{curso_id}.csv", f"{curso_id}_permanente.csv"]
    if curso_id.endswith("_permanente"):
        names.append(f"{curso_id[: -len('_permanente')]}.csv")
    seen: set[str] = set()
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        path = PERSONAL / name
        if path.exists():
            return path
    return None


def discover_cursos(cursos: dict[str, dict]) -> list[str]:
    found = []
    for curso_id, meta in cursos.items():
        if not curso_id:
            continue
        if not str(meta.get("hotmart_url") or "").strip():
            continue
        if csv_path_for(curso_id):
            found.append(curso_id)
    return found


def logo_reader() -> ImageReader:
    im = Image.open(LOGO).convert("RGBA")
    buf = BytesIO()
    im.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def fit_font(c: canvas.Canvas, text: str, font: str, max_size: float, max_width: float) -> float:
    size = max_size
    while size >= 9 and c.stringWidth(text, font, size) > max_width:
        size -= 0.5
    return size


def draw_notice(
    dest: Path,
    nombre: str,
    correo: str,
    curso_nombre: str,
    hotmart_url: str,
    logo: ImageReader,
) -> None:
    c = canvas.Canvas(str(dest), pagesize=(PAGE_W, PAGE_H))
    c.setFillColor(white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    c.drawImage(logo, PAGE_W / 2 - 36, PAGE_H - 118, width=72, height=72, mask="auto")
    c.setFillColor(black)
    c.setFont("Arial", 11)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 138, "Dr. Z Academy")
    c.setFont("Arial", 10)
    c.setFillColor(HexColor("#555555"))
    c.drawCentredString(PAGE_W / 2, PAGE_H - 154, curso_nombre)

    mid = PAGE_H / 2 + 24
    c.setFillColor(black)
    name_size = fit_font(c, nombre, "Arial-Bold", 20, PAGE_W - 80)
    c.setFont("Arial-Bold", name_size)
    c.drawCentredString(PAGE_W / 2, mid, nombre)
    mail_size = fit_font(c, correo, "Arial", 12, PAGE_W - 80)
    c.setFont("Arial", mail_size)
    c.drawCentredString(PAGE_W / 2, mid - 26, correo)

    c.setFont("Arial", 12)
    c.drawCentredString(PAGE_W / 2, mid - 72, "El certificado oficial está disponible en:")
    url_size = fit_font(c, hotmart_url, "Arial", 11, PAGE_W - 72)
    c.setFillColor(LINK_BLUE)
    c.setFont("Arial", url_size)
    c.drawCentredString(PAGE_W / 2, mid - 94, hotmart_url)
    c.linkURL(hotmart_url, (36, mid - 108, PAGE_W - 36, mid - 78), relative=0)
    c.save()


def read_students(path: Path) -> list[dict]:
    rows = []
    seen = set()
    with path.open(encoding="utf-8-sig", newline="") as fh:
        sample = fh.read(2048)
        fh.seek(0)
        delimiter = ";" if sample.count(";") >= sample.count(",") else ","
        reader = csv.DictReader(fh, delimiter=delimiter)
        for row in reader:
            nombre = format_name(row.get("Nombre") or row.get("nombre") or "")
            correo = first_email(row.get("Email") or row.get("email") or row.get("correo") or "")
            if not nombre or not correo or correo in seen:
                continue
            seen.add(correo)
            rows.append({"nombre": nombre, "correo": correo})
    return rows


def dest_name(curso_id: str, nombre: str, correo: str) -> str:
    return (
        f"{curso_id}-hotmart-"
        f"{safe_part(correo, 'sincorreo')}-"
        f"{safe_part(nombre, 'sinnombre')}.pdf"
    )


def email_from_filename(name: str) -> str:
    stem = name[:-4] if name.lower().endswith(".pdf") else name
    if "-hotmart-" in stem:
        stem = stem.split("-hotmart-", 1)[1]
    return first_email(stem)


def existing_by_email(curso_id: str) -> dict[str, Path]:
    found: dict[str, Path] = {}
    if not DRIVE_DIR.is_dir():
        return found
    for path in DRIVE_DIR.glob(f"{curso_id}-hotmart-*.pdf"):
        correo = email_from_filename(path.name)
        if correo:
            found[correo] = path
    return found


def count_hotmart_pdfs(curso_id: str) -> int:
    if not DRIVE_DIR.is_dir():
        return 0
    return sum(1 for _ in DRIVE_DIR.glob(f"{curso_id}-hotmart-*.pdf"))


def update_cert_count(curso_id: str, count: int) -> None:
    data = load_cursos_list()
    changed = False
    for item in data:
        if item.get("id") == curso_id and item.get("numero_certificados") != count:
            item["numero_certificados"] = count
            changed = True
    if changed:
        CURSOS_JSON.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


def generate_curso(
    curso_id: str,
    cursos: dict[str, dict],
    logo: ImageReader,
    dry_run: bool,
    force: bool,
) -> int:
    path = csv_path_for(curso_id)
    meta = cursos.get(curso_id) or {}
    hotmart_url = str(meta.get("hotmart_url") or "").strip()
    curso_nombre = str(meta.get("nombre") or curso_id).strip()
    if path is None:
        print(f"⚠  No está el CSV de {curso_id} en club/personal/")
        return 0
    if not hotmart_url:
        print(f"⚠  {curso_id} no tiene hotmart_url en cursos.json")
        return 0

    students = read_students(path)
    already = existing_by_email(curso_id)
    created = 0
    skipped = 0
    print(f"▶  {curso_nombre}: {len(students)} en {path.name}, {len(already)} PDF actuales")
    DRIVE_DIR.mkdir(parents=True, exist_ok=True)

    for person in students:
        filename = dest_name(curso_id, person["nombre"], person["correo"])
        dest = DRIVE_DIR / filename
        exists = person["correo"] in already
        if exists and not force:
            skipped += 1
            continue
        print(f"  {'reescritura' if exists else 'nuevo'}  {filename}")
        if not dry_run:
            draw_notice(dest, person["nombre"], person["correo"], curso_nombre, hotmart_url, logo)
        created += 1

    total = count_hotmart_pdfs(curso_id) if not dry_run else len(already) + created
    if not dry_run:
        update_cert_count(curso_id, total)
    print(f"  nuevos={created}  ya existían={skipped}  total PDF={total}")
    return created


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Crea avisos PDF de Hotmart solo para quienes aún no tienen uno"
    )
    parser.add_argument("--curso", help="astropython, cuantica_a_pie_permanente, …")
    parser.add_argument("--force", action="store_true", help="Reescribe los PDF que ya existen")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cursos = load_cursos()
    available = discover_cursos(cursos)
    if args.curso:
        if args.curso not in cursos:
            print(f"Curso desconocido: {args.curso}")
            return 1
        targets = [args.curso]
    else:
        targets = available
    if not targets:
        print("No hay cursos con hotmart_url y CSV en club/personal/<curso_id>.csv")
        return 1

    logo = logo_reader()
    created = 0
    for curso_id in targets:
        created += generate_curso(curso_id, cursos, logo, args.dry_run, args.force)
    if args.dry_run:
        print("  (dry-run: no se escribió nada)")
    else:
        print(f"  Destino: {DRIVE_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

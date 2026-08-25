#!/usr/bin/env python3
"""Envía los boletines HTML de club/personal/boletines/.

Uso (desde personal/boletines o desde el repo):

  python3 enviar.py --dry-run
  python3 enviar.py --prueba tucorreo@gmail.com
  python3 enviar.py --prueba tucorreo@gmail.com --correo puntobernal@gmail.com
  python3 enviar.py --categoria ORO
  python3 enviar.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def find_repo() -> Path:
    here = Path(__file__).resolve().parent
    for path in [here, *here.parents]:
        if (path / "notify" / "client" / "course_notify_gmail.py").is_file():
            return path
    raise SystemExit("No se encontró el repositorio (notify/client/course_notify_gmail.py).")


def boletines_dir(repo: Path) -> Path:
    here = Path(__file__).resolve().parent
    if (here / "index.json").is_file():
        return here
    path = repo / "club" / "personal" / "boletines"
    if (path / "index.json").is_file():
        return path
    raise SystemExit(f"No hay index.json en {here} ni en {path}. Genera primero: make club-boletines")


def load_index(folder: Path) -> dict:
    data = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        raise SystemExit("index.json inválido.")
    return data


def select_items(items: list, *, correo: str, categoria: str) -> list:
    selected = items
    if categoria:
        cat = categoria.strip().upper()
        selected = [it for it in selected if str(it.get("categoria") or "").upper() == cat]
    if correo:
        want = correo.strip().lower()
        selected = [it for it in selected if str(it.get("correo") or "").strip().lower() == want]
    return selected


def read_html(folder: Path, item: dict) -> str:
    rel = str(item.get("archivo") or "").strip()
    path = folder / rel
    if not path.is_file():
        raise SystemExit(f"No está el HTML: {path}")
    return path.read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Enviar boletines personalizados del Club")
    parser.add_argument("--prueba", default="", help="Enviar a este correo (no al de cada miembro)")
    parser.add_argument("--correo", default="", help="Solo el boletín de este miembro")
    parser.add_argument("--categoria", default="", help="Solo ORO, PLATA o BRONCE")
    parser.add_argument("--dry-run", action="store_true", help="Lista destinatarios, no envía")
    parser.add_argument("--limite", type=int, default=0, help="Máximo de correos a enviar (0 = todos)")
    args = parser.parse_args()

    repo = find_repo()
    sys.path.insert(0, str(repo / "notify" / "client"))
    from course_notify_gmail import send_gmail_bulk

    folder = boletines_dir(repo)
    index = load_index(folder)
    items = select_items(index.get("items") or [], correo=args.correo, categoria=args.categoria)
    if args.limite and args.limite > 0:
        items = items[: args.limite]
    if not items:
        print("No hay boletines que coincidan.")
        return 1

    prueba = args.prueba.strip()
    messages = []
    for item in items:
        html = read_html(folder, item)
        to_addr = prueba or str(item.get("correo") or "").strip()
        subject = str(item.get("asunto") or "").strip()
        if prueba:
            subject = f"[PRUEBA] {subject}"
        messages.append({"to": to_addr, "subject": subject, "html": html, "unsub": ""})

    print(f"Carpeta: {folder}")
    print(f"Boletines: {len(messages)}")
    for item, msg in zip(items, messages):
        orig = str(item.get("correo") or "")
        dest = msg["to"]
        extra = f" → {dest}" if prueba and dest != orig else ""
        print(f"  {item.get('categoria')}  {item.get('nombre')} <{orig}>{extra}")

    if args.dry_run:
        print("\nDry-run: no se envió nada.")
        return 0

    if not prueba:
        confirm = input(f"\n¿Enviar {len(messages)} correo(s) reales? (y/N): ")
        if confirm.strip().lower() != "y":
            print("Envío cancelado.")
            return 0
    else:
        print(f"\nModo prueba: todos salen hacia {prueba}.")

    log_path = folder / ".enviados.log"
    already = set()
    if log_path.exists() and not prueba:
        already = {line.strip() for line in log_path.read_text(encoding="utf-8").splitlines() if line.strip()}
        before = len(messages)
        kept = []
        kept_items = []
        for item, msg in zip(items, messages):
            key = str(item.get("correo") or "").strip().lower()
            if key in already:
                continue
            kept.append(msg)
            kept_items.append(item)
        skipped = before - len(kept)
        if skipped:
            print(f"Se saltan {skipped} ya enviados ({log_path.name}).")
        messages, items = kept, kept_items
        if not messages:
            print("Nada pendiente por enviar.")
            return 0

    def on_progress(email: str, success: bool, error: str | None):
        if success:
            print(f"  ✓  {email}")
            if not prueba:
                with log_path.open("a", encoding="utf-8") as log:
                    log.write(email.strip().lower() + "\n")
        else:
            print(f"  ✗  {email}: {error}")

    sent = send_gmail_bulk(messages=messages, progress_callback=on_progress)
    print(f"\nEnviados: {len(sent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

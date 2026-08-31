#!/usr/bin/env python3
"""Descarga respuestas de formularios del Club (Cloudflare KV).

Uso:
    python3 club/client/export_forms.py
    python3 club/client/export_forms.py --form evaluacion-curso --curso masterclass_extraterrestre
    python3 club/client/export_forms.py --csv-repo
    make club-forms-export CURSO=masterclass_extraterrestre
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
OUT_DIR = REPO / "club" / "personal" / "formularios"
FORMS_DIR = REPO / "club" / "drz-forms"
DEFAULT_WORKER_URL = "https://drz-club-portal.drz-academy.workers.dev"
SKIP_JSON = {"cursos-opciones.json"}


def load_secret(name: str) -> str:
    env_key = {
        "club-admin-token": "CLUB_ADMIN_TOKEN",
        "club-admin-master": "CLUB_ADMIN_MASTER",
        "club-worker-url": "CLUB_WORKER_URL",
    }[name]
    raw = os.environ.get(env_key, "").strip()
    if raw:
        return raw
    path = REPO / ".secrets" / name
    if path.exists():
        value = next((ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()), "")
        if value:
            return value
    if name == "club-worker-url":
        return DEFAULT_WORKER_URL
    return ""


def admin_token() -> str:
    token = load_secret("club-admin-token") or load_secret("club-admin-master")
    if not token:
        raise FileNotFoundError(
            "Falta CLUB_ADMIN_TOKEN o CLUB_ADMIN_MASTER "
            "(variable de entorno o archivo en .secrets/)."
        )
    return token


def worker_url() -> str:
    return load_secret("club-worker-url").rstrip("/")


def discover_form_ids() -> list[str]:
    ids: list[str] = []
    if not FORMS_DIR.exists():
        return ids
    for path in sorted(FORMS_DIR.glob("*.json")):
        if path.name in SKIP_JSON:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        fid = str(data.get("id") or "").strip()
        has_questions = isinstance(data.get("preguntas"), list) and data["preguntas"]
        has_sections = isinstance(data.get("secciones"), list) and data["secciones"]
        if fid and (has_questions or has_sections):
            ids.append(fid)
    return ids


def fetch(path: str, query: dict[str, str], accept: str) -> bytes:
    url = worker_url() + path
    if query:
        url += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v})
    token = admin_token()
    req = urllib.request.Request(
        url,
        headers={
            "Accept": accept,
            "Authorization": f"Bearer {token}",
            "User-Agent": "drz-club-forms-export/1.0",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read()
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Error al exportar: {err.code} {raw}") from err


def write_json(form_id: str, curso: str, payload: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    slug = curso or "todos"
    out = OUT_DIR / f"{form_id}-{slug}-{stamp}.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out


def write_repo_csv(form_id: str, body: bytes) -> Path:
    FORMS_DIR.mkdir(parents=True, exist_ok=True)
    out = FORMS_DIR / f"{form_id}-respuestas.csv"
    out.write_bytes(body)
    return out


def export_json(form_id: str, curso: str) -> tuple[Path, int]:
    raw = fetch("/admin/forms", {"form": form_id, "curso": curso}, "application/json")
    data = json.loads(raw.decode("utf-8"))
    if not data.get("ok"):
        raise RuntimeError(f"Error al exportar: {data}")
    path = write_json(form_id, curso, data)
    return path, int(data.get("count") or 0)


def export_csv(form_id: str) -> Path:
    body = fetch("/forms/export", {"form": form_id}, "text/csv")
    if not body:
        raise RuntimeError(f"CSV vacío para {form_id}")
    return write_repo_csv(form_id, body)


def main() -> int:
    parser = argparse.ArgumentParser(description="Exporta respuestas de formularios del Club")
    parser.add_argument("--form", default="", help="id del formulario (vacío = todos si --csv-repo)")
    parser.add_argument("--curso", default="", help="id del curso (solo JSON; vacío = todos)")
    parser.add_argument(
        "--csv-repo",
        action="store_true",
        help="Escribe club/drz-forms/<id>-respuestas.csv (backup en git; todas las respuestas)",
    )
    parser.add_argument("--no-json", action="store_true", help="No guardar JSON en personal/formularios/")
    args = parser.parse_args()

    form_ids = [args.form] if args.form else discover_form_ids()
    if not form_ids:
        form_ids = ["evaluacion-curso"]

    if not args.csv_repo and not args.form:
        form_ids = ["evaluacion-curso"]

    try:
        if args.csv_repo:
            if args.curso:
                print("Aviso: --csv-repo exporta todas las respuestas (ignora --curso).", file=sys.stderr)
            for form_id in form_ids:
                path = export_csv(form_id)
                print(f"  CSV:         {path.relative_to(REPO)}")
        if not args.no_json:
            for form_id in form_ids:
                path, count = export_json(form_id, args.curso)
                print(f"  Formulario:  {form_id}")
                print(f"  Curso:       {args.curso or '(todos)'}")
                print(f"  Respuestas:  {count}")
                print(f"  JSON:        {path.relative_to(REPO)}")
    except (FileNotFoundError, RuntimeError, json.JSONDecodeError) as err:
        print(str(err), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

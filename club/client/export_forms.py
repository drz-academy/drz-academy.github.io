#!/usr/bin/env python3
"""Descarga respuestas de formularios del Club (Cloudflare KV) a personal/.

Uso:
    python3 club/client/export_forms.py
    python3 club/client/export_forms.py --form evaluacion-curso --curso masterclass_extraterrestre
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


def load_secret(name: str) -> str:
    env_key = {
        "club-admin-token": "CLUB_ADMIN_TOKEN",
        "club-worker-url": "CLUB_WORKER_URL",
    }[name]
    raw = os.environ.get(env_key, "").strip()
    if raw:
        return raw
    path = REPO / ".secrets" / name
    if not path.exists():
        raise FileNotFoundError(f"Falta {path} o la variable {env_key}.")
    return next((ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()), "")


def main() -> int:
    parser = argparse.ArgumentParser(description="Exporta respuestas de formularios del Club")
    parser.add_argument("--form", default="evaluacion-curso", help="id del formulario")
    parser.add_argument("--curso", default="", help="id del curso (vacío = todos)")
    args = parser.parse_args()

    query = {"form": args.form}
    if args.curso:
        query["curso"] = args.curso
    url = load_secret("club-worker-url").rstrip("/") + "/admin/forms?" + urllib.parse.urlencode(query)
    token = load_secret("club-admin-token")
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "drz-club-forms-export/1.0",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace")
        print(f"Error al exportar: {err.code} {raw}", file=sys.stderr)
        return 1

    if not data.get("ok"):
        print(f"Error al exportar: {data}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    slug = args.curso or "todos"
    out = OUT_DIR / f"{args.form}-{slug}-{stamp}.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  Formulario: {data.get('form')}")
    print(f"  Curso:      {data.get('curso') or '(todos)'}")
    print(f"  Respuestas: {data.get('count', 0)}")
    print(f"  Archivo:    {out.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

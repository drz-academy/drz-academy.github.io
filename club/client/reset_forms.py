#!/usr/bin/env python3
"""Borra las respuestas de evaluación del Club en Cloudflare KV.

No toca los esquemas de formulario ni los perfiles. Tras el reset, cada
persona vuelve a ver el enlace Evaluación y puede enviar de nuevo.

Uso:
    python3 club/client/reset_forms.py
    make club-forms-reset
    make club-forms-reset FORM=evaluacion-curso
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent


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


def confirmed() -> bool:
    if "--yes" in sys.argv or "-y" in sys.argv:
        return True
    try:
        answer = input("¿Estás completamente seguro de borrar todas las evaluaciones? (sí/N): ")
    except EOFError:
        return False
    return answer.strip().lower() in {"s", "si", "sí", "y", "yes"}


def form_id_from_args() -> str:
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--form" and i + 1 < len(args):
            return args[i + 1].strip()
        if arg.startswith("--form="):
            return arg.split("=", 1)[1].strip()
    return os.environ.get("FORM", "").strip()


def main() -> int:
    if not confirmed():
        print("Cancelado. No se borró nada.")
        return 0

    form_id = form_id_from_args()
    url = load_secret("club-worker-url").rstrip("/") + "/admin/reset-forms"
    token = load_secret("club-admin-token")
    payload = json.dumps({"form": form_id} if form_id else {}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "drz-club-portal-reset-forms/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace")
        print(f"Error al borrar evaluaciones: {err.code} {raw}", file=sys.stderr)
        return 1
    if not result.get("ok"):
        print(f"Error al borrar evaluaciones: {result}", file=sys.stderr)
        return 1
    print("Dr. Z Academy Club — reset de evaluaciones")
    if form_id:
        print(f"  Formulario:          {form_id}")
    print(f"  Respuestas borradas: {result.get('deleted', 0)}")
    print("Listo. Quien ya había evaluado puede volver a enviar el formulario.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

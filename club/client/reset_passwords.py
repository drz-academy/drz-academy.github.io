#!/usr/bin/env python3
"""Borra todas las claves del Club en KV (auth, sesiones y tokens de reset).

La próxima vez cada miembro vuelve a crear una clave con cédula + correo.

Uso:
    python3 club/client/reset_passwords.py
    make -C club reset-pass
    make club-reset-pass
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


def main() -> int:
    url = load_secret("club-worker-url").rstrip("/") + "/admin/reset-pass"
    token = load_secret("club-admin-token")
    req = urllib.request.Request(
        url,
        data=b"{}",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "drz-club-portal-reset-pass/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace")
        print(f"Error al resetear claves: {err.code} {raw}", file=sys.stderr)
        return 1
    if not result.get("ok"):
        print(f"Error al resetear claves: {result}", file=sys.stderr)
        return 1
    print("Dr. Z Academy Club — reset de claves")
    print(f"  Claves borradas:     {result.get('auth', 0)}")
    print(f"  Sesiones cerradas:   {result.get('sessions', 0)}")
    print(f"  Tokens de reset:     {result.get('resets', 0)}")
    print("Listo. En la próxima visita cada persona crea una clave nueva.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

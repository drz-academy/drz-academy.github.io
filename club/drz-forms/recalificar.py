#!/usr/bin/env python3
"""Recalcula puntajes de envíos ya guardados en Cloudflare KV.

Tras cambiar `respuesta` / `puntaje` en el JSON del examen, sube el esquema
y vuelve a calificar cada envío con la clave actual.

Uso:
    python3 club/drz-forms/recalificar.py circulo-latino-c1-a1-casos.json
    python3 club/drz-forms/recalificar.py circulo-latino-c1-a1-casos
    python3 club/drz-forms/recalificar.py circulo-latino-c1-a1-casos --solo-recalificar
    make club-forms-recalificar FORM=circulo-latino-c1-a1-casos
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
FORMS_DIR = Path(__file__).resolve().parent
DEFAULT_WORKER_URL = "https://drz-club-portal.drz-academy.workers.dev"


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


def ssl_context():
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def resolve_form(arg: str) -> tuple[str, Path]:
    raw = (arg or "").strip()
    if not raw:
        raise ValueError("Indica el id del formulario o la ruta al JSON.")

    candidates: list[Path] = []
    path = Path(raw)
    if path.suffix.lower() == ".json":
        candidates.append(path if path.is_absolute() else (Path.cwd() / path))
        candidates.append(FORMS_DIR / path.name)
    else:
        candidates.append(FORMS_DIR / f"{raw}.json")
        candidates.append(FORMS_DIR / raw)

    schema_path = next((p.resolve() for p in candidates if p.exists()), None)
    if schema_path is None:
        # Permite recalificar solo con el id si el esquema ya está en KV.
        form_id = Path(raw).stem.strip().lower()
        if not form_id:
            raise FileNotFoundError(f"No encontré el JSON del formulario: {arg}")
        return form_id, FORMS_DIR / f"{form_id}.json"

    data = json.loads(schema_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{schema_path.name} no es un objeto JSON de formulario.")
    form_id = str(data.get("id") or schema_path.stem).strip().lower()
    if not form_id:
        raise ValueError(f"{schema_path.name} no tiene id.")
    if not data.get("examen"):
        print(
            f"Aviso: {schema_path.name} no tiene examen:true; "
            "el Worker puede responder not_exam.",
            file=sys.stderr,
        )
    return form_id, schema_path


def sync_schema() -> int:
    """Sube miembros + esquemas locales (incluye las claves nuevas)."""
    sys.path.insert(0, str(REPO / "club" / "client"))
    import sync_members  # noqa: WPS433

    return int(sync_members.main())


def post_regrade(form_id: str) -> dict:
    url = worker_url() + "/admin/regrade-forms"
    payload = json.dumps({"form": form_id}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {admin_token()}",
            "User-Agent": "drz-club-forms-recalificar/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180, context=ssl_context()) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = {"ok": False, "raw": raw}
        data["_http_status"] = err.code
        return data


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Recalcula puntajes de un formulario de examen en Cloudflare KV",
    )
    parser.add_argument(
        "formulario",
        help="id del form o ruta al JSON (p. ej. circulo-latino-c1-a1-casos.json)",
    )
    parser.add_argument(
        "--solo-recalificar",
        action="store_true",
        help="No ejecuta club-sync; usa el esquema que ya está en KV",
    )
    args = parser.parse_args()

    try:
        form_id, schema_path = resolve_form(args.formulario)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as err:
        print(f"Error: {err}", file=sys.stderr)
        return 1

    print("Dr. Z Academy Club — recalificar formulario")
    print(f"  Formulario: {form_id}")
    if schema_path.exists():
        print(f"  Esquema:    {schema_path.relative_to(REPO)}")

    if not args.solo_recalificar:
        if not schema_path.exists():
            print(
                f"Error: no existe {schema_path}; no puedo sincronizar el esquema.",
                file=sys.stderr,
            )
            return 1
        print("  Sincronizando esquema (club-sync)…")
        code = sync_schema()
        if code != 0:
            return code
    else:
        print("  (sin sync: --solo-recalificar)")

    print("  Recalificando envíos…")
    result = post_regrade(form_id)
    if not result.get("ok"):
        status = result.get("_http_status", "")
        print(f"Error al recalificar: {status} {result}", file=sys.stderr)
        return 1

    scanned = int(result.get("scanned") or 0)
    updated = int(result.get("updated") or 0)
    unchanged = int(result.get("unchanged") or 0)
    print(f"  Escaneados: {scanned}")
    print(f"  Actualizados: {updated}")
    print(f"  Sin cambio:  {unchanged}")
    for row in result.get("results") or []:
        flag = "*" if row.get("changed") else " "
        print(f"  {flag} {row.get('id') or '(sin id)'}: {row.get('puntaje') or '—'}")
    print("Listo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Sube miembros y catálogo del Club al Worker (Cloudflare KV).

Lee el catálogo en club/ y los datos personales en club/personal/ (fuera de Git).
No imprime cédulas ni correos.

Uso:
    python3 club/client/sync_members.py
    make club-sync
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
CLUB = REPO / "club"
PERSONAL = CLUB / "personal"
MEMBERS_JSON = PERSONAL / "drz-club-members.json"
CURSOS_JSON = CLUB / "cursos.json"
CERTIFICADOS_CSV = PERSONAL / "certificados.csv"
CUPONES_JSON = PERSONAL / "cupones.json"


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


def load_cursos() -> list[dict]:
    if not CURSOS_JSON.exists():
        return []
    cursos: list[dict] = []
    for curso in json.loads(CURSOS_JSON.read_text(encoding="utf-8")):
        item = {
            "id": str(curso.get("id") or "").strip(),
            "nombre": str(curso.get("nombre") or "").strip(),
            "fecha_inicio": str(curso.get("fecha_inicio") or "").strip(),
            "fecha_fin": str(curso.get("fecha_fin") or "").strip(),
            "classroom_url": str(curso.get("classroom_url") or "").strip(),
            "hotmart_url": str(curso.get("hotmart_url") or "").strip(),
            "certificados_folder": str(curso.get("certificados_folder") or "").strip(),
            "pagina_url": str(curso.get("pagina_url") or "").strip(),
            "inscripcion_url": str(curso.get("inscripcion_url") or "").strip(),
            "valor": str(curso.get("valor") or "").strip(),
            "numero_participantes": curso.get("numero_participantes", ""),
            "next_course": curso.get("next_course", False),
        }
        if item["id"] or item["nombre"]:
            cursos.append(item)
    return cursos


def load_certificados() -> dict[tuple[str, str], str]:
    """Índice (clave, curso_id) → url. clave es cédula, correo o celular."""
    mapping: dict[tuple[str, str], str] = {}
    if not CERTIFICADOS_CSV.exists():
        return mapping
    with CERTIFICADOS_CSV.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            curso_id = str(row.get("curso_id") or "").strip()
            url = str(row.get("url") or "").strip()
            if not curso_id or not url:
                continue
            doc = re.sub(r"[^0-9]", "", str(row.get("documento") or ""))
            cel = re.sub(r"[^0-9]", "", str(row.get("celular") or ""))
            correo = first_valid_email(row.get("correo") or "")
            
            is_hotmart = "-hotmart-" in str(row.get("archivo") or "").lower()
            
            if is_hotmart:
                if correo:
                    mapping[(correo, curso_id)] = url
            else:
                if doc:
                    mapping[(doc, curso_id)] = url
                if cel:
                    mapping[(cel, curso_id)] = url
                if correo:
                    mapping[(correo, curso_id)] = url
    return mapping


def normalize_email(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def first_valid_email(value: str) -> str:
    for part in re.split(r"[\s,;]+", normalize_email(value)):
        if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", part):
            return part
    return ""


def parse_valor(raw) -> float:
    text = str(raw or "").replace(",", "").strip()
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def load_cupones() -> dict[str, dict]:
    """Cupones del próximo curso: id del curso → {ORO, PLATA, BRONCE}."""
    if not CUPONES_JSON.exists():
        return {}
    raw = json.loads(CUPONES_JSON.read_text(encoding="utf-8"))
    items = raw if isinstance(raw, list) else [raw]
    by_id: dict[str, dict] = {}
    for item in items:
        curso_id = str(item.get("id") or "").strip()
        if not curso_id:
            continue
        by_id[curso_id] = {
            "ORO": str(item.get("cupon_gold") or item.get("cupon_oro") or "").strip(),
            "PLATA": str(item.get("cupon_silver") or item.get("cupon_plata") or "").strip(),
            "BRONCE": str(item.get("cupon_bronze") or item.get("cupon_bronce") or "").strip(),
        }
    return by_id


def codigo_cupon(curso_id: str, categoria: str, cupones: dict[str, dict]) -> str:
    cat = str(categoria or "").strip().upper()
    if "ORO" in cat:
        key = "ORO"
    elif "PLATA" in cat:
        key = "PLATA"
    elif "BRONCE" in cat:
        key = "BRONCE"
    else:
        return ""
    return (cupones.get(curso_id) or {}).get(key) or ""
    for curso in cursos:
        n = curso.get("numero_participantes")
        try:
            n_int = int(n) if n not in (None, "") else None
        except (TypeError, ValueError):
            n_int = None
        if n_int == 0:
            return curso
    return None


def next_course(cursos: list[dict]) -> dict | None:
    for curso in cursos:
        if curso.get("next_course"):
            return curso

    for curso in cursos:
        n = curso.get("numero_participantes")
        try:
            n_int = int(n) if n not in (None, "") else None
        except (TypeError, ValueError):
            n_int = None
        if n_int == 0:
            return curso
    return None


def build_proximo(cursos: list[dict], raw: dict, cupones: dict[str, dict]) -> dict | None:
    nxt = next_course(cursos)
    if not nxt:
        return None
    valor = parse_valor(nxt.get("valor"))
    usado = str(raw.get("beneficio_usado") or "").strip().upper() in {"SI", "SÍ", "YES", "TRUE"}
    try:
        desc = int(raw.get("descuento_valor") or 0)
    except (TypeError, ValueError):
        desc = 0
    disponible = desc > 0 and not usado
    if disponible and desc >= 100:
        precio_final = 0.0
    elif disponible:
        precio_final = round(valor * (100 - desc) / 100)
    else:
        precio_final = valor
    categoria = str(raw.get("categoria") or "SIN CATEGORÍA")
    return {
        "nombre": nxt.get("nombre") or "",
        "valor": valor,
        "pagina_url": nxt.get("pagina_url") or nxt.get("inscripcion_url") or "",
        "inscripcion_url": nxt.get("inscripcion_url") or "",
        "cupon": {
            "disponible": disponible,
            "etiqueta": categoria,
            "descuento": str(raw.get("descuento") or "0%"),
            "precio_final": precio_final,
            "codigo": codigo_cupon(str(nxt.get("id") or ""), categoria, cupones) if disponible else "",
        },
    }


TEST_EMAIL = "puntobernal@gmail.com"
TEST_DOCUMENTO = "666666"


def test_member(cursos: list[dict]) -> dict:
    hechos = []
    for curso in cursos:
        if curso.get("id") == "masterclass_cambio_climatico":
            continue
        n = curso.get("numero_participantes")
        if n is not None and str(n).strip() != "" and int(n) == 0:
            continue
        if curso.get("nombre"):
            hechos.append(curso["nombre"])
    if not hechos:
        hechos = [c["nombre"] for c in cursos if c.get("nombre")]
    return {
        "nombre": "Punto Bernal",
        "documento": TEST_DOCUMENTO,
        "correo": TEST_EMAIL,
        "cursos_participados": hechos,
        "categoria": "ORO",
        "emoji": "🥇",
        "descuento": "100%",
        "descuento_valor": 100,
        "beneficios": "Inscripción GRATIS al próximo curso + acceso gratis a un producto permanente",
        "nota": "Usuario de prueba — no es un miembro real",
    }


def build_payload() -> tuple[list[dict], list[dict], dict]:
    if not MEMBERS_JSON.exists():
        raise FileNotFoundError(f"No está {MEMBERS_JSON}. Genera la base con club/bin/build_database.py")
    members_raw = json.loads(MEMBERS_JSON.read_text(encoding="utf-8"))
    cursos = load_cursos()
    existing = next((m for m in members_raw if first_valid_email(m.get("correo") or "") == TEST_EMAIL), None)
    if existing:
        existing["documento"] = TEST_DOCUMENTO
        existing["nombre"] = existing.get("nombre") or "Punto Bernal"
    else:
        members_raw.insert(0, test_member(cursos))
    by_nombre = {c["nombre"]: c for c in cursos if c.get("nombre")}
    certificados = load_certificados()
    cupones = load_cupones()

    members: list[dict] = []
    skipped_no_doc = 0
    skipped_no_email = 0
    certs_attached = 0
    for raw in members_raw:
        documento = re.sub(r"[^0-9]", "", str(raw.get("documento") or ""))
        celular = re.sub(r"[^0-9]", "", str(raw.get("celular") or ""))
        correo = first_valid_email(raw.get("correo") or "")
        if not documento and celular:
            documento = celular
        if not documento:
            skipped_no_doc += 1
            continue
        if not correo or "@" not in correo:
            skipped_no_email += 1
            continue
        cursos_persona = []
        for nombre in raw.get("cursos_participados") or []:
            meta = by_nombre.get(nombre) or {"id": "", "nombre": nombre}
            curso_id = meta.get("id") or ""
            cert_url = (
                certificados.get((documento, curso_id), "")
                or certificados.get((correo, curso_id), "")
                or certificados.get((celular, curso_id), "")
            )
            if cert_url:
                certs_attached += 1
            cursos_persona.append(
                {
                    "id": curso_id,
                    "nombre": meta.get("nombre") or nombre,
                    "fecha_inicio": meta.get("fecha_inicio") or "",
                    "fecha_fin": meta.get("fecha_fin") or "",
                    "classroom_url": meta.get("classroom_url") or "",
                    "hotmart_url": meta.get("hotmart_url") or "",
                    "certificado_url": cert_url,
                    "pagina_url": meta.get("pagina_url") or "",
                }
            )
        members.append(
            {
                "documento": documento,
                "correo": correo,
                "nombre": str(raw.get("nombre") or "").strip(),
                "categoria": str(raw.get("categoria") or "SIN CATEGORÍA"),
                "emoji": str(raw.get("emoji") or ""),
                "beneficios": str(raw.get("beneficios") or ""),
                "descuento": str(raw.get("descuento") or ""),
                "cursos": cursos_persona,
                "proximo_curso": build_proximo(cursos, raw, cupones),
                "documento_aliases": [TEST_DOCUMENTO, "1000100010"] if correo == TEST_EMAIL else [],
            }
        )
    stats = {
        "eligible": len(members),
        "skipped_no_doc": skipped_no_doc,
        "skipped_no_email": skipped_no_email,
        "certs_attached": certs_attached,
        "cursos": len(cursos),
        "total_source": len(members_raw),
    }
    return members, cursos, stats


def post_sync(members: list[dict], cursos: list[dict]) -> dict:
    url = load_secret("club-worker-url").rstrip("/") + "/admin/sync"
    token = load_secret("club-admin-token")
    payload = json.dumps({"members": members, "cursos": cursos}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "drz-club-portal-sync/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
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
    members, cursos, stats = build_payload()
    print("Dr. Z Academy Club — sincronización al portal")
    print(f"  Fuente:              {stats['total_source']} miembros")
    print(f"  Listos para el portal: {stats['eligible']} (cédula + correo)")
    print(f"  Sin cédula:          {stats['skipped_no_doc']}")
    print(f"  Sin correo:          {stats['skipped_no_email']}")
    print(f"  Cursos en catálogo:  {stats['cursos']}")
    print(f"  Certificados ligados:{stats['certs_attached']}")
    print(f"  Cupones:             {CUPONES_JSON.name if CUPONES_JSON.exists() else '(sin personal/cupones.json)'}")
    if not members:
        print("No hay miembros con cédula y correo. Nada que subir.")
        return 1
    if "--dry-run" in sys.argv:
        print("  (dry-run: no se subió nada)")
        return 0
    result = post_sync(members, cursos)
    if not result.get("ok"):
        print(f"Error al sincronizar: {result}", file=sys.stderr)
        return 1
    print(f"  Guardados en KV:     {result.get('stored')}")
    print("Listo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

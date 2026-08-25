#!/usr/bin/env python3
"""Totales públicos del Club a partir de club/cursos.json (sin datos personales)."""

from __future__ import annotations

import argparse
import json
import os
import sys

CLUB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CURSOS_JSON = os.path.join(CLUB_DIR, "cursos.json")


def as_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def unique_courses(cursos: list) -> list:
    by_id = {}
    for curso in cursos:
        cid = str(curso.get("id") or "").strip()
        if not cid:
            continue
        prev = by_id.get(cid)
        if prev is None:
            by_id[cid] = curso
            continue
        score = (as_int(curso.get("numero_participantes")), as_int(curso.get("numero_certificados")))
        prev_score = (as_int(prev.get("numero_participantes")), as_int(prev.get("numero_certificados")))
        if score > prev_score:
            by_id[cid] = curso
    return list(by_id.values())


def build_stats(cursos: list) -> dict:
    items = unique_courses(cursos)
    dictados = [c for c in items if as_int(c.get("numero_participantes")) > 0]
    return {
        "cursos_ofrecidos": len(items),
        "cursos_dictados": len(dictados),
        "inscritos": sum(as_int(c.get("numero_participantes")) for c in items),
        "certificados": sum(as_int(c.get("numero_certificados")) for c in items),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera stats.json público del Club")
    parser.add_argument("--out", required=True, help="Ruta de salida (p. ej. _site/club/stats.json)")
    args = parser.parse_args()

    with open(CURSOS_JSON, encoding="utf-8") as f:
        cursos = json.load(f)
    if not isinstance(cursos, list):
        raise SystemExit("cursos.json debe ser una lista")

    stats = build_stats(cursos)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(
        f"✓  Club stats: {stats['cursos_dictados']} dictados, "
        f"{stats['cursos_ofrecidos']} ofrecidos, "
        f"{stats['inscritos']} inscritos, "
        f"{stats['certificados']} certificados → {args.out}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

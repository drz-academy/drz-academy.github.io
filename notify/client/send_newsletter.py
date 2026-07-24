#!/usr/bin/env python3
"""Script para enviar un archivo Markdown como Newsletter."""

import argparse
import sys
from pathlib import Path

import markdown
from course_notify_client import list_subscribers, worker_base
from course_notify_gmail import send_gmail

def wrap_html(html_content: str) -> str:
    """Envuelve el contenido HTML renderizado con estilos básicos de email."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {{ font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }}
      a {{ color: #007bff; text-decoration: none; }}
      a:hover {{ text-decoration: underline; }}
      img {{ max-width: 100%; height: auto; }}
      h1, h2, h3 {{ color: #222; margin-top: 1.5em; margin-bottom: 0.5em; }}
      p {{ margin-bottom: 1em; }}
    </style>
    </head>
    <body>
    {html_content}
    </body>
    </html>
    """

def main() -> int:
    parser = argparse.ArgumentParser(description="Enviar una newsletter desde un archivo Markdown.")
    parser.add_argument("markdown_file", type=Path, help="Ruta al archivo .md (ej. cursos/extraterrestres/newsletter.md)")
    parser.add_argument("--subject", required=True, help="Asunto del correo electrónico")
    parser.add_argument("--test-limit", type=int, default=0, help="Enviar solo a las primeras N personas (como test)")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra a quiénes se enviaría, no envía nada")

    args = parser.parse_args()

    if not args.markdown_file.exists():
        print(f"Error: El archivo {args.markdown_file} no existe.", file=sys.stderr)
        return 1

    md_content = args.markdown_file.read_text(encoding="utf-8")
    
    # Convertir Markdown a HTML
    raw_html = markdown.markdown(md_content, extensions=['extra', 'nl2br'])
    final_html = wrap_html(raw_html)

    print(f"Obteniendo lista de suscriptores...")
    subs_resp = list_subscribers()
    if not subs_resp.get("ok"):
        print(f"Error listando suscriptores: {subs_resp}", file=sys.stderr)
        return 1

    subscribers = list(subs_resp.get("subscribers") or [])
    if not subscribers:
        print("No hay suscriptores confirmados.", file=sys.stderr)
        return 0

    if args.test_limit > 0:
        subscribers = subscribers[:args.test_limit]
        print(f"MODO TEST: Limitado a los primeros {len(subscribers)} suscriptores.")

    emails = [str(s.get("email") or "") for s in subscribers if s.get("email")]
    
    if args.dry_run:
        print("\nEl correo (dry-run) se enviaría a:")
        for e in emails:
            print(f"  - {e}")
        return 0

    print(f"\nSe enviará el correo a {len(emails)} personas. Asunto: '{args.subject}'")
    confirm = input("¿Deseas continuar? (y/N): ")
    if confirm.lower() != 'y':
        print("Envío cancelado.")
        return 0

    print("Iniciando envío de correos (puede tomar un momento debido al límite de tasa de Google)...")
    
    wbase = worker_base()
    
    # Send individually to support unsubscribe tokens
    sent_count = 0
    for sub in subscribers:
        email = str(sub.get("email") or "").strip()
        if not email:
            continue
            
        token = str(sub.get("unsubscribeToken") or "").strip()
        unsub = f"{wbase}/unsubscribe?token={token}" if token else ""
        
        try:
            send_gmail(
                to_addrs=[email],
                subject=args.subject,
                html_body=final_html,
                unsubscribe_url=unsub,
                delay_sec=1.5 # Un breve delay entre correos para evitar bloqueos
            )
            sent_count += 1
            print(f"Enviado a {email}")
        except Exception as e:
            print(f"Error enviando a {email}: {e}", file=sys.stderr)

    print(f"\nFinalizado. Correos enviados exitosamente: {sent_count}/{len(emails)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

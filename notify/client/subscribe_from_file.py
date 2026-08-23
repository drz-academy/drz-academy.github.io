#!/usr/bin/env python3
import sys
import re
import argparse
from pathlib import Path

from course_notify_client import list_subscriber_emails, seed_subscribers

def extract_emails(text: str) -> set:
    pattern = r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'
    return set(re.findall(pattern, text))

def main():
    parser = argparse.ArgumentParser(description="Subscribe emails from a markdown/text file.")
    parser.add_argument("file", type=Path, help="Path to the file containing emails")
    args = parser.parse_args()

    if not args.file.exists():
        print(f"Error: The file {args.file} does not exist.", file=sys.stderr)
        return 1

    content = args.file.read_text(encoding="utf-8")
    emails_in_file = extract_emails(content)
    
    if not emails_in_file:
        print("No se encontraron correos electrónicos válidos en el archivo.")
        return 0

    print("Obteniendo lista de suscriptores actuales...")
    try:
        already_subscribed = set(list_subscriber_emails())
    except Exception as e:
        print(f"Error al obtener la lista de suscriptores: {e}", file=sys.stderr)
        return 1

    new_emails = emails_in_file - already_subscribed

    if not new_emails:
        print(f"Se encontraron {len(emails_in_file)} correos en el archivo, pero todos ya están suscritos.")
        return 0

    new_emails_list = list(new_emails)
    print(f"Se encontrarón {len(new_emails_list)} correos nuevos. Suscribiendo...")
    
    # Enviar en lotes de 50
    batch_size = 50
    for i in range(0, len(new_emails_list), batch_size):
        batch = new_emails_list[i:i + batch_size]
        print(f"Enviando lote de {len(batch)} correos...")
        result = seed_subscribers(batch)
        if not result.get("ok"):
            print(f"Error al suscribir lote: {result}", file=sys.stderr)
            return 1
            
    print("¡Suscripción completada exitosamente!")
    
    # Sobreescribir el archivo con la lista completa y actualizada
    print("Actualizando el archivo con la lista total de suscritos...")
    todas_suscritas = already_subscribed.union(new_emails)
    try:
        with open(args.file, "w", encoding="utf-8") as f:
            for email in sorted(todas_suscritas):
                f.write(f"{email}\n")
        print(f"Archivo {args.file} actualizado con {len(todas_suscritas)} correos.")
    except Exception as e:
        print(f"Advertencia: No se pudo actualizar el archivo {args.file}: {e}", file=sys.stderr)
        
    return 0

if __name__ == "__main__":
    sys.exit(main())

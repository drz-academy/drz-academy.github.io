#!/usr/bin/env python3
"""Read a CSV file (e.g. contacts.csv) and seed subscribers in the worker."""

import argparse
import csv
import sys
from pathlib import Path

from course_notify_client import seed_subscribers


def is_valid_email(email: str) -> bool:
    email = email.strip()
    return bool(email and "@" in email and "." in email.split("@")[-1])


def main():
    parser = argparse.ArgumentParser(description="Import subscribers from Google Contacts CSV.")
    parser.add_argument("csv_file", type=Path, help="Path to the CSV file.")
    parser.add_argument("--dry-run", action="store_true", help="Only print emails, do not send to the worker.")
    
    args = parser.parse_args()
    
    if not args.csv_file.exists():
        print(f"Error: El archivo {args.csv_file} no existe.", file=sys.stderr)
        return 1
    
    emails = []
    
    with open(args.csv_file, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("Error: El archivo CSV está vacío o no tiene encabezados válidos.", file=sys.stderr)
            return 1
            
        email_fields = [fn for fn in reader.fieldnames if "E-mail" in fn and "Value" in fn]
        
        for row in reader:
            for field in email_fields:
                val = row.get(field, "").strip()
                if is_valid_email(val):
                    emails.append(val)
                    break # Solo cogemos el primer email válido de la persona
                    
    # Limpiar duplicados locales
    unique_emails = list(dict.fromkeys(emails))
    
    if not unique_emails:
        print("No se encontraron emails válidos en el archivo CSV.")
        return 0
        
    print(f"Se encontraron {len(unique_emails)} correos válidos.")
    
    if args.dry_run:
        print("\nLista de correos (dry-run):")
        for e in unique_emails:
            print(f"  - {e}")
        print("\nNo se enviaron datos al servidor.")
        return 0
        
    print("Iniciando seed de suscriptores al Worker...")
    
    try:
        # Se envían en bloques por si son demasiados
        batch_size = 50
        for i in range(0, len(unique_emails), batch_size):
            batch = unique_emails[i:i + batch_size]
            print(f"Enviando lote de {len(batch)} correos...")
            result = seed_subscribers(batch)
            if not result.get("ok"):
                print(f"Error al enviar lote: {result}", file=sys.stderr)
        
        print("Proceso completado con éxito.")
    except Exception as e:
        print(f"Error fatal: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

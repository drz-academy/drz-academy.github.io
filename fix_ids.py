import os, shutil, sys
from pathlib import Path
sys.path.insert(0, "/Users/jzuluaga/dev/drz-academy.github.io/club/personal/ClubDrZAcademy/Certificados")
from bin.actualizar_certificados import resolve_xlsx, load_cursos, infer_curso, read_certificados, load_members, pick_member, dest_name, pick_pdf

os.chdir("/Users/jzuluaga/dev/drz-academy.github.io/club/personal/ClubDrZAcademy/Certificados")
xlsx = resolve_xlsx("Extraterrestres-Certificación-RepositorioPublico/Lista Certificación - Master Class Extraterrestre - 2026-2.xlsx")
cursos = load_cursos()
curso_id = infer_curso(xlsx, cursos)
curso_nombre = cursos[curso_id]["nombre"]
people = read_certificados(xlsx)
pdfs = [p for p in xlsx.parent.iterdir() if p.is_file() and p.suffix.lower() == ".pdf" and not p.name.startswith(".")]
members = load_members()

for person in people:
    member = pick_member(person["nombre"], person["documento"], person["correo"], members, curso_nombre)
    if member:
        documento = member["documento"] or person["documento"] or member["celular"]
        email = member["correo"] or person["correo"]
        nombre = member["nombre"]
    else:
        documento = person["documento"]
        email = person["correo"]
        nombre = person["nombre"]
    filename = dest_name(curso_id, documento, email, nombre)
    dest = Path("CertificadosPublicos") / filename
    
    pdf = pick_pdf(person["nombre"], pdfs)
    if pdf is None:
        continue
        
    print(f"Moving {pdf.name} to {dest.name}")
    try:
        os.rename(pdf, dest)
    except Exception as e:
        print(f"Error moving {pdf.name}: {e}")

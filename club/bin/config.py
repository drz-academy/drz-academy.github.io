"""Configuración global para los scripts del Club."""

import os

# Carpeta en Google Drive (relativa a club/ o absoluta)
CLUB_DRZ_DRIVE = "./personal/ClubDrZAcademy/"

def get_info_dir(club_dir: str) -> str:
    """Devuelve la ruta absoluta al directorio info en Google Drive."""
    return os.path.normpath(os.path.join(club_dir, CLUB_DRZ_DRIVE, "info"))

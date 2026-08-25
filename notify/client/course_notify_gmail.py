#!/usr/bin/env python3
"""Envío de correos de la Dr. Z Academy vía Gmail SMTP."""

from __future__ import annotations

import smtplib
import time
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, make_msgid
from pathlib import Path

from course_notify_secrets import load_secret, normalize_credential

DEFAULT_FROM_NAME = "Jorge Zuluaga, Dr. Z Academy"
SEND_DELAY_SEC = 2.0

_IMAGE_SUBTYPES = {
    ".png": "png",
    ".jpg": "jpeg",
    ".jpeg": "jpeg",
    ".gif": "gif",
    ".webp": "webp",
}


def _attach_inline_images(root: MIMEMultipart, inline_images: list | None) -> None:
    for item in inline_images or []:
        path = Path(str(item.get("path") or ""))
        cid = str(item.get("cid") or path.stem).strip("<>")
        if not cid or not path.is_file():
            continue
        subtype = _IMAGE_SUBTYPES.get(path.suffix.lower(), "png")
        with path.open("rb") as handle:
            part = MIMEImage(handle.read(), _subtype=subtype)
        part.add_header("Content-ID", f"<{cid}>")
        part.add_header("Content-Disposition", "inline", filename=path.name)
        root.attach(part)


def build_message(
    *,
    user: str,
    to_addr: str,
    subject: str,
    html_body: str,
    from_name: str = DEFAULT_FROM_NAME,
    unsubscribe_url: str = "",
    inline_images: list | None = None,
) -> MIMEMultipart:
    if unsubscribe_url:
        footer = f'<br><br><hr style="border:0; border-top:1px solid #eee;"><p style="font-size: 12px; color: #777; text-align: center;">¿No deseas recibir más correos como este? <a href="{unsubscribe_url}" style="color:#007bff;">Desuscribirme</a></p>'
        html_body += footer

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText("Este mensaje requiere un cliente de correo con soporte HTML.", "plain", "utf-8"))
    alt.attach(MIMEText(html_body, "html", "utf-8"))

    images = [item for item in (inline_images or []) if item]
    msg: MIMEMultipart = MIMEMultipart("related") if images else alt
    if images:
        msg.attach(alt)
        _attach_inline_images(msg, images)

    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, user))
    msg["To"] = to_addr
    msg["Reply-To"] = user
    msg["Message-ID"] = make_msgid(domain=user.split("@", 1)[-1])
    if unsubscribe_url:
        msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    return msg


def send_gmail(
    *,
    to_addrs: list[str],
    subject: str,
    html_body: str,
    from_name: str = DEFAULT_FROM_NAME,
    smtp_user: str = "",
    smtp_password: str = "",
    unsubscribe_url: str = "",
    delay_sec: float = SEND_DELAY_SEC,
) -> list[str]:
    user = normalize_credential(smtp_user, strip_spaces=False) if smtp_user else load_secret("gmail-smtp-user")
    password = (
        normalize_credential(smtp_password, strip_spaces=True)
        if smtp_password
        else load_secret("gmail-app-password", strip_spaces=True)
    )
    recipients = [a.strip() for a in to_addrs if a.strip()]
    if not recipients:
        raise ValueError("No hay destinatarios.")

    sent: list[str] = []
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as smtp:
        smtp.login(user, password)
        for idx, recipient in enumerate(recipients):
            if idx > 0 and delay_sec > 0:
                time.sleep(delay_sec)
            msg = build_message(
                user=user,
                to_addr=recipient,
                subject=subject,
                html_body=html_body,
                from_name=from_name,
                unsubscribe_url=unsubscribe_url,
            )
            smtp.send_message(msg, from_addr=user, to_addrs=[recipient])
            sent.append(recipient)
    return sent


def send_gmail_bulk(
    *,
    messages: list[dict],
    from_name: str = DEFAULT_FROM_NAME,
    smtp_user: str = "",
    smtp_password: str = "",
    delay_sec: float = SEND_DELAY_SEC,
    progress_callback = None,
) -> list[str]:
    """
    Envía una lista de correos reutilizando la conexión SMTP en lotes de 40 para evitar que Google
    cierre la conexión abruptamente, y permite callbacks para registrar el progreso.
    """
    user = normalize_credential(smtp_user, strip_spaces=False) if smtp_user else load_secret("gmail-smtp-user")
    password = (
        normalize_credential(smtp_password, strip_spaces=True)
        if smtp_password
        else load_secret("gmail-app-password", strip_spaces=True)
    )

    sent: list[str] = []
    batch_size = 40
    smtp = None

    def connect():
        nonlocal smtp
        if smtp:
            try: smtp.quit()
            except: pass
        smtp = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60)
        smtp.login(user, password)

    try:
        for idx, msg_data in enumerate(messages):
            to_addr = msg_data.get("to", "").strip()
            if not to_addr:
                continue

            if idx % batch_size == 0:
                connect()

            if idx > 0 and delay_sec > 0:
                time.sleep(delay_sec)

            msg = build_message(
                user=user,
                to_addr=to_addr,
                subject=msg_data.get("subject", ""),
                html_body=msg_data.get("html", ""),
                from_name=from_name,
                unsubscribe_url=msg_data.get("unsub", ""),
                inline_images=msg_data.get("inline") or None,
            )
            
            try:
                smtp.send_message(msg, from_addr=user, to_addrs=[to_addr])
                sent.append(to_addr)
                if progress_callback:
                    progress_callback(to_addr, True, None)
            except Exception as e:
                # Si falla, intentamos reconectar una vez y reintentar
                try:
                    time.sleep(1)
                    connect()
                    smtp.send_message(msg, from_addr=user, to_addrs=[to_addr])
                    sent.append(to_addr)
                    if progress_callback:
                        progress_callback(to_addr, True, None)
                except Exception as retry_e:
                    if progress_callback:
                        progress_callback(to_addr, False, str(retry_e))
    finally:
        if smtp:
            try: smtp.quit()
            except: pass

    return sent

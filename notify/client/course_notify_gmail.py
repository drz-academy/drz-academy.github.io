#!/usr/bin/env python3
"""Envío de correos de la Dr. Z Academy vía Gmail SMTP."""

from __future__ import annotations

import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, make_msgid

from course_notify_secrets import load_secret, normalize_credential

DEFAULT_FROM_NAME = "Jorge Zuluaga, Dr. Z Academy"
SEND_DELAY_SEC = 2.0

def build_message(
    *,
    user: str,
    to_addr: str,
    subject: str,
    html_body: str,
    from_name: str = DEFAULT_FROM_NAME,
    unsubscribe_url: str = "",
) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, user))
    msg["To"] = to_addr
    msg["Reply-To"] = user
    msg["Message-ID"] = make_msgid(domain=user.split("@", 1)[-1])
    if unsubscribe_url:
        msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        
        # Agregar link de desuscripción al final del HTML si existe
        footer = f'<br><br><hr style="border:0; border-top:1px solid #eee;"><p style="font-size: 12px; color: #777; text-align: center;">¿No deseas recibir más correos como este? <a href="{unsubscribe_url}" style="color:#007bff;">Desuscribirme</a></p>'
        html_body += footer

    msg.attach(MIMEText("Este mensaje requiere un cliente de correo con soporte HTML.", "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
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

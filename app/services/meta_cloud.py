"""Serviço de integração com Meta Cloud API (WhatsApp Business API oficial)."""

import hmac
import hashlib
import json
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

META_API_BASE = "https://graph.facebook.com/v18.0"
APP_SECRET = settings.META_APP_SECRET


class MetaCloudError(Exception):
    pass


def _handle_error(resp: httpx.Response, ctx: str) -> None:
    if resp.status_code >= 400:
        try:
            data = resp.json()
            msg = data.get("error", {}).get("message", resp.text)
        except Exception:
            msg = resp.text
        logger.error("[meta-cloud] %s — HTTP %s: %s", ctx, resp.status_code, msg)
        raise MetaCloudError(f"{ctx}: {msg}")


def verificar_assinatura(payload_body: bytes, signature: str) -> bool:
    """Verifica assinatura X-Hub-Signature-256 do webhook da Meta."""
    if not APP_SECRET:
        logger.warning("[meta-cloud] META_APP_SECRET não configurado — pulando verificação de assinatura")
        return True
    if not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(
        APP_SECRET.encode("utf-8"),
        payload_body,
        hashlib.sha256,
    ).hexdigest()
    received = signature[7:]  # remove "sha256="
    return hmac.compare_digest(expected, received)


def enviar_mensagem_texto(
    phone_number_id: str,
    access_token: str,
    to: str,
    text: str,
) -> dict:
    """Envia mensagem de texto via Meta Cloud API."""
    url = f"{META_API_BASE}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }

    with httpx.Client(timeout=60) as client:
        resp = client.post(url, headers=headers, json=body)
        _handle_error(resp, "enviar_mensagem_texto")
        return resp.json()


def processar_webhook(payload: dict) -> dict:
    """Processa payload do webhook da Meta Cloud API.
    
    Retorna dict com:
    - event_type: 'message' | 'status' | 'unknown'
    - entries: lista de itens processados
    """
    entries = []

    if payload.get("object") != "whatsapp_business_account":
        logger.warning("[meta-cloud] webhook objeto desconhecido: %s", payload.get("object"))
        return {"event_type": "unknown", "entries": []}

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})

            # Mensagens recebidas
            for msg in value.get("messages", []):
                entries.append({
                    "type": "message",
                    "wa_id": msg.get("from"),
                    "wamid": msg.get("id"),
                    "timestamp": msg.get("timestamp"),
                    "message_type": msg.get("type", "text"),
                    "text": msg.get("text", {}).get("body", "") if msg.get("type") == "text" else "",
                    "contacts": value.get("contacts", []),
                    "metadata": value.get("metadata", {}),
                })

            # Status de entrega
            for status in value.get("statuses", []):
                entries.append({
                    "type": "status",
                    "wamid": status.get("id"),
                    "recipient_id": status.get("recipient_id"),
                    "status": status.get("status"),  # sent, delivered, read, failed
                    "timestamp": status.get("timestamp"),
                })

    event_type = "message" if any(e["type"] == "message" for e in entries) else (
        "status" if any(e["type"] == "status" for e in entries) else "unknown"
    )

    return {"event_type": event_type, "entries": entries}

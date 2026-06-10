"""Integração com Instagram Direct via "Instagram API with Instagram Login".

Usa graph.instagram.com (não exige Página do Facebook). Reaproveita a verificação
de assinatura HMAC do meta_cloud (mesmo META_APP_SECRET).
"""

import logging
from typing import Any

import httpx

from app.core.config import settings
from app.services.meta_cloud import (  # reuso: mesmo app secret / mesmo esquema HMAC
    MetaCloudError,
    verificar_assinatura,  # noqa: F401  (reexport para o router usar)
)

logger = logging.getLogger(__name__)

INSTAGRAM_API_BASE = f"https://graph.instagram.com/{settings.META_GRAPH_API_VERSION}"


class InstagramError(MetaCloudError):
    pass


def _handle_error(resp: httpx.Response, ctx: str) -> None:
    if resp.status_code >= 400:
        code = None
        try:
            data = resp.json()
            err = data.get("error", {})
            msg = err.get("message", resp.text)
            code = err.get("code")
        except Exception:
            msg = resp.text
        logger.error("[instagram] %s — HTTP %s: %s", ctx, resp.status_code, msg)
        raise InstagramError(f"{ctx}: {msg}", code=code)


def validar_credenciais(ig_id: str, access_token: str) -> dict:
    """GET /{ig_id}?fields=username — valida token e retorna metadados da conta."""
    url = f"{INSTAGRAM_API_BASE}/{ig_id}"
    params = {"fields": "username,name", "access_token": access_token}
    with httpx.Client(timeout=30) as client:
        resp = client.get(url, params=params)
        _handle_error(resp, "validar_credenciais")
        return resp.json()


def enviar_mensagem_texto(ig_id: str, access_token: str, recipient_igsid: str, text: str) -> dict:
    """POST /{ig_id}/messages — envia DM de texto para um IGSID."""
    url = f"{INSTAGRAM_API_BASE}/{ig_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    body = {"recipient": {"id": recipient_igsid}, "message": {"text": text}}
    with httpx.Client(timeout=60) as client:
        resp = client.post(url, headers=headers, json=body)
        _handle_error(resp, "enviar_mensagem_texto")
        return resp.json()


def processar_webhook(payload: dict) -> dict:
    """Normaliza o webhook de mensagens do Instagram (formato Messenger).

    object="instagram", entry[].messaging[] com sender.id (IGSID), message.mid, message.text.
    Mensagens de eco (is_echo) são ignoradas — são as que nós mesmos enviamos.
    """
    entries: list[dict] = []
    if payload.get("object") != "instagram":
        logger.warning("[instagram] webhook objeto desconhecido: %s", payload.get("object"))
        return {"event_type": "unknown", "entries": []}

    for entry in payload.get("entry", []):
        for ev in entry.get("messaging", []):
            message = ev.get("message", {})
            if not message or message.get("is_echo"):
                continue
            sender = (ev.get("sender") or {}).get("id", "")
            mid = message.get("mid", "")
            if not sender or not mid:
                continue
            entries.append({
                "type": "message",
                "igsid": sender,
                "mid": mid,
                "timestamp": ev.get("timestamp"),
                "text": message.get("text", "") or "",
                "message_type": "text" if message.get("text") else "attachment",
            })

    event_type = "message" if entries else "unknown"
    return {"event_type": event_type, "entries": entries}

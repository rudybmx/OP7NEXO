"""Adapter: converte payload do WAHA Plus para o formato interno usado por normalize_message_event().

WAHA Plus (noweb) envolve os campos da mensagem dentro de waha["payload"]:
    {"event": "message", "session": "...", "payload": {"id": "...", "from": "...", "body": "..."}}

Versões mais antigas entregavam os campos na raiz (flat). O adapter tenta "payload" primeiro
e cai de volta para a raiz como fallback.
"""

from __future__ import annotations

import os
from urllib.parse import urlparse, urlunparse

_WAHA_TYPE_TO_MSG_KEY: dict[str, str] = {
    "image":    "imageMessage",
    "video":    "videoMessage",
    "audio":    "audioMessage",
    "ptt":      "audioMessage",
    "voice":    "audioMessage",
    "document": "documentMessage",
    "file":     "documentMessage",
    "sticker":  "stickerMessage",
}


def _normalize_waha_media_url(url: str) -> str:
    """Substitui scheme+netloc quando a URL vem de localhost/127.0.0.1."""
    base = os.getenv("WAHA_API_BASE_URL", "http://waha:3000")
    parsed = urlparse(url)
    if parsed.hostname in ("localhost", "127.0.0.1"):
        base_parsed = urlparse(base)
        parsed = parsed._replace(scheme=base_parsed.scheme, netloc=base_parsed.netloc)
    return urlunparse(parsed)


def adapt_waha_to_evolution(waha: dict) -> dict:
    """Converte payload inbound WAHA para estrutura compatível com normalize_message_event().

    WAHA Plus noweb: campos em waha["payload"]["from"], waha["payload"]["body"], etc.
    Fallback flat: campos direto na raiz (formato legado).
    """
    inner = waha.get("payload") or waha

    msg_id     = inner.get("id") or waha.get("id", "")
    remote_jid = inner.get("chatId") or inner.get("from") or waha.get("chatId") or waha.get("from", "")
    msg_text   = inner.get("body") or waha.get("body", "")
    push_name  = inner.get("pushName") or waha.get("pushName", "")
    timestamp  = (inner.get("timestamp") or inner.get("messageTimestamp")
                  or waha.get("timestamp") or waha.get("messageTimestamp"))
    from_me    = inner.get("fromMe") if inner.get("fromMe") is not None else waha.get("fromMe", False)
    session    = waha.get("session") or inner.get("_sessionName") or waha.get("_sessionName", "waha")

    has_media = bool(inner.get("hasMedia"))
    waha_type  = str(inner.get("type") or "").lower()
    media_obj  = inner.get("media") or {}
    caption    = inner.get("caption") or ""

    if has_media and waha_type in _WAHA_TYPE_TO_MSG_KEY:
        msg_key = _WAHA_TYPE_TO_MSG_KEY[waha_type]
        raw_url = media_obj.get("url") or inner.get("mediaUrl") or ""
        media_url = _normalize_waha_media_url(raw_url) if raw_url else ""
        message: dict = {
            msg_key: {
                "url":      media_url,
                "mimetype": media_obj.get("mimetype") or "application/octet-stream",
                "fileName": media_obj.get("filename") or media_obj.get("fileName") or "",
                "caption":  caption,
            }
        }
    else:
        message = {"conversation": msg_text}

    return {
        "data": {
            "key": {
                "id": msg_id,
                "remoteJid": remote_jid,
                "fromMe": bool(from_me),
            },
            "pushName": push_name,
            "message": message,
            "messageTimestamp": timestamp,
        },
        "event": "messages.upsert",
        "instance": session,
    }

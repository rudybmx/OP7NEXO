"""Adapter: converte payload do WAHA Plus para o formato interno usado por normalize_message_event().

WAHA Plus (noweb) envolve os campos da mensagem dentro de waha["payload"]:
    {"event": "message", "session": "...", "payload": {"id": "...", "from": "...", "body": "..."}}

Versões mais antigas entregavam os campos na raiz (flat). O adapter tenta "payload" primeiro
e cai de volta para a raiz como fallback.
"""

from __future__ import annotations

import logging
import os
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

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

# ACK codes WAHA Plus NOWEB → status interno
_WAHA_ACK_NAME_MAP: dict[str, str] = {
    "error":     "failed",
    "pending":   "pending",
    "server":    "sent",
    "device":    "delivered",
    "read":      "read",
    "played":    "read",
}

_WAHA_ACK_INT_MAP: dict[int, str] = {
    -1: "failed",
    0:  "pending",
    1:  "sent",
    2:  "delivered",
    3:  "read",
    4:  "read",
}


def _map_waha_ack_to_status(ack: int | None, ack_name: str | None) -> str | None:
    """Converte ACK WAHA em status interno. Retorna None se não reconhecido.

    ackName tem prioridade sobre o int (mais robusto a variações de versão).
    """
    name = str(ack_name or "").strip().lower()
    if name:
        mapped = _WAHA_ACK_NAME_MAP.get(name)
        if mapped:
            return mapped
    if ack is not None:
        try:
            return _WAHA_ACK_INT_MAP.get(int(ack))
        except (TypeError, ValueError):
            pass
    return None


def _waha_short_msg_id(raw_id: str) -> str:
    """Extrai o short message ID do full WA ID WAHA NOWEB.

    Full WA ID format: "true_JID_SHORTID" ou "false_JID_SHORTID".
    Só normaliza se o sufixo após 'true_'/'false_' ainda contiver '_'
    (ou seja, formato real true_JID_SHORTID). IDs simples são retornados intactos.
    """
    if raw_id.startswith(("true_", "false_")):
        suffix = raw_id.split("_", 1)[1]   # parte após o prefixo
        if "_" in suffix:                   # confirma estrutura JID_SHORTID
            return raw_id.rsplit("_", 1)[-1]
    return raw_id


def _normalize_waha_jid(jid: str) -> str:
    text = str(jid or "").strip()
    if text.endswith("@c.us"):
        return f"{text[:-5]}@s.whatsapp.net"
    return text


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

    Trata também evento message.ack, retornando messages.update compatível com
    normalize_receipt_event() para atualização de status de entrega/leitura.
    """
    inner = waha.get("payload") or waha

    msg_id     = _waha_short_msg_id(str(inner.get("id") or waha.get("id", "")))
    remote_jid = _normalize_waha_jid(
        inner.get("chatId") or inner.get("from") or waha.get("chatId") or waha.get("from", "")
    )
    msg_text   = inner.get("body") or waha.get("body", "")
    push_name  = inner.get("pushName") or waha.get("pushName", "")
    timestamp  = (inner.get("timestamp") or inner.get("messageTimestamp")
                  or waha.get("timestamp") or waha.get("messageTimestamp"))
    from_me    = inner.get("fromMe") if inner.get("fromMe") is not None else waha.get("fromMe", False)
    session    = waha.get("session") or inner.get("_sessionName") or waha.get("_sessionName", "waha")
    event_name = (waha.get("event") or "").lower()

    if event_name == "session.status":
        return {
            "data": {
                "status": inner.get("status") or waha.get("status"),
                "state": inner.get("status") or waha.get("status"),
                "number": (inner.get("me") or {}).get("id") if isinstance(inner.get("me"), dict) else None,
            },
            "event": "connection.update",
            "instance": session,
        }

    # ── Branch message.ack — receipt de entrega/leitura ──────────────────────
    if event_name == "message.ack":
        ack_val  = inner.get("ack")
        ack_name = inner.get("ackName")
        # WAHA NOWEB envia full WA ID: "true_JID_SHORTID" — normalizar para short ID
        # que é o que o sendText/sendImage armazena no banco (evolution_msg_id).
        ack_msg_id = _waha_short_msg_id(msg_id)
        logger.debug(
            "[waha-ack] event=%s ack=%s ackName=%s has_id=%s",
            waha.get("event"), ack_val, ack_name, bool(ack_msg_id),
        )
        ack_status = _map_waha_ack_to_status(ack_val, ack_name)
        if ack_status is None:
            logger.warning("[waha-ack] ack desconhecido ack=%s ackName=%s", ack_val, ack_name)
            return {"event": "messages.ack_unknown", "instance": session}
        return {
            "data": {
                "key": {
                    "id": ack_msg_id,
                    "remoteJid": remote_jid,
                    "fromMe": bool(from_me),
                },
                "status": ack_status,
            },
            "event": "messages.update",
            "instance": session,
        }

    # ── Branch mensagem (texto / mídia) ──────────────────────────────────────
    has_media = bool(inner.get("hasMedia"))
    waha_type  = str(inner.get("type") or "").lower()
    media_obj  = inner.get("media") or {}
    caption    = inner.get("caption") or ""

    # WAHA NOWEB não envia campo "type" — inferir pelo mimetype quando ausente
    if has_media and (not waha_type or waha_type not in _WAHA_TYPE_TO_MSG_KEY):
        mimetype_str = (media_obj.get("mimetype") or "").lower()
        if mimetype_str.startswith("image/webp"):
            waha_type = "sticker"
        elif mimetype_str.startswith("image/"):
            waha_type = "image"
        elif mimetype_str.startswith("audio/"):
            waha_type = "ptt"
        elif mimetype_str.startswith("video/"):
            waha_type = "video"
        elif mimetype_str:
            waha_type = "document"

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
        if media_obj.get("error"):
            message[msg_key]["error"] = str(media_obj.get("error"))
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

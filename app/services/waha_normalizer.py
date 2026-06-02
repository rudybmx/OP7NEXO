"""Adapter: converte payload do WAHA Plus para o formato interno usado por normalize_message_event().

WAHA Plus (noweb) envolve os campos da mensagem dentro de waha["payload"]:
    {"event": "message", "session": "...", "payload": {"id": "...", "from": "...", "body": "..."}}

Versões mais antigas entregavam os campos na raiz (flat). O adapter tenta "payload" primeiro
e cai de volta para a raiz como fallback.
"""

from __future__ import annotations


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

    return {
        "data": {
            "key": {
                "id": msg_id,
                "remoteJid": remote_jid,
                "fromMe": bool(from_me),
            },
            "pushName": push_name,
            "message": {"conversation": msg_text},
            "messageTimestamp": timestamp,
        },
        "event": "messages.upsert",
        "instance": session,
    }

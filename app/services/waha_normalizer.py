"""Adapter: converte payload flat do WAHA Plus para o formato interno usado por normalize_message_event().

O WAHA Plus entrega mensagens com campos na raiz (flat), diferente do Evolution API que usa
estrutura hierárquica (data.data.Info.Chat, data.data.Message). Este módulo faz a tradução
para que o pipeline existente (enqueue_evolution_event → process_evolution_message) funcione
sem alterações.
"""

from __future__ import annotations


def adapt_waha_to_evolution(waha: dict) -> dict:
    """Converte payload inbound WAHA para estrutura compatível com normalize_message_event().

    Campos WAHA esperados na raiz:
        id, chatId, from, body, pushName, timestamp, fromMe, hasMedia, _sessionName
    """
    remote_jid: str = waha.get("chatId") or waha.get("from") or ""
    return {
        "data": {
            "key": {
                "id": waha.get("id", ""),
                "remoteJid": remote_jid,
                "fromMe": bool(waha.get("fromMe", False)),
            },
            "pushName": waha.get("pushName", ""),
            "message": {"conversation": waha.get("body", "")},
            "messageTimestamp": waha.get("timestamp") or waha.get("messageTimestamp"),
        },
        "event": "messages.upsert",
        "instance": waha.get("_sessionName", "waha"),
    }

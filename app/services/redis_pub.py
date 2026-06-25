import json
import os
from urllib.parse import quote

import redis

WHATSAPP_EVENTS_CHANNEL = os.getenv("WHATSAPP_EVENTS_CHANNEL", "whatsapp:events")
NOTIFICACOES_EVENTS_CHANNEL = os.getenv("NOTIFICACOES_EVENTS_CHANNEL", "notifications:events")

_redis_client: redis.Redis | None = None


def _resolve_redis_url() -> str:
    explicit_url = (os.getenv("REDIS_URL") or "").strip()
    if explicit_url:
        return explicit_url

    password = (os.getenv("REDIS_PASSWORD") or "").strip()
    if password:
        return f"redis://:{quote(password, safe='')}@redis:6379/0"

    raise RuntimeError("Configuração Redis ausente. Defina REDIS_URL ou REDIS_PASSWORD.")


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(_resolve_redis_url(), decode_responses=True)
    return _redis_client


def publish_whatsapp_event(event: dict) -> None:
    """Publica um evento WhatsApp no canal Redis para consumo em tempo real."""
    try:
        r = _get_redis()
        r.publish(WHATSAPP_EVENTS_CHANNEL, json.dumps(event))
    except Exception as e:
        # Não quebrar o webhook se o Redis falhar
        print(f"[redis_pub] falha ao publicar evento: {e}")


def publish_notificacao_event(event: dict) -> None:
    """Publica um evento de notificação no canal Redis (base p/ realtime futuro)."""
    try:
        r = _get_redis()
        r.publish(NOTIFICACOES_EVENTS_CHANNEL, json.dumps(event))
    except Exception as e:
        print(f"[redis_pub] falha ao publicar notificação: {e}")

import json
import os

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://default:hgyQW64RKLQCdYz3ATb5vtfXhoVvfH3y@redis:6379")
WHATSAPP_EVENTS_CHANNEL = os.getenv("WHATSAPP_EVENTS_CHANNEL", "whatsapp:events")

_redis_client: redis.Redis | None = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


def publish_whatsapp_event(event: dict) -> None:
    """Publica um evento WhatsApp no canal Redis para consumo em tempo real."""
    try:
        r = _get_redis()
        r.publish(WHATSAPP_EVENTS_CHANNEL, json.dumps(event))
    except Exception as e:
        # Não quebrar o webhook se o Redis falhar
        print(f"[redis_pub] falha ao publicar evento: {e}")

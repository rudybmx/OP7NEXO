"""Resolver de configuração de IA — DB-first com fallback no `.env`.

Substitui a leitura direta de `settings.openai_*` (que carrega 1x no import e é
imutável em runtime). Os serviços chamam `get_ai_config(feature)` e recebem o
modelo/chave/base_url EFETIVOS: override da tabela `ai_settings` (linha `ativo=true`,
campo não-nulo) quando existir, senão o valor do `.env`.

Cache em memória com TTL curto para não bater no banco a cada chamada de IA. A UI
de admin invalida o cache ao salvar (`invalidate_cache`).

Com a tabela vazia/inativa o comportamento é byte-idêntico ao anterior (zero regressão).
Banco indisponível → cai no `.env` e loga warning (não derruba a chamada de IA).
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

from app.core.config import settings

log = logging.getLogger(__name__)

FEATURES = ("insights", "image", "vision", "copy", "carrossel", "agent")

_DEFAULT_BASE = "https://api.openai.com/v1"
_CACHE_TTL = 60.0
_lock = threading.Lock()
_cache: dict[str, tuple[float, "AiConfig"]] = {}


@dataclass(frozen=True)
class AiConfig:
    feature: str
    model: str
    api_key: str
    base_url: str
    source: str  # "db" | "env"


def _env_defaults(feature: str) -> tuple[str, str, str]:
    """Defaults do `.env` por feature → (api_key, base_url, model).

    `vision` e `copy` herdam a chave/base dedicada de imagem (comportamento atual).
    """
    if feature == "insights":
        return (
            settings.openai_api_key,
            settings.openai_base_url or _DEFAULT_BASE,
            settings.openai_model or "gpt-4o-mini",
        )
    img_key = settings.openai_image_api_key
    img_base = settings.openai_image_base_url or _DEFAULT_BASE
    if feature == "image":
        return img_key, img_base, settings.openai_image_model
    if feature == "vision":
        return img_key, img_base, settings.openai_vision_model
    if feature == "copy":
        return img_key, img_base, settings.openai_copy_model
    if feature == "carrossel":
        return img_key, img_base, settings.openai_carrossel_model
    # agent — slot reservado; herda a chave/base de texto.
    return (
        settings.openai_api_key,
        settings.openai_base_url or _DEFAULT_BASE,
        settings.openai_model or "gpt-4o-mini",
    )


def _resolve(feature: str) -> AiConfig:
    e_key, e_base, e_model = _env_defaults(feature)
    model, api_key, base_url, source = e_model, e_key, e_base, "env"

    try:
        from app.core.database import SessionLocal
        from app.models.ai_setting import AiSetting

        db = SessionLocal()
        try:
            row = (
                db.query(AiSetting)
                .filter(AiSetting.feature == feature, AiSetting.ativo.is_(True))
                .first()
            )
            if row is not None:
                if row.model:
                    model, source = row.model, "db"
                if row.api_key:
                    api_key, source = row.api_key, "db"
                if row.base_url:
                    base_url, source = row.base_url, "db"
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — banco indisponível → usa .env
        log.warning("[ai_config] fallback para .env (feature=%s): %s", feature, exc)

    return AiConfig(feature=feature, model=model, api_key=api_key, base_url=base_url, source=source)


def get_ai_config(feature: str) -> AiConfig:
    now = time.monotonic()
    with _lock:
        hit = _cache.get(feature)
        if hit and now - hit[0] < _CACHE_TTL:
            return hit[1]
    cfg = _resolve(feature)
    with _lock:
        _cache[feature] = (now, cfg)
    return cfg


def invalidate_cache(feature: str | None = None) -> None:
    with _lock:
        if feature is None:
            _cache.clear()
        else:
            _cache.pop(feature, None)


_REASONING_PREFIXES = ("gpt-5", "o1", "o3", "o4")


def chat_kwargs(
    model: str,
    max_out: int,
    *,
    temperature: float | None = None,
    reasoning_effort: str | None = None,
) -> dict:
    """Kwargs de `chat.completions.create` adaptados à família do modelo.

    Modelos de RACIOCÍNIO (gpt-5*, o1/o3/o4*): usam `max_completion_tokens` com
    headroom (o reasoning consome budget ANTES do output — budget curto → output
    vazio), NÃO aceitam `temperature` custom (só o default) e aceitam
    `reasoning_effort`. Os demais (gpt-4.1 etc.) usam `max_tokens` + `temperature`
    como antes (comportamento idêntico ao anterior → zero regressão).
    """
    m = (model or "").lower()
    if any(m.startswith(p) for p in _REASONING_PREFIXES):
        kw: dict = {"max_completion_tokens": max(int(max_out), 256) + 4000}
        if reasoning_effort:
            kw["reasoning_effort"] = reasoning_effort
        return kw
    kw = {"max_tokens": int(max_out)}
    if temperature is not None:
        kw["temperature"] = temperature
    return kw

"""Geração da BASE visual via OpenAI gpt-image-2.

Princípio: este service gera/edita apenas a base visual (fundo/cena/produto).
Texto, logo e marca NÃO entram aqui — são camadas aplicadas depois pelo
renderizador do OP7NEXO. O prompt instrui o modelo a deixar áreas livres e a
NÃO desenhar texto/logo/preço (guardrail best-effort).

IMPORTANTE: usa um cliente OpenAI DEDICADO (openai_image_*). Não reusa
openai_api_key/openai_base_url, que apontam para o gateway de texto (zen) e não
têm modelos de imagem. base_url é sempre explícito para não herdar OPENAI_BASE_URL
do ambiente.
"""
from __future__ import annotations

import base64
import logging
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.criativo import CriativoGeracao
from app.services.object_storage import public_url, put_bytes

log = logging.getLogger(__name__)

# gpt-image-2 aceita um conjunto discreto de tamanhos. Mapeamos o formato/canal
# do criativo para o tamanho válido de proporção mais próxima.
_SIZE_QUADRADO = "1024x1024"
_SIZE_RETRATO = "1024x1536"
_SIZE_PAISAGEM = "1536x1024"

_FORMAT_TO_SIZE = {
    "feed_1x1": _SIZE_QUADRADO,
    "quadrado": _SIZE_QUADRADO,
    "1x1": _SIZE_QUADRADO,
    "story": _SIZE_RETRATO,
    "stories": _SIZE_RETRATO,
    "reels": _SIZE_RETRATO,
    "9x16": _SIZE_RETRATO,
    "retrato": _SIZE_RETRATO,
    "feed_4x5": _SIZE_RETRATO,
    "4x5": _SIZE_RETRATO,
    "paisagem": _SIZE_PAISAGEM,
    "banner": _SIZE_PAISAGEM,
    "16x9": _SIZE_PAISAGEM,
}


def resolve_generation_size(creative_format: str | None) -> str:
    """Mapeia o formato/canal final para um size válido do gpt-image-2."""
    if not creative_format:
        return _SIZE_QUADRADO
    return _FORMAT_TO_SIZE.get(creative_format.strip().lower(), _SIZE_QUADRADO)


# Guardrail anti-texto/logo (best-effort): pedido explícito de base limpa.
_GUARDRAIL = (
    "Generate ONLY the visual background/scene for an advertisement. "
    "Do NOT draw any text, words, letters, numbers, prices, captions, call-to-action, "
    "phone numbers, addresses, slogans, legal text, logos or brand names anywhere in the image. "
    "Leave clean, uncluttered safe areas for text/logo to be added later by the layout engine. "
    "Photorealistic, high quality, professional advertising composition."
)


def montar_prompt(
    *,
    estilo_prompt_template: str | None,
    briefing: str,
    creative_format: str | None,
    brand_kit: dict | None = None,
) -> str:
    partes: list[str] = []
    if estilo_prompt_template:
        partes.append(estilo_prompt_template.strip())
    if briefing:
        partes.append(f"Briefing: {briefing.strip()}")
    if creative_format:
        partes.append(f"Format: {creative_format}")
    if brand_kit:
        cores = [c for c in (brand_kit.get("primary_color"), brand_kit.get("secondary_color")) if c]
        if cores:
            partes.append("Brand colors (aesthetic direction only): " + ", ".join(cores))
        if brand_kit.get("visual_rules"):
            partes.append(f"Visual direction: {brand_kit['visual_rules']}")
        if brand_kit.get("forbidden_rules"):
            partes.append(f"Avoid: {brand_kit['forbidden_rules']}")
    partes.append(_GUARDRAIL)
    return "\n".join(partes)


def _image_client():
    from openai import OpenAI

    return OpenAI(
        api_key=settings.openai_image_api_key,
        base_url=settings.openai_image_base_url or "https://api.openai.com/v1",
    )


def _map_error(exc: Exception) -> tuple[str, str]:
    """Mapeia exceção da OpenAI para (error_code, mensagem amigável)."""
    try:
        from openai import APITimeoutError, BadRequestError, RateLimitError
    except Exception:  # pragma: no cover
        return "provider_error", str(exc)[:300]

    if isinstance(exc, RateLimitError):
        return "rate_limited", "Limite de uso da OpenAI atingido. Tente novamente em instantes."
    if isinstance(exc, APITimeoutError):
        return "timeout", "A geração demorou demais e expirou. Tente novamente."
    if isinstance(exc, BadRequestError):
        msg = str(exc).lower()
        if "content_policy" in msg or "moderation" in msg or "safety" in msg:
            return "blocked_by_policy", "O conteúdo solicitado foi bloqueado pela política da OpenAI."
        return "invalid_prompt", "O pedido foi rejeitado pelo modelo. Ajuste o briefing e tente de novo."
    return "provider_error", "Falha ao gerar a imagem no provedor. Tente novamente."


def gerar_base(
    db: Session,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID | None,
    briefing: str,
    creative_format: str | None = None,
    estilo=None,
    quality: str = "low",
    brand_kit: dict | None = None,
) -> CriativoGeracao:
    """Gera a base visual e persiste o registro de geração (com auditoria).

    Não faz streaming (fatia inicial, testável por curl). O endpoint SSE virá
    por cima reusando esta lógica.
    """
    size = resolve_generation_size(creative_format)
    prompt = montar_prompt(
        estilo_prompt_template=getattr(estilo, "prompt_template", None),
        briefing=briefing,
        creative_format=creative_format,
        brand_kit=brand_kit,
    )

    ger = CriativoGeracao(
        workspace_id=workspace_id,
        user_id=user_id,
        estilo_id=getattr(estilo, "id", None),
        briefing=briefing,
        creative_format=creative_format,
        generation_size=size,
        model=settings.openai_image_model,
        prompt_final=prompt,
        params_json={"size": size, "quality": quality},
        status="pending",
    )
    db.add(ger)
    db.commit()
    db.refresh(ger)

    try:
        client = _image_client()
        raw = client.images.with_raw_response.generate(
            model=settings.openai_image_model,
            prompt=prompt,
            size=size,
            quality=quality,
            n=1,
        )
        request_id = getattr(raw, "request_id", None)
        resp = raw.parse()

        b64 = resp.data[0].b64_json
        content = base64.b64decode(b64)
        object_name = f"workspaces/{workspace_id}/criativos/bases/{ger.id}.png"
        put_bytes(settings.MINIO_BUCKET_CRIATIVOS, object_name, content, "image/png")
        url = public_url(settings.MINIO_BUCKET_CRIATIVOS, object_name)

        usage = resp.usage.model_dump() if getattr(resp, "usage", None) else {}
        ger.imagem_base_url = url
        ger.usage = usage
        ger.request_id = request_id
        ger.model_snapshot = getattr(resp, "model", None) or settings.openai_image_model
        ger.status = "done"
        db.commit()
        db.refresh(ger)
        log.info("[image_gen] base gerada geracao=%s tokens=%s", ger.id, usage.get("total_tokens"))
    except Exception as exc:  # noqa: BLE001
        code, msg = _map_error(exc)
        ger.status = "error"
        ger.error_code = code
        ger.error_message = msg
        db.commit()
        db.refresh(ger)
        log.warning("[image_gen] falha geracao=%s code=%s err=%s", ger.id, code, str(exc)[:200])

    return ger

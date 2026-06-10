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


def criar_geracao(
    db: Session,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID | None,
    briefing: str,
    creative_format: str | None = None,
    estilo_id: uuid.UUID | None = None,
    estilo_prompt_template: str | None = None,
    quality: str = "low",
    brand_kit: dict | None = None,
) -> CriativoGeracao:
    """Insere o registro de geração em status `pending` e devolve com id.

    Separado de `executar_geracao` para o SSE emitir `generation.created` (com o
    id, para recuperação/reconexão) ANTES da chamada bloqueante ao modelo.
    """
    size = resolve_generation_size(creative_format)
    prompt = montar_prompt(
        estilo_prompt_template=estilo_prompt_template,
        briefing=briefing,
        creative_format=creative_format,
        brand_kit=brand_kit,
    )
    ger = CriativoGeracao(
        workspace_id=workspace_id,
        user_id=user_id,
        estilo_id=estilo_id,
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
    return ger


def executar_geracao(db: Session, ger: CriativoGeracao) -> CriativoGeracao:
    """Chama o gpt-image-2, salva a base no MinIO e atualiza o registro.

    Em erro, persiste status=error + error_code mapeado. Sempre devolve o `ger`.
    """
    quality = (ger.params_json or {}).get("quality", "low")
    try:
        client = _image_client()
        raw = client.images.with_raw_response.generate(
            model=settings.openai_image_model,
            prompt=ger.prompt_final,
            size=ger.generation_size,
            quality=quality,
            n=1,
        )
        request_id = getattr(raw, "request_id", None)
        resp = raw.parse()

        content = base64.b64decode(resp.data[0].b64_json)
        object_name = f"workspaces/{ger.workspace_id}/criativos/bases/{ger.id}.png"
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
    """Conveniência síncrona (criar + executar) — usada no teste direto/não-SSE."""
    ger = criar_geracao(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        briefing=briefing,
        creative_format=creative_format,
        estilo_id=getattr(estilo, "id", None),
        estilo_prompt_template=getattr(estilo, "prompt_template", None),
        quality=quality,
        brand_kit=brand_kit,
    )
    return executar_geracao(db, ger)


# ───────────────────────── Geração INTEGRADA (one-shot) ─────────────────────
# gpt-image-2 renderiza a arte COMPLETA: texto + composição integrados, e a
# logo via multi-imagem (images.edit). Estratégia de logo: híbrida — o modelo
# integra a logo do upload; se o usuário marcar force_real_logo, o sistema
# aplica um overlay inteligente da logo real (fallback de fidelidade).

_BASE_TXT = (
    "Texto integrado à arte de forma elegante (não use texto solto/sobreposto sem "
    "composição). Hierarquia clara: headline forte, subtítulo legível, CTA em botão "
    "evidente. Alto contraste e área segura nas bordas para Meta Ads. Logo fiel, sem "
    "distorcer. Ortografia em português do Brasil impecável. Visual de agência, premium."
)
_FORBIDDEN_TXT = (
    "Evite: antes/depois, promessa de resultado, instrumentos clínicos invasivos, "
    "sangue, visual brega, poluição visual, texto pequeno demais, logo deformada."
)


def montar_prompt_integrado(
    spec: dict, *, tem_logo: bool = False, tem_referencia: bool = False
) -> str:
    g = spec.get
    L: list[str] = [
        "Você é diretor de arte de performance. Crie um criativo publicitário "
        "PROFISSIONAL e premium, pronto para Meta Ads, com todo o texto e a marca "
        "integrados de forma elegante na arte."
    ]
    if g("product"):
        L.append(f"Produto/serviço: {g('product')}.")
    if g("objective"):
        L.append(f"Objetivo da campanha: {g('objective')}.")
    if g("audience"):
        L.append(f"Público: {g('audience')}.")
    if g("estilo"):
        L.append(f"Estilo visual: {g('estilo')}.")
    if g("tone"):
        L.append(f"Tom: {g('tone')}.")
    replica = tem_referencia and (g("reference_usage") == "replica")

    # No modo réplica, a referência manda na paleta — as cores da marca NÃO repintam.
    cores = [c for c in (g("primary_color"), g("secondary_color")) if c]
    if cores and not replica:
        L.append(
            "Paleta da MARCA (use como cores predominantes da arte — fundos, "
            "destaques, formas e botão): " + ", ".join(cores) + "."
        )
    if tem_referencia:
        if replica:
            L.append(
                "REPLIQUE EXATAMENTE a imagem de referência: mesmo layout, posições, "
                "proporções, formas, composição e PALETA DE CORES. Troque APENAS os "
                "textos pelos fornecidos abaixo e a marca/logo. Mantenha todo o resto "
                "idêntico ao modelo — não invente novo layout nem mude as cores da arte."
            )
        else:
            uso = g("reference_usage") or "style_and_composition"
            traduz = {
                "style": "como direção de estilo",
                "composition": "como direção de composição e hierarquia",
                "style_and_composition": "como direção de estilo, composição e hierarquia",
            }.get(uso, "como direção visual")
            L.append(
                f"Use a imagem de REFERÊNCIA enviada {traduz}, sem copiar literalmente."
            )
    if tem_logo:
        L.append(
            "Use a LOGO enviada de forma fiel (sem redesenhar nem distorcer), "
            "posicionada de forma discreta e profissional (topo ou rodapé)."
        )
    rico = (g("densidade") or "simples") == "rico"

    copy_parts: list[str] = []
    if g("headline"):
        copy_parts.append(f'Headline (texto mais forte): "{g("headline")}"')
    if g("subheadline"):
        copy_parts.append(f'Subtítulo: "{g("subheadline")}"')
    if g("cta"):
        copy_parts.append(
            f'CTA proporcional e no estilo do criativo de referência (botão discreto e '
            f'elegante, NÃO um botão genérico grande ocupando muito espaço): "{g("cta")}"'
        )
    rodape = g("footer") or (g("city") if g("show_city", True) else None)
    if rodape:
        copy_parts.append(f'Rodapé pequeno: "{rodape}"')

    if rico:
        L.append(
            "Monte um anúncio COMPLETO e persuasivo, com copy de apoio e boa densidade "
            "visual (como um anúncio de agência), mantendo hierarquia clara e sem poluição."
        )
        if copy_parts:
            L.append("Textos principais: " + "; ".join(copy_parts) + ".")
        bullets = [b for b in (g("bullets") or []) if b]
        if bullets:
            L.append(
                "Inclua estes bullets de benefício, com ícones elegantes: "
                + "; ".join(f'"{b}"' for b in bullets)
                + "."
            )
        else:
            L.append("Inclua 2 a 3 bullets curtos de benefício relevantes, com ícones elegantes.")
        if g("selo"):
            L.append(f'Inclua um selo de credibilidade discreto: "{g("selo")}".')
        if g("copy_extra"):
            L.append(f"Copy adicional para integrar à arte: {g('copy_extra')}.")
    else:
        if copy_parts:
            L.append(
                "Escreva na arte EXATAMENTE estes textos (não invente outros): "
                + "; ".join(copy_parts)
                + "."
            )
        L.append(
            f"No máximo ~{spec.get('max_words', 14)} palavras na arte. Visual limpo, "
            "premium, com bastante espaço negativo."
        )

    L.append(f"Formato: {g('creative_format') or 'feed_1x1'}.")
    if g("briefing"):
        L.append(f"Observações extras: {g('briefing')}.")
    L.append(_BASE_TXT + " " + _FORBIDDEN_TXT)
    return "\n".join(L)


def criar_geracao_integrada(
    db: Session,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID | None,
    spec: dict,
    tem_logo: bool = False,
    tem_referencia: bool = False,
) -> CriativoGeracao:
    size = resolve_generation_size(spec.get("creative_format"))
    prompt = montar_prompt_integrado(spec, tem_logo=tem_logo, tem_referencia=tem_referencia)
    ger = CriativoGeracao(
        workspace_id=workspace_id,
        user_id=user_id,
        briefing=spec.get("briefing"),
        creative_format=spec.get("creative_format"),
        generation_size=size,
        model=settings.openai_image_model,
        prompt_final=prompt,
        params_json={**spec, "modo": "integrado", "tem_logo": tem_logo, "tem_referencia": tem_referencia},
        status="pending",
    )
    db.add(ger)
    db.commit()
    db.refresh(ger)
    return ger


def executar_geracao_integrada(
    db: Session,
    ger: CriativoGeracao,
    *,
    logo_bytes: bytes | None = None,
    referencia_bytes: bytes | None = None,
) -> CriativoGeracao:
    """Gera a arte integrada (images.edit se houver logo/ref; senão generate)."""
    spec = ger.params_json or {}
    quality = spec.get("quality", "medium")
    try:
        client = _image_client()
        imagens: list[tuple[str, bytes, str]] = []
        if logo_bytes:
            imagens.append(("logo.png", logo_bytes, "image/png"))
        if referencia_bytes:
            imagens.append(("referencia.png", referencia_bytes, "image/png"))

        if imagens:
            raw = client.images.with_raw_response.edit(
                model=settings.openai_image_model,
                image=imagens,
                prompt=ger.prompt_final,
                size=ger.generation_size,
                quality=quality,
                n=1,
            )
        else:
            raw = client.images.with_raw_response.generate(
                model=settings.openai_image_model,
                prompt=ger.prompt_final,
                size=ger.generation_size,
                quality=quality,
                n=1,
            )
        request_id = getattr(raw, "request_id", None)
        resp = raw.parse()
        content = base64.b64decode(resp.data[0].b64_json)

        # Fallback de fidelidade: overlay inteligente da logo real (opt-in)
        if spec.get("force_real_logo") and logo_bytes:
            try:
                from app.services import criativo_render

                content = criativo_render.aplicar_logo(
                    content, logo_bytes, creative_format=ger.creative_format
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("[image_gen] overlay de logo falhou geracao=%s: %s", ger.id, exc)

        object_name = f"workspaces/{ger.workspace_id}/criativos/finais/{ger.id}.png"
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
        log.info("[image_gen] integrado geracao=%s tokens=%s", ger.id, usage.get("total_tokens"))
    except Exception as exc:  # noqa: BLE001
        code, msg = _map_error(exc)
        ger.status = "error"
        ger.error_code = code
        ger.error_message = msg
        db.commit()
        db.refresh(ger)
        log.warning("[image_gen] falha integrado geracao=%s code=%s err=%s", ger.id, code, str(exc)[:200])
    return ger

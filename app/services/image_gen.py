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


def _client_for(feature: str):
    """Cliente OpenAI com a chave/base_url EFETIVOS da feature (resolver DB-first → .env)."""
    from openai import OpenAI

    from app.core.ai_config import get_ai_config

    cfg = get_ai_config(feature)
    return OpenAI(
        api_key=cfg.api_key,
        base_url=cfg.base_url or "https://api.openai.com/v1",
    )


def _image_client():
    return _client_for("image")


def _image_model() -> str:
    """Modelo de imagem EFETIVO (override DB ou `.env`)."""
    from app.core.ai_config import get_ai_config

    return get_ai_config("image").model


def _registrar_uso_imagem(ger, usage: dict) -> None:
    """Telemetria de consumo (Fase 2). Best-effort — nunca quebra a geração."""
    from app.services.ai_usage import registrar_uso

    registrar_uso(
        feature="image",
        workspace_id=ger.workspace_id,
        model=ger.model_snapshot or _image_model(),
        kind="image",
        usage=usage,
        image_count=1,
        quality=(ger.params_json or {}).get("quality", "low"),
        size=ger.generation_size,
        request_id=ger.request_id,
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
        model=_image_model(),
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
            model=_image_model(),
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
        ger.model_snapshot = getattr(resp, "model", None) or _image_model()
        ger.status = "done"
        db.commit()
        db.refresh(ger)
        log.info("[image_gen] base gerada geracao=%s tokens=%s", ger.id, usage.get("total_tokens"))
        _registrar_uso_imagem(ger, usage)
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
    "evidente. Alto contraste. RESPIRO/margem de segurança de ~10% em TODAS as bordas: "
    "headline, subtítulo, CTA e logo DENTRO da zona central segura — NADA de conteúdo "
    "essencial colado nas bordas (a arte é cortada para o formato final do canal). "
    "Composição equilibrada e arejada. Logo fiel, sem distorcer. Ortografia em português "
    "do Brasil impecável, SEM travessão (—). Visual de agência, premium."
)
_FORBIDDEN_TXT = (
    "Evite: antes/depois, promessa de resultado, instrumentos clínicos invasivos, "
    "sangue, visual brega, poluição visual, texto pequeno demais, logo deformada."
)

# Instrução concreta por objetivo da campanha (muda tom/CTA/composição de verdade).
_OBJETIVO_INSTRUCAO = {
    "agendamento no whatsapp": "Objetivo: agendamento via WhatsApp — CTA conversacional e direto (ex.: 'Fale no WhatsApp', 'Agende agora'), com leve urgência e baixa fricção.",
    "geração de leads": "Objetivo: gerar leads — desperte curiosidade e valor; CTA de captura (ex.: 'Quero saber mais', 'Receba').",
    "divulgar oferta": "Objetivo: divulgar oferta — use escassez/urgência e destaque o benefício/oferta (senso de oportunidade).",
    "institucional / marca": "Objetivo: institucional — tom de autoridade e confiança, memorável, menos promocional.",
}


def _prompt_reverso(cs: dict, densidade_ajuste: str, logo_mode: str = "compor") -> str:
    """Monta o prompt a partir do creative_spec rico (extraído e editado) — Modelo Reverso.

    Usa a `descricao` como espinha + `conteudo_textual` (textos exatos) + paleta +
    categorias. Aceita o schema legado (`regions`) como fallback.
    """
    ct = cs.get("conteudo_textual") or {}
    if not ct and cs.get("regions"):  # fallback schema legado
        reg = cs["regions"]
        ct = {
            "headline": (reg.get("headline") or {}).get("text", ""),
            "subheadline": (reg.get("subheadline") or {}).get("text", ""),
            "bullets": [b.get("text", "") for b in (reg.get("bullets") or [])],
            "cta": (reg.get("cta") or {}).get("text", ""),
            "footer": (reg.get("footer") or {}).get("text", ""),
        }
    logo = cs.get("logo") or (cs.get("regions") or {}).get("logo") or {}

    L: list[str] = []
    desc = cs.get("descricao")
    if desc:
        L.append(
            "Recrie um criativo publicitário para Meta Ads com base nesta descrição "
            "VISUAL do modelo (cena, personagem, composição, cores, estilo): " + desc
        )
    else:
        L.append("Recrie o criativo seguindo FIELMENTE a referência enviada.")
    pal = cs.get("paleta_de_cores") or cs.get("palette") or []
    if pal:
        L.append("Paleta (use exatamente estas cores): " + ", ".join(pal) + ".")

    def _b(x):
        return x.get("text", "") if isinstance(x, dict) else x

    textos: list[str] = []
    if ct.get("headline"):
        textos.append(f'Headline "{ct["headline"]}"')
    if ct.get("subheadline"):
        textos.append(f'Subtítulo "{ct["subheadline"]}"')
    bl = [_b(b) for b in (ct.get("bullets") or []) if _b(b)]
    if bl:
        textos.append("Bullets com ícones: " + "; ".join(f'"{b}"' for b in bl))
    if ct.get("cta"):
        textos.append(f'CTA "{ct["cta"]}"')
    if ct.get("footer"):
        textos.append(f'Rodapé "{ct["footer"]}"')
    if textos:
        L.append(
            "Os ÚNICOS textos da arte são os listados a seguir; ignore quaisquer "
            "palavras/legendas que apareçam na descrição visual. Escreva EXATAMENTE "
            "estes textos, integrados à arte com hierarquia: " + "; ".join(textos) + "."
        )
    else:
        L.append("NÃO escreva nenhum texto na arte (a descrição é só visual).")

    if logo.get("present"):
        pos = logo.get("posicao") or logo.get("position") or "topo"
        if logo_mode == "integrar":
            L.append(f"Integre a logo enviada de forma fiel e elegante em {pos}, sem distorcer.")
        else:
            obs = logo.get("observacao") or ""
            L.append(
                f"Deixe a área de {pos} como FUNDO NATURAL LIMPO para a logo {('(' + obs + ')') if obs else ''} — "
                "NÃO desenhe logo, marca, nome de marca, caixa, moldura, contorno ou placeholder; "
                "ignore qualquer menção a logo/marca na descrição; a logo real será aplicada ali depois."
            )

    if (densidade_ajuste or "fiel").lower() == "livre":
        L.append("Modo LIVRE: use a descrição como base e aprimore a composição livremente, mantendo a essência e aplicando a paleta indicada.")
    else:
        L.append("Modo FIEL: replique EXATAMENTE o layout, posições, proporções e a paleta do modelo; mude apenas o conteúdo textual indicado.")
    L.append(_BASE_TXT + " " + _FORBIDDEN_TXT)
    return "\n".join(L)


def montar_prompt_integrado(
    spec: dict, *, tem_logo: bool = False, tem_referencia: bool = False,
    tem_personagem: bool = False,
) -> str:
    g = spec.get
    cs = g("creative_spec") or {}
    if g("reference_usage") == "modelo_reverso" and cs:
        return _prompt_reverso(cs, g("densidade_ajuste") or "fiel", g("logo_mode") or "compor")
    L: list[str] = [
        "Você é diretor de arte de performance. Crie um criativo publicitário "
        "PROFISSIONAL e premium, pronto para Meta Ads, com todo o texto e a marca "
        "integrados de forma elegante na arte."
    ]
    if g("product"):
        L.append(f"Produto/serviço: {g('product')}.")
    if g("objective"):
        obj_instr = _OBJETIVO_INSTRUCAO.get((g("objective") or "").strip().lower())
        L.append(obj_instr or f"Objetivo da campanha: {g('objective')}.")
    if g("audience"):
        L.append(f"Público: {g('audience')}.")
    if g("estilo"):
        L.append(f"Estilo visual: {g('estilo')}.")
    if g("tone"):
        L.append(f"Tom: {g('tone')}.")
    if g("visual_rules"):
        L.append(f"Regras visuais da MARCA (sempre siga): {g('visual_rules')}.")
    if g("forbidden_rules"):
        L.append(f"NUNCA faça (proibido pela MARCA): {g('forbidden_rules')}.")
    if tem_personagem:
        L.append(
            "PESSOA REAL: as fotos anexadas (primeiras imagens) representam a MESMA pessoa — "
            "use como fonte de identidade do personagem do criativo. PRESERVE o rosto FIEL: "
            "formato do rosto, olhos, nariz, boca, tom de pele, cabelo e idade aparente; a pessoa "
            "deve ser CLARAMENTE RECONHECÍVEL como a das fotos. NÃO rejuvenesça, NÃO embeleze, "
            "NÃO troque etnia, NÃO altere gênero, NÃO misture características de pessoas diferentes "
            "e NÃO estilize o rosto. Integre de forma fotorrealista, coerente com a luz da cena. "
            "PRIORIDADE: 1) identidade da pessoa, 2) composição, 3) estilo (se houver imagem de "
            "referência, ela é só ESTILO — não copie pessoas dela)."
        )
        if g("personagem_descricao"):
            L.append(f"Como o personagem deve aparecer na arte: {g('personagem_descricao')}.")
    replica = tem_referencia and (g("reference_usage") == "replica")

    # No modo réplica, a referência manda na paleta — as cores da marca NÃO repintam.
    c60 = g("cor_60") or g("primary_color")
    c30 = g("cor_30") or g("secondary_color")
    c10 = g("cor_10")
    if (c60 or c30 or c10) and not replica:
        partes_cor = []
        if c60:
            partes_cor.append(f"{c60} como cor DOMINANTE (~60%: fundos e áreas amplas)")
        if c30:
            partes_cor.append(f"{c30} como SECUNDÁRIA (~30%)")
        if c10:
            partes_cor.append(f"{c10} como DETALHE/ACENTO (~10%: bordas, ícones, botão)")
        L.append("Paleta da MARCA na regra 60/30/10: " + "; ".join(partes_cor) + ".")
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
        if (g("logo_mode") or "compor") == "integrar":
            L.append(
                "Use a LOGO enviada de forma fiel (sem redesenhar nem distorcer), "
                "posicionada de forma discreta e profissional (topo ou rodapé)."
            )
        else:
            L.append(
                "Deixe uma área de canto (topo ou rodapé) como fundo natural limpo para a logo "
                "— NÃO desenhe logo, marca, caixa, moldura, contorno ou placeholder; a logo real "
                "será aplicada ali depois."
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
    tem_personagem: bool = False,
) -> CriativoGeracao:
    size = resolve_generation_size(spec.get("creative_format"))
    prompt = montar_prompt_integrado(
        spec, tem_logo=tem_logo, tem_referencia=tem_referencia, tem_personagem=tem_personagem
    )
    ger = CriativoGeracao(
        workspace_id=workspace_id,
        user_id=user_id,
        briefing=spec.get("briefing"),
        creative_format=spec.get("creative_format"),
        generation_size=size,
        model=_image_model(),
        prompt_final=prompt,
        params_json={**spec, "modo": "integrado", "tem_logo": tem_logo,
                     "tem_referencia": tem_referencia, "tem_personagem": tem_personagem},
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
    personagem_bytes: list[bytes] | None = None,
) -> CriativoGeracao:
    """Gera a arte integrada (images.edit se houver personagem/logo/ref; senão generate)."""
    spec = ger.params_json or {}
    quality = spec.get("quality", "medium")
    logo_mode = spec.get("logo_mode", "compor")
    try:
        client = _image_client()
        imagens: list[tuple[str, bytes, str]] = []
        # Personagem PRIMEIRO (fonte de identidade); gpt-image-2 já processa toda
        # imagem de entrada em alta fidelidade (não há param input_fidelity).
        for i, pb in enumerate(personagem_bytes or [], 1):
            imagens.append((f"personagem_{i}.png", pb, "image/png"))
        # No modo "compor" a logo NÃO vai ao modelo (pra ele não desenhar nada);
        # é composta depois. No "integrar" a logo vai e o modelo a desenha.
        if logo_bytes and logo_mode == "integrar":
            imagens.append(("logo.png", logo_bytes, "image/png"))
        if referencia_bytes:
            imagens.append(("referencia.png", referencia_bytes, "image/png"))

        if imagens:
            raw = client.images.with_raw_response.edit(
                model=_image_model(),
                image=imagens,
                prompt=ger.prompt_final,
                size=ger.generation_size,
                quality=quality,
                n=1,
            )
        else:
            raw = client.images.with_raw_response.generate(
                model=_image_model(),
                prompt=ger.prompt_final,
                size=ger.generation_size,
                quality=quality,
                n=1,
            )
        request_id = getattr(raw, "request_id", None)
        resp = raw.parse()
        content = base64.b64decode(resp.data[0].b64_json)

        # Reenquadra pro tamanho EXATO do canal antes de compor a logo (gpt-image-2 só
        # tem 1024²/1024×1536/1536×1024; 4:5 e 9:16 caíam em 2:3). object-cover.
        from app.services import criativo_render

        try:
            content = criativo_render.ajustar_para_canvas(content, ger.creative_format)
        except Exception as exc:  # noqa: BLE001
            log.warning("[image_gen] ajuste de canvas falhou geracao=%s: %s", ger.id, exc)

        # Modo "compor": compõe a logo real na posição (do JSON no reverso; default nos demais)
        if logo_bytes and logo_mode == "compor":
            cs = spec.get("creative_spec") or {}
            logo_region = cs.get("logo") or (cs.get("regions") or {}).get("logo") or {}
            try:
                from app.services import criativo_render

                content = criativo_render.aplicar_logo(
                    content,
                    logo_bytes,
                    creative_format=ger.creative_format,
                    position=logo_region.get("posicao") or logo_region.get("position") or "topo-esquerda",
                    size=logo_region.get("tamanho") or logo_region.get("size") or "media",
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("[image_gen] composicao de logo falhou geracao=%s: %s", ger.id, exc)

        object_name = f"workspaces/{ger.workspace_id}/criativos/finais/{ger.id}.png"
        put_bytes(settings.MINIO_BUCKET_CRIATIVOS, object_name, content, "image/png")
        url = public_url(settings.MINIO_BUCKET_CRIATIVOS, object_name)

        usage = resp.usage.model_dump() if getattr(resp, "usage", None) else {}
        ger.imagem_base_url = url
        ger.usage = usage
        ger.request_id = request_id
        ger.model_snapshot = getattr(resp, "model", None) or _image_model()
        ger.status = "done"
        db.commit()
        db.refresh(ger)
        log.info("[image_gen] integrado geracao=%s tokens=%s", ger.id, usage.get("total_tokens"))
        _registrar_uso_imagem(ger, usage)
    except Exception as exc:  # noqa: BLE001
        code, msg = _map_error(exc)
        ger.status = "error"
        ger.error_code = code
        ger.error_message = msg
        db.commit()
        db.refresh(ger)
        log.warning("[image_gen] falha integrado geracao=%s code=%s err=%s", ger.id, code, str(exc)[:200])
    return ger

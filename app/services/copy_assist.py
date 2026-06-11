"""Assistente de copy com IA — gera/melhora textos de criativo com gatilhos mentais.

Usa um modelo de texto (`settings.openai_copy_model`, ex. gpt-4.1-mini) com a mesma
chave OpenAI dedicada de imagem. Duas frentes:
- `melhorar_copy`: gera/melhora UM campo (botão ✨ por campo), complementando os demais.
- `gerar_pacote_copy`: gera TODOS os textos de uma vez a partir do briefing ("O que
  anunciar?"), coerentes e sem repetição — é o gatilho do botão "✨ Gerar textos".

Princípio cirúrgico: a "fatoração" (Produto/Público/Diferencial/Objetivo) é feita
DENTRO do prompt, a partir do briefing — não como campos separados na tela.
"""
from __future__ import annotations

import json
import logging

from app.core.config import settings
from app.services.image_gen import _image_client

log = logging.getLogger(__name__)

_GATILHOS = (
    "Use gatilhos mentais coerentes com o objetivo (escassez, urgência, prova social, "
    "autoridade, curiosidade/lacuna, reciprocidade, aversão à perda, exclusividade, novidade). "
    "Context is king: ancore SEMPRE no produto, no público e no objetivo informados. "
    "CTA sempre em verbo no imperativo. Português do Brasil, conciso, direto, sem clichê, "
    "sem promessa de resultado e sem termos médicos sensíveis. "
    "NUNCA use travessão (—) nem hífen longo; prefira vírgula, ponto ou frases curtas."
)


def _sem_travessao(texto: str) -> str:
    """Remove o travessão de IA (— / –) — substitui por vírgula e normaliza."""
    t = (texto or "").replace("—", ",").replace("–", ",")
    t = t.replace(" ,", ",").replace(",,", ",")
    while "  " in t:
        t = t.replace("  ", " ")
    return t.strip().strip(",").strip()


# Direção + emoção/gatilho por objetivo da campanha (valor de `objective`).
# A "emoção principal" do guia vive aqui — sem 3º seletor na tela.
_OBJ = {
    "agendamento no whatsapp": (
        "Objetivo agendar no WhatsApp: conversa fácil e baixa fricção, leve urgência. "
        "Emoção: confiança e conveniência. Gatilhos: facilidade, urgência leve."
    ),
    "geração de leads": (
        "Objetivo gerar leads: desperte curiosidade e valor; convide a uma ação de captura. "
        "Emoção: curiosidade e desejo. Gatilhos: curiosidade/lacuna, reciprocidade."
    ),
    "divulgar oferta": (
        "Objetivo divulgar oferta: destaque o benefício/oferta com senso de oportunidade. "
        "Emoção: aversão à perda (FOMO). Gatilhos: escassez, urgência."
    ),
    "institucional / marca": (
        "Objetivo institucional: tom de autoridade e confiança, memorável, menos promocional. "
        "Emoção: confiança e pertencimento. Gatilhos: autoridade, prova social."
    ),
}

# Regra/tamanho cirúrgico por campo (boas práticas de copy para Meta Ads).
_CAMPO = {
    "product": "Reescreva como direção objetiva: produto/serviço + público-alvo + diferencial competitivo (1 a 2 frases). NÃO é headline nem CTA.",
    "headline": "Crie uma HEADLINE que para o scroll: gancho forte, até ~6 palavras. Pode ser benefício claro, pergunta intrigante ou número.",
    "subheadline": "Crie um SUBTÍTULO de 1 frase que COMPLEMENTA a headline (aprofunda o benefício), sem repetir as palavras dela.",
    "cta": "Crie um CTA em verbo no imperativo, específico sobre o próximo passo (ex.: 'Agende sua avaliação'), até ~4 palavras.",
    "footer": "Crie um texto pequeno de rodapé (curtíssimo).",
    "bullet": "Crie um bullet de BENEFÍCIO (não característica), curto e direto, até ~5 palavras.",
    "selo": "Crie um selo curto de credibilidade ou urgência (ex.: 'Mais de 10 anos', 'Últimas vagas').",
    "copy_extra": "Crie uma copy de apoio curta e persuasiva (1 frase) usando AIDA ou PAS (problema, agitação, solução).",
}


def _direcao_objetivo(objective: str | None) -> str:
    return _OBJ.get((objective or "").strip().lower(), "")


def melhorar_copy(
    campo: str,
    texto_atual: str | None = None,
    product: str | None = None,
    objective: str | None = None,
    densidade: str | None = None,
    existentes: list[str] | None = None,
    tone: str | None = None,
    audience: str | None = None,
) -> tuple[str, dict]:
    """Gera ou melhora o texto de UM campo. Retorna (texto, usage).

    `existentes` = outros textos já presentes no criativo — o novo texto NÃO deve
    repeti-los; deve complementar com um ângulo diferente.
    """
    regra = _CAMPO.get(campo, "Melhore o texto a seguir mantendo a intenção.")
    obj = _direcao_objetivo(objective)

    sistema = (
        "Você é um copywriter de performance para anúncios (Meta Ads). "
        + _GATILHOS
        + " Responda APENAS com o texto final — sem aspas, sem rótulo, sem explicação."
    )
    partes = [regra]
    if obj:
        partes.append(obj)
    if product:
        partes.append(f"Contexto (o que anunciar): {product}.")
    if audience:
        partes.append(f"Público-alvo: {audience}.")
    if tone:
        partes.append(f"Tom de voz desejado: {tone}.")
    existentes = [e.strip() for e in (existentes or []) if e and e.strip()]
    if existentes:
        partes.append(
            "Textos JÁ presentes no criativo — NÃO repita as ideias/palavras deles; "
            "traga um ângulo/benefício DIFERENTE e complementar: " + " | ".join(existentes)
        )
    if texto_atual and texto_atual.strip():
        partes.append(f'Melhore mantendo a intenção (sem repetir os textos acima): "{texto_atual.strip()}".')
    else:
        partes.append("O campo está vazio: gere uma sugestão complementar (sem repetir os textos acima).")

    client = _image_client()
    resp = client.chat.completions.create(
        model=settings.openai_copy_model,
        messages=[
            {"role": "system", "content": sistema},
            {"role": "user", "content": "\n".join(partes)},
        ],
        max_tokens=120,
        temperature=0.8,
    )
    texto = _sem_travessao((resp.choices[0].message.content or "").strip().strip('"').strip())
    usage = resp.usage.model_dump() if getattr(resp, "usage", None) else {}
    log.info("[copy_assist] campo=%s tokens=%s", campo, usage.get("total_tokens"))
    return texto, usage


# ───────────────────────── Pacote de copy (gerar tudo) ──────────────────────
_PACOTE_KEYS = ("headline", "subheadline", "cta", "bullets", "selo", "copy_extra")


def _normalizar_pacote(p: dict, rico: bool) -> dict:
    """Garante as chaves, scrub anti-travessão em CADA campo, respeita a densidade."""
    if not isinstance(p, dict):
        p = {}
    out: dict = {
        "headline": _sem_travessao(str(p.get("headline") or "")),
        "subheadline": _sem_travessao(str(p.get("subheadline") or "")),
        "cta": _sem_travessao(str(p.get("cta") or "")),
        "bullets": [],
        "selo": "",
        "copy_extra": "",
    }
    if rico:
        bl = p.get("bullets") or []
        if isinstance(bl, list):
            out["bullets"] = [_sem_travessao(str(b)) for b in bl if str(b).strip()][:3]
        out["selo"] = _sem_travessao(str(p.get("selo") or ""))
        out["copy_extra"] = _sem_travessao(str(p.get("copy_extra") or ""))
    return out


def gerar_pacote_copy(
    product: str | None = None,
    objective: str | None = None,
    densidade: str | None = None,
    tone: str | None = None,
    audience: str | None = None,
) -> tuple[dict, dict]:
    """Gera TODOS os textos do criativo numa só chamada, coerentes e sem repetição.

    A IA fatora Produto/Público/Diferencial/Objetivo a partir do briefing (`product`)
    e escreve cada campo com sua função. `simples` → só headline/subheadline/cta;
    `rico` → também bullets (2–3), selo e copy_extra. Retorna (pacote, usage).
    """
    rico = (densidade or "simples").strip().lower() == "rico"
    obj = _direcao_objetivo(objective)

    sistema = (
        "Você é um copywriter de performance para anúncios (Meta Ads). "
        + _GATILHOS
        + " Responda SOMENTE com um JSON válido, sem comentários."
    )

    L: list[str] = [
        "Crie TODO o texto de um criativo de anúncio a partir de uma única direção.",
        "PASSO 1 — Fatore mentalmente a direção em Produto/Serviço, Público-alvo, "
        "Diferencial competitivo e Objetivo. Use isso como base de TUDO.",
        f'Direção (o que anunciar): "{(product or "").strip()}".',
    ]
    if obj:
        L.append(obj)
    if audience:
        L.append(f"Público-alvo: {audience}.")
    if tone:
        L.append(f"Tom de voz desejado: {tone}.")
    L.append(
        "PASSO 2 — Escreva cada campo com sua função, SEM repetir ideias ou palavras "
        "entre eles (eles se complementam):"
    )
    L.append("- headline: " + _CAMPO["headline"])
    L.append("- subheadline: " + _CAMPO["subheadline"])
    L.append("- cta: " + _CAMPO["cta"])
    if rico:
        L.append("- bullets: 2 a 3 itens, cada um um BENEFÍCIO diferente (não característica), curtos.")
        L.append("- selo: " + _CAMPO["selo"])
        L.append("- copy_extra: " + _CAMPO["copy_extra"])
        L.append(
            'Responda este JSON: {"headline":"","subheadline":"","cta":"",'
            '"bullets":["","",""],"selo":"","copy_extra":""}.'
        )
    else:
        L.append(
            "Densidade SIMPLES: gere apenas headline, subheadline e cta. "
            'Responda este JSON: {"headline":"","subheadline":"","cta":"",'
            '"bullets":[],"selo":"","copy_extra":""} (bullets vazio, selo e copy_extra vazios).'
        )

    client = _image_client()
    resp = client.chat.completions.create(
        model=settings.openai_copy_model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": sistema},
            {"role": "user", "content": "\n".join(L)},
        ],
        max_tokens=600,
        temperature=0.8,
    )
    raw = resp.choices[0].message.content or "{}"
    pacote = _normalizar_pacote(json.loads(raw), rico)
    usage = resp.usage.model_dump() if getattr(resp, "usage", None) else {}
    log.info("[copy_assist] pacote densidade=%s tokens=%s", densidade, usage.get("total_tokens"))
    return pacote, usage

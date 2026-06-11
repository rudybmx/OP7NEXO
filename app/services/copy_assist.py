"""Assistente de copy com IA — gera/melhora textos de criativo com gatilhos mentais.

Usa um modelo de texto (`settings.openai_copy_model`, ex. gpt-4.1-mini) com a mesma
chave OpenAI dedicada de imagem. Baseia-se no objetivo da campanha e no contexto do
produto. Campo vazio → gera sugestão; preenchido → melhora.
"""
from __future__ import annotations

import logging

from app.core.config import settings
from app.services.image_gen import _image_client

log = logging.getLogger(__name__)

_GATILHOS = (
    "Use gatilhos mentais quando couber (escassez, urgência, prova social, autoridade, "
    "curiosidade/lacuna, exclusividade). CTA sempre em verbo no imperativo. Português do "
    "Brasil, conciso e direto, sem clichê, sem promessa de resultado e sem termos médicos sensíveis."
)

# Direção por objetivo da campanha (valor de `objective`).
_OBJ = {
    "agendamento no whatsapp": "Foque em conversa fácil pelo WhatsApp, baixa fricção e leve urgência.",
    "geração de leads": "Desperte curiosidade e valor; convide a uma ação de captura.",
    "divulgar oferta": "Use escassez/urgência e destaque o benefício/oferta (FOMO).",
    "institucional / marca": "Tom de autoridade e confiança, memorável, menos promocional.",
}

# Regra/tamanho por campo.
_CAMPO = {
    "product": "Reescreva como descrição objetiva do produto/serviço + público + diferencial (1 a 2 frases). NÃO é uma headline nem CTA.",
    "headline": "Crie uma HEADLINE forte e curta (até ~6 palavras).",
    "subheadline": "Crie um SUBTÍTULO de 1 frase que complementa a headline.",
    "cta": "Crie um CTA em verbo no imperativo, até ~4 palavras.",
    "footer": "Crie um texto pequeno de rodapé (curtíssimo).",
    "bullet": "Crie um bullet de benefício curto (até ~5 palavras).",
    "selo": "Crie um selo de credibilidade curto (ex.: 'Mais de 10 anos de excelência').",
    "copy_extra": "Crie uma copy de apoio curta e persuasiva (1 frase).",
}


def melhorar_copy(
    campo: str,
    texto_atual: str | None = None,
    product: str | None = None,
    objective: str | None = None,
    densidade: str | None = None,
) -> tuple[str, dict]:
    """Gera ou melhora o texto de um campo. Retorna (texto, usage)."""
    regra = _CAMPO.get(campo, "Melhore o texto a seguir mantendo a intenção.")
    obj = _OBJ.get((objective or "").strip().lower(), "")

    sistema = (
        "Você é um copywriter de performance para anúncios (Meta Ads). "
        + _GATILHOS
        + " Responda APENAS com o texto final — sem aspas, sem rótulo, sem explicação."
    )
    partes = [regra]
    if obj:
        partes.append("Objetivo da campanha: " + obj)
    if product:
        partes.append(f"Contexto (o que anunciar): {product}.")
    if texto_atual and texto_atual.strip():
        partes.append(f'Melhore mantendo a intenção: "{texto_atual.strip()}".')
    else:
        partes.append("O campo está vazio: gere uma sugestão a partir do contexto.")

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
    texto = (resp.choices[0].message.content or "").strip().strip('"').strip()
    usage = resp.usage.model_dump() if getattr(resp, "usage", None) else {}
    log.info("[copy_assist] campo=%s tokens=%s", campo, usage.get("total_tokens"))
    return texto, usage

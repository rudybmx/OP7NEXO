"""Análise completa do carrossel por IA (Criativos 2.0) — pré-geração, ADVISORY.

Um "diretor de arte + especialista em marketing moderno/newsjacking" revisa TUDO que
o usuário montou (tema, textos por slide, paleta, personagens/objetos, e o estilo do
modelo em texto) e pontua coerência + aponta inconsistências e sugestões ANTES de gastar
saldo gerando imagens. NÃO gera imagem, NÃO debita (só telemetria, como copy/vision).
Modelo de texto: get_ai_config("copy").
"""
from __future__ import annotations

import json
import logging

from pydantic import BaseModel, Field, ValidationError

from app.core.ai_config import chat_kwargs, get_ai_config
from app.services.copy_assist import _sem_travessao
from app.services.image_gen import _client_for

log = logging.getLogger(__name__)

_MOLDES = {
    "A": "newsjacking de evento/celebridade",
    "B": "feature/tutorial",
    "C": "tese conceitual (X NÃO É Y)",
}


class AnaliseCarrossel(BaseModel):
    score: int = Field(ge=0, le=100)
    status: str = "ajustes"            # bom | ajustes | ruim
    resumo: str = ""
    inconsistencias: list[str] = Field(default_factory=list)
    sugestoes: list[str] = Field(default_factory=list)


_SYSTEM_ANALISE = """Você é um diretor de arte + especialista em marketing moderno e NEWSJACKING DE NEGÓCIOS, com 20 anos de experiência em carrosséis de Instagram que convertem. Recebe um carrossel JÁ montado (tema, textos por slide, paleta, personagens/objetos e, se houver, o estilo do modelo de referência) e faz uma ANÁLISE CRÍTICA antes de gerar as imagens.

Avalie:
- COERÊNCIA: os textos e a direção visual de cada slide conversam com o ASSUNTO/tema? A imagem que será gerada vai bater com a notícia/tema?
- NEWSJACKING: a marca não é a heroína (o herói é o INSIGHT)? Tem gancho que para o polegar? Há tensão/ângulo claro?
- ESTRUTURA: curva de intensidade (capa forte → desenvolvimento → clímax → CTA)? 1 ideia por slide? Há os 2 CTAs (engajamento + conversão)?
- COPY: palavra-bomba forte e curta? Sem promessa que o miolo não entrega? Sem números inventados? PT-BR impecável, sem travessão?
- DESIGN/PALETA: a paleta tem contraste e hierarquia (regra 60/30/10)? A cor-pivô destaca a palavra certa? Combina com o estilo do modelo (se houver)?
- PERSONAGENS/OBJETOS: as descrições fazem sentido no contexto? Personagens demais num slide podem poluir (recomende no máx ~3 protagonistas por slide).

Seja específico e ACIONÁVEL (cite o slide). Não reescreva tudo; aponte o que mais impacta.

Responda SOMENTE um JSON:
{"score": 0-100, "status": "bom|ajustes|ruim", "resumo": "1 frase", "inconsistencias": ["..."], "sugestoes": ["..."]}
- score >=80 e sem inconsistências graves => status "bom".
- inconsistências que comprometem o resultado => "ruim".
- caso intermediário => "ajustes".
NUNCA use travessão (—)."""


def _montar_contexto(tema: str | None, dj: dict, molde_fallback: str | None = None) -> str:
    linhas: list[str] = []
    linhas.append(f"TEMA/ASSUNTO: {tema or dj.get('tema') or '(não informado)'}")
    molde = (dj.get("molde") or molde_fallback or "").strip().upper()
    if molde:
        linhas.append(f"MOLDE: {molde} ({_MOLDES.get(molde, '?')})")
    if dj.get("angulo") or dj.get("tensao"):
        linhas.append(f"ÂNGULO/TENSÃO: {dj.get('angulo') or dj.get('tensao')}")
    if dj.get("payload"):
        linhas.append(f"LIÇÃO (payload): {dj.get('payload')}")
    pal = dj.get("paleta") or {}
    if pal:
        cores = pal.get("cores")
        if isinstance(cores, list) and cores:
            cs = ", ".join(
                f"{(c.get('hex') or '').strip()}[{c.get('papel') or 'livre'}~{c.get('peso')}]"
                for c in cores if isinstance(c, dict) and (c.get("hex") or "").strip()
            )
            linhas.append(f"PALETA ({len(cores)} cores): {cs}")
        else:
            dom = pal.get("dominante") or pal.get("tensao")
            apo = pal.get("apoio") or pal.get("resolucao")
            des = pal.get("destaque") or pal.get("pivo")
            linhas.append(f"PALETA: dominante={dom} apoio={apo} destaque={des}")
    est = (dj.get("estilo") or "").strip()
    est_ref = (dj.get("estilo_referencia") or "").strip()
    if est:
        linhas.append(f"ESTILO VISUAL: {est}")
    if est_ref:
        linhas.append(f"ESTILO DO MODELO (referência): {est_ref[:600]}")
    pers = [p.get("descricao") for p in (dj.get("personagens") or []) if (p or {}).get("descricao")]
    objs = [o.get("descricao") for o in (dj.get("objetos") or []) if (o or {}).get("descricao")]
    if pers:
        linhas.append("PERSONAGENS: " + "; ".join(pers))
    if objs:
        linhas.append("OBJETOS: " + "; ".join(objs))
    linhas.append("\nSLIDES:")
    for sd in dj.get("slides") or []:
        c = sd.get("copy") or {}
        partes = [f"  Slide {sd.get('index')}", f"intensidade={sd.get('intensidade')}"]
        if c.get("palavra_bomba"):
            partes.append(f'bomba="{c["palavra_bomba"]}"')
        if c.get("contexto"):
            partes.append(f'contexto="{c["contexto"]}"')
        if c.get("selo"):
            partes.append(f'selo="{c["selo"]}"')
        if c.get("texto"):
            partes.append(f'texto="{c["texto"]}"')
        if c.get("cta_continuacao"):
            partes.append(f'cta="{c["cta_continuacao"]}"')
        if sd.get("direcao_imagem"):
            partes.append(f'imagem="{sd["direcao_imagem"]}"')
        linhas.append(" | ".join(str(p) for p in partes))
    return "\n".join(linhas)


def analisar_carrossel(car, dj_override: dict | None = None) -> tuple[AnaliseCarrossel, dict]:
    """Analisa o carrossel montado e devolve (análise, usage). Levanta em erro de LLM.

    `dj_override`: usa este director_json (estado vivo da tela, ex.: com personagens/
    objetos do payload) em vez do persistido — não persiste nada.
    """
    dj = dj_override if dj_override is not None else (car.director_json or {})
    contexto = _montar_contexto(car.tema, dj, car.molde)
    client = _client_for("carrossel")
    model = get_ai_config("carrossel").model
    resp = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_ANALISE},
            {"role": "user", "content": contexto + "\n\nFaça a análise."},
        ],
        **chat_kwargs(model, 1100, temperature=0.4, reasoning_effort="minimal"),
    )
    usage = resp.usage.model_dump() if getattr(resp, "usage", None) else {}
    raw = resp.choices[0].message.content or "{}"
    try:
        analise = AnaliseCarrossel.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError):
        # Falha de parse não deve bloquear o usuário: devolve análise neutra.
        analise = AnaliseCarrossel(score=70, status="ajustes",
                                   resumo="Não consegui analisar com confiança; revise os textos manualmente.")
    analise.resumo = _sem_travessao(analise.resumo)
    analise.inconsistencias = [_sem_travessao(x) for x in analise.inconsistencias]
    analise.sugestoes = [_sem_travessao(x) for x in analise.sugestoes]
    if analise.status not in {"bom", "ajustes", "ruim"}:
        analise.status = "ajustes"
    log.info("[carrossel_analise] carrossel=%s score=%s status=%s tokens=%s",
             car.id, analise.score, analise.status, usage.get("total_tokens"))
    return analise, usage

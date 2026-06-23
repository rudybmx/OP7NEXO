"""Diretor de carrossel newsjacking — tema → roteiro estruturado (LLM).

Recebe um assunto e devolve o roteiro slide-a-slide (molde A/B/C, curva de
intensidade, copy + direção de imagem por slide, paleta semântica, 2 CTAs),
validado por schema Pydantic com **repair** (1 retry). NÃO gera imagem — só o
roteiro (custo zero de imagem). O texto será QUEIMADO pelo modelo de imagem na
geração (PoC 2026-06-23).

Modelo de texto: `get_ai_config("copy")` (configurável via ai_settings). O system
prompt do diretor vive na constante `_SYSTEM_DIRETOR` por enquanto.
TODO(config-db): mover o prompt para uma tabela de config para iterar a linha
criativa sem deploy (seam em `_system_prompt`).
"""
from __future__ import annotations

import json
import logging
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.core.ai_config import get_ai_config
from app.services.copy_assist import _sem_travessao
from app.services.image_gen import _client_for

log = logging.getLogger(__name__)


class RoteiroInvalidoError(RuntimeError):
    """O diretor não produziu um roteiro válido mesmo após repair."""


# ───────────────────────────── Schema do roteiro ────────────────────────────
class SlideCopy(BaseModel):
    contexto: str | None = None        # texto pequeno (topo)
    palavra_bomba: str | None = None   # headline GIGANTE all caps
    selo: str | None = None            # selo de reforço (caixa)
    texto: str | None = None           # miolo: 1 ideia, ≤12 palavras
    cta_continuacao: str | None = None  # seta "Como X? →"


class SlideRoteiro(BaseModel):
    index: int
    intensidade: str = "medio"          # alto | medio | baixo | medio-alto
    copy: SlideCopy = Field(default_factory=SlideCopy)
    direcao_imagem: str                 # tipo de imagem + sujeito + emoção/ângulo


class Paleta(BaseModel):
    tensao: str | None = None           # cor de tensão/tese
    resolucao: str | None = None        # cor do "certo / o que inclui"
    pivo: str | None = None             # cor-pivô (palavra-verbo central)


class CtaPar(BaseModel):
    engajamento: str | None = None      # penúltimo slide ("salva esse post")
    conversao: str | None = None        # último ("agende demonstração")


class RoteiroCarrossel(BaseModel):
    molde: Literal["A", "B", "C"]
    tensao: str
    payload: str                        # a lição de negócio (o herói)
    gatilhos: list[str] = Field(default_factory=list)
    paleta: Paleta = Field(default_factory=Paleta)
    slides: list[SlideRoteiro]
    ctas: CtaPar = Field(default_factory=CtaPar)
    legenda: str | None = None          # legenda do post


# ───────────────────────────── System prompt ────────────────────────────────
_SYSTEM_DIRETOR = """Você é diretor de conteúdo de edu-tainment de negócios para CARROSSEL de Instagram, na linha JORNALISMO DE MARCA via NEWSJACKING: pega um evento/conceito que já está na cabeça do público e re-enquadra como lição de marketing, vendas ou negócios.

REGRA DE OURO: a marca do cliente NUNCA é o herói — o herói é o INSIGHT. Teste de tudo: "isso para o polegar em 0,4s?".

MOLDES (escolha 1):
- A — Newsjacking de evento/celebridade (rosto famoso, noticiário). Capa: celebridade recortada + emoção extrema + headline-bomba.
- B — Newsjacking de feature/tutorial (novidade/ferramenta/atualização). O Fato → tutorial acionável → reframe estratégico → antes/depois → CTA.
- C — Tese conceitual / tríade de negação ("X NÃO É Y"): 3 capas repetindo a MESMA fórmula sintática com sujeito visual diferente → lista "o que É" → síntese split → clímax com a tese + prova social.

GATILHOS (use ≥2 e liste em "gatilhos"): curiosity gap, viés de negatividade (QUEBROU/FIM/ADEUS), pattern interrupt, empréstimo de atenção (figura famosa), ancoragem numérica (números REAIS), tribalismo, neurônios-espelho (rosto em emoção EXTREMA, nunca neutro), prova social.

CURVA DE INTENSIDADE (não é platô): capa ALTO → fato MÉDIO → desenvolvimento ALTO/MÉDIO → respiro BAIXO (lista/tipografia) → síntese MÉDIO-ALTO → clímax ALTO + prova social → CTA. Cada slide: 1 ideia, frases ≤12 palavras, termina com micro-gancho. SEMPRE 2 CTAs: engajamento no penúltimo ("salva esse post"), conversão no último. Cada slide tem cta_continuacao (seta "Como se preparar? →").

DIREÇÃO DE IMAGEM (campo direcao_imagem, escolha o TIPO pela função): celebridade recortada (empréstimo de atenção); objeto-herói (produto sem rosto, render dramático); screenshot de UI (tutorial/prova); foto real do time (prova social/clímax); montagem de 2 mundos (choque); tipografia pura (respiro); lista com ícones (didático); meme/cultura pop (reforço). Rosto SEMPRE em emoção extrema. Descreva: tipo + sujeito + emoção/ângulo. SEM citar texto a desenhar (o texto vem da copy).

COR SEMÂNTICA (paleta): tensao = cor de conflito/capa; resolucao = cor do "certo/o que inclui"; pivo = cor da palavra-verbo central. Use nomes de cor (ex.: vermelho, verde, amarelo).

GUARDRAILS: nunca prometa na capa o que o miolo não entrega; nunca invente números (dado citado tem que ser REAL); 1 ideia por slide; PT-BR impecável; NUNCA use travessão (—).

SAÍDA: responda SOMENTE com um JSON válido neste formato (sem comentários):
{"molde":"A|B|C","tensao":"...","payload":"...","gatilhos":["..."],"paleta":{"tensao":"...","resolucao":"...","pivo":"..."},"slides":[{"index":1,"intensidade":"alto","copy":{"contexto":"...","palavra_bomba":"...","selo":"...","texto":"...","cta_continuacao":"..."},"direcao_imagem":"..."}],"ctas":{"engajamento":"...","conversao":"..."},"legenda":"..."}"""


def _system_prompt(db=None) -> str:
    """Seam para futura config em DB. Hoje retorna a constante."""
    return _SYSTEM_DIRETOR


def _user_prompt(
    tema: str,
    n_slides: int,
    master_format: str,
    origem: str,
    referencia_desc: str | None,
) -> str:
    L = [
        f'Assunto/tema do carrossel: "{(tema or "").strip()}".',
        f"Gere um roteiro com EXATAMENTE {n_slides} slides (index de 1 a {n_slides}).",
        f"Formato mestre: {master_format}.",
    ]
    if origem == "referencia" and referencia_desc:
        L.append(f"Baseie o estilo visual nesta referência extraída: {referencia_desc}.")
    L.append(
        "Capa no molde escolhido; respeite a curva de intensidade e a regra dos 2 CTAs "
        "(engajamento no penúltimo, conversão no último)."
    )
    L.append("Responda SOMENTE com o JSON do schema, sem comentários.")
    return "\n".join(L)


def _scrub(r: RoteiroCarrossel) -> RoteiroCarrossel:
    """Aplica o scrub anti-travessão em todos os campos de texto."""
    def walk(v):
        if isinstance(v, str):
            return _sem_travessao(v)
        if isinstance(v, list):
            return [walk(x) for x in v]
        if isinstance(v, dict):
            return {k: walk(x) for k, x in v.items()}
        return v

    return RoteiroCarrossel.model_validate(walk(r.model_dump()))


def _merge_usage(acc: dict, u: dict) -> None:
    for k, v in (u or {}).items():
        if isinstance(v, int):
            acc[k] = acc.get(k, 0) + v


def gerar_roteiro(
    tema: str,
    n_slides: int = 5,
    master_format: str = "9x16",
    origem: str = "manual",
    referencia_desc: str | None = None,
    db=None,
) -> tuple[RoteiroCarrossel, dict]:
    """Tema → roteiro validado. Faz 1 repair se a 1ª resposta for inválida.

    Levanta RoteiroInvalidoError se nem o repair produzir JSON válido com o número
    de slides pedido. Retorna (roteiro, usage_acumulado).
    """
    client = _client_for("copy")
    model = get_ai_config("copy").model
    sistema = _system_prompt(db)
    user = _user_prompt(tema, n_slides, master_format, origem, referencia_desc)

    usage_total: dict = {}
    last_err: str | None = None
    for tentativa in (1, 2):
        msgs = [{"role": "system", "content": sistema}, {"role": "user", "content": user}]
        if last_err:
            msgs.append({
                "role": "user",
                "content": (
                    f"Sua resposta anterior foi inválida: {last_err}. "
                    f"Corrija e devolva SOMENTE JSON válido com EXATAMENTE {n_slides} "
                    f"slides (index 1..{n_slides})."
                ),
            })
        resp = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=msgs,
            max_tokens=2000,
            temperature=0.85,
        )
        _merge_usage(usage_total, resp.usage.model_dump() if getattr(resp, "usage", None) else {})
        raw = resp.choices[0].message.content or "{}"
        try:
            roteiro = RoteiroCarrossel.model_validate(json.loads(raw))
            if len(roteiro.slides) != n_slides:
                raise ValueError(f"esperado {n_slides} slides, veio {len(roteiro.slides)}")
            roteiro = _scrub(roteiro)
            log.info("[diretor] roteiro OK molde=%s slides=%s tokens=%s",
                     roteiro.molde, len(roteiro.slides), usage_total.get("total_tokens"))
            return roteiro, usage_total
        except (json.JSONDecodeError, ValidationError, ValueError) as e:
            last_err = str(e)[:300]
            log.warning("[diretor] tentativa %s inválida: %s", tentativa, last_err)

    raise RoteiroInvalidoError(f"roteiro inválido após repair: {last_err}")

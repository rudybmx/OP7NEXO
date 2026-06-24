"""Diretor de carrossel newsjacking — tema → roteiro estruturado (LLM).

Recebe um assunto e devolve o roteiro slide-a-slide (molde A/B/C, curva de
intensidade, copy + direção de imagem por slide, paleta semântica, 2 CTAs),
validado por schema Pydantic com **repair** (1 retry). NÃO gera imagem — só o
roteiro (custo zero de imagem). O texto será QUEIMADO pelo modelo de imagem na
geração (PoC 2026-06-23).

Modelo de texto: `get_ai_config("carrossel")` (configurável via ai_settings). O system
prompt do diretor vive na constante `_SYSTEM_DIRETOR` por enquanto.
TODO(config-db): mover o prompt para uma tabela de config para iterar a linha
criativa sem deploy (seam em `_system_prompt`).
"""
from __future__ import annotations

import json
import logging
from typing import Literal

from pydantic import AliasChoices, BaseModel, Field, ValidationError

from app.core.ai_config import chat_kwargs, get_ai_config
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
    # Edição por slide (front): índices do pool de personagens/objetos usados AQUI
    # (None = todos do pool; [] = nenhum) e modelo-reverso por slide.
    personagens_idx: list[int] | None = None
    objetos_idx: list[int] | None = None
    estilo_referencia: str | None = None
    objeto: dict | None = None  # objeto POR SLIDE: {"descricao": "..."} (foto vai in-memory no /gerar)
    tipo: str | None = None  # tipo de imagem (variedade): rosto-emocao|objeto-heroi|screenshot-ui|foto-time|montagem|tipografia|lista-icones|cena-conceitual


class Paleta(BaseModel):
    """Paleta de cores do carrossel.

    `cores` (lista de N cores em hex, autorada pela UI) é a FONTE DE VERDADE quando
    presente — é o que o usuário controla e o que o prompt de imagem lê. Os papéis
    nomeados (dominante/apoio/destaque) são apenas a SEMENTE do Diretor e o caminho
    de compat com roteiros antigos (chaves tensao/resolucao/pivo, via alias).
    """

    model_config = {"populate_by_name": True}

    dominante: str | None = Field(
        default=None, validation_alias=AliasChoices("dominante", "tensao"))
    apoio: str | None = Field(
        default=None, validation_alias=AliasChoices("apoio", "resolucao"))
    destaque: str | None = Field(
        default=None, validation_alias=AliasChoices("destaque", "pivo"))
    cores: list[dict] = Field(default_factory=list)  # [{"hex","papel","peso"}]
    modo: str | None = None  # analoga|mono|complementar|split|triade|tetrade|custom


class CtaPar(BaseModel):
    engajamento: str | None = None      # penúltimo slide ("salva esse post")
    conversao: str | None = None        # último ("agende demonstração")


class RoteiroCarrossel(BaseModel):
    model_config = {"populate_by_name": True}

    molde: Literal["A", "B", "C"]
    # ângulo/gancho do conflito em TEXTO (nunca cor). Compat: aceita 'tensao' antigo.
    angulo: str = Field(validation_alias=AliasChoices("angulo", "tensao"))
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

DIREÇÃO DE IMAGEM — VARIEDADE OBRIGATÓRIA (campos `tipo` + `direcao_imagem` por slide): o carrossel segue "o MESMO CAMINHO, não a MESMA imagem" — mantenha a MESMA linha visual (paleta, tipografia, clima) mas COMPOSIÇÃO e SUJEITO DIFERENTES a cada slide. NUNCA repita o mesmo enquadramento/retrato em slides seguidos.
TIPOS (1 por slide, escolha pela FUNÇÃO e VARIE): rosto-emocao (rosto humano em emoção extrema), objeto-heroi (produto/elemento sem rosto, render dramático), screenshot-ui (print de tela/dado), foto-time (pessoas reais, prova social), montagem (2 mundos colididos, choque), tipografia (só número/palavra gigante, respiro), lista-icones (itens com ícones, didático), cena-conceitual (metáfora visual do insight).
DISTRIBUIÇÃO (obrigatória, é o que evita slides iguais): no MÁXIMO 2 slides "rosto-emocao" no carrossel inteiro (tipicamente só CAPA e CLÍMAX); os demais SEM rosto chocado. Inclua pelo menos 1 "tipografia" (respiro), 1 "lista-icones" (didático) e 1 entre objeto-heroi/screenshot-ui/montagem; cada tipo aparece no máximo 2x. (No molde C, as 3 capas da tríade repetem a FÓRMULA com sujeito visual DIFERENTE em cada.)
`direcao_imagem`: RICA e ESPECÍFICA — tipo + sujeito concreto + ângulo/enquadramento + emoção/tom + por que essa imagem ENSINA e avança o insight (didática). Rosto em emoção extrema SÓ nos slides "rosto-emocao". SEM citar o texto a desenhar (o texto vem da copy).

ÂNGULO vs COR (campos DISTINTOS, não confunda!): "angulo" = o gancho/conflito central do carrossel em TEXTO (a tensão narrativa, ex.: "clínicas perdem pacientes por um erro invisível") — NUNCA uma cor. "paleta" = SEMENTE de cores em nomes de cor (ex.: vermelho, verde, amarelo): dominante (fundo/capa), apoio (listas / "o que inclui"), destaque (palavra-verbo central). É só ponto de partida; o usuário refina a paleta final na UI.

GUARDRAILS: nunca prometa na capa o que o miolo não entrega; nunca invente números (dado citado tem que ser REAL); 1 ideia por slide; PT-BR impecável; NUNCA use travessão (—).

SAÍDA: responda SOMENTE com um JSON válido neste formato (sem comentários):
{"molde":"A|B|C","angulo":"...","payload":"...","gatilhos":["..."],"paleta":{"dominante":"...","apoio":"...","destaque":"..."},"slides":[{"index":1,"intensidade":"alto","tipo":"rosto-emocao","copy":{"contexto":"...","palavra_bomba":"...","selo":"...","texto":"...","cta_continuacao":"..."},"direcao_imagem":"..."}],"ctas":{"engajamento":"...","conversao":"..."},"legenda":"..."}"""


def _system_prompt(db=None) -> str:
    """Seam para futura config em DB. Hoje retorna a constante."""
    return _SYSTEM_DIRETOR


_MOLDE_DESC = {
    "A": "newsjacking de evento/celebridade: capa com rosto/figura recortada + emocao extrema + headline-bomba; o resto desenvolve a licao por tras do evento",
    "B": "feature/tutorial: fato -> 'isso mudou tudo' -> tutorial acionavel passo a passo -> antes/depois -> CTA",
    "C": "tese conceitual 'X NAO E Y': 3 capas repetindo a formula -> lista do 'que e de verdade' -> sintese -> climax + prova social",
}


def _user_prompt(
    tema: str,
    n_slides: int,
    master_format: str,
    origem: str,
    referencia_desc: str | None,
    molde: str | None = None,
) -> str:
    L = [
        f'Assunto/tema do carrossel: "{(tema or "").strip()}".',
        f"Gere um roteiro com EXATAMENTE {n_slides} slides (index de 1 a {n_slides}).",
        f"Formato mestre: {master_format}.",
    ]
    if origem == "referencia" and referencia_desc:
        L.append(f"Baseie o estilo visual nesta referência extraída: {referencia_desc}.")
    m = (molde or "").strip().upper()
    if m in _MOLDE_DESC:
        L.append(
            f"USE OBRIGATORIAMENTE o molde {m} ({_MOLDE_DESC[m]}). Monte os slides EXATAMENTE "
            f"nessa estrutura e devolva molde='{m}' no JSON."
        )
    L.append(
        "Capa no molde; respeite a curva de intensidade e a regra dos 2 CTAs "
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
    molde: str | None = None,
) -> tuple[RoteiroCarrossel, dict]:
    """Tema → roteiro validado. Faz 1 repair se a 1ª resposta for inválida.

    Levanta RoteiroInvalidoError se nem o repair produzir JSON válido com o número
    de slides pedido. Retorna (roteiro, usage_acumulado).
    """
    client = _client_for("carrossel")
    model = get_ai_config("carrossel").model
    sistema = _system_prompt(db)
    user = _user_prompt(tema, n_slides, master_format, origem, referencia_desc, molde)

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
            **chat_kwargs(model, 2500, temperature=0.85, reasoning_effort="minimal"),
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


_SYSTEM_AJUSTE = (
    _SYSTEM_DIRETOR
    + "\n\nMODO AJUSTE: voce recebe um roteiro JA montado e devolve a MELHOR versao dele. "
    "NAO mude o ASSUNTO/tema, NAO mude o molde e NAO mude o numero de slides. Melhore a copy "
    "(palavra-bomba, contexto, selo, texto, CTA), o angulo (gancho/conflito em texto, nunca cor), "
    "a paleta (cores semente) e o encadeamento. CRITICO: DIVERSIFIQUE as imagens — aplique a "
    "DISTRIBUICAO de tipos (no maximo 2 'rosto-emocao'; garanta tipografia + lista-icones + um "
    "objeto/screenshot/montagem) e reescreva `tipo` e `direcao_imagem` de cada slide para que "
    "NENHUM fique visualmente igual ao outro, mantendo a mesma linha visual. Responda SOMENTE o JSON."
)


def ajustar_roteiro(car, db=None) -> tuple[RoteiroCarrossel, dict]:
    """Recebe o roteiro atual e devolve a MELHOR versao (mesmo assunto, molde e nº de slides)."""
    dj = car.director_json or {}
    slides = dj.get("slides") or []
    n = len(slides)
    if n == 0:
        raise RoteiroInvalidoError("carrossel sem slides para ajustar")
    tema = car.tema or dj.get("tema") or ""
    molde = dj.get("molde") or getattr(car, "molde", None) or "A"
    atual = {
        "molde": molde, "angulo": dj.get("angulo") or dj.get("tensao"),
        "payload": dj.get("payload"), "paleta": dj.get("paleta"),
        "slides": [{"index": s.get("index"), "intensidade": s.get("intensidade"),
                    "tipo": s.get("tipo"), "copy": s.get("copy"),
                    "direcao_imagem": s.get("direcao_imagem")} for s in slides],
    }
    client = _client_for("carrossel")
    model = get_ai_config("carrossel").model
    user = (
        f"ASSUNTO FIXO (NAO mudar): {tema}\nMOLDE FIXO: {molde}\nMANTENHA EXATAMENTE {n} slides (index 1..{n}).\n"
        f"Roteiro atual a melhorar (JSON):\n{json.dumps(atual, ensure_ascii=False)}\n\n"
        "Analise o ASSUNTO a fundo e a sequencia de imagens: se houver slides visualmente repetidos "
        "(ex.: varios rostos), CORRIJA diversificando tipo/direcao_imagem conforme a DISTRIBUICAO. "
        "Devolva a MELHOR versao em JSON do schema, mantendo assunto, molde e nº de slides."
    )
    usage_total: dict = {}
    last_err: str | None = None
    for tentativa in (1, 2):
        msgs = [{"role": "system", "content": _SYSTEM_AJUSTE}, {"role": "user", "content": user}]
        if last_err:
            msgs.append({"role": "user", "content": f"Invalido: {last_err}. Corrija; SOMENTE JSON com {n} slides."})
        resp = client.chat.completions.create(
            model=model, response_format={"type": "json_object"},
            messages=msgs, **chat_kwargs(model, 2500, temperature=0.7, reasoning_effort="minimal"),
        )
        _merge_usage(usage_total, resp.usage.model_dump() if getattr(resp, "usage", None) else {})
        raw = resp.choices[0].message.content or "{}"
        try:
            roteiro = RoteiroCarrossel.model_validate(json.loads(raw))
            if len(roteiro.slides) != n:
                raise ValueError(f"esperado {n} slides, veio {len(roteiro.slides)}")
            roteiro = _scrub(roteiro)
            log.info("[diretor] ajuste OK molde=%s slides=%s tokens=%s",
                     roteiro.molde, n, usage_total.get("total_tokens"))
            return roteiro, usage_total
        except (json.JSONDecodeError, ValidationError, ValueError) as e:
            last_err = str(e)[:300]
            log.warning("[diretor] ajuste tentativa %s inválida: %s", tentativa, last_err)
    raise RoteiroInvalidoError(f"ajuste inválido após repair: {last_err}")

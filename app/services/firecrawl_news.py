"""Busca de notícias (Firecrawl) + curadoria de pautas newsjacking (Origin A).

Fluxo: assunto → Firecrawl `v2/search` (sources=news, recência) → curadoria LLM
(identidade newsjacking de negócios) → 5 pautas. NÃO gera imagem. Cada pauta vira
um possível tema do Diretor. Modelo de texto: get_ai_config("copy").
"""
from __future__ import annotations

import json
import logging

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.core.ai_config import get_ai_config
from app.core.config import settings
from app.services.copy_assist import _sem_travessao
from app.services.image_gen import _client_for

log = logging.getLogger(__name__)


class PautasIndisponiveisError(RuntimeError):
    """Firecrawl indisponível ou curadoria inválida (falha real de upstream)."""


class SemNoticiasError(PautasIndisponiveisError):
    """Nenhuma notícia recente para o assunto — resultado benigno, não é falha."""


class Pauta(BaseModel):
    titulo: str
    assunto: str                                   # tema pronto para o Diretor
    personagens: list[str] = Field(default_factory=list)
    linha_criativa: str = ""
    fonte_url: str | None = None


class PautasResult(BaseModel):
    pautas: list[Pauta]


def _buscar_noticias(assunto: str, limit: int = 6) -> list[dict]:
    """Firecrawl v2/search com sources=news + filtro de recência (último mês)."""
    if not settings.firecrawl_api_key:
        raise PautasIndisponiveisError("Firecrawl não configurado (FIRECRAWL_API_KEY ausente).")
    url = settings.firecrawl_api_url.rstrip("/") + "/v2/search"
    body = {"query": assunto, "sources": ["news"], "limit": limit, "tbs": "qdr:m"}
    try:
        with httpx.Client(timeout=45) as client:
            r = client.post(url, json=body, headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"})
    except Exception as exc:  # noqa: BLE001
        raise PautasIndisponiveisError(f"Falha ao chamar o Firecrawl: {str(exc)[:200]}")
    if r.status_code != 200:
        raise PautasIndisponiveisError(f"Firecrawl HTTP {r.status_code}: {r.text[:200]}")
    data = (r.json() or {}).get("data") or {}
    news = data.get("news") if isinstance(data, dict) else data
    return [n for n in (news or []) if n.get("title")]


_SYSTEM_PAUTAS = """Você é diretor de conteúdo de NEWSJACKING DE NEGÓCIOS para carrossel de Instagram. Pega um evento/notícia que já está na cabeça do público e re-enquadra como lição de marketing, vendas ou negócios. Regra de ouro: a marca do cliente NUNCA é o herói; o herói é o INSIGHT.

A partir das NOTÍCIAS fornecidas, gere EXATAMENTE 5 pautas de carrossel. Cada pauta:
- titulo: o gancho da pauta (curto, forte).
- assunto: um tema PRONTO para o gerador de carrossel (1 frase clara que vira o briefing).
- personagens: 1 a 3 personagens/figuras que combinam com a pauta (ex.: CEO, atleta, marca famosa).
- linha_criativa: molde (A newsjacking de evento/celebridade, B feature/tutorial, C tese "X NÃO É Y") + ângulo/tensão + direção visual.
- fonte_url: a URL da notícia que inspirou a pauta.

PT-BR impecável, NUNCA use travessão. Use SOMENTE dados reais das notícias (não invente números). Responda SOMENTE um JSON:
{"pautas":[{"titulo":"","assunto":"","personagens":["",""],"linha_criativa":"","fonte_url":""}]}"""


def buscar_pautas(assunto: str, n: int = 5) -> tuple[PautasResult, dict]:
    """assunto → 5 pautas newsjacking a partir de notícias frescas. (pautas, usage)."""
    noticias = _buscar_noticias(assunto)
    if not noticias:
        raise SemNoticiasError("Nenhuma notícia recente encontrada para esse assunto.")

    contexto = "\n".join(
        f"- {x.get('title')} | {(x.get('snippet') or x.get('description') or '')[:240]} | {x.get('url')}"
        for x in noticias[:8]
    )
    client = _client_for("copy")
    resp = client.chat.completions.create(
        model=get_ai_config("copy").model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PAUTAS},
            {"role": "user", "content": f"Assunto de interesse: {assunto}\n\nNOTÍCIAS:\n{contexto}\n\nGere EXATAMENTE {n} pautas."},
        ],
        max_tokens=1700,
        temperature=0.7,
    )
    usage = resp.usage.model_dump() if getattr(resp, "usage", None) else {}
    raw = resp.choices[0].message.content or "{}"
    try:
        res = PautasResult.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise PautasIndisponiveisError(f"Curadoria de pautas inválida: {str(exc)[:200]}")
    for p in res.pautas:
        p.titulo = _sem_travessao(p.titulo)
        p.assunto = _sem_travessao(p.assunto)
        p.linha_criativa = _sem_travessao(p.linha_criativa)
    log.info("[firecrawl_news] %s noticias -> %s pautas tokens=%s",
             len(noticias), len(res.pautas), usage.get("total_tokens"))
    return res, usage

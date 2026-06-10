"""Prompt-reverso: extrai um `creative_spec` JSON de uma imagem de referência.

Usa um modelo de VISÃO (`settings.openai_vision_model`, ex. gpt-4.1) via
chat.completions com `response_format=json_object` e a imagem em `image_url`
base64. Reusa o cliente OpenAI dedicado de imagem (mesma chave/base_url).
"""
from __future__ import annotations

import base64
import json
import logging

from app.core.config import settings
from app.services.image_gen import _image_client

log = logging.getLogger(__name__)

_SCHEMA_PROMPT = """Você é diretor de arte. Analise este criativo publicitário de forma CIRÚRGICA e detalhada e devolva SOMENTE um JSON (creative_spec) com:
{
 "formato": "ex 4:5",
 "descricao": "UM parágrafo rico e detalhado descrevendo a imagem inteira como um prompt de geração completo (fundo, cores, personagem, pose, iluminação, posição da logo, textos e suas cores, ícones, botões, rodapé, estilo)",
 "objetivo_do_criativo": "ex: gerar agendamento / institucional",
 "estilo": "", "tom": "", "estilo_visual": "ex: clean premium, glass, editorial",
 "paleta_de_cores": ["#hex", "..."],
 "personagem": "descrição do personagem/sujeito principal, ou 'sem pessoa'",
 "composicao_visual": "layout, posições e hierarquia (onde fica cada elemento)",
 "conteudo_textual": {"headline":"","subheadline":"","bullets":["..."],"cta":"","footer":""},
 "logo": {"present": true, "posicao":"ex topo-central", "tamanho":"pequena|media|grande", "observacao":"onde a logo está apoiada (faixa/área limpa) para não cobrir texto"}
}
Use posições em português (topo-esquerda, topo-central, rodapé-centro, etc.). Seja fiel ao que está na imagem. Responda só o JSON, sem comentários."""


def _normalizar(spec: dict) -> dict:
    """Garante as chaves mínimas (campos faltantes → default seguro); aceita schema legado."""
    if not isinstance(spec, dict):
        spec = {}
    spec.setdefault("formato", spec.get("format"))
    for k in ("descricao", "objetivo_do_criativo", "estilo", "tom", "estilo_visual", "personagem", "composicao_visual"):
        spec.setdefault(k, None)
    spec.setdefault("paleta_de_cores", spec.get("palette") or [])
    ct = spec.setdefault("conteudo_textual", {})
    if not isinstance(ct, dict):
        ct = spec["conteudo_textual"] = {}
    for k in ("headline", "subheadline", "cta", "footer"):
        ct.setdefault(k, "")
    ct.setdefault("bullets", [])
    logo = spec.setdefault("logo", {})
    if not isinstance(logo, dict):
        logo = spec["logo"] = {}
    logo.setdefault("present", False)
    logo.setdefault("posicao", logo.get("position") or "topo-esquerda")
    logo.setdefault("tamanho", logo.get("size") or "media")
    return spec


def extrair_creative_spec(image_bytes: bytes) -> tuple[dict, dict]:
    """Extrai o creative_spec de uma referência. Retorna (spec, usage).

    Levanta exceção em erro (mapeada para error_code pelo endpoint).
    """
    b64 = base64.b64encode(image_bytes).decode()
    client = _image_client()
    resp = client.chat.completions.create(
        model=settings.openai_vision_model,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _SCHEMA_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                ],
            }
        ],
        max_tokens=1800,
    )
    raw = resp.choices[0].message.content or "{}"
    spec = _normalizar(json.loads(raw))
    usage = resp.usage.model_dump() if getattr(resp, "usage", None) else {}
    log.info("[creative_vision] spec extraído tokens=%s", usage.get("total_tokens"))
    return spec, usage

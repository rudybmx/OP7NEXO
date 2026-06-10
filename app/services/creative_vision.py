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

_SCHEMA_PROMPT = """Analise este criativo publicitário e devolva SOMENTE um JSON (creative_spec) com:
{
 "format": "ex 4:5",
 "mood": "", "style": "",
 "palette": ["#hex", "..."],
 "background": "descrição curta",
 "subjects": [{"type":"","description":"","position":"ex direita"}],
 "regions": {
   "logo": {"present": true, "position": "ex topo-esquerda", "size": "pequena|media|grande"},
   "headline": {"text":"","position":"","style":"ex bold serif branca"},
   "subheadline": {"text":"","position":""},
   "bullets": [{"text":"","icon":""}],
   "cta": {"text":"","position":"","shape":"pill","color":"#hex"},
   "footer": {"text":"","position":""}
 },
 "density": "simples|rico"
}
Use posições em português (topo-esquerda, rodapé-centro, etc.). Responda só o JSON, sem comentários."""


def _normalizar(spec: dict) -> dict:
    """Garante as chaves mínimas (campos faltantes → default seguro)."""
    if not isinstance(spec, dict):
        spec = {}
    spec.setdefault("format", None)
    spec.setdefault("mood", None)
    spec.setdefault("style", None)
    spec.setdefault("palette", [])
    spec.setdefault("background", None)
    spec.setdefault("subjects", [])
    reg = spec.setdefault("regions", {})
    if not isinstance(reg, dict):
        reg = spec["regions"] = {}
    logo = reg.setdefault("logo", {})
    logo.setdefault("present", False)
    for k in ("headline", "subheadline", "cta", "footer"):
        reg.setdefault(k, {})
    reg.setdefault("bullets", [])
    spec.setdefault("density", "simples")
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

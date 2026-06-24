"""Resolve o provider/modelo/token de LLM de um agente e chama o LLM.

Precedência do token (decidido): banco (`llm_provider_tokens`, decifrado com Fernet
em memória) primeiro; fallback no `.env` (settings.openai_*). Todos os providers seed
são `openai_compatible`, então o mesmo client `openai` atende OpenAI/OpenRouter/DeepSeek.
"""
from __future__ import annotations

from dataclasses import dataclass

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core import llm_crypto
from app.core.config import settings
from app.models.agente import Agente, LlmProvider, LlmProviderToken


class LLMConfigError(RuntimeError):
    """Configuração de LLM ausente/inválida (modelo, provider ou token)."""


@dataclass(frozen=True)
class LLMResolved:
    model: str
    base_url: str
    api_key: str
    provider_nome: str


def resolver(db: Session, agente: Agente) -> LLMResolved:
    model = (agente.modelo or "").strip()
    if not model:
        raise LLMConfigError("Agente sem modelo configurado")

    provider = (
        db.query(LlmProvider).filter(LlmProvider.id == agente.provider_id).first()
        if agente.provider_id
        else None
    )
    if provider is None:
        if not settings.openai_api_key:
            raise LLMConfigError("Agente sem provider e sem chave de texto no .env")
        return LLMResolved(
            model=model,
            base_url=settings.openai_base_url or "https://api.openai.com/v1",
            api_key=settings.openai_api_key,
            provider_nome="env",
        )

    tok = (
        db.query(LlmProviderToken)
        .filter(LlmProviderToken.provider_id == provider.id, LlmProviderToken.ativo.is_(True))
        .first()
    )
    if tok and tok.token_encrypted:
        api_key = llm_crypto.decrypt(tok.token_encrypted)  # só em memória
    elif settings.openai_api_key:
        api_key = settings.openai_api_key  # fallback .env
    else:
        raise LLMConfigError(f"Provider '{provider.nome}' sem token configurado")

    return LLMResolved(model=model, base_url=provider.base_url, api_key=api_key, provider_nome=provider.nome)


def chamar_json(db: Session, agente: Agente, system: str, user: str) -> tuple[str, dict]:
    """Chama o LLM pedindo JSON. Retorna (conteúdo_bruto, usage dict)."""
    r = resolver(db, agente)
    client = OpenAI(api_key=r.api_key, base_url=r.base_url)
    resp = client.chat.completions.create(
        model=r.model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    content = resp.choices[0].message.content or "{}"
    usage = resp.usage.model_dump() if getattr(resp, "usage", None) else {}
    return content, usage

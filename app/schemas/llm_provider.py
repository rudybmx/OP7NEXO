"""Schemas dos providers/modelos/token de LLM (Central de Agentes, Fase 1).

O token NUNCA é devolvido inteiro — só `token_mask` (6+4). Os Out são montados
manualmente nos routers (padrão ai_settings.py)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TipoProvider = Literal["openai_compatible", "anthropic_native"]


class ModeloIn(BaseModel):
    nome_modelo: str = Field(min_length=1, max_length=120)
    label_display: str | None = None
    ativo: bool = True


class ModeloOut(BaseModel):
    id: str
    nome_modelo: str
    label_display: str | None
    ativo: bool


class CarregarModelosOut(BaseModel):
    """Resultado de carregar modelos do provider via `GET {base_url}/models`."""

    inseridos: int
    total: int
    modelos: list[ModeloOut]


class ProviderIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    base_url: str = Field(min_length=1, max_length=255)
    tipo: TipoProvider = "openai_compatible"
    descricao: str | None = None
    ativo: bool = True


class ProviderUpdate(BaseModel):
    nome: str | None = Field(default=None, max_length=80)
    base_url: str | None = Field(default=None, max_length=255)
    tipo: TipoProvider | None = None
    descricao: str | None = None
    ativo: bool | None = None


class ProviderOut(BaseModel):
    id: str
    nome: str
    base_url: str
    tipo: str
    ativo: bool
    descricao: str | None
    token_configurado: bool
    token_mask: str
    modelos: list[ModeloOut]


class ProviderTokenIn(BaseModel):
    token: str = Field(min_length=1)


class ProviderTokenOut(BaseModel):
    """Resposta de GET/POST token — só máscara, nunca o valor claro."""

    provider_id: str
    configurado: bool
    token_mask: str
    ativo: bool

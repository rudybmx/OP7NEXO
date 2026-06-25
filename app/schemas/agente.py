"""Schemas do agente (Central de Agentes, Fase 1).

Out montados manualmente nos routers. `threshold_confianca` é 0..1 (a UI exibe %).
Campos de RAG/handoff-runtime/feedback são de fases posteriores e não entram aqui."""
from __future__ import annotations

from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, Field

StatusAgente = Literal["ativo", "inativo"]


class HorarioIn(BaseModel):
    dia_semana: int = Field(ge=0, le=6)
    hora_inicio: time
    hora_fim: time
    ativo: bool = True


class HorarioOut(BaseModel):
    id: str
    dia_semana: int
    hora_inicio: str
    hora_fim: str
    ativo: bool


class HabilidadeIn(BaseModel):
    tipo: str = Field(min_length=1, max_length=40)
    nome: str = Field(min_length=1, max_length=120)
    config_json: dict = Field(default_factory=dict)
    ativo: bool = True


class HabilidadeOut(BaseModel):
    id: str
    tipo: str
    nome: str
    config_json: dict
    ativo: bool


class CanalVinculadoOut(BaseModel):
    canal_id: str
    canal_nome: str | None
    ativo: bool


class AgenteIn(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    descricao: str | None = None
    provider_id: str | None = None
    modelo: str | None = Field(default=None, max_length=120)
    status: StatusAgente = "inativo"
    tom: str | None = Field(default=None, max_length=40)
    idiomas: list[str] = Field(default_factory=list)
    blacklist_topicos: list[str] = Field(default_factory=list)
    threshold_confianca: float = Field(default=0.7, ge=0.0, le=1.0)
    tempo_resposta_target_ms: int | None = Field(default=None, ge=0)
    debounce_segundos: int = Field(default=40, ge=0, le=3600)
    limite_tokens_dia: int | None = Field(default=None, ge=0)
    alerta_threshold_pct: int = Field(default=80, ge=0, le=100)
    mensagem_abertura: str | None = None
    objetivo: str | None = Field(default=None, max_length=2000)
    # Vínculos opcionais na criação
    canais: list[str] = Field(default_factory=list)  # canal_ids
    horarios: list[HorarioIn] = Field(default_factory=list)
    habilidades: list[HabilidadeIn] = Field(default_factory=list)
    prompt: str | None = None  # rascunho inicial (agente_prompts status=draft)


class AgenteUpdate(BaseModel):
    nome: str | None = Field(default=None, max_length=120)
    descricao: str | None = None
    provider_id: str | None = None
    modelo: str | None = Field(default=None, max_length=120)
    status: StatusAgente | None = None
    tom: str | None = Field(default=None, max_length=40)
    idiomas: list[str] | None = None
    blacklist_topicos: list[str] | None = None
    threshold_confianca: float | None = Field(default=None, ge=0.0, le=1.0)
    tempo_resposta_target_ms: int | None = Field(default=None, ge=0)
    debounce_segundos: int | None = Field(default=None, ge=0, le=3600)
    limite_tokens_dia: int | None = Field(default=None, ge=0)
    alerta_threshold_pct: int | None = Field(default=None, ge=0, le=100)
    mensagem_abertura: str | None = None
    objetivo: str | None = Field(default=None, max_length=2000)
    canais: list[str] | None = None
    horarios: list[HorarioIn] | None = None
    habilidades: list[HabilidadeIn] | None = None
    prompt: str | None = None


class DiretrizesIn(BaseModel):
    """Diretrizes de IA do workspace — texto único injetado no system prompt de TODOS
    os agentes do workspace. Teto de tamanho: entra em cada resposta (custo/latência)."""

    diretrizes: str = Field(default="", max_length=4000)


class DiretrizesOut(BaseModel):
    diretrizes: str
    atualizado_em: datetime | None = None


class ToggleIn(BaseModel):
    status: StatusAgente


class SandboxTurno(BaseModel):
    papel: Literal["cliente", "agente"] = "cliente"
    texto: str


class SandboxIn(BaseModel):
    mensagem: str = Field(min_length=1)
    historico_simulado: list[SandboxTurno] = Field(default_factory=list)


class SandboxOut(BaseModel):
    resposta: str
    score_confianca: float
    intent: str | None
    rag_chunks_usados: list[str]
    tokens_estimados: int


class BaseConhecimentoIn(BaseModel):
    tipo: Literal["documento", "url", "faq"] = "faq"
    titulo: str | None = Field(default=None, max_length=255)
    conteudo: str | None = None  # texto (faq/documento) — obrigatório se não for url
    url: str | None = None  # obrigatório quando tipo='url'


class BaseConhecimentoOut(BaseModel):
    id: str
    tipo: str
    titulo: str | None
    preview: str
    criado_em: str | None


class BaseConhecimentoIngestOut(BaseModel):
    titulo: str | None
    tipo: str
    chunks: int


class PromptVersaoOut(BaseModel):
    id: str
    status: str
    prompt_texto: str
    criado_em: str | None
    publicado_em: str | None
    publicado_por: str | None
    diff_vs_anterior: str | None


class UsoTotais(BaseModel):
    tokens_input: int
    tokens_output: int
    tokens_total: int
    custo_usd: float
    chamadas: int
    conversas: int
    handoffs: int
    taxa_handoff: float
    score_medio: float | None


class UsoSeriePonto(BaseModel):
    dia: str
    tokens: int


class UsoDashboardOut(BaseModel):
    totais: UsoTotais
    serie: list[UsoSeriePonto]


class AgenteListItemOut(BaseModel):
    id: str
    nome: str
    status: str
    modelo: str | None
    provider_id: str | None
    provider_nome: str | None
    canais: list[CanalVinculadoOut]
    ultima_atividade: str | None


class AgenteOut(BaseModel):
    id: str
    workspace_id: str
    nome: str
    descricao: str | None
    provider_id: str | None
    provider_nome: str | None
    modelo: str | None
    status: str
    tom: str | None
    idiomas: list[str]
    blacklist_topicos: list[str]
    threshold_confianca: float
    tempo_resposta_target_ms: int | None
    debounce_segundos: int
    limite_tokens_dia: int | None
    alerta_threshold_pct: int
    mensagem_abertura: str | None
    objetivo: str | None
    canais: list[CanalVinculadoOut]
    horarios: list[HorarioOut]
    habilidades: list[HabilidadeOut]
    prompt_draft: str | None
    prompt_publicado: str | None
    criado_em: str | None
    atualizado_em: str | None

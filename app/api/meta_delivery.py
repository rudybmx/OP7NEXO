"""Módulo de domínio para status de veiculação (delivery) Meta Ads.

Códigos canônicos com grupos, labels e cores padronizados.
"""

from datetime import datetime, timezone
from typing import Tuple

# Códigos canônicos de veiculação
VEICULACAO_ATIVO = "ATIVO"
VEICULACAO_DESATIVADO = "DESATIVADO"
VEICULACAO_CONCLUIDO = "CONCLUIDO"
VEICULACAO_PROGRAMADO = "PROGRAMADO"
VEICULACAO_APRENDIZADO = "APRENDIZADO"
VEICULACAO_APRENDIZADO_LIMITADO = "APRENDIZADO_LIMITADO"
VEICULACAO_EM_ANALISE = "EM_ANALISE"
VEICULACAO_REJEITADO = "REJEITADO"
VEICULACAO_PROCESSANDO = "PROCESSANDO"
VEICULACAO_ERRO_CONTA = "ERRO_CONTA"
VEICULACAO_ITENS_AUSENTES = "ITENS_AUSENTES"

# Grupos
GRUPO_OPERACIONAL = "operacional"
GRUPO_PERFORMANCE = "performance"
GRUPO_SISTEMICO = "sistemico"

# Mapeamento: código → grupo
VEICULACAO_GRUPO: dict[str, str] = {
    VEICULACAO_ATIVO: GRUPO_OPERACIONAL,
    VEICULACAO_DESATIVADO: GRUPO_OPERACIONAL,
    VEICULACAO_CONCLUIDO: GRUPO_OPERACIONAL,
    VEICULACAO_PROGRAMADO: GRUPO_OPERACIONAL,
    VEICULACAO_APRENDIZADO: GRUPO_PERFORMANCE,
    VEICULACAO_APRENDIZADO_LIMITADO: GRUPO_PERFORMANCE,
    VEICULACAO_EM_ANALISE: GRUPO_SISTEMICO,
    VEICULACAO_REJEITADO: GRUPO_SISTEMICO,
    VEICULACAO_PROCESSANDO: GRUPO_SISTEMICO,
    VEICULACAO_ERRO_CONTA: GRUPO_SISTEMICO,
    VEICULACAO_ITENS_AUSENTES: GRUPO_SISTEMICO,
}

# Mapeamento: código → label humano
VEICULACAO_LABEL: dict[str, str] = {
    VEICULACAO_ATIVO: "Ativo",
    VEICULACAO_DESATIVADO: "Desativado",
    VEICULACAO_CONCLUIDO: "Concluído",
    VEICULACAO_PROGRAMADO: "Programado",
    VEICULACAO_APRENDIZADO: "Aprendendo",
    VEICULACAO_APRENDIZADO_LIMITADO: "Aprendizado Limitado",
    VEICULACAO_EM_ANALISE: "Em Análise",
    VEICULACAO_REJEITADO: "Rejeitado",
    VEICULACAO_PROCESSANDO: "Processando",
    VEICULACAO_ERRO_CONTA: "Erro na Conta",
    VEICULACAO_ITENS_AUSENTES: "Itens Ausentes",
}

# Cores padronizadas (hex)
VEICULACAO_COR: dict[str, str] = {
    VEICULACAO_ATIVO: "#0fa856",
    VEICULACAO_APRENDIZADO: "#0fa856",
    VEICULACAO_DESATIVADO: "#8892b0",
    VEICULACAO_CONCLUIDO: "#8892b0",
    VEICULACAO_PROGRAMADO: "#8892b0",
    VEICULACAO_APRENDIZADO_LIMITADO: "#EF9F27",
    VEICULACAO_EM_ANALISE: "#EF9F27",
    VEICULACAO_REJEITADO: "#FF5C8D",
    VEICULACAO_ERRO_CONTA: "#FF5C8D",
    VEICULACAO_PROCESSANDO: "#8892b0",
    VEICULACAO_ITENS_AUSENTES: "#8892b0",
}

VEICULACAO_COR_BG: dict[str, str] = {
    VEICULACAO_ATIVO: "rgba(15,168,86,0.10)",
    VEICULACAO_APRENDIZADO: "rgba(15,168,86,0.10)",
    VEICULACAO_DESATIVADO: "rgba(136,146,176,0.10)",
    VEICULACAO_CONCLUIDO: "rgba(136,146,176,0.10)",
    VEICULACAO_PROGRAMADO: "rgba(136,146,176,0.10)",
    VEICULACAO_APRENDIZADO_LIMITADO: "rgba(239,159,39,0.10)",
    VEICULACAO_EM_ANALISE: "rgba(239,159,39,0.10)",
    VEICULACAO_REJEITADO: "rgba(255,92,141,0.10)",
    VEICULACAO_ERRO_CONTA: "rgba(255,92,141,0.10)",
    VEICULACAO_PROCESSANDO: "rgba(136,146,176,0.10)",
    VEICULACAO_ITENS_AUSENTES: "rgba(136,146,176,0.10)",
}

VEICULACAO_COR_BORDER: dict[str, str] = {
    VEICULACAO_ATIVO: "rgba(15,168,86,0.25)",
    VEICULACAO_APRENDIZADO: "rgba(15,168,86,0.25)",
    VEICULACAO_DESATIVADO: "rgba(136,146,176,0.20)",
    VEICULACAO_CONCLUIDO: "rgba(136,146,176,0.20)",
    VEICULACAO_PROGRAMADO: "rgba(136,146,176,0.20)",
    VEICULACAO_APRENDIZADO_LIMITADO: "rgba(239,159,39,0.25)",
    VEICULACAO_EM_ANALISE: "rgba(239,159,39,0.25)",
    VEICULACAO_REJEITADO: "rgba(255,92,141,0.25)",
    VEICULACAO_ERRO_CONTA: "rgba(255,92,141,0.25)",
    VEICULACAO_PROCESSANDO: "rgba(136,146,176,0.20)",
    VEICULACAO_ITENS_AUSENTES: "rgba(136,146,176,0.20)",
}


def _normalize_status(raw: str | None) -> str:
    s = (raw or "").upper()
    if s in {"ACTIVE", "LEARNING"}:
        return "ACTIVE"
    if s in {"PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"}:
        return "PAUSED"
    if s in {"ARCHIVED", "DELETED"}:
        return "ARCHIVED"
    return s or "PAUSED"


def _is_concluido(
    end_time: datetime | None,
    lifetime_budget: float | None,
    spend_total: float | None,
) -> Tuple[bool, str | None]:
    now = datetime.now(timezone.utc)
    if end_time and end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)
    if end_time and end_time < now:
        return True, end_time.strftime("%d/%m/%Y %H:%M")
    lb = float(lifetime_budget or 0)
    sp = float(spend_total or 0)
    if lb > 0 and sp >= lb:
        return True, "Orçamento vitalício atingido"
    return False, None


def resolver_veiculacao_campanha(meta: dict) -> Tuple[str, str | None]:
    """Resolve veiculação canônica para campanha."""
    # Verificar revisão/erro primeiro (prioridade máxima)
    effective = (meta.get("effective_status") or "").upper()
    if effective in {"WITH_ISSUES", "ERROR", "DISAPPROVED"}:
        return VEICULACAO_REJEITADO, "REVISAO_REJEITADA"
    if effective == "PENDING_REVIEW":
        return VEICULACAO_EM_ANALISE, "PENDENTE_REVISAO"
    if effective == "PROCESSING":
        return VEICULACAO_PROCESSANDO, "PROCESSANDO"

    base = _normalize_status(meta.get("status"))
    if base == "ACTIVE":
        # Verificar se está programado (start_time futuro)
        start_time = meta.get("start_time")
        if start_time:
            now = datetime.now(timezone.utc)
            if isinstance(start_time, str):
                start_time = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=timezone.utc)
            if start_time > now:
                return VEICULACAO_PROGRAMADO, "AGENDADO"

        concluido, motivo = _is_concluido(
            meta.get("stop_time"),
            meta.get("lifetime_budget"),
            meta.get("spend_total"),
        )
        if concluido:
            return VEICULACAO_CONCLUIDO, motivo

        # Aprendizado
        if effective == "LEARNING":
            return VEICULACAO_APRENDIZADO, None
        if effective == "LEARNING_LIMITED":
            return VEICULACAO_APRENDIZADO_LIMITADO, None

        return VEICULACAO_ATIVO, None

    if base == "PAUSED":
        return VEICULACAO_DESATIVADO, "PAUSADA"
    if base == "ARCHIVED":
        return VEICULACAO_DESATIVADO, "ARQUIVADA"

    return VEICULACAO_DESATIVADO, None


def resolver_veiculacao_conjunto(meta: dict, campanha_status: str) -> Tuple[str, str | None]:
    """Resolve veiculação canônica para conjunto de anúncios com herança."""
    # Herança de pai inativo
    if campanha_status == VEICULACAO_CONCLUIDO:
        return VEICULACAO_CONCLUIDO, "PAI_CONCLUIDO"
    if campanha_status == VEICULACAO_DESATIVADO:
        return VEICULACAO_DESATIVADO, "PAI_DESATIVADO"
    if campanha_status == VEICULACAO_PROGRAMADO:
        return VEICULACAO_PROGRAMADO, "PAI_PROGRAMADO"
    if campanha_status not in {VEICULACAO_ATIVO, VEICULACAO_APRENDIZADO, VEICULACAO_APRENDIZADO_LIMITADO}:
        return campanha_status, "PAI_INATIVO"

    # Verificar revisão/erro
    effective = (meta.get("effective_status") or "").upper()
    if effective in {"WITH_ISSUES", "ERROR", "DISAPPROVED"}:
        return VEICULACAO_REJEITADO, "REVISAO_REJEITADA"
    if effective == "PENDING_REVIEW":
        return VEICULACAO_EM_ANALISE, "PENDENTE_REVISAO"
    if effective == "PROCESSING":
        return VEICULACAO_PROCESSANDO, "PROCESSANDO"

    base = _normalize_status(meta.get("status"))
    if base == "ACTIVE":
        concluido, motivo = _is_concluido(
            meta.get("end_time"),
            meta.get("lifetime_budget"),
            meta.get("spend_total"),
        )
        if concluido:
            return VEICULACAO_CONCLUIDO, motivo

        if effective == "LEARNING":
            return VEICULACAO_APRENDIZADO, None
        if effective == "LEARNING_LIMITED":
            return VEICULACAO_APRENDIZADO_LIMITADO, None

        return VEICULACAO_ATIVO, None

    if base == "PAUSED":
        return VEICULACAO_DESATIVADO, "PAUSADA"
    if base == "ARCHIVED":
        return VEICULACAO_DESATIVADO, "ARQUIVADA"

    return VEICULACAO_DESATIVADO, None


def resolver_veiculacao_anuncio(
    meta: dict, campanha_status: str, conjunto_status: str
) -> Tuple[str, str | None]:
    """Resolve veiculação canônica para anúncio com herança hierárquica."""
    # Herança de pais inativos
    if campanha_status == VEICULACAO_CONCLUIDO or conjunto_status == VEICULACAO_CONCLUIDO:
        return VEICULACAO_CONCLUIDO, "PAI_CONCLUIDO"
    if campanha_status == VEICULACAO_DESATIVADO or conjunto_status == VEICULACAO_DESATIVADO:
        return VEICULACAO_DESATIVADO, "PAI_DESATIVADO"
    if campanha_status == VEICULACAO_PROGRAMADO or conjunto_status == VEICULACAO_PROGRAMADO:
        return VEICULACAO_PROGRAMADO, "PAI_PROGRAMADO"
    if campanha_status not in {VEICULACAO_ATIVO, VEICULACAO_APRENDIZADO, VEICULACAO_APRENDIZADO_LIMITADO}:
        return VEICULACAO_DESATIVADO, "PAI_INATIVO"
    if conjunto_status not in {VEICULACAO_ATIVO, VEICULACAO_APRENDIZADO, VEICULACAO_APRENDIZADO_LIMITADO}:
        return VEICULACAO_DESATIVADO, "PAI_INATIVO"

    # Verificar revisão/erro no anúncio
    effective = (meta.get("effective_status") or "").upper()
    if effective in {"WITH_ISSUES", "ERROR", "DISAPPROVED"}:
        return VEICULACAO_REJEITADO, "REVISAO_REJEITADA"
    if effective == "PENDING_REVIEW":
        return VEICULACAO_EM_ANALISE, "PENDENTE_REVISAO"
    if effective == "PROCESSING":
        return VEICULACAO_PROCESSANDO, "PROCESSANDO"

    base = _normalize_status(meta.get("status"))
    if base == "PAUSED":
        return VEICULACAO_DESATIVADO, "PAUSADA"
    if base == "ARCHIVED":
        return VEICULACAO_DESATIVADO, "ARQUIVADA"

    if effective == "LEARNING":
        return VEICULACAO_APRENDIZADO, None
    if effective == "LEARNING_LIMITED":
        return VEICULACAO_APRENDIZADO_LIMITADO, None

    # ATIVO por padrão
    return VEICULACAO_ATIVO, None


def resolver_veiculacao_criativo(
    status_ads: list[str],
) -> Tuple[str, str | None]:
    """Resolve veiculação canônica para criativo baseado nos anúncios que o usam."""
    if not status_ads:
        return VEICULACAO_ITENS_AUSENTES, "SEM_ANUNCIOS"

    # Prioridade: revisão/erro > concluído > ativo > desativado
    if any(s in {VEICULACAO_REJEITADO} for s in status_ads):
        return VEICULACAO_REJEITADO, "ANUNCIO_REJEITADO"
    if any(s in {VEICULACAO_EM_ANALISE} for s in status_ads):
        return VEICULACAO_EM_ANALISE, "ANUNCIO_EM_ANALISE"
    if any(s in {VEICULACAO_PROCESSANDO} for s in status_ads):
        return VEICULACAO_PROCESSANDO, "ANUNCIO_PROCESSANDO"
    if any(s in {VEICULACAO_ERRO_CONTA} for s in status_ads):
        return VEICULACAO_ERRO_CONTA, "CONTA_COM_ERRO"

    if any(s == VEICULACAO_CONCLUIDO for s in status_ads):
        # Se todos concluídos
        if all(s == VEICULACAO_CONCLUIDO for s in status_ads):
            return VEICULACAO_CONCLUIDO, "TODOS_CONCLUIDOS"
        return VEICULACAO_ATIVO, "MISTO_CONCLUIDO"

    if any(s == VEICULACAO_ATIVO for s in status_ads):
        return VEICULACAO_ATIVO, None
    if any(s == VEICULACAO_APRENDIZADO for s in status_ads):
        return VEICULACAO_APRENDIZADO, None
    if any(s == VEICULACAO_APRENDIZADO_LIMITADO for s in status_ads):
        return VEICULACAO_APRENDIZADO_LIMITADO, None

    # Se chegou aqui, todos estão desativados
    if all(s == VEICULACAO_DESATIVADO for s in status_ads):
        return VEICULACAO_DESATIVADO, "TODOS_DESATIVADOS"

    return VEICULACAO_DESATIVADO, None


def serializar_veiculacao(codigo: str, motivo: str | None = None) -> dict:
    """Serializa veiculação para payload JSON."""
    return {
        "veiculacao": codigo,
        "veiculacao_label": VEICULACAO_LABEL.get(codigo, codigo),
        "veiculacao_grupo": VEICULACAO_GRUPO.get(codigo, GRUPO_SISTEMICO),
        "veiculacao_motivo": motivo,
        "veiculacao_cor": VEICULACAO_COR.get(codigo, "#8892b0"),
        "veiculacao_cor_bg": VEICULACAO_COR_BG.get(codigo, "rgba(136,146,176,0.10)"),
        "veiculacao_cor_border": VEICULACAO_COR_BORDER.get(codigo, "rgba(136,146,176,0.20)"),
    }

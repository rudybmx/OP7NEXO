"""Auto-agendamento público (Fase 5) — endpoints SEM autenticação.

Gated apenas pelo token público por agenda (`agenda_public_tokens`). O paciente marca sozinho.
Regras de segurança (superfície pública):
- TODO identificador (agenda_id, workspace_id) vem do TOKEN, nunca do corpo.
- O POST RE-VALIDA o slot no servidor (`calcular_disponibilidade`) — recusa horário fora de
  expediente/almoço/bloqueio/passado/ocupado. O `criar_agendamento` sozinho é permissivo.
- O serviço informado tem que pertencer a ESTA agenda (ou ser global do workspace).
- Rate-limit do POST por IP (+ telefone), fail-closed — não trava por token (DoS de 1 link).
- Autonomia por agenda (`agente_agendamento`): 'desativado' = sem link; 'direto' = grava
  'confirmado'; 'confirmar' = grava 'agendado' (fila de aprovação) + observação.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date as date_cls, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.crm.agenda import Agenda, AgendaServico
from app.models.workspace import Workspace
from app.services.agenda import public_token
from app.services.agenda.agendamento import (
    ConflitoAgendamento,
    DadosInvalidos,
    criar_agendamento,
)
from app.services.agenda.disponibilidade import calcular_disponibilidade
from app.services.agenda.telefone import canonical_phone_digits
from app.services.rate_limit import RateLimitError, dentro_do_limite

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public/agendar", tags=["public-agendar"])


# ───────────────────────────── helpers ─────────────────────────────
def _rate_limit(chave: str, limite: int, janela_s: int, *, fail_open: bool) -> None:
    try:
        if not dentro_do_limite(chave, limite, janela_s, fail_open=fail_open):
            raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde alguns instantes.")
    except RateLimitError:
        raise HTTPException(status_code=503, detail="Serviço temporariamente indisponível. Tente novamente.")


def _carregar(token: str, db: Session) -> tuple[Agenda, uuid.UUID]:
    """Resolve agenda + workspace A PARTIR DO TOKEN. 404 genérico (não vaza existência)."""
    row = public_token.buscar_token_valido(db, token)
    if not row:
        raise HTTPException(status_code=404, detail="Link de agendamento inválido ou desativado")
    agenda = (
        db.query(Agenda)
        .filter(Agenda.id == row.agenda_id, Agenda.ativo.is_(True))
        .first()
    )
    if not agenda:
        raise HTTPException(status_code=404, detail="Link de agendamento inválido ou desativado")
    return agenda, row.workspace_id


def _ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "desconhecido"


def _servicos_da_agenda(db: Session, *, workspace_id, agenda_id) -> list[AgendaServico]:
    return (
        db.query(AgendaServico)
        .filter(
            AgendaServico.workspace_id == workspace_id,
            AgendaServico.ativo.is_(True),
            (AgendaServico.agenda_id == agenda_id) | (AgendaServico.agenda_id.is_(None)),
        )
        .order_by(AgendaServico.nome)
        .all()
    )


# ───────────────────────────── schemas ─────────────────────────────
class AgendarIn(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    telefone: str = Field(min_length=8, max_length=20)
    data_hora_inicio: datetime
    servico_id: uuid.UUID | None = None
    observacoes: str | None = Field(default=None, max_length=500)


# ───────────────────────────── endpoints ─────────────────────────────
@router.get("/{token}")
def info(token: str, db: Session = Depends(get_db)):
    _rate_limit(f"pubagenda:info:{token}", 60, 10, fail_open=True)
    agenda, ws_id = _carregar(token, db)
    ws = db.get(Workspace, ws_id)
    servicos = _servicos_da_agenda(db, workspace_id=ws_id, agenda_id=agenda.id)
    return {
        "agenda_nome": agenda.nome,
        "agenda_cor": agenda.cor,
        "clinica_nome": ws.nome if ws else None,
        "fuso_horario": agenda.fuso_horario,
        "pode_agendar": agenda.agente_agendamento != "desativado",
        "servicos": [
            {
                "id": str(s.id),
                "nome": s.nome,
                "duracao_minutos": s.duracao_minutos,
                "preco": float(s.preco) if s.preco is not None else None,
            }
            for s in servicos
        ],
    }


@router.get("/{token}/disponibilidade")
def disponibilidade(
    token: str,
    data: date_cls = Query(...),
    servico_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
):
    _rate_limit(f"pubagenda:disp:{token}", 30, 10, fail_open=True)
    agenda, ws_id = _carregar(token, db)
    duracao = _duracao_servico(db, ws_id, agenda.id, servico_id) if servico_id else None
    resultado = calcular_disponibilidade(
        db, workspace_id=ws_id, agenda_id=agenda.id, data=data, duracao_min=duracao
    )
    if resultado is None:
        raise HTTPException(status_code=404, detail="Agenda indisponível")
    return {
        "data": data.isoformat(),
        "fuso_horario": agenda.fuso_horario,
        "slots": [
            {"inicio": s["inicio"].isoformat(), "fim": s["fim"].isoformat()}
            for s in resultado["slots"]
        ],
    }


@router.post("/{token}", status_code=201)
def agendar(token: str, payload: AgendarIn, request: Request, db: Session = Depends(get_db)):
    ip = _ip(request)
    tel_norm = canonical_phone_digits(payload.telefone) or "sem-tel"
    # Anti-abuso: por IP e por telefone, fail-closed (não por token — não trava a clínica toda).
    _rate_limit(f"pubagenda:book:ip:{ip}", 10, 3600, fail_open=False)
    _rate_limit(f"pubagenda:book:tel:{tel_norm}", 5, 3600, fail_open=False)

    agenda, ws_id = _carregar(token, db)
    if agenda.agente_agendamento == "desativado":
        raise HTTPException(status_code=403, detail="Agendamento online indisponível para esta agenda.")

    # Serviço (se houver) tem que ser desta agenda ou global do workspace.
    servico_obj = None
    if payload.servico_id:
        servico_obj = (
            db.query(AgendaServico)
            .filter(
                AgendaServico.id == payload.servico_id,
                AgendaServico.workspace_id == ws_id,
                AgendaServico.ativo.is_(True),
                (AgendaServico.agenda_id == agenda.id) | (AgendaServico.agenda_id.is_(None)),
            )
            .first()
        )
        if not servico_obj:
            raise HTTPException(status_code=422, detail="Serviço inválido para esta agenda.")

    # data_hora_inicio → UTC aware; a DATA p/ disponibilidade é no fuso DA AGENDA.
    inicio = payload.data_hora_inicio
    if inicio.tzinfo is None:
        inicio = inicio.replace(tzinfo=timezone.utc)
    inicio = inicio.astimezone(timezone.utc)
    tz = ZoneInfo(agenda.fuso_horario)
    data_local = inicio.astimezone(tz).date()

    duracao = servico_obj.duracao_minutos if servico_obj else None
    resultado = calcular_disponibilidade(
        db, workspace_id=ws_id, agenda_id=agenda.id, data=data_local, duracao_min=duracao
    )
    if resultado is None:
        raise HTTPException(status_code=404, detail="Agenda indisponível")

    # RE-VALIDAÇÃO server-side: o início pedido tem que ser um slot LIVRE.
    slot = next((s for s in resultado["slots"] if s["inicio"] == inicio), None)
    if slot is None:
        raise HTTPException(status_code=409, detail="Esse horário não está mais disponível. Escolha outro.")

    # Autonomia por agenda: direto → confirmado; confirmar → agendado (fila de aprovação).
    if agenda.agente_agendamento == "direto":
        status_novo = "confirmado"
        obs = payload.observacoes
    else:
        status_novo = "agendado"
        marca = "⏳ Reserva pelo link público — aguardando confirmação da equipe."
        obs = f"{payload.observacoes}\n{marca}".strip() if payload.observacoes else marca

    try:
        ag = criar_agendamento(
            db,
            workspace_id=ws_id,
            agenda_id=agenda.id,
            cliente_nome=payload.nome.strip(),
            cliente_telefone=payload.telefone.strip(),
            data_hora_inicio=inicio,
            data_hora_fim=slot["fim"],
            servico_id=servico_obj.id if servico_obj else None,
            servico=servico_obj.nome if servico_obj else None,
            observacoes=obs,
            origem="paciente",
            status=status_novo,
        )
    except ConflitoAgendamento:
        raise HTTPException(status_code=409, detail="Esse horário acabou de ser ocupado. Escolha outro.")
    except DadosInvalidos as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {
        "ok": True,
        "status": ag.status,
        "pendente": status_novo == "agendado",
        "data_hora_inicio": ag.data_hora_inicio.isoformat(),
        "data_hora_fim": ag.data_hora_fim.isoformat(),
        "agenda_nome": agenda.nome,
        "servico": ag.servico,
    }


def _duracao_servico(db: Session, ws_id, agenda_id, servico_id) -> int | None:
    s = (
        db.query(AgendaServico)
        .filter(
            AgendaServico.id == servico_id,
            AgendaServico.workspace_id == ws_id,
            (AgendaServico.agenda_id == agenda_id) | (AgendaServico.agenda_id.is_(None)),
        )
        .first()
    )
    return s.duracao_minutos if s else None

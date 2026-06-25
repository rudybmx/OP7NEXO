"""API da Agenda nativa (Fase 1).

CRUD de agendas/horários/bloqueios/agendamentos + disponibilidade + overview (KPIs) +
agendamentos por contato (caixa do Atendimento). Multi-tenant: rotas com escopo de criação/listagem
resolvem `workspace_id` (padrão de `app/api/followups.py`); rotas by-id carregam a entidade e checam
acesso via `verificar_acesso_workspace` (funciona p/ platform_admin e usuários com 1+ workspaces).
Espelha `op7nexo-front/src/types/agenda.ts`.
"""
from __future__ import annotations

import uuid
from datetime import date as date_cls
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, get_workspace_atual, verificar_acesso_workspace
from app.models.crm.agenda import Agenda, AgendaBloqueio, AgendaHorario, Agendamento
from app.models.user import User
from app.services.agenda import (
    AgendaNaoEncontrada,
    ConflitoAgendamento,
    DadosInvalidos,
    calcular_disponibilidade,
    cancelar as svc_cancelar,
    criar_agendamento as svc_criar_agendamento,
    atualizar_status as svc_atualizar_status,
)
from app.services.agenda.disponibilidade import STATUS_OCUPANTES
from app.services.agenda.telefone import canonical_phone_digits

router = APIRouter(prefix="/agenda", tags=["agenda"])

_TZ_OVERVIEW = ZoneInfo("America/Sao_Paulo")


# ─────────────────────────── Schemas ───────────────────────────
class AgendaIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    nome: str
    tipo: str = "profissional"
    cor: str = "#3E5BFF"
    capacidade_simultanea: int = 1
    fuso_horario: str = "America/Sao_Paulo"
    webhook_url: str | None = None
    agente_agendamento: str = "confirmar"
    responsavel_id: uuid.UUID | None = None


class AgendaUpdate(BaseModel):
    nome: str | None = None
    tipo: str | None = None
    cor: str | None = None
    capacidade_simultanea: int | None = None
    fuso_horario: str | None = None
    webhook_url: str | None = None
    agente_agendamento: str | None = None
    responsavel_id: uuid.UUID | None = None
    ativo: bool | None = None


class AgendaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    workspace_id: uuid.UUID
    nome: str
    tipo: str
    cor: str
    capacidade_simultanea: int
    fuso_horario: str
    webhook_url: str | None
    agente_agendamento: str
    responsavel_id: uuid.UUID | None
    ativo: bool
    created_at: datetime
    updated_at: datetime


class HorarioIn(BaseModel):
    dia_semana: str
    ativo: bool = True
    hora_inicio: str
    hora_fim: str
    duracao_slot_minutos: int = 30
    tem_almoco: bool = False
    almoco_inicio: str | None = None
    almoco_fim: str | None = None


class HorariosPutIn(BaseModel):
    horarios: list[HorarioIn]


class HorarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    agenda_id: uuid.UUID
    dia_semana: str
    ativo: bool
    hora_inicio: str
    hora_fim: str
    duracao_slot_minutos: int
    tem_almoco: bool
    almoco_inicio: str | None
    almoco_fim: str | None


class BloqueioIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    agenda_id: uuid.UUID | None = None
    motivo: str
    inicio: datetime
    fim: datetime
    tipo: str = "outro"


class BloqueioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    agenda_id: uuid.UUID | None
    motivo: str
    inicio: datetime
    fim: datetime
    tipo: str
    created_at: datetime


class AgendamentoIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    agenda_id: uuid.UUID
    cliente_nome: str
    cliente_telefone: str | None = None
    cliente_email: str | None = None
    data_hora_inicio: datetime
    data_hora_fim: datetime
    servico: str | None = None
    observacoes: str | None = None
    origem: str = "manual"
    para_terceiro: bool = False
    agendado_por_telefone: str | None = None


class AgendamentoUpdate(BaseModel):
    cliente_nome: str | None = None
    cliente_email: str | None = None
    data_hora_inicio: datetime | None = None
    data_hora_fim: datetime | None = None
    servico: str | None = None
    observacoes: str | None = None


class StatusUpdate(BaseModel):
    status: str
    cancelamento_motivo: str | None = None
    cancelado_por: str | None = None
    reagendado_de: uuid.UUID | None = None


class AgendamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    workspace_id: uuid.UUID
    agenda_id: uuid.UUID
    contato_id: uuid.UUID | None
    cliente_nome: str
    cliente_telefone: str | None
    cliente_telefone_normalizado: str | None
    cliente_email: str | None
    agendado_por_telefone: str | None
    data_hora_inicio: datetime
    data_hora_fim: datetime
    slot_index: int
    servico: str | None
    observacoes: str | None
    status: str
    origem: str
    criado_por: str | None
    cancelamento_motivo: str | None
    cancelado_por: str | None
    cancelado_em: datetime | None
    reagendado_de: uuid.UUID | None
    nps_enviado: bool
    nps_enviado_em: datetime | None
    nps_score: int | None
    created_at: datetime
    updated_at: datetime


# ─────────────────────────── Helpers ───────────────────────────
def _resolve_workspace(workspace_filter, requested: uuid.UUID | None, usuario: User, db: Session) -> uuid.UUID:
    """Resolve o workspace para rotas de criação/listagem (que aceitam workspace_id explícito)."""
    if requested:
        verificar_acesso_workspace(usuario, requested, db)
        return requested
    if isinstance(workspace_filter, list):
        if len(workspace_filter) != 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe workspace_id quando há múltiplos workspaces.")
        workspace_id = workspace_filter[0]
    else:
        workspace_id = workspace_filter
    if workspace_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id é obrigatório")
    verificar_acesso_workspace(usuario, workspace_id, db)
    return workspace_id


def _get_agenda_or_404(db: Session, agenda_id: uuid.UUID, ws_id: uuid.UUID) -> Agenda:
    """Agenda dentro de um workspace já resolvido (usado em fluxos de criação)."""
    agenda = db.query(Agenda).filter(Agenda.id == agenda_id, Agenda.workspace_id == ws_id).first()
    if not agenda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agenda não encontrada")
    return agenda


def _agenda_autorizada(db: Session, agenda_id: uuid.UUID, usuario: User) -> Agenda:
    """Carrega a agenda por id e valida acesso (rotas by-id; funciona p/ platform_admin)."""
    agenda = db.query(Agenda).filter(Agenda.id == agenda_id).first()
    if not agenda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agenda não encontrada")
    verificar_acesso_workspace(usuario, agenda.workspace_id, db)
    return agenda


def _agendamento_autorizado(db: Session, ag_id: uuid.UUID, usuario: User) -> Agendamento:
    obj = db.query(Agendamento).filter(Agendamento.id == ag_id).first()
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado")
    verificar_acesso_workspace(usuario, obj.workspace_id, db)
    return obj


# ─────────────────────────── Agendas ───────────────────────────
@router.get("/agendas", response_model=list[AgendaOut])
def listar_agendas(
    workspace_id: uuid.UUID | None = Query(None),
    incluir_inativas: bool = Query(False),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, workspace_id, usuario, db)
    q = db.query(Agenda).filter(Agenda.workspace_id == ws_id)
    if not incluir_inativas:
        q = q.filter(Agenda.ativo.is_(True))
    return q.order_by(Agenda.nome).all()


@router.post("/agendas", response_model=AgendaOut, status_code=status.HTTP_201_CREATED)
def criar_agenda(
    data: AgendaIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, data.workspace_id, usuario, db)
    agenda = Agenda(
        workspace_id=ws_id,
        nome=data.nome,
        tipo=data.tipo,
        cor=data.cor,
        capacidade_simultanea=max(1, data.capacidade_simultanea or 1),
        fuso_horario=data.fuso_horario,
        webhook_url=data.webhook_url,
        agente_agendamento=data.agente_agendamento,
        responsavel_id=data.responsavel_id,
    )
    db.add(agenda)
    db.commit()
    db.refresh(agenda)
    return agenda


@router.patch("/agendas/{agenda_id}", response_model=AgendaOut)
def editar_agenda(
    agenda_id: uuid.UUID,
    data: AgendaUpdate,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    agenda = _agenda_autorizada(db, agenda_id, usuario)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(agenda, field, value)
    db.commit()
    db.refresh(agenda)
    return agenda


@router.delete("/agendas/{agenda_id}", status_code=status.HTTP_200_OK)
def desativar_agenda(
    agenda_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    agenda = _agenda_autorizada(db, agenda_id, usuario)
    agenda.ativo = False
    db.commit()
    return {"id": str(agenda.id), "ativo": False}


# ─────────────────────────── Horários ───────────────────────────
@router.get("/agendas/{agenda_id}/horarios", response_model=list[HorarioOut])
def listar_horarios(
    agenda_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    _agenda_autorizada(db, agenda_id, usuario)
    return (
        db.query(AgendaHorario)
        .filter(AgendaHorario.agenda_id == agenda_id)
        .order_by(AgendaHorario.dia_semana)
        .all()
    )


@router.put("/agendas/{agenda_id}/horarios", response_model=list[HorarioOut])
def salvar_horarios(
    agenda_id: uuid.UUID,
    data: HorariosPutIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    agenda = _agenda_autorizada(db, agenda_id, usuario)
    db.query(AgendaHorario).filter(AgendaHorario.agenda_id == agenda_id).delete()
    novos = [
        AgendaHorario(
            workspace_id=agenda.workspace_id,
            agenda_id=agenda_id,
            dia_semana=h.dia_semana,
            ativo=h.ativo,
            hora_inicio=h.hora_inicio,
            hora_fim=h.hora_fim,
            duracao_slot_minutos=h.duracao_slot_minutos,
            tem_almoco=h.tem_almoco,
            almoco_inicio=h.almoco_inicio,
            almoco_fim=h.almoco_fim,
        )
        for h in data.horarios
    ]
    db.add_all(novos)
    db.commit()
    return (
        db.query(AgendaHorario)
        .filter(AgendaHorario.agenda_id == agenda_id)
        .order_by(AgendaHorario.dia_semana)
        .all()
    )


# ─────────────────────────── Bloqueios ───────────────────────────
@router.get("/bloqueios", response_model=list[BloqueioOut])
def listar_bloqueios(
    workspace_id: uuid.UUID | None = Query(None),
    agenda_id: uuid.UUID | None = Query(None),
    busca: str | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, workspace_id, usuario, db)
    q = db.query(AgendaBloqueio).filter(AgendaBloqueio.workspace_id == ws_id)
    if agenda_id:
        q = q.filter(or_(AgendaBloqueio.agenda_id == agenda_id, AgendaBloqueio.agenda_id.is_(None)))
    if busca:
        q = q.filter(AgendaBloqueio.motivo.ilike(f"%{busca}%"))
    return q.order_by(AgendaBloqueio.inicio.desc()).all()


@router.post("/bloqueios", response_model=BloqueioOut, status_code=status.HTTP_201_CREATED)
def criar_bloqueio(
    data: BloqueioIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, data.workspace_id, usuario, db)
    if data.agenda_id:
        _get_agenda_or_404(db, data.agenda_id, ws_id)
    if data.fim <= data.inicio:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fim deve ser maior que início")
    bloqueio = AgendaBloqueio(
        workspace_id=ws_id,
        agenda_id=data.agenda_id,
        motivo=data.motivo,
        inicio=data.inicio,
        fim=data.fim,
        tipo=data.tipo,
    )
    db.add(bloqueio)
    db.commit()
    db.refresh(bloqueio)
    return bloqueio


@router.delete("/bloqueios/{bloqueio_id}", status_code=status.HTTP_200_OK)
def remover_bloqueio(
    bloqueio_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    bloqueio = db.query(AgendaBloqueio).filter(AgendaBloqueio.id == bloqueio_id).first()
    if not bloqueio:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bloqueio não encontrado")
    verificar_acesso_workspace(usuario, bloqueio.workspace_id, db)
    db.delete(bloqueio)
    db.commit()
    return {"id": str(bloqueio_id), "removido": True}


# ─────────────────────────── Agendamentos ───────────────────────────
@router.get("/agendamentos", response_model=list[AgendamentoOut])
def listar_agendamentos(
    workspace_id: uuid.UUID | None = Query(None),
    agenda_ids: list[uuid.UUID] | None = Query(None),
    status_filter: list[str] | None = Query(None, alias="status"),
    origem: list[str] | None = Query(None),
    data_inicio: datetime | None = Query(None),
    data_fim: datetime | None = Query(None),
    busca: str | None = Query(None),
    contato_id: uuid.UUID | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, workspace_id, usuario, db)
    q = db.query(Agendamento).filter(Agendamento.workspace_id == ws_id)
    if agenda_ids:
        q = q.filter(Agendamento.agenda_id.in_(agenda_ids))
    if status_filter:
        q = q.filter(Agendamento.status.in_(status_filter))
    if origem:
        q = q.filter(Agendamento.origem.in_(origem))
    if contato_id:
        q = q.filter(Agendamento.contato_id == contato_id)
    if data_inicio:
        q = q.filter(Agendamento.data_hora_inicio >= data_inicio)
    if data_fim:
        q = q.filter(Agendamento.data_hora_inicio <= data_fim)
    if busca:
        like = f"%{busca}%"
        q = q.filter(
            or_(
                Agendamento.cliente_nome.ilike(like),
                Agendamento.cliente_telefone.ilike(like),
                Agendamento.servico.ilike(like),
            )
        )
    return q.order_by(Agendamento.data_hora_inicio.asc()).offset(offset).limit(limit).all()


@router.post("/agendamentos", response_model=AgendamentoOut, status_code=status.HTTP_201_CREATED)
def criar_agendamento(
    data: AgendamentoIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, data.workspace_id, usuario, db)
    try:
        obj = svc_criar_agendamento(
            db,
            workspace_id=ws_id,
            agenda_id=data.agenda_id,
            cliente_nome=data.cliente_nome,
            data_hora_inicio=data.data_hora_inicio,
            data_hora_fim=data.data_hora_fim,
            cliente_telefone=data.cliente_telefone,
            cliente_email=data.cliente_email,
            servico=data.servico,
            observacoes=data.observacoes,
            origem=data.origem,
            criado_por=str(usuario.id),
            para_terceiro=data.para_terceiro,
            agendado_por_telefone=data.agendado_por_telefone,
        )
    except AgendaNaoEncontrada as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except DadosInvalidos as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except ConflitoAgendamento as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return obj


@router.patch("/agendamentos/{agendamento_id}", response_model=AgendamentoOut)
def editar_agendamento(
    agendamento_id: uuid.UUID,
    data: AgendamentoUpdate,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    obj = _agendamento_autorizado(db, agendamento_id, usuario)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conflito de horário (já ocupado)")
    db.refresh(obj)
    return obj


@router.patch("/agendamentos/{agendamento_id}/status", response_model=AgendamentoOut)
def atualizar_status_agendamento(
    agendamento_id: uuid.UUID,
    data: StatusUpdate,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    obj = _agendamento_autorizado(db, agendamento_id, usuario)
    return svc_atualizar_status(
        db,
        obj,
        status=data.status,
        cancelamento_motivo=data.cancelamento_motivo,
        cancelado_por=data.cancelado_por or str(usuario.id),
        reagendado_de=data.reagendado_de,
    )


@router.delete("/agendamentos/{agendamento_id}", response_model=AgendamentoOut)
def cancelar_agendamento(
    agendamento_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    obj = _agendamento_autorizado(db, agendamento_id, usuario)
    return svc_cancelar(db, obj, cancelado_por=str(usuario.id))


# ─────────────────────────── Disponibilidade ───────────────────────────
@router.get("/disponibilidade")
def disponibilidade(
    agenda_id: uuid.UUID = Query(...),
    data: date_cls = Query(...),
    duracao_min: int | None = Query(None, ge=1),
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, workspace_id, usuario, db)
    resultado = calcular_disponibilidade(
        db, workspace_id=ws_id, agenda_id=agenda_id, data=data, duracao_min=duracao_min
    )
    if resultado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agenda não encontrada")
    agenda = resultado["agenda"]
    return {
        "data": data.isoformat(),
        "agenda_id": str(agenda.id),
        "fuso_horario": agenda.fuso_horario,
        "slots": [
            {
                "inicio": s["inicio"].isoformat(),
                "fim": s["fim"].isoformat(),
                "vagas_restantes": s["vagas_restantes"],
            }
            for s in resultado["slots"]
        ],
    }


# ─────────────────────────── Overview (KPIs) ───────────────────────────
def _bounds_utc(dia: date_cls) -> tuple[datetime, datetime]:
    ini = datetime(dia.year, dia.month, dia.day, tzinfo=_TZ_OVERVIEW).astimezone(timezone.utc)
    return ini, ini + timedelta(days=1)


@router.get("/overview")
def overview(
    workspace_id: uuid.UUID | None = Query(None),
    agenda_ids: list[uuid.UUID] | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, workspace_id, usuario, db)
    hoje = datetime.now(_TZ_OVERVIEW).date()
    semana_ini_dia = hoje - timedelta(days=hoje.weekday())  # segunda
    hoje_ini, hoje_fim = _bounds_utc(hoje)
    semana_ini, _ = _bounds_utc(semana_ini_dia)
    _, semana_fim = _bounds_utc(semana_ini_dia + timedelta(days=6))

    base = db.query(Agendamento).filter(Agendamento.workspace_id == ws_id, Agendamento.ativo.is_(True))
    if agenda_ids:
        base = base.filter(Agendamento.agenda_id.in_(agenda_ids))

    hoje_rows = base.filter(
        Agendamento.data_hora_inicio >= hoje_ini, Agendamento.data_hora_inicio < hoje_fim
    ).all()
    semana_rows = base.filter(
        Agendamento.data_hora_inicio >= semana_ini, Agendamento.data_hora_inicio < semana_fim
    ).all()

    agendamentos_hoje = len(hoje_rows)
    confirmados_hoje = sum(1 for r in hoje_rows if r.status in ("confirmado", "em_atendimento", "compareceu"))
    faltas_semana = sum(1 for r in semana_rows if r.status == "falta")
    compareceu_semana = sum(1 for r in semana_rows if r.status == "compareceu")
    total_fechado = compareceu_semana + faltas_semana
    taxa = round((compareceu_semana / total_fechado) * 100) if total_fechado else 0

    por_origem: dict[str, int] = {}
    for r in semana_rows:
        por_origem[r.origem] = por_origem.get(r.origem, 0) + 1

    return {
        "agendamentos_hoje": agendamentos_hoje,
        "confirmados_hoje": confirmados_hoje,
        "faltas_semana": faltas_semana,
        "compareceu_semana": compareceu_semana,
        "taxa_comparecimento": taxa,
        "por_origem": por_origem,
        # split Web vs IA (web = paciente/manual/api; ia = agente)
        "por_canal": {
            "ia": por_origem.get("agente", 0),
            "web": por_origem.get("paciente", 0) + por_origem.get("manual", 0) + por_origem.get("api", 0),
        },
    }


# ─────────────────────── Agendamentos por contato (caixa do Atendimento) ───────────────────────
@router.get("/contatos/agendamentos")
def agendamentos_do_contato(
    telefone: str = Query(...),
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, workspace_id, usuario, db)
    tel_norm = canonical_phone_digits(telefone)
    if not tel_norm:
        return {"proximos": [], "historico": [], "resumo": {"total": 0, "compareceu": 0, "falta": 0, "taxa_comparecimento": 0}}

    rows = (
        db.query(Agendamento)
        .filter(
            Agendamento.workspace_id == ws_id,
            or_(
                Agendamento.cliente_telefone_normalizado == tel_norm,
                Agendamento.agendado_por_telefone_normalizado == tel_norm,
            ),
        )
        .order_by(Agendamento.data_hora_inicio.desc())
        .all()
    )

    agora = datetime.now(timezone.utc)
    proximos, historico = [], []
    for r in rows:
        item = AgendamentoOut.model_validate(r).model_dump(mode="json")
        ativo_futuro = r.ativo and r.status in STATUS_OCUPANTES and r.data_hora_inicio and r.data_hora_inicio >= agora
        (proximos if ativo_futuro else historico).append(item)
    proximos.sort(key=lambda x: x["data_hora_inicio"])

    total = len(rows)
    compareceu = sum(1 for r in rows if r.status == "compareceu")
    falta = sum(1 for r in rows if r.status == "falta")
    fechado = compareceu + falta
    taxa = round((compareceu / fechado) * 100) if fechado else 0
    return {
        "proximos": proximos,
        "historico": historico,
        "resumo": {"total": total, "compareceu": compareceu, "falta": falta, "taxa_comparecimento": taxa},
    }

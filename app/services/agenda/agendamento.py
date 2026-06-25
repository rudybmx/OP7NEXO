"""Criação e ciclo de vida de agendamentos.

Regras-chave:
- Vínculo por telefone NORMALIZADO (canonização BR do 9º dígito). `contato_id` é conveniência.
- Exceção terceiro: agendamento para outra pessoa → sem telefone do paciente, com
  `agendado_por_telefone` (de quem marcou) preenchido p/ aparecer na caixa do contato.
- Anti-double-booking: escolhe o menor `slot_index` livre em [0, capacidade-1]; a EXCLUDE do
  banco é a rede de segurança contra corrida (IntegrityError → tenta próximo / 409).
- Impede o MESMO telefone no MESMO horário.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.crm.agenda import Agenda, Agendamento
from app.models.crm.contato import Contato
from app.services.agenda.disponibilidade import STATUS_OCUPANTES
from app.services.agenda.telefone import canonical_phone_digits


class AgendaError(Exception):
    """Base dos erros de domínio da agenda."""


class AgendaNaoEncontrada(AgendaError):
    """Agenda inexistente/inativa no workspace → 404."""


class DadosInvalidos(AgendaError):
    """Payload inconsistente (ex.: fim <= início) → 400."""


class ConflitoAgendamento(AgendaError):
    """Sem vaga no horário ou mesmo telefone já agendado → 409."""


def resolver_contato_por_telefone(
    db: Session, *, workspace_id: uuid.UUID, telefone_normalizado: str | None
) -> uuid.UUID | None:
    """Acha o contato CRM cujo número canônico bate com o telefone (conveniência; pode ser None).

    O contato é gravado com `jid` já canônico (13 díg @s.whatsapp.net) pelo pipeline de dedupe,
    então casamos pelo prefixo do jid. Nunca é a chave de vínculo — só preenche `contato_id`.
    """
    if not telefone_normalizado:
        return None
    contato = (
        db.query(Contato.id)
        .filter(
            Contato.workspace_id == workspace_id,
            Contato.ativo.is_(True),
            or_(
                Contato.jid.like(f"{telefone_normalizado}@%"),
                Contato.telefone == telefone_normalizado,
            ),
        )
        .first()
    )
    return contato[0] if contato else None


def _coerce_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def criar_agendamento(
    db: Session,
    *,
    workspace_id: uuid.UUID,
    agenda_id: uuid.UUID,
    cliente_nome: str,
    data_hora_inicio: datetime,
    data_hora_fim: datetime,
    cliente_telefone: str | None = None,
    cliente_email: str | None = None,
    servico: str | None = None,
    observacoes: str | None = None,
    origem: str = "manual",
    criado_por: str | None = None,
    para_terceiro: bool = False,
    agendado_por_telefone: str | None = None,
    status: str = "agendado",
) -> Agendamento:
    inicio = _coerce_utc(data_hora_inicio)
    fim = _coerce_utc(data_hora_fim)
    if fim <= inicio:
        raise DadosInvalidos("data_hora_fim deve ser maior que data_hora_inicio")

    agenda = (
        db.query(Agenda)
        .filter(Agenda.id == agenda_id, Agenda.workspace_id == workspace_id, Agenda.ativo.is_(True))
        .first()
    )
    if agenda is None:
        raise AgendaNaoEncontrada("Agenda não encontrada")

    # Telefones: exceção terceiro grava o paciente SEM telefone; quem marcou fica em agendado_por.
    if para_terceiro:
        cli_tel = None
        cli_norm = None
    else:
        cli_tel = (cliente_telefone or "").strip() or None
        cli_norm = canonical_phone_digits(cli_tel)
    ag_tel = (agendado_por_telefone or "").strip() or None
    ag_norm = canonical_phone_digits(ag_tel)

    contato_id = resolver_contato_por_telefone(
        db, workspace_id=workspace_id, telefone_normalizado=cli_norm
    )

    # Mesmo telefone no mesmo horário → 409 (mesmo em capacidade > 1).
    if cli_norm:
        ja = (
            db.query(Agendamento.id)
            .filter(
                Agendamento.workspace_id == workspace_id,
                Agendamento.cliente_telefone_normalizado == cli_norm,
                Agendamento.ativo.is_(True),
                Agendamento.status.in_(STATUS_OCUPANTES),
                Agendamento.data_hora_inicio < fim,
                Agendamento.data_hora_fim > inicio,
            )
            .first()
        )
        if ja:
            raise ConflitoAgendamento("Este cliente já tem um agendamento neste horário")

    capacidade = max(1, agenda.capacidade_simultanea or 1)

    # Escolhe o menor slot_index livre; a EXCLUDE protege contra corrida (SAVEPOINT por tentativa).
    criado: Agendamento | None = None
    for idx in range(capacidade):
        sp = db.begin_nested()
        obj = Agendamento(
            workspace_id=workspace_id,
            agenda_id=agenda_id,
            contato_id=contato_id,
            cliente_nome=cliente_nome,
            cliente_telefone=cli_tel,
            cliente_telefone_normalizado=cli_norm,
            cliente_email=(cliente_email or None),
            agendado_por_telefone=ag_tel,
            agendado_por_telefone_normalizado=ag_norm,
            data_hora_inicio=inicio,
            data_hora_fim=fim,
            slot_index=idx,
            servico=(servico or None),
            observacoes=(observacoes or None),
            status=status,
            origem=origem,
            criado_por=criado_por,
        )
        db.add(obj)
        try:
            db.flush()
        except IntegrityError:
            sp.rollback()
            continue
        sp.commit()
        criado = obj
        break

    if criado is None:
        raise ConflitoAgendamento("Sem vaga disponível neste horário")

    db.commit()
    db.refresh(criado)
    return criado


def atualizar_status(
    db: Session,
    agendamento: Agendamento,
    *,
    status: str,
    cancelamento_motivo: str | None = None,
    cancelado_por: str | None = None,
    reagendado_de: uuid.UUID | None = None,
) -> Agendamento:
    agendamento.status = status
    if cancelamento_motivo is not None:
        agendamento.cancelamento_motivo = cancelamento_motivo
    if cancelado_por is not None:
        agendamento.cancelado_por = cancelado_por
    if reagendado_de is not None:
        agendamento.reagendado_de = reagendado_de
    if status == "cancelado":
        agendamento.cancelado_em = datetime.now(timezone.utc)
        agendamento.ativo = False
    db.commit()
    db.refresh(agendamento)
    return agendamento


def cancelar(
    db: Session,
    agendamento: Agendamento,
    *,
    motivo: str | None = None,
    cancelado_por: str | None = None,
) -> Agendamento:
    return atualizar_status(
        db,
        agendamento,
        status="cancelado",
        cancelamento_motivo=motivo,
        cancelado_por=cancelado_por,
    )


def reagendar(
    db: Session,
    agendamento: Agendamento,
    *,
    data_hora_inicio: datetime,
    data_hora_fim: datetime,
    cancelado_por: str | None = None,
) -> Agendamento:
    """Cria um novo agendamento no novo horário e marca o original como reagendado (atômico)."""
    novo = criar_agendamento(
        db,
        workspace_id=agendamento.workspace_id,
        agenda_id=agendamento.agenda_id,
        cliente_nome=agendamento.cliente_nome,
        data_hora_inicio=data_hora_inicio,
        data_hora_fim=data_hora_fim,
        cliente_telefone=agendamento.cliente_telefone,
        cliente_email=agendamento.cliente_email,
        servico=agendamento.servico,
        observacoes=agendamento.observacoes,
        origem=agendamento.origem,
        criado_por=cancelado_por,
        para_terceiro=agendamento.cliente_telefone is None and agendamento.agendado_por_telefone is not None,
        agendado_por_telefone=agendamento.agendado_por_telefone,
    )
    agendamento.status = "reagendado"
    agendamento.ativo = False
    novo.reagendado_de = agendamento.id
    db.commit()
    db.refresh(novo)
    return novo

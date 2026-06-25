"""Motor de disponibilidade da Agenda.

`gerar_slots` é uma **função pura** (entradas explícitas, sem DB) — testável isoladamente.
`calcular_disponibilidade` é o wrapper que busca os insumos do banco e chama a pura.

Timezone first-class: tudo é armazenado em UTC (timestamptz); a geração/limite de slots usa o
fuso da agenda (`zoneinfo`) e converte para UTC. Slots `[início, fim)` — back-to-back não colide.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date as date_cls
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.crm.agenda import Agenda, AgendaBloqueio, AgendaHorario, Agendamento

# Python weekday(): Monday=0 .. Sunday=6
_DIA_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]

# Status que ocupam vaga (entram na contagem de capacidade)
STATUS_OCUPANTES = ("agendado", "confirmado", "em_atendimento")


@dataclass(frozen=True)
class Faixa:
    """Faixa de funcionamento de um dia (uma linha de agenda_horarios)."""

    hora_inicio: str  # 'HH:mm'
    hora_fim: str  # 'HH:mm'
    duracao_slot_minutos: int
    tem_almoco: bool = False
    almoco_inicio: str | None = None
    almoco_fim: str | None = None


def _parse_hm(valor: str) -> tuple[int, int]:
    h, m = valor.split(":")
    return int(h), int(m)


def _overlap(a_ini: datetime, a_fim: datetime, b_ini: datetime, b_fim: datetime) -> bool:
    """[a_ini,a_fim) sobrepõe [b_ini,b_fim)?"""
    return a_ini < b_fim and b_ini < a_fim


def _as_utc(dt: datetime) -> datetime:
    """Garante datetime aware em UTC (timestamptz do driver já costuma vir aware)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def gerar_slots(
    *,
    data: date_cls,
    fuso: str,
    faixas: list[Faixa],
    bloqueios: list[tuple[datetime, datetime]],
    ocupacoes: list[tuple[datetime, datetime]],
    capacidade: int,
    agora: datetime,
    duracao_min: int | None = None,
) -> list[dict]:
    """Gera os slots livres do dia. Remove almoço, passado, bloqueios e respeita capacidade.

    `bloqueios`/`ocupacoes`/`agora` em UTC aware. Retorna [{inicio(UTC), fim(UTC), vagas_restantes}].
    """
    tz = ZoneInfo(fuso)
    bloqueios = [(_as_utc(a), _as_utc(b)) for a, b in bloqueios]
    ocupacoes = [(_as_utc(a), _as_utc(b)) for a, b in ocupacoes]
    agora = _as_utc(agora)

    slots: list[dict] = []
    for f in faixas:
        dur = duracao_min or f.duracao_slot_minutos
        if not dur or dur <= 0:
            continue
        hi_h, hi_m = _parse_hm(f.hora_inicio)
        hf_h, hf_m = _parse_hm(f.hora_fim)
        ini_local = datetime(data.year, data.month, data.day, hi_h, hi_m, tzinfo=tz)
        fim_local = datetime(data.year, data.month, data.day, hf_h, hf_m, tzinfo=tz)

        alm_ini = alm_fim = None
        if f.tem_almoco and f.almoco_inicio and f.almoco_fim:
            ah, am = _parse_hm(f.almoco_inicio)
            bh, bm = _parse_hm(f.almoco_fim)
            alm_ini = datetime(data.year, data.month, data.day, ah, am, tzinfo=tz)
            alm_fim = datetime(data.year, data.month, data.day, bh, bm, tzinfo=tz)

        step = timedelta(minutes=dur)
        cur = ini_local
        while cur + step <= fim_local:
            s_ini_local, s_fim_local = cur, cur + step
            cur = s_fim_local
            u_ini = s_ini_local.astimezone(timezone.utc)
            u_fim = s_fim_local.astimezone(timezone.utc)

            if u_ini < agora:
                continue
            if alm_ini and _overlap(s_ini_local, s_fim_local, alm_ini, alm_fim):
                continue
            if any(_overlap(u_ini, u_fim, b0, b1) for b0, b1 in bloqueios):
                continue
            usados = sum(1 for o0, o1 in ocupacoes if _overlap(u_ini, u_fim, o0, o1))
            vagas = capacidade - usados
            if vagas <= 0:
                continue
            slots.append({"inicio": u_ini, "fim": u_fim, "vagas_restantes": vagas})

    slots.sort(key=lambda s: s["inicio"])
    # dedupe por horário de início (faixas podem se sobrepor)
    visto: set[str] = set()
    unicos: list[dict] = []
    for s in slots:
        chave = s["inicio"].isoformat()
        if chave in visto:
            continue
        visto.add(chave)
        unicos.append(s)
    return unicos


def calcular_disponibilidade(
    db: Session,
    *,
    workspace_id: uuid.UUID,
    agenda_id: uuid.UUID,
    data: date_cls,
    duracao_min: int | None = None,
    agora: datetime | None = None,
) -> dict | None:
    """Busca insumos do banco e devolve {agenda, slots}. None se a agenda não existir no workspace."""
    agora = agora or datetime.now(timezone.utc)
    agenda = (
        db.query(Agenda)
        .filter(Agenda.id == agenda_id, Agenda.workspace_id == workspace_id, Agenda.ativo.is_(True))
        .first()
    )
    if agenda is None:
        return None

    dia = _DIA_SEMANA[data.weekday()]
    horarios = (
        db.query(AgendaHorario)
        .filter(
            AgendaHorario.agenda_id == agenda_id,
            AgendaHorario.dia_semana == dia,
            AgendaHorario.ativo.is_(True),
        )
        .all()
    )
    faixas = [
        Faixa(
            hora_inicio=h.hora_inicio,
            hora_fim=h.hora_fim,
            duracao_slot_minutos=h.duracao_slot_minutos,
            tem_almoco=h.tem_almoco,
            almoco_inicio=h.almoco_inicio,
            almoco_fim=h.almoco_fim,
        )
        for h in horarios
    ]

    tz = ZoneInfo(agenda.fuso_horario)
    dia_ini = datetime(data.year, data.month, data.day, 0, 0, tzinfo=tz).astimezone(timezone.utc)
    dia_fim = dia_ini + timedelta(days=1)

    bloqueios = [
        (b.inicio, b.fim)
        for b in db.query(AgendaBloqueio)
        .filter(
            AgendaBloqueio.workspace_id == workspace_id,
            (AgendaBloqueio.agenda_id == agenda_id) | (AgendaBloqueio.agenda_id.is_(None)),
            AgendaBloqueio.fim > dia_ini,
            AgendaBloqueio.inicio < dia_fim,
        )
        .all()
    ]
    ocupacoes = [
        (a.data_hora_inicio, a.data_hora_fim)
        for a in db.query(Agendamento)
        .filter(
            Agendamento.agenda_id == agenda_id,
            Agendamento.ativo.is_(True),
            Agendamento.status.in_(STATUS_OCUPANTES),
            Agendamento.data_hora_fim > dia_ini,
            Agendamento.data_hora_inicio < dia_fim,
        )
        .all()
    ]

    slots = gerar_slots(
        data=data,
        fuso=agenda.fuso_horario,
        faixas=faixas,
        bloqueios=bloqueios,
        ocupacoes=ocupacoes,
        capacidade=agenda.capacidade_simultanea,
        duracao_min=duracao_min,
        agora=agora,
    )
    return {"agenda": agenda, "slots": slots}

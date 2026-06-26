"""Lembretes de agendamento (Fase 4).

Job de varredura (roda no worker): para cada config ativa, acha agendamentos futuros no escopo,
calcula o horário de envio, e manda por WhatsApp os vencidos ainda-não-enviados (dedupe durável
em `agenda_lembrete_envios`). A resposta do paciente é tratada pelo agente (Fase 3).

v1: só canal whatsapp; só contatos com conversa existente (opt-in). Ver docs/specs/agenda-lembretes/.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.canal_entrada import CanalEntrada
from app.models.crm.agenda import (
    Agenda,
    Agendamento,
    AgendaLembreteConfig,
    AgendaLembreteEnvio,
)
from app.models.crm.conversa import Conversa
from app.services.agenda.disponibilidade import STATUS_OCUPANTES

log = logging.getLogger(__name__)

TEMPLATE_PADRAO = (
    "Olá {{nome}}! 👋 Passando para lembrar do seu agendamento"
    " de {{servico}} em {{data}} às {{hora}}."
    " Se precisar remarcar ou cancelar, é só responder por aqui. Até lá! 😊"
)


def _parse_hm(valor: str) -> tuple[int, int]:
    h, m = (valor or "09:00").split(":")
    return int(h), int(m)


def horario_envio(agendamento: Agendamento, fuso: str, cfg: AgendaLembreteConfig) -> datetime:
    """Quando o lembrete deve sair (UTC). dias_antes>0 → (data−dias) às hora_envio no fuso da agenda;
    dias_antes=0 → início − horas_antes."""
    inicio = agendamento.data_hora_inicio
    if inicio.tzinfo is None:
        inicio = inicio.replace(tzinfo=timezone.utc)
    if cfg.dias_antes and cfg.dias_antes > 0:
        tz = ZoneInfo(fuso)
        local = inicio.astimezone(tz)
        dia = local.date() - timedelta(days=cfg.dias_antes)
        hh, mm = _parse_hm(cfg.hora_envio or "09:00")
        envio_local = datetime(dia.year, dia.month, dia.day, hh, mm, tzinfo=tz)
        return envio_local.astimezone(timezone.utc)
    horas = cfg.horas_antes or 1
    return inicio - timedelta(hours=horas)


def render_template(template: str, agendamento: Agendamento, agenda: Agenda) -> str:
    inicio = agendamento.data_hora_inicio
    if inicio.tzinfo is None:
        inicio = inicio.replace(tzinfo=timezone.utc)
    loc = inicio.astimezone(ZoneInfo(agenda.fuso_horario))
    repl = {
        "{{nome}}": agendamento.cliente_nome or "",
        "{{data}}": loc.strftime("%d/%m/%Y"),
        "{{hora}}": loc.strftime("%H:%M"),
        "{{servico}}": agendamento.servico or "atendimento",
        "{{profissional}}": agenda.nome or "",
        "{{link_confirmacao}}": "",  # link público é Fase 5
    }
    out = template or ""
    for k, v in repl.items():
        out = out.replace(k, v)
    return out.strip()


def criar_lembrete_padrao(db: Session, agenda: Agenda) -> AgendaLembreteConfig:
    """Lembrete default de uma agenda nova: 1 dia antes, 09:00, WhatsApp (editável/removível)."""
    cfg = AgendaLembreteConfig(
        workspace_id=agenda.workspace_id,
        agenda_id=agenda.id,
        canal="whatsapp",
        dias_antes=1,
        hora_envio="09:00",
        mensagem_template=TEMPLATE_PADRAO,
        ativo=True,
        ordem=0,
    )
    db.add(cfg)
    return cfg


def _achar_conversa_canal(db: Session, workspace_id, telefone_norm: str | None):
    """Conversa ativa mais recente do contato (qualquer sufixo de jid) + seu canal. None se não houver."""
    if not telefone_norm:
        return None, None
    conversa = (
        db.query(Conversa)
        .filter(
            Conversa.workspace_id == workspace_id,
            Conversa.remote_jid.like(f"{telefone_norm}@%"),
            Conversa.ativo.is_(True),
        )
        .order_by(Conversa.ultima_msg_at.desc().nullslast())
        .first()
    )
    if conversa is None or not conversa.canal_id:
        return None, None
    canal = db.query(CanalEntrada).filter(CanalEntrada.id == conversa.canal_id).first()
    return conversa, canal


def _persistir_saida(db: Session, conversa: Conversa, texto: str, evo_msg_id: str | None) -> None:
    """Grava a mensagem de saída + atualiza a conversa (igual ao envio do agente)."""
    db.execute(
        text(
            """
            INSERT INTO crm_whatsapp_mensagens
              (workspace_id, canal_id, conversa_id, contato_id, instance, remote_jid,
               direcao, from_me, remetente_tipo, remetente_nome, conteudo, message_type,
               status, evolution_msg_id, recebida_em, created_at, updated_at)
            VALUES
              (:ws, :canal, :cid, :ct, :inst, :jid,
               'saida', true, 'sistema', 'Lembrete', :msg, 'conversation',
               'enviada', :evid, NOW(), NOW(), NOW())
            """
        ),
        {
            "ws": str(conversa.workspace_id),
            "canal": str(conversa.canal_id) if conversa.canal_id else None,
            "cid": str(conversa.id),
            "ct": str(conversa.contato_id) if conversa.contato_id else None,
            "inst": conversa.instance,
            "jid": conversa.remote_jid,
            "msg": texto,
            "evid": evo_msg_id,
        },
    )
    conversa.ultima_mensagem = texto
    conversa.ultima_direcao = "saida"
    conversa.ultima_msg_at = datetime.now(timezone.utc)
    conversa.last_outbound_at = datetime.now(timezone.utc)


def _enviar_lembrete(db: Session, ag: Agendamento, agenda: Agenda, cfg: AgendaLembreteConfig) -> tuple[bool, str | None]:
    tel = ag.cliente_telefone_normalizado or ag.agendado_por_telefone_normalizado
    conversa, canal = _achar_conversa_canal(db, ag.workspace_id, tel)
    if conversa is None or canal is None:
        return False, "sem conversa/canal p/ o contato"
    texto = render_template(cfg.mensagem_template, ag, agenda)
    if not texto:
        return False, "template vazio"
    from app.services.agent_service import _enviar_resposta  # import tardio: evita ciclo

    try:
        enviado, evo_id = _enviar_resposta(conversa, canal, texto)
    except Exception as exc:  # noqa: BLE001
        return False, f"falha no envio: {exc}"
    if not enviado:
        return False, "provider recusou o envio"
    _persistir_saida(db, conversa, texto, evo_id)
    return True, None


def _registrar_envio(db: Session, ag: Agendamento, cfg: AgendaLembreteConfig, ok: bool, erro: str | None) -> None:
    db.add(
        AgendaLembreteEnvio(
            workspace_id=ag.workspace_id,
            agendamento_id=ag.id,
            config_id=cfg.id,
            status="enviado" if ok else "falha",
            erro=None if ok else (erro or "")[:500],
        )
    )


def processar_lembretes_pendentes(db: Session, *, agora: datetime | None = None, limit: int = 200) -> dict:
    """Varre configs ativas → agendamentos futuros vencidos ainda-não-enviados → envia + loga.

    Best-effort por agendamento (1 falha não derruba o lote). Dedupe por (agendamento, config).
    """
    agora = agora or datetime.now(timezone.utc)
    configs = (
        db.query(AgendaLembreteConfig)
        .filter(AgendaLembreteConfig.ativo.is_(True), AgendaLembreteConfig.canal == "whatsapp")
        .all()
    )
    enviados = falhas = 0
    for cfg in configs:
        q = db.query(Agendamento).filter(
            Agendamento.workspace_id == cfg.workspace_id,
            Agendamento.ativo.is_(True),
            Agendamento.status.in_(STATUS_OCUPANTES),
            Agendamento.data_hora_inicio > agora,
        )
        if cfg.agenda_id is not None:
            q = q.filter(Agendamento.agenda_id == cfg.agenda_id)
        ags = q.order_by(Agendamento.data_hora_inicio.asc()).limit(limit).all()
        for ag in ags:
            agenda = db.query(Agenda).filter(Agenda.id == ag.agenda_id).first()
            if agenda is None or not agenda.ativo:
                continue
            if agora < horario_envio(ag, agenda.fuso_horario, cfg):
                continue  # ainda não chegou a hora de enviar
            ja = (
                db.query(AgendaLembreteEnvio.id)
                .filter(
                    AgendaLembreteEnvio.agendamento_id == ag.id,
                    AgendaLembreteEnvio.config_id == cfg.id,
                )
                .first()
            )
            if ja:
                continue
            try:
                ok, erro = _enviar_lembrete(db, ag, agenda, cfg)
                _registrar_envio(db, ag, cfg, ok, erro)
                db.commit()
            except Exception as exc:  # noqa: BLE001 — isola a falha do agendamento
                db.rollback()
                log.warning("[lembrete] falha agendamento=%s cfg=%s: %s", ag.id, cfg.id, exc)
                try:
                    _registrar_envio(db, ag, cfg, False, str(exc))
                    db.commit()
                except Exception:
                    db.rollback()
                ok = False
            enviados += 1 if ok else 0
            falhas += 0 if ok else 1
    return {"configs": len(configs), "enviados": enviados, "falhas": falhas}

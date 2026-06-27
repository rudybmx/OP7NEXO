"""Resgate de follow-up (Fase 2): o agente gera e (em modo automatico) envia uma mensagem
de reengajamento para leads que pararam de responder (etiqueta 'followup').

Roda no worker (scheduler). Para cada conversa elegível:
  - INSERT do resgate ANTES de enviar (status='processando') — a UNIQUE(conversa,tentativa)
    reserva o slot → crash não causa reenvio a cliente real.
  - gera a mensagem com a IA do agente (voz/persona do agente).
  - modo 'automatico': envia (reusa _enviar_resposta) + persiste a saída → status='enviado'.
  - modo 'rascunho': status='pendente' (fica na fila de aprovação na tela de Follow-up).

Cadência com reset: conta só os resgates do ciclo atual (depois da última resposta do lead);
quando o lead responde, o ciclo zera ("respondeu → volta ao ciclo"). Atingiu o máximo sem
resposta → followup_fechamento='perdido' (terminal; fonte do futuro Kanban "Perdidos").
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.agente.agente import Agente
from app.models.canal_entrada import CanalEntrada
from app.models.crm.conversa import Conversa
from app.models.crm.followup_resgate import FollowupResgate

log = logging.getLogger(__name__)

TZ_BR = ZoneInfo("America/Sao_Paulo")
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
FECHAMENTO_FECHADO = ("ganho", "perca", "perdido")
ATIVOS_CICLO = ("pendente", "processando", "aprovado", "enviado")


def _dentro_quiet_hours(agora: datetime, inicio: int, fim: int) -> bool:
    """True se a hora local (America/Sao_Paulo) está dentro de [inicio, fim)."""
    h = agora.astimezone(TZ_BR).hour
    if inicio <= fim:
        return inicio <= h < fim
    return h >= inicio or h < fim  # janela que cruza a meia-noite


def _persistir_saida(db: Session, conversa: Conversa, agente: Agente, texto: str, evo_msg_id: str | None) -> None:
    """Grava a mensagem de saída (como o agente) + atualiza a conversa."""
    db.execute(
        text(
            """
            INSERT INTO crm_whatsapp_mensagens
              (workspace_id, canal_id, conversa_id, contato_id, instance, remote_jid,
               direcao, from_me, remetente_tipo, remetente_nome, conteudo, message_type,
               status, evolution_msg_id, recebida_em, created_at, updated_at)
            VALUES
              (:ws, :canal, :cid, :ct, :inst, :jid,
               'saida', true, 'ia', :rnome, :msg, 'conversation',
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
            "rnome": (agente.nome or "Resgate")[:120],
            "msg": texto,
            "evid": evo_msg_id,
        },
    )
    conversa.ultima_mensagem = texto
    conversa.ultima_direcao = "saida"
    conversa.ultima_msg_at = datetime.now(timezone.utc)
    conversa.last_outbound_at = datetime.now(timezone.utc)


def gerar_mensagem_resgate(
    db: Session, agente: Agente, *, contato_nome: str | None, resumo: str | None,
    interesse: str | None, temperatura: str | None, tentativa: int,
) -> tuple[str, float, dict]:
    """Gera UMA mensagem de resgate na voz do agente. Retorna (texto, score, usage)."""
    from app.services.agent_service import _prompt_efetivo
    from app.services import llm_client_service

    persona = _prompt_efetivo(db, agente) or ""
    angulo = (
        "1ª tentativa: leve e acolhedora, retoma o assunto." if tentativa <= 1 else
        "tentativa intermediária: agregue um valor/benefício concreto." if tentativa == 2 else
        "última tentativa: educada, sem pressão, deixando a porta aberta."
    )
    system = (
        f"{persona}\n\n"
        "TAREFA: você está REENGAJANDO um cliente que parou de responder no WhatsApp. "
        "Escreva UMA mensagem curta (1-3 frases), calorosa e natural, em português do Brasil, "
        "no seu tom de sempre. NÃO use saudação genérica repetida; referencie o contexto do lead. "
        "Não invente fatos. Responda SOMENTE em JSON: "
        '{"mensagem": "<texto da mensagem>", "score": <0.0-1.0 confiança>}.'
    )
    user = (
        f"Cliente: {contato_nome or 'cliente'}\n"
        f"Resumo da conversa: {resumo or '(sem resumo)'}\n"
        f"Interesse detectado: {interesse or '(não identificado)'}\n"
        f"Temperatura: {temperatura or '(não avaliada)'}\n"
        f"Ângulo desta tentativa (nº {tentativa}): {angulo}\n"
        "Escreva a mensagem de resgate."
    )
    content, usage = llm_client_service.chamar_json(db, agente, system, user)
    try:
        data = json.loads(content)
        texto = str(data.get("mensagem") or "").strip()
        score = float(data.get("score") or 0.5)
    except Exception:
        texto, score = "", 0.0
    return texto, score, (usage or {})


def _enviar(db: Session, conversa: Conversa, canal: CanalEntrada | None, agente: Agente, texto: str) -> tuple[bool, str | None]:
    """Envia + persiste. Retorna (ok, erro)."""
    from app.services.agent_service import _enviar_resposta, _sanitizar_resposta
    if not texto:
        return False, "mensagem vazia gerada pela IA"
    if canal is None:
        return False, "conversa sem canal"
    texto = _sanitizar_resposta(texto)
    try:
        enviado, evo_id = _enviar_resposta(conversa, canal, texto)
    except Exception as exc:  # noqa: BLE001
        return False, f"falha no envio: {exc}"
    if not enviado:
        return False, "provider recusou o envio (canal não suportado?)"
    _persistir_saida(db, conversa, agente, texto, evo_id)
    return True, None


def _candidatos(db: Session, limit: int) -> list[dict]:
    rows = db.execute(
        text(
            """
            SELECT c.id::text AS conversa_id, c.workspace_id::text AS workspace_id,
                   c.contato_id::text AS contato_id, c.canal_id::text AS canal_id,
                   ct.nome AS contato_nome, c.resumo_ia AS resumo,
                   c.contexto_ia->>'interesse' AS interesse,
                   c.contexto_ia->>'temperatura' AS temperatura,
                   c.last_inbound_at,
                   a.id::text AS agente_id, a.resgate_modo, a.resgate_max_tentativas,
                   a.resgate_intervalo_horas, a.resgate_hora_inicio, a.resgate_hora_fim
            FROM crm_whatsapp_conversas c
            JOIN crm_whatsapp_contatos ct ON ct.id = c.contato_id
            JOIN crm_conversa_etiquetas ce ON ce.conversa_id = c.id
            JOIN crm_etiquetas e ON e.id = ce.etiqueta_id AND e.nome = 'followup' AND e.ativo = true
            JOIN agente_canais ac ON ac.canal_id = c.canal_id AND ac.ativo = true
            JOIN agentes a ON a.id = ac.agente_id AND a.status = 'ativo' AND a.deleted_at IS NULL
                 AND a.resgate_modo <> 'desligado'
            WHERE c.ativo = true AND c.is_group = false AND c.status <> 'resolvido'
              AND c.ultima_direcao = 'saida'
              AND COALESCE(c.followup_fechamento, 'em_aberto') NOT IN ('ganho','perca','perdido')
              AND COALESCE(c.ai_escalado, false) = false
              AND c.responsavel_id IS NULL
            ORDER BY c.last_outbound_at ASC NULLS FIRST
            LIMIT :lim
            """
        ),
        {"lim": limit},
    ).mappings().all()
    return [dict(r) for r in rows]


def processar_resgates(db: Session, *, agora: datetime | None = None, max_por_ciclo: int = 25) -> dict:
    """Varre conversas em followup elegíveis e gera/dispara o resgate. Best-effort por lead."""
    agora = agora or datetime.now(timezone.utc)
    out = {"candidatos": 0, "gerados": 0, "enviados": 0, "rascunhos": 0, "falhas": 0, "terminados": 0}
    # Recupera reservas órfãs (crash entre reservar e finalizar) — senão a conversa fica travada.
    db.execute(text(
        "UPDATE crm_followup_resgates SET status='falhou', erro='interrompido' "
        "WHERE status='processando' AND created_at < NOW() - INTERVAL '30 minutes'"
    ))
    db.commit()
    candidatos = _candidatos(db, max_por_ciclo * 4)  # folga: muitos serão pulados por cadência
    out["candidatos"] = len(candidatos)

    feitos = 0
    for cand in candidatos:
        if feitos >= max_por_ciclo:
            break
        try:
            conversa_id = uuid.UUID(cand["conversa_id"])
            last_inbound = cand["last_inbound_at"] or EPOCH
            if last_inbound.tzinfo is None:
                last_inbound = last_inbound.replace(tzinfo=timezone.utc)
            max_tent = int(cand["resgate_max_tentativas"] or 3)
            intervalo = timedelta(hours=int(cand["resgate_intervalo_horas"] or 24))

            resgates = (
                db.query(FollowupResgate)
                .filter(FollowupResgate.conversa_id == conversa_id)
                .order_by(FollowupResgate.created_at.desc())
                .all()
            )
            # Ciclo atual = resgates criados depois da última resposta do lead (reset on re-engage).
            ciclo = [r for r in resgates if (r.created_at or EPOCH) > last_inbound and r.status in ATIVOS_CICLO]

            if len(ciclo) >= max_tent:
                # esgotou o ciclo sem resposta → terminal "Perdidos".
                db.execute(
                    text("UPDATE crm_whatsapp_conversas SET followup_fechamento='perdido' WHERE id=:id"),
                    {"id": str(conversa_id)},
                )
                db.commit()
                out["terminados"] += 1
                continue
            # não empilhar: já há um pendente/processando aguardando neste ciclo.
            if any(r.status in ("pendente", "processando", "aprovado") for r in ciclo):
                continue
            # intervalo entre tentativas.
            if ciclo:
                ultimo = max((r.enviado_em or r.created_at or EPOCH) for r in ciclo)
                if ultimo.tzinfo is None:
                    ultimo = ultimo.replace(tzinfo=timezone.utc)
                if ultimo > agora - intervalo:
                    continue
            # quiet hours.
            if not _dentro_quiet_hours(agora, int(cand["resgate_hora_inicio"] or 8), int(cand["resgate_hora_fim"] or 20)):
                continue

            agente = db.query(Agente).filter(Agente.id == uuid.UUID(cand["agente_id"])).first()
            conversa = db.query(Conversa).filter(Conversa.id == conversa_id).first()
            if agente is None or conversa is None:
                continue
            tentativa = len(resgates) + 1  # global por conversa (satisfaz UNIQUE)

            # 1) RESERVA DURÁVEL do slot ANTES de gerar/enviar (anti-double-send): commit já aqui;
            #    crash depois disto não causa reenvio (UNIQUE bloqueia + cleanup recupera órfãos).
            resgate = FollowupResgate(
                workspace_id=conversa.workspace_id, conversa_id=conversa_id,
                contato_id=conversa.contato_id, agente_id=agente.id, canal_id=conversa.canal_id,
                tentativa=tentativa, status="processando",
            )
            db.add(resgate)
            try:
                db.flush()
                db.commit()
            except Exception:  # noqa: BLE001 — UNIQUE colidiu (slot já reservado) → pula
                db.rollback()
                continue
            feitos += 1

            # 2) gera + finaliza; falha aqui marca o resgate como 'falhou' (não trava o lead).
            try:
                texto, score, usage = gerar_mensagem_resgate(
                    db, agente, contato_nome=cand["contato_nome"], resumo=cand["resumo"],
                    interesse=cand["interesse"], temperatura=cand["temperatura"], tentativa=tentativa,
                )
                resgate.mensagem = texto
                resgate.score = score
                out["gerados"] += 1
                try:
                    from app.services.agent_service import registrar_uso
                    registrar_uso(
                        db, agente,
                        canal_id=conversa.canal_id, conversa_id=conversa.id,
                        tokens_input=int(usage.get("prompt_tokens") or usage.get("tokens_input") or 0),
                        tokens_output=int(usage.get("completion_tokens") or usage.get("tokens_output") or 0),
                        escalado=False, score=score,
                    )
                except Exception:  # noqa: BLE001 — contabilidade não bloqueia o resgate
                    pass

                if cand["resgate_modo"] == "automatico":
                    canal = db.query(CanalEntrada).filter(CanalEntrada.id == conversa.canal_id).first() if conversa.canal_id else None
                    ok, erro = _enviar(db, conversa, canal, agente, texto)
                    if ok:
                        resgate.status = "enviado"
                        resgate.enviado_em = datetime.now(timezone.utc)
                        out["enviados"] += 1
                    else:
                        resgate.status = "falhou"
                        resgate.erro = erro
                        out["falhas"] += 1
                elif texto:  # rascunho
                    resgate.status = "pendente"
                    out["rascunhos"] += 1
                else:
                    resgate.status = "falhou"
                    resgate.erro = "IA não gerou mensagem"
                    out["falhas"] += 1
                db.commit()
            except Exception as exc:  # noqa: BLE001 — falha após reservar: marca falhou, não trava
                db.rollback()
                resgate.status = "falhou"
                resgate.erro = str(exc)[:500]
                db.commit()
                out["falhas"] += 1
                log.warning("[resgate] falha gerando/enviando %s: %s", cand.get("conversa_id"), exc)
        except Exception as exc:  # noqa: BLE001 — um lead que falha não derruba o lote
            db.rollback()
            out["falhas"] += 1
            log.warning("[resgate] falha no lead %s: %s", cand.get("conversa_id"), exc)
    if any(out[k] for k in ("gerados", "enviados", "terminados", "falhas")):
        log.info("[resgate] %s", out)
    return out


def aprovar_resgate(db: Session, resgate_id: uuid.UUID) -> dict:
    """Aprova um rascunho (status='pendente') → envia. Retorna {ok, erro?}."""
    r = db.query(FollowupResgate).filter(FollowupResgate.id == resgate_id).first()
    if r is None:
        return {"ok": False, "erro": "resgate não encontrado"}
    if r.status != "pendente":
        return {"ok": False, "erro": f"resgate não está pendente (status={r.status})"}
    conversa = db.query(Conversa).filter(Conversa.id == r.conversa_id).first()
    agente = db.query(Agente).filter(Agente.id == r.agente_id).first() if r.agente_id else None
    if conversa is None or agente is None:
        return {"ok": False, "erro": "conversa/agente ausente"}
    canal = db.query(CanalEntrada).filter(CanalEntrada.id == conversa.canal_id).first() if conversa.canal_id else None
    ok, erro = _enviar(db, conversa, canal, agente, r.mensagem or "")
    if ok:
        r.status = "enviado"
        r.enviado_em = datetime.now(timezone.utc)
    else:
        r.status = "falhou"
        r.erro = erro
    db.commit()
    return {"ok": ok, "erro": erro}


def cancelar_resgate(db: Session, resgate_id: uuid.UUID) -> dict:
    r = db.query(FollowupResgate).filter(FollowupResgate.id == resgate_id).first()
    if r is None:
        return {"ok": False, "erro": "resgate não encontrado"}
    r.status = "cancelado"
    db.commit()
    return {"ok": True}

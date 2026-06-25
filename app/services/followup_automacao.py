"""Followup automático: aplica a etiqueta 'followup' às conversas cujo lead parou de
responder além do `tempo_followup_min` do agente do canal.

A etiqueta é a **fonte única** do estado de followup (NÃO toca `lead_status`, que é
lifecycle). Idempotente: pula conversas que já têm a etiqueta. Pausa sozinho: se o lead
responder, `ultima_direcao` vira 'entrada' e a conversa deixa de casar a condição."""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.crm.etiqueta import CrmEtiqueta

log = logging.getLogger(__name__)

ETIQUETA_FOLLOWUP = "followup"
ETIQUETA_FOLLOWUP_COR = "#F5A623"


def find_or_create_etiqueta(db: Session, workspace_id, nome: str, cor: str) -> CrmEtiqueta:
    et = (
        db.query(CrmEtiqueta)
        .filter(CrmEtiqueta.workspace_id == workspace_id, CrmEtiqueta.nome == nome, CrmEtiqueta.ativo.is_(True))
        .first()
    )
    if not et:
        et = CrmEtiqueta(workspace_id=workspace_id, nome=nome, cor=cor)
        db.add(et)
        db.flush()
    return et


def aplicar_followup_etiquetas(db: Session) -> int:
    """Etiqueta conversas em followup (lead sem responder > tempo_followup_min do agente).
    Retorna quantas foram etiquetadas neste ciclo. Idempotente + best-effort."""
    rows = db.execute(
        text("""
            SELECT c.id AS conversa_id, c.workspace_id AS workspace_id
            FROM crm_whatsapp_conversas c
            JOIN agente_canais ac ON ac.canal_id = c.canal_id AND ac.ativo = true
            JOIN agentes a ON a.id = ac.agente_id AND a.status = 'ativo' AND a.deleted_at IS NULL
                AND a.tempo_followup_min IS NOT NULL AND a.tempo_followup_min > 0
            WHERE c.ativo = true AND c.is_group = false AND c.status <> 'resolvido'
              AND c.ultima_direcao = 'saida'
              AND c.last_outbound_at IS NOT NULL
              AND c.last_outbound_at < NOW() - (a.tempo_followup_min * INTERVAL '1 minute')
              AND NOT EXISTS (
                SELECT 1 FROM crm_conversa_etiquetas ce
                JOIN crm_etiquetas e ON e.id = ce.etiqueta_id
                WHERE ce.conversa_id = c.id AND e.nome = :nome AND e.ativo = true
              )
            LIMIT 500
        """),
        {"nome": ETIQUETA_FOLLOWUP},
    ).fetchall()
    count = 0
    for conversa_id, workspace_id in rows:
        et = find_or_create_etiqueta(db, workspace_id, ETIQUETA_FOLLOWUP, ETIQUETA_FOLLOWUP_COR)
        db.execute(
            text("INSERT INTO crm_conversa_etiquetas (conversa_id, etiqueta_id) "
                 "VALUES (CAST(:c AS uuid), :e) ON CONFLICT DO NOTHING"),
            {"c": str(conversa_id), "e": et.id},
        )
        count += 1
    db.commit()
    return count

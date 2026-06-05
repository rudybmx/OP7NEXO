from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.canal_entrada import CanalEntrada
from app.services.whatsapp_jid_filters import is_ignored_whatsapp_jid
from app.services.whatsapp_normalizer import (
    CONNECTION_EVENT_TYPES,
    MESSAGE_EVENT_TYPES,
    RECEIPT_EVENT_TYPES,
    build_evolution_event_signature,
    normalize_event_type,
    normalize_message_event,
    normalize_receipt_event,
)

log = logging.getLogger(__name__)

SUPPORTED_EVENT_TYPES = MESSAGE_EVENT_TYPES | RECEIPT_EVENT_TYPES | CONNECTION_EVENT_TYPES


def extract_event_identifiers(payload: dict[str, Any] | None, event_type: str | None = None) -> dict[str, str | None]:
    event_type = normalize_event_type(event_type or (payload.get("event") if isinstance(payload, dict) else None))
    if event_type in RECEIPT_EVENT_TYPES:
        receipt = normalize_receipt_event(payload, event_type)
        evolution_msg_id = receipt.message_ids[0] if receipt.message_ids else None
        return {
            "remote_jid": receipt.remote_jid or None,
            "evolution_msg_id": evolution_msg_id,
            "instance": receipt.instance,
        }

    if event_type in MESSAGE_EVENT_TYPES:
        message = normalize_message_event(payload, event_type)
        return {
            "remote_jid": message.remote_jid or None,
            "evolution_msg_id": message.evolution_msg_id or None,
            "instance": message.instance,
        }

    return {
        "remote_jid": None,
        "evolution_msg_id": None,
        "instance": None,
    }


def _canonical_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload or {}, sort_keys=True, separators=(",", ":"), default=str)


def build_event_hash(
    *,
    workspace_id: uuid.UUID,
    canal_id: uuid.UUID,
    instance: str,
    event_type: str,
    payload: dict[str, Any],
) -> str:
    ids = extract_event_identifiers(payload, event_type)
    msg_id = ids.get("evolution_msg_id")
    remote_jid = ids.get("remote_jid")
    if msg_id:
        canonical = {
            "workspace_id": str(workspace_id),
            "canal_id": str(canal_id),
            "instance": instance,
            "event_type": event_type,
            "remote_jid": remote_jid or "",
            "evolution_msg_id": msg_id,
        }
    else:
        signature = build_evolution_event_signature(payload, event_type, instance=instance)
        canonical = {
            "workspace_id": str(workspace_id),
            "canal_id": str(canal_id),
            "instance": instance,
            "event_type": event_type,
            "signature": signature,
        }
    base = json.dumps(canonical, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def enqueue_evolution_event(
    db: Session,
    canal: CanalEntrada,
    event: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    event_type = normalize_event_type(event)
    identifiers = extract_event_identifiers(payload, event_type)
    instance = canal.evolution_instance_id or identifiers.get("instance") or "opcl"
    remote_jid = identifiers.get("remote_jid")
    if is_ignored_whatsapp_jid(remote_jid):
        return {
            "event_id": None,
            "event_type": event_type,
            "event_hash": None,
            "inserted": False,
            "queued": False,
            "ignored": True,
            "supported": event_type in SUPPORTED_EVENT_TYPES,
        }

    event_hash = build_event_hash(
        workspace_id=canal.workspace_id,
        canal_id=canal.id,
        instance=instance,
        event_type=event_type,
        payload=payload,
    )

    event_row = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_eventos (
                workspace_id, canal_id, event, event_type, event_hash, instance,
                remote_jid, evolution_msg_id, payload, recebido_em, processing_status
            )
            VALUES (
                :workspace_id, :canal_id, :event, :event_type, :event_hash, :instance,
                :remote_jid, :evolution_msg_id, CAST(:payload AS jsonb), :received_at, 'pending'
            )
            ON CONFLICT (event_hash) WHERE event_hash IS NOT NULL DO NOTHING
            RETURNING id
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "canal_id": str(canal.id),
            "event": event or "",
            "event_type": event_type,
            "event_hash": event_hash,
            "instance": instance,
            "remote_jid": identifiers.get("remote_jid"),
            "evolution_msg_id": identifiers.get("evolution_msg_id"),
            "payload": _canonical_payload(payload),
            "received_at": datetime.now(timezone.utc),
        },
    ).fetchone()

    inserted = event_row is not None
    if inserted:
        event_id = event_row[0]
    else:
        existing = db.execute(
            text("""
                SELECT id, processing_status
                FROM public.crm_whatsapp_eventos
                WHERE event_hash = :event_hash
                LIMIT 1
            """),
            {"event_hash": event_hash},
        ).fetchone()
        if not existing:
            raise RuntimeError("Evento duplicado não encontrado após conflito de hash")
        event_id = existing[0]

    priority = 10 if event_type in {"MESSAGE", "MESSAGES_UPSERT", "MESSAGE_UPSERT", "MESSAGE_RECEIVED"} else 0
    job_row = db.execute(
        text("""
            INSERT INTO public.crm_message_jobs (
                workspace_id, canal_id, raw_event_id, job_type, status, priority, payload
            )
            VALUES (
                :workspace_id, :canal_id, :raw_event_id, 'webhook_event', 'pending', :priority,
                jsonb_build_object('event_type', :event_type)
            )
            ON CONFLICT (raw_event_id)
            WHERE raw_event_id IS NOT NULL AND job_type = 'webhook_event'
            DO NOTHING
            RETURNING id
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "canal_id": str(canal.id),
            "raw_event_id": str(event_id),
            "priority": priority,
            "event_type": event_type,
        },
    ).fetchone()

    queued = job_row is not None
    return {
        "event_id": str(event_id),
        "event_type": event_type,
        "event_hash": event_hash,
        "inserted": inserted,
        "queued": queued,
        "ignored": False,
        "supported": event_type in SUPPORTED_EVENT_TYPES,
    }

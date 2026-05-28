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

log = logging.getLogger(__name__)

SUPPORTED_EVENT_TYPES = {
    "CONNECTION_UPDATE",
    "CONNECTED",
    "LOGGEDOUT",
    "LOGGED_OUT",
    "DISCONNECTED",
    "QRCODE",
    "QR_CODE",
    "MESSAGE",
    "MESSAGES_UPSERT",
    "MESSAGE_UPSERT",
    "MESSAGE_RECEIVED",
    "RECEIPT",
    "READ_RECEIPT",
    "READRECEIPT",
    "MESSAGES_UPDATE",
    "MESSAGE_STATUS",
}


def normalize_event_type(event: str | None) -> str:
    return str(event or "").upper().replace(".", "_").replace("-", "_").strip()


def payload_root(payload: dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, dict):
            return data
        return payload
    return {}


def payload_info(payload: dict[str, Any] | None) -> dict[str, Any]:
    root = payload_root(payload)
    info = root.get("Info")
    return info if isinstance(info, dict) else {}


def extract_event_identifiers(payload: dict[str, Any] | None) -> dict[str, str | None]:
    root = payload_root(payload)
    info = payload_info(payload)
    key = root.get("key") if isinstance(root.get("key"), dict) else {}

    remote_jid = (
        info.get("Chat")
        or info.get("chat")
        or info.get("RemoteJid")
        or info.get("jid")
        or key.get("remoteJid")
        or root.get("remoteJid")
    )
    evolution_msg_id = (
        info.get("ID")
        or info.get("Id")
        or key.get("id")
        or root.get("id")
        or root.get("ID")
    )
    instance = None
    if isinstance(payload, dict):
        instance = payload.get("instanceName") or payload.get("instance") or payload.get("instance_id")

    return {
        "remote_jid": str(remote_jid) if remote_jid else None,
        "evolution_msg_id": str(evolution_msg_id) if evolution_msg_id else None,
        "instance": str(instance) if instance else None,
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
    ids = extract_event_identifiers(payload)
    msg_id = ids.get("evolution_msg_id")
    remote_jid = ids.get("remote_jid")
    if msg_id:
        base = f"{workspace_id}:{canal_id}:{instance}:{event_type}:{remote_jid or ''}:{msg_id}"
    else:
        base = f"{workspace_id}:{canal_id}:{instance}:{event_type}:{_canonical_payload(payload)}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def enqueue_evolution_event(
    db: Session,
    canal: CanalEntrada,
    event: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    event_type = normalize_event_type(event)
    identifiers = extract_event_identifiers(payload)
    instance = canal.evolution_instance_id or identifiers.get("instance") or "opcl"
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
            ON CONFLICT (raw_event_id) DO NOTHING
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
        "supported": event_type in SUPPORTED_EVENT_TYPES,
    }

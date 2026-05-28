from __future__ import annotations

import logging
import socket
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text

from app.core.database import SessionLocal
from app.models.canal_entrada import CanalEntrada
from app.services.whatsapp_event_queue import SUPPORTED_EVENT_TYPES

log = logging.getLogger(__name__)

WORKER_ID = f"{socket.gethostname()}:whatsapp-event-worker"


def process_next_whatsapp_jobs(limit: int = 20) -> dict[str, int]:
    processed = 0
    failed = 0
    skipped = 0

    with SessionLocal() as db:
        rows = db.execute(
            text("""
                SELECT id
                FROM public.crm_message_jobs
                WHERE status IN ('pending', 'error')
                  AND attempts < max_attempts
                  AND next_run_at <= NOW()
                ORDER BY priority DESC, created_at ASC
                LIMIT :limit
                FOR UPDATE SKIP LOCKED
            """),
            {"limit": limit},
        ).fetchall()

        job_ids = [str(row[0]) for row in rows]
        if not job_ids:
            return {"processed": 0, "failed": 0, "skipped": 0}

        for job_id in job_ids:
            db.execute(
                text("""
                    UPDATE public.crm_message_jobs
                    SET status = 'running',
                        locked_at = NOW(),
                        locked_by = :worker,
                        attempts = attempts + 1,
                        updated_at = NOW()
                    WHERE id = :job_id
                """),
                {"worker": WORKER_ID, "job_id": job_id},
            )
        db.commit()

    for job_id in job_ids:
        try:
            result = _process_job(job_id)
            if result == "skipped":
                skipped += 1
            else:
                processed += 1
        except Exception:
            failed += 1
            log.exception("[whatsapp-worker] falha inesperada job=%s", job_id)

    return {"processed": processed, "failed": failed, "skipped": skipped}


def _process_job(job_id: str) -> str:
    with SessionLocal() as db:
        job = db.execute(
            text("""
                SELECT
                    j.id, j.attempts, j.max_attempts,
                    j.workspace_id, j.canal_id, j.job_type, j.related_message_id, j.payload AS job_payload,
                    e.id AS event_id, e.event, e.event_type, e.payload,
                    c.id AS canal_id
                FROM public.crm_message_jobs j
                LEFT JOIN public.crm_whatsapp_eventos e ON e.id = j.raw_event_id
                LEFT JOIN public.canais_entrada c ON c.id = j.canal_id
                WHERE j.id = :job_id
            """),
            {"job_id": job_id},
        ).mappings().first()

        if not job:
            return "skipped"

        try:
            job_type = str(job["job_type"] or "webhook_event")
            if job_type == "media_download":
                from app.services.whatsapp_media import process_media_download_job

                media_job = dict(job)
                media_job["payload"] = media_job.get("job_payload") or {}
                process_media_download_job(db, media_job)
                _mark_done(db, job_id, str(job["event_id"] or ""), status="done")
                return "processed"

            event_type = str(job["event_type"] or "").upper()
            if event_type not in SUPPORTED_EVENT_TYPES:
                _mark_done(db, job_id, str(job["event_id"] or ""), status="ignored")
                return "skipped"

            canal = db.query(CanalEntrada).filter(CanalEntrada.id == job["canal_id"]).first()
            if not canal:
                raise RuntimeError(f"Canal não encontrado para job {job_id}")

            payload = job["payload"] if isinstance(job["payload"], dict) else {}
            instance_data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}

            from app.api.canais import _processar_evento_evolution

            _processar_evento_evolution(
                db=db,
                canal=canal,
                event_norm=event_type,
                instance_data=instance_data,
                media_mode="inline",
                raw_event_id=str(job["event_id"]),
            )
            _mark_done(db, job_id, str(job["event_id"] or ""), status="done")
            return "processed"
        except Exception as exc:
            _mark_failed(
                db,
                job_id,
                str(job["event_id"] or ""),
                attempts=int(job["attempts"] or 0),
                max_attempts=int(job["max_attempts"] or 5),
                error=str(exc),
            )
            raise


def _mark_done(db, job_id: str, event_id: str, *, status: str) -> None:
    db.execute(
        text("""
            UPDATE public.crm_message_jobs
            SET status = :status,
                processed_at = NOW(),
                locked_at = NULL,
                locked_by = NULL,
                error_message = NULL,
                updated_at = NOW()
            WHERE id = :job_id
        """),
        {"status": status, "job_id": job_id},
    )
    if event_id:
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_eventos
                SET processing_status = :status,
                    processed_at = NOW(),
                    error_message = NULL
                WHERE id = :event_id
            """),
            {"status": status, "event_id": event_id},
        )
    db.commit()


def _mark_failed(
    db,
    job_id: str,
    event_id: str,
    *,
    attempts: int,
    max_attempts: int,
    error: str,
) -> None:
    current_attempt = attempts
    status = "dead_letter" if current_attempt >= max_attempts else "error"
    next_run = datetime.now(timezone.utc) + timedelta(seconds=min(300, 10 * current_attempt))
    db.execute(
        text("""
            UPDATE public.crm_message_jobs
            SET status = :status,
                locked_at = NULL,
                locked_by = NULL,
                next_run_at = :next_run,
                error_message = :error,
                updated_at = NOW()
            WHERE id = :job_id
        """),
        {
            "status": status,
            "next_run": next_run,
            "error": error[:4000],
            "job_id": job_id,
        },
    )
    if event_id:
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_eventos
                SET processing_status = :status,
                    retry_count = retry_count + 1,
                    error_message = :error
                WHERE id = :event_id
            """),
            {"status": status, "error": error[:4000], "event_id": event_id},
        )
    db.commit()

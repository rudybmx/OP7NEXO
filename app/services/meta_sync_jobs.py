"""Lifecycle helpers for Meta Ads sync jobs."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.ads_account import AdsAccount
from app.models.sync_job import SyncJob
from app.models.sync_job_event import SyncJobEvent
from app.services.meta_sync import (
    INSIGHTS_SYNC_WINDOW_DAYS,
    MetaContaInacessivelError,
    obter_motivo_sync_pulado,
    sincronizar_conta,
)

SYNC_JOB_TERMINAL_STATUSES = {"done", "error", "skipped"}


def _janela_sync(conta: AdsAccount, modo_sync: str) -> tuple[date | None, date | None]:
    hoje = date.today()
    if modo_sync == "backfill":
        since = conta.periodo_sync_inicio or hoje.replace(day=1)
    else:
        since = hoje - timedelta(days=INSIGHTS_SYNC_WINDOW_DAYS - 1)
    return since, hoje


def _to_uuid(value: str | uuid.UUID) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def buscar_sync_job_ativo(db: Session, ads_account_id: str) -> SyncJob | None:
    return db.execute(
        select(SyncJob)
        .where(
            SyncJob.ads_account_id == ads_account_id,
            SyncJob.status.in_(("pending", "running")),
        )
        .order_by(SyncJob.created_at.desc())
    ).scalars().first()


def criar_sync_job(
    db: Session,
    ads_account_id: str,
    modo_sync: str = "recorrente",
) -> SyncJob:
    conta = db.get(AdsAccount, _to_uuid(ads_account_id))
    if not conta:
        raise ValueError(f"AdsAccount {ads_account_id} não encontrada")

    janela_inicio, janela_fim = _janela_sync(conta, modo_sync)
    job = SyncJob(
        ads_account_id=ads_account_id,
        status="pending",
        modo_sync=modo_sync,
        janela_inicio=janela_inicio,
        janela_fim=janela_fim,
        progresso=0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def registrar_sync_event(
    job_id: str | uuid.UUID,
    tipo: str,
    mensagem: str | None,
    *,
    etapa: str | None = None,
    progresso: int | None = None,
    detalhes: dict[str, Any] | None = None,
) -> None:
    db: Session | None = None
    try:
        with SessionLocal() as db:
            db.add(
                SyncJobEvent(
                    sync_job_id=_to_uuid(job_id),
                    tipo=tipo,
                    etapa_atual=etapa,
                    progresso=progresso,
                    mensagem=mensagem,
                    detalhes=detalhes,
                )
            )
            db.commit()
    except Exception:
        try:
            if db is not None:
                db.rollback()
        except Exception:
            pass


def atualizar_sync_job(
    job_id: str | uuid.UUID,
    *,
    status: str | None = None,
    etapa_atual: str | None = None,
    progresso: int | None = None,
    totais: dict[str, Any] | None = None,
    erro: str | None = None,
) -> None:
    campos: list[str] = ["updated_at = NOW()"]
    params: dict[str, Any] = {"job_id": str(job_id)}

    if status is not None:
        campos.append("status = :status")
        params["status"] = status
    if etapa_atual is not None:
        campos.append("etapa_atual = :etapa_atual")
        params["etapa_atual"] = etapa_atual
    if progresso is not None:
        campos.append("progresso = :progresso")
        params["progresso"] = progresso
    if totais is not None:
        campos.append("totais = CAST(:totais AS JSONB)")
        params["totais"] = json.dumps(totais)
    if erro is not None or status in SYNC_JOB_TERMINAL_STATUSES:
        campos.append("erro = :erro")
        params["erro"] = erro

    db: Session | None = None
    try:
        with SessionLocal() as db:
            db.execute(
                text(f"UPDATE sync_jobs SET {', '.join(campos)} WHERE id = :job_id"),
                params,
            )
            db.commit()
    except Exception:
        try:
            if db is not None:
                db.rollback()
        except Exception:
            pass


def finalizar_sync_job(
    job_id: str | uuid.UUID,
    *,
    status: str,
    etapa_atual: str | None = None,
    progresso: int | None = None,
    totais: dict[str, Any] | None = None,
    erro: str | None = None,
) -> None:
    if progresso is None:
        progresso = 100 if status in {"done", "skipped"} else None
    if etapa_atual is None:
        etapa_atual = "concluido" if status == "done" else "skipped" if status == "skipped" else "erro"
    atualizar_sync_job(
        job_id,
        status=status,
        etapa_atual=etapa_atual,
        progresso=progresso,
        totais=totais,
        erro=erro,
    )


def iniciar_sync_job(
    db: Session,
    ads_account_id: str,
    *,
    modo_sync: str = "recorrente",
    background: bool = True,
) -> tuple[str, bool, str, str | None]:
    job_ativo = buscar_sync_job_ativo(db, ads_account_id)
    if job_ativo:
        return str(job_ativo.id), False, job_ativo.status, None

    conta = db.get(AdsAccount, _to_uuid(ads_account_id))
    if not conta:
        raise ValueError(f"AdsAccount {ads_account_id} não encontrada")

    job = criar_sync_job(db, ads_account_id, modo_sync=modo_sync)
    motivo_skip = obter_motivo_sync_pulado(conta)
    if motivo_skip:
        finalizar_sync_job(
            job.id,
            status="skipped",
            etapa_atual="skipped",
            progresso=100,
            erro=motivo_skip,
        )
        registrar_sync_event(
            job.id,
            "skip",
            motivo_skip,
            detalhes={
                "modo_sync": modo_sync,
                "janela_inicio": job.janela_inicio.isoformat() if job.janela_inicio else None,
                "janela_fim": job.janela_fim.isoformat() if job.janela_fim else None,
            },
        )
        return str(job.id), False, "skipped", motivo_skip

    if background:
        thread = threading.Thread(
            target=executar_sync_job,
            args=(str(job.id), ads_account_id, modo_sync),
            daemon=True,
        )
        thread.start()
        return str(job.id), True, "pending", None

    status_final = executar_sync_job(str(job.id), ads_account_id, modo_sync)
    return str(job.id), True, status_final, None


def executar_sync_job(
    job_id: str,
    ads_account_id: str,
    modo_sync: str = "recorrente",
) -> str:
    with SessionLocal() as db:
        def _emit_event(
            tipo: str,
            mensagem: str | None,
            *,
            etapa: str | None = None,
            progresso: int | None = None,
            detalhes: dict[str, Any] | None = None,
        ) -> None:
            registrar_sync_event(
                job_id,
                tipo,
                mensagem,
                etapa=etapa,
                progresso=progresso,
                detalhes=detalhes,
            )

        ultimo_evento: dict[str, Any] = {"etapa": None, "progresso": None}

        def _progress(etapa: str, progresso: int) -> None:
            if ultimo_evento["etapa"] == etapa and ultimo_evento["progresso"] == progresso:
                return
            ultimo_evento["etapa"] = etapa
            ultimo_evento["progresso"] = progresso
            atualizar_sync_job(
                job_id,
                status="running",
                etapa_atual=etapa,
                progresso=progresso,
            )
            _emit_event("progress", etapa, etapa=etapa, progresso=progresso)

        atualizar_sync_job(job_id, status="running", progresso=0, etapa_atual="iniciando")
        _emit_event(
            "start",
            "Sincronização iniciada",
            etapa="iniciando",
            progresso=0,
            detalhes={"ads_account_id": ads_account_id, "modo_sync": modo_sync},
        )

        try:
            resultado = sincronizar_conta(
                ads_account_id,
                db,
                on_progress=_progress,
                on_event=_emit_event,
                modo_sync=modo_sync,
            )
            if resultado.get("skipped"):
                motivo = str(resultado.get("reason") or "sync ignorado")
                finalizar_sync_job(
                    job_id,
                    status="skipped",
                    etapa_atual="skipped",
                    progresso=100,
                    erro=motivo,
                )
                _emit_event("skip", motivo, etapa="skipped", progresso=100, detalhes=resultado)
                return "skipped"

            totais = resultado.get("totais") or {}
            finalizar_sync_job(
                job_id,
                status="done",
                etapa_atual="concluido",
                progresso=100,
                totais=totais,
                erro=None,
            )
            _emit_event("success", "Sincronização concluída", etapa="concluido", progresso=100, detalhes={"totais": totais})
            return "done"
        except MetaContaInacessivelError as exc:
            try:
                db.rollback()
            except Exception:
                pass
            conta = db.get(AdsAccount, _to_uuid(ads_account_id))
            if conta:
                conta.sync_paused = True
                db.commit()
            finalizar_sync_job(
                job_id,
                status="error",
                etapa_atual="erro",
                erro=str(exc),
            )
            _emit_event("error", str(exc), etapa="erro", detalhes={"exception": exc.__class__.__name__})
            return "error"
        except Exception as exc:
            try:
                db.rollback()
            except Exception:
                pass
            finalizar_sync_job(
                job_id,
                status="error",
                etapa_atual="erro",
                erro=str(exc),
            )
            _emit_event("error", str(exc), etapa="erro", detalhes={"exception": exc.__class__.__name__})
            return "error"

"""Worker de sincronização Meta Ads — roda em container separado do FastAPI.

Responsabilidades:
- APScheduler com cron 06h/12h/18h BRT (mesmos jobs do scheduler.py)
- Polling de sync_jobs com status='pending' a cada 10s e execução em thread
- Graceful shutdown: aguarda threads em andamento antes de sair (máx 120s)
"""
import json
import logging
import signal
import sys
import threading
import time
import uuid

from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import setup_logging
from app.models.ads_account import AdsAccount
from app.models.sync_job import SyncJob
from app.services.meta_graph import MetaRateLimitError
from app.services.meta_sync import (
    MetaContaInacessivelError,
    marcar_sync_jobs_ativos_como_interrompidos,
    sincronizar_conta,
)
from app.services.scheduler import iniciar_scheduler, parar_scheduler

log = logging.getLogger(__name__)

_shutdown = False
_active_threads: list[threading.Thread] = []
_threads_lock = threading.Lock()


def _run_sync_job(job_id: str, ads_account_id: str, modo_sync: str) -> None:
    """Executa um sync_job em background e atualiza o registro no banco."""
    thread = threading.current_thread()
    with _threads_lock:
        _active_threads.append(thread)

    def _set(etapa: str, progresso: int) -> None:
        with SessionLocal() as db:
            db.execute(text("""
                UPDATE sync_jobs
                SET etapa_atual = :etapa, progresso = :progresso, updated_at = NOW()
                WHERE id = :id
            """), {"etapa": etapa, "progresso": progresso, "id": job_id})
            db.commit()

    def _finalizar(status: str, *, totais: dict | None = None, erro: str | None = None) -> None:
        with SessionLocal() as db:
            if status == "done":
                db.execute(text("""
                    UPDATE sync_jobs
                    SET status = 'done', progresso = 100, etapa_atual = 'concluido',
                        totais = CAST(:totais AS JSONB), erro = NULL, updated_at = NOW()
                    WHERE id = :id
                """), {"totais": json.dumps(totais or {}), "id": job_id})
            else:
                db.execute(text("""
                    UPDATE sync_jobs
                    SET status = 'error', erro = :erro, updated_at = NOW()
                    WHERE id = :id
                """), {"erro": erro or "Erro no sync", "id": job_id})
            db.commit()

    try:
        with SessionLocal() as db:
            db.execute(text(
                "UPDATE sync_jobs SET status = 'running', updated_at = NOW() WHERE id = :id"
            ), {"id": job_id})
            db.commit()

            try:
                result = sincronizar_conta(ads_account_id, db, on_progress=_set, modo_sync=modo_sync)
                totais = result.get("totais") or {}
                _finalizar("done", totais=totais)
            except MetaRateLimitError as exc:
                try:
                    db.rollback()
                except Exception:
                    pass
                _finalizar(
                    "error",
                    erro=(
                        "Rate limit temporário da Meta. "
                        f"Tente novamente após o cooldown atual. ({exc})"
                    ),
                )
            except MetaContaInacessivelError as exc:
                try:
                    db.rollback()
                except Exception:
                    pass
                conta = db.get(AdsAccount, uuid.UUID(ads_account_id))
                if conta:
                    conta.sync_paused = True
                    db.commit()
                _finalizar("error", erro=str(exc))
            except Exception as exc:
                try:
                    db.rollback()
                except Exception:
                    pass
                _finalizar("error", erro=str(exc))
    finally:
        with _threads_lock:
            _active_threads.remove(thread)


def _poll_pending_jobs() -> None:
    """Busca jobs pending e dispara threads para cada um."""
    with SessionLocal() as db:
        rows = db.execute(text("""
            SELECT id, ads_account_id, modo_sync
            FROM sync_jobs
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 5
        """)).fetchall()

    for row in rows:
        job_id = str(row.id)
        ads_account_id = str(row.ads_account_id)
        modo_sync = row.modo_sync if row.modo_sync in ("recorrente", "backfill") else "recorrente"
        log.info("Worker: iniciando sync job %s conta %s", job_id, ads_account_id)
        t = threading.Thread(
            target=_run_sync_job,
            args=(job_id, ads_account_id, modo_sync),
            daemon=False,
            name=f"sync-{job_id[:8]}",
        )
        t.start()


def _handle_shutdown(signum, frame) -> None:
    global _shutdown
    log.info("Worker: sinal %s recebido — iniciando graceful shutdown", signum)
    _shutdown = True


def main() -> None:
    setup_logging()
    logging.getLogger().setLevel(logging.INFO)

    log.info("Worker iniciando...")

    interrompidos = marcar_sync_jobs_ativos_como_interrompidos()
    if interrompidos:
        log.warning("Jobs interrompidos no startup do worker: %s", interrompidos)

    iniciar_scheduler()

    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    log.info("Worker ativo — polling a cada 10s")

    while not _shutdown:
        try:
            _poll_pending_jobs()
        except Exception:
            log.exception("Erro no polling de jobs pending")
        time.sleep(10)

    log.info("Worker: shutdown iniciado — aguardando threads ativas...")
    parar_scheduler()

    deadline = time.time() + 120
    while time.time() < deadline:
        with _threads_lock:
            ativos = list(_active_threads)
        if not ativos:
            break
        log.info("Worker: aguardando %d thread(s) de sync...", len(ativos))
        for t in ativos:
            t.join(timeout=5)

    with _threads_lock:
        restantes = len(_active_threads)
    if restantes:
        log.warning("Worker: %d thread(s) ainda ativas após timeout — saindo mesmo assim", restantes)
    else:
        log.info("Worker: todas as threads concluíram — saída limpa")

    sys.exit(0)


if __name__ == "__main__":
    main()

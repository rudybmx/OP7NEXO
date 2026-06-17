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
from app.services.redis_pub import _get_redis
from app.services.scheduler import iniciar_scheduler, parar_scheduler

log = logging.getLogger(__name__)

_shutdown = False
_active_threads: list[threading.Thread] = []
_threads_lock = threading.Lock()


def _tipo_to_modo(tipo: str) -> str:
    """Mapeia sync_jobs.tipo (leve|pesado|backfill) -> modo_sync do sincronizar_conta.

    B3 refina isto com um parâmetro `escopo` dedicado; em B2 o tipo já é a fonte
    de verdade (corrige a antiga coerção que rebaixava tudo para 'recorrente').
    """
    return "backfill" if tipo == "backfill" else "recorrente"


def _backoff_reenfileira(attempts: int) -> float:
    base = max(float(settings.META_RETRY_BASE_INTERVAL), 1.0)
    cap = max(float(settings.META_RETRY_MAX_INTERVAL), base)
    return min(base * (2 ** max(int(attempts), 0)), cap)


def _cooldown_state_restante(db, ads_account_id: str) -> float:
    """Segundos restantes do cooldown gravado em meta_sync_states (unifica B1/B2)."""
    try:
        row = db.execute(text("""
            SELECT EXTRACT(EPOCH FROM (cooldown_until - NOW()))
            FROM meta_sync_states
            WHERE ads_account_id = CAST(:id AS uuid) AND cooldown_until > NOW()
        """), {"id": ads_account_id}).scalar()
        return float(row) if row and row > 0 else 0.0
    except Exception:
        return 0.0


def _reenfileirar(job_id: str, ads_account_id: str, attempts: int, exc: MetaRateLimitError) -> None:
    """Rate limit ADIA, não cancela (regra 1): volta o job para pending com
    next_run_at futuro e attempts++. NUNCA marca 'error'."""
    with SessionLocal() as db:
        espera = max(
            float(getattr(exc, "cooldown_seconds", 0.0) or 0.0),
            _backoff_reenfileira(attempts),
            _cooldown_state_restante(db, ads_account_id),
        )
        espera = min(espera, float(settings.META_RETRY_MAX_INTERVAL))
        db.execute(text("""
            UPDATE sync_jobs
            SET status = 'pending',
                attempts = attempts + 1,
                next_run_at = NOW() + make_interval(secs => :secs),
                etapa_atual = 'aguardando_rate_limit',
                erro = NULL,
                updated_at = NOW()
            WHERE id = :id
        """), {"secs": espera, "id": job_id})
        db.commit()
    log.info(
        "Worker: job %s conta %s re-enfileirado em %.0fs (rate limit, attempts=%d)",
        job_id, ads_account_id, espera, attempts + 1,
    )


def _run_sync_job(job_id: str, ads_account_id: str, tipo: str, attempts: int) -> None:
    """Executa um sync_job (já marcado 'running' pelo claim atômico) e atualiza o registro."""
    thread = threading.current_thread()
    with _threads_lock:
        _active_threads.append(thread)

    modo_sync = _tipo_to_modo(tipo)

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
            try:
                result = sincronizar_conta(ads_account_id, db, on_progress=_set, modo_sync=modo_sync)
                totais = result.get("totais") or {}
                _finalizar("done", totais=totais)
            except MetaRateLimitError as exc:
                try:
                    db.rollback()
                except Exception:
                    pass
                # Rate limit NUNCA vira erro — re-enfileira (regra 1).
                _reenfileirar(job_id, ads_account_id, attempts, exc)
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
    """Reivindica jobs prontos (status='pending' AND next_run_at<=NOW()) de forma
    atômica (FOR UPDATE SKIP LOCKED) respeitando o teto global de concorrência."""
    cap = max(1, int(settings.META_SYNC_MAX_PARALLEL_ACCOUNTS))
    with _threads_lock:
        ativos = len(_active_threads)
    livre = cap - ativos
    if livre <= 0:
        return
    n = min(livre, max(1, int(settings.META_SYNC_WORKER_POLL_BATCH)))

    with SessionLocal() as db:
        rows = db.execute(text("""
            UPDATE sync_jobs
            SET status = 'running', updated_at = NOW()
            WHERE id IN (
                SELECT id FROM sync_jobs
                WHERE status = 'pending' AND next_run_at <= NOW()
                ORDER BY next_run_at ASC
                LIMIT :n
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, ads_account_id, tipo, attempts
        """), {"n": n}).fetchall()
        db.commit()

    for row in rows:
        job_id = str(row.id)
        ads_account_id = str(row.ads_account_id)
        tipo = row.tipo or "leve"
        attempts = int(row.attempts or 0)
        log.info("Worker: iniciando sync job %s conta %s tipo=%s attempts=%d",
                 job_id, ads_account_id, tipo, attempts)
        t = threading.Thread(
            target=_run_sync_job,
            args=(job_id, ads_account_id, tipo, attempts),
            daemon=False,
            name=f"sync-{job_id[:8]}",
        )
        t.start()


def _heartbeat_loop() -> None:
    """Publica heartbeat no Redis a cada 30s para sinalizar que o scheduler está ativo."""
    while not _shutdown:
        try:
            _get_redis().setex("meta_sync:scheduler_running", 60, "1")
        except Exception:
            pass
        time.sleep(30)


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

    threading.Thread(target=_heartbeat_loop, daemon=True, name="heartbeat").start()

    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    log.info("Worker ativo — polling a cada 10s")

    poll_interval = max(1, int(settings.META_SYNC_WORKER_POLL_INTERVAL))
    while not _shutdown:
        try:
            _poll_pending_jobs()
        except Exception:
            log.exception("Erro no polling de jobs pending")
        time.sleep(poll_interval)

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

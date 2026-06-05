"""APScheduler — roda sincronização Meta Ads 3x/dia."""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import func, or_

from app.core.database import SessionLocal
from app.models.ads_account import AdsAccount
from app.models.meta_sync_state import MetaSyncState
from app.core.config import settings
from app.services.meta_graph import MetaRateLimitError
from app.services.meta_sync import MetaContaInacessivelError, sincronizar_conta
from app.services.whatsapp_event_worker import process_next_whatsapp_jobs

log = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def _job_sync_todas_contas() -> None:
    log.info("Scheduler: iniciando sync Meta Ads — %s", datetime.now(tz=timezone.utc).isoformat())
    with SessionLocal() as db:
        agora = datetime.now(timezone.utc)
        contas = db.query(AdsAccount).outerjoin(
            MetaSyncState,
            MetaSyncState.ads_account_id == AdsAccount.id,
        ).filter(
            AdsAccount.plataforma == "meta",
            AdsAccount.status == "ativo",
            AdsAccount.sync_paused.is_(False),
            AdsAccount.bm_token.isnot(None),
            or_(
                AdsAccount.token_expira_em.is_(None),
                AdsAccount.token_expira_em >= agora,
            ),
            or_(
                MetaSyncState.cooldown_until.is_(None),
                MetaSyncState.cooldown_until <= agora,
            ),
        ).order_by(
            func.coalesce(
                MetaSyncState.last_success_at,
                AdsAccount.sincronizado_em,
                AdsAccount.criado_em,
            ).asc(),
            AdsAccount.account_name.asc(),
            AdsAccount.account_id.asc(),
        ).all()

        def _sync_conta(conta_id: str, account_id_meta: str) -> None:
            with SessionLocal() as conta_db:
                try:
                    resultado = sincronizar_conta(conta_id, conta_db)
                    log.info("Conta %s: %s", account_id_meta, resultado)
                except MetaRateLimitError as exc:
                    try:
                        conta_db.rollback()
                    except Exception:
                        pass
                    log.warning(
                        "Conta %s em cooldown por rate limit Meta endpoint=%s usage=%s cooldown=%.2fs",
                        account_id_meta,
                        exc.endpoint,
                        exc.usage_percent,
                        float(exc.cooldown_seconds or 0.0),
                    )
                except MetaContaInacessivelError as exc:
                    try:
                        conta_db.rollback()
                    except Exception:
                        pass
                    import uuid as _uuid
                    c = conta_db.get(AdsAccount, _uuid.UUID(conta_id))
                    if c:
                        c.sync_paused = True
                        conta_db.commit()
                    log.warning("Conta %s pausada após erro terminal no sync: %s", account_id_meta, exc)
                except Exception as exc:
                    log.exception("Erro sync conta %s: %s", account_id_meta, exc)

        max_workers = max(1, int(settings.META_SYNC_MAX_PARALLEL_ACCOUNTS))
        log.info("Scheduler: processando %d contas com %d workers paralelos", len(contas), max_workers)
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(_sync_conta, str(conta.id), conta.account_id): conta
                for conta in contas
            }
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as exc:
                    log.exception("Erro inesperado em thread de sync: %s", exc)

    log.info("Scheduler: sync concluído")


def _job_process_whatsapp_events() -> None:
    try:
        result = process_next_whatsapp_jobs(limit=25)
        total = sum(result.values())
        if total:
            log.info("Scheduler: fila WhatsApp processada — %s", result)
    except Exception as exc:
        log.exception("Erro ao processar fila WhatsApp: %s", exc)


def iniciar_scheduler() -> None:
    # 06:00, 12:00, 18:00 horário de Brasília
    scheduler.add_job(
        _job_sync_todas_contas,
        CronTrigger(hour="6,12,18", timezone="America/Sao_Paulo"),
        id="meta_sync",
        replace_existing=True,
        misfire_grace_time=600,
    )
    scheduler.add_job(
        _job_process_whatsapp_events,
        "interval",
        seconds=5,
        id="whatsapp_event_queue",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=30,
    )
    scheduler.start()
    job = scheduler.get_job("meta_sync")
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else "n/a"
    log.info(
        "Scheduler iniciado — jobs Meta Ads às 06h, 12h, 18h (Brasília); próximo=%s; fila WhatsApp a cada 5s",
        next_run,
    )


def parar_scheduler() -> None:
    scheduler.shutdown(wait=False)

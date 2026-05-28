"""APScheduler — roda sincronização Meta Ads 3x/dia."""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.database import SessionLocal
from app.models.ads_account import AdsAccount
from app.services.meta_sync import MetaContaInacessivelError, sincronizar_conta
from app.services.whatsapp_event_worker import process_next_whatsapp_jobs

log = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def _job_sync_todas_contas() -> None:
    log.info("Scheduler: iniciando sync Meta Ads — %s", datetime.now(tz=timezone.utc).isoformat())
    with SessionLocal() as db:
        contas = db.query(AdsAccount).filter(
            AdsAccount.plataforma == "meta",
            AdsAccount.status == "ativo",
            AdsAccount.sync_paused.is_(False),
        ).all()

        for conta in contas:
            if not conta.bm_token:
                continue
            if conta.token_expira_em and conta.token_expira_em < datetime.now(tz=timezone.utc):
                log.warning("Token expirado — conta %s (%s)", conta.id, conta.account_id)
                continue
            try:
                resultado = sincronizar_conta(str(conta.id), db)
                log.info("Conta %s: %s", conta.account_id, resultado)
            except MetaContaInacessivelError as exc:
                try:
                    db.rollback()
                except Exception:
                    pass
                conta.sync_paused = True
                db.commit()
                log.warning("Conta %s pausada após erro terminal no sync: %s", conta.account_id, exc)
            except Exception as exc:
                log.exception("Erro sync conta %s: %s", conta.account_id, exc)

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

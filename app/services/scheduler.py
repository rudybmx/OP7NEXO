"""APScheduler — roda sincronização Meta Ads 3x/dia e health daily de tokens."""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.database import SessionLocal
from app.models.ads_account import AdsAccount
from app.services.meta_token_health import checar_tokens_ativos
from app.services.meta_sync_jobs import iniciar_sync_job

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
            try:
                job_id, _, status, reason = iniciar_sync_job(db, str(conta.id), modo_sync="recorrente", background=False)
                if status == "skipped":
                    log.info("Conta %s: job %s pulado (%s)", conta.account_id, job_id, reason or "sem motivo")
                else:
                    log.info("Conta %s: job %s finalizado com status %s", conta.account_id, job_id, status)
            except Exception as exc:
                log.exception("Erro sync conta %s: %s", conta.account_id, exc)

    log.info("Scheduler: sync concluído")


def _job_health_meta_tokens() -> None:
    log.info("Scheduler: iniciando health de tokens Meta — %s", datetime.now(tz=timezone.utc).isoformat())
    with SessionLocal() as db:
        summary = checar_tokens_ativos(db)
    log.info("Scheduler: health de tokens concluído — %s", summary)


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
        _job_health_meta_tokens,
        CronTrigger(hour=7, minute=0, timezone="America/Sao_Paulo"),
        id="meta_token_health",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    job_sync = scheduler.get_job("meta_sync")
    job_health = scheduler.get_job("meta_token_health")
    next_sync = job_sync.next_run_time.isoformat() if job_sync and job_sync.next_run_time else "n/a"
    next_health = job_health.next_run_time.isoformat() if job_health and job_health.next_run_time else "n/a"
    log.info(
        "Scheduler iniciado — Meta Ads 06h/12h/18h e health 07h (Brasília); próximo_sync=%s; próximo_health=%s",
        next_sync,
        next_health,
    )


def parar_scheduler() -> None:
    scheduler.shutdown(wait=False)

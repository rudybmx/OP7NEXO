"""APScheduler — enfileira sync Meta Ads (leve/pesado) + sweeper de cobertura.

Spec 002: os crons ENFILEIRAM sync_jobs; o worker dedicado executa com o
comportamento "nunca desistir" (re-agenda no rate limit).
"""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.config import settings
from app.services.whatsapp_event_worker import process_next_whatsapp_jobs

log = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

# Piso de ativação do Kanban "Leads sem Resposta": o job ignora o backlog
# histórico e só cria card para conversas cuja última saída ocorreu A PARTIR
# deste instante (decisão de produto: começar limpo, sem despejar ~987 leads
# antigos de uma vez). Para reprocessar o histórico, recue esta data.
ATIVACAO_LEADS_SEM_RESPOSTA = datetime(2026, 6, 15, 4, 0, 0, tzinfo=timezone.utc)


def _enfileirar_contas(tipo: str) -> None:
    """Spec 002 (B4): os crons ENFILEIRAM sync_jobs (não chamam o sync inline).

    Assim toda execução herda o "nunca desistir" do worker (re-agenda no rate
    limit). Dedup POR CONTA (qualquer job pending/running) — em tier
    development_access um backlog não-deduplicado explodiria a quota; quando a
    conta já tem job na fila, o novo ciclo é ignorado (o job existente cobre os
    números). Respeita cooldown e os filtros de elegibilidade.
    """
    modo = "backfill" if tipo == "backfill" else "recorrente"
    with SessionLocal() as db:
        rows = db.execute(text("""
            INSERT INTO sync_jobs
                (id, ads_account_id, modo_sync, tipo, status, next_run_at,
                 attempts, progresso, created_at, updated_at)
            SELECT gen_random_uuid(), a.id::text, :modo, :tipo, 'pending', NOW(),
                   0, 0, NOW(), NOW()
            FROM ads_accounts a
            LEFT JOIN meta_sync_states s ON s.ads_account_id = a.id
            WHERE a.plataforma = 'meta'
              AND a.status = 'ativo'
              AND a.sync_paused = false
              AND a.bm_token IS NOT NULL
              AND (a.token_expira_em IS NULL OR a.token_expira_em >= NOW())
              AND (s.cooldown_until IS NULL OR s.cooldown_until <= NOW())
              AND NOT EXISTS (
                  SELECT 1 FROM sync_jobs j
                  WHERE j.ads_account_id = a.id::text
                    AND j.status IN ('pending', 'running')
              )
            RETURNING id
        """), {"modo": modo, "tipo": tipo}).fetchall()
        db.commit()
    log.info("Scheduler: %d conta(s) enfileiradas tipo=%s", len(rows), tipo)


def _job_enfileirar_leve() -> None:
    _enfileirar_contas("leve")


def _job_enfileirar_pesado() -> None:
    _enfileirar_contas("pesado")


def _job_gerar_insights_ia() -> None:
    """Cron próprio (pós-enfileiramento). Best-effort."""
    try:
        _gerar_insights_ia()
    except Exception as exc:
        log.exception("Erro ao gerar insights de IA: %s", exc)


def _job_sweeper() -> None:
    """Spec 002 (B4): repara cobertura. Detecta conta ativa COM gasto e catálogo
    mas SEM insights (ou defasada >1 dia) e enfileira backfill serializado —
    máx META_SYNC_MAX_PARALLEL_ACCOUNTS por ciclo, sem duplicar job da conta.
    Reaproveita o "nunca desistir" do worker (não repete o rate-limit do
    cadastro em massa)."""
    with SessionLocal() as db:
        rows = db.execute(text("""
            INSERT INTO sync_jobs
                (id, ads_account_id, modo_sync, tipo, status, next_run_at,
                 attempts, progresso, created_at, updated_at)
            SELECT gen_random_uuid(), a.id::text, 'backfill', 'backfill', 'pending',
                   NOW(), 0, 0, NOW(), NOW()
            FROM ads_accounts a
            LEFT JOIN meta_sync_states s ON s.ads_account_id = a.id
            LEFT JOIN (
                SELECT ads_account_id, MAX(data) AS ultima, COUNT(*) AS n
                FROM meta_insights_diarios GROUP BY ads_account_id
            ) d ON d.ads_account_id = a.id
            WHERE a.plataforma = 'meta'
              AND a.status = 'ativo'
              AND a.sync_paused = false
              AND a.bm_token IS NOT NULL
              AND (a.token_expira_em IS NULL OR a.token_expira_em >= NOW())
              AND a.amount_spent > 0
              AND EXISTS (SELECT 1 FROM meta_campaigns_catalog c WHERE c.ads_account_id = a.id)
              AND (COALESCE(d.n, 0) = 0 OR d.ultima < CURRENT_DATE - 1)
              AND (s.cooldown_until IS NULL OR s.cooldown_until <= NOW())
              -- Não re-backfillar quem JÁ teve sync bem-sucedido recente: conta
              -- com gasto lifetime mas 0 insights no período é "conta parada"
              -- (legítima), não vítima de rate limit. Sem este gate o sweeper
              -- repetiria backfill a cada ciclo e queimaria a quota.
              AND (s.last_success_at IS NULL OR s.last_success_at < NOW() - INTERVAL '12 hours')
              AND NOT EXISTS (
                  SELECT 1 FROM sync_jobs j
                  WHERE j.ads_account_id = a.id::text
                    AND j.status IN ('pending', 'running')
              )
            ORDER BY COALESCE(d.n, 0) ASC, a.amount_spent DESC
            LIMIT :max
            RETURNING id
        """), {"max": max(1, int(settings.META_SYNC_MAX_PARALLEL_ACCOUNTS))}).fetchall()
        db.commit()
    if rows:
        log.info("Sweeper: %d backfill(s) de cobertura enfileirados", len(rows))


def _gerar_insights_ia() -> None:
    """Gera/atualiza insights de IA (Meta + Google) para todos os workspaces com
    dados nos últimos 7 dias. Reaproveita o cache (6h/hash) — barato se nada mudou."""
    from datetime import date, timedelta
    from app.services.ia_insights import gerar_insights_meta, gerar_insights_google

    fim = date.today()
    ini = fim - timedelta(days=7)

    # Coleta (workspace, [contas]) com dados no período, por plataforma.
    with SessionLocal() as db:
        # meta_insights_diarios não tem workspace_id → join em ads_accounts (dono).
        meta_pairs = db.execute(
            text(
                "SELECT a.workspace_id::text, array_agg(DISTINCT d.ads_account_id::text) "
                "FROM meta_insights_diarios d "
                "JOIN ads_accounts a ON a.id = d.ads_account_id "
                "WHERE d.data BETWEEN :ini AND :fim AND a.workspace_id IS NOT NULL "
                "GROUP BY a.workspace_id"
            ),
            {"ini": ini, "fim": fim},
        ).fetchall()
        google_pairs = db.execute(
            text(
                "SELECT workspace_id::text, array_agg(DISTINCT ads_account_id::text) "
                "FROM google_dados_diarios WHERE data BETWEEN :ini AND :fim "
                "GROUP BY workspace_id"
            ),
            {"ini": ini, "fim": fim},
        ).fetchall()

    meta = [(r[0], list(r[1])) for r in meta_pairs]
    google = [(r[0], list(r[1])) for r in google_pairs]
    ini_s, fim_s = str(ini), str(fim)

    for ws, accs in meta:
        try:
            with SessionLocal() as wdb:
                gerar_insights_meta(ws, accs, ini_s, fim_s, wdb)
        except Exception as exc:
            log.exception("Insights Meta falhou ws=%s: %s", ws, exc)

    for ws, accs in google:
        try:
            with SessionLocal() as wdb:
                gerar_insights_google(ws, accs, ini_s, fim_s, wdb)
        except Exception as exc:
            log.exception("Insights Google falhou ws=%s: %s", ws, exc)

    log.info("Scheduler: insights IA gerados — meta=%d ws, google=%d ws", len(meta), len(google))


def _job_leads_sem_resposta() -> None:
    """A cada 5min: conversas com saída sem resposta há >2h viram card em
    'Leads sem Resposta'. Grupos são ignorados (decisão de produto)."""
    from datetime import timedelta

    from app.models.crm.conversa import Conversa
    from app.services.paineis_automacao import criar_ou_reabrir_card_lead_sem_resposta

    corte = datetime.now(timezone.utc) - timedelta(hours=2)
    try:
        with SessionLocal() as db:
            conversas = (
                db.query(Conversa)
                .filter(
                    Conversa.ultima_direcao == "saida",
                    Conversa.last_outbound_at.isnot(None),
                    Conversa.last_outbound_at < corte,
                    Conversa.last_outbound_at >= ATIVACAO_LEADS_SEM_RESPOSTA,
                    Conversa.ativo.is_(True),
                    Conversa.is_group.is_(False),
                    Conversa.status != "resolvido",
                )
                .all()
            )
            criados = 0
            for conv in conversas:
                try:
                    if criar_ou_reabrir_card_lead_sem_resposta(db, conv) is not None:
                        criados += 1
                except Exception as exc:
                    db.rollback()
                    log.warning("leads_sem_resposta: falha conversa=%s: %s", conv.id, exc)
            db.commit()
            if criados:
                log.info("Scheduler: leads_sem_resposta — %d card(s) criados/reabertos", criados)
    except Exception as exc:
        log.exception("Erro no job leads_sem_resposta: %s", exc)


def _job_followup_etiqueta() -> None:
    """A cada 5min: aplica a etiqueta 'followup' em conversas cujo lead parou de responder
    além do `tempo_followup_min` do agente do canal (etiqueta = fonte do estado de followup;
    idempotente, pula quem já tem)."""
    try:
        with SessionLocal() as db:
            from app.services.followup_automacao import aplicar_followup_etiquetas

            n = aplicar_followup_etiquetas(db)
            if n:
                log.info("Scheduler: followup — %d conversa(s) etiquetadas", n)
    except Exception as exc:
        log.exception("Erro no job followup_etiqueta: %s", exc)


def _job_processar_lembretes() -> None:
    """A cada 5min: envia lembretes de agendamento vencidos (X dias/horas antes) por WhatsApp.
    Dedupe durável em agenda_lembrete_envios — não re-spamma o paciente. A resposta do paciente
    é tratada pelo agente (Fase 3)."""
    try:
        with SessionLocal() as db:
            from app.services.agenda.lembretes import processar_lembretes_pendentes

            r = processar_lembretes_pendentes(db)
            if r.get("enviados") or r.get("falhas"):
                log.info("Scheduler: lembretes — %d enviado(s), %d falha(s)", r["enviados"], r["falhas"])
    except Exception as exc:
        log.exception("Erro no job processar_lembretes: %s", exc)


def _job_process_whatsapp_events() -> None:
    try:
        result = process_next_whatsapp_jobs(limit=25)
        total = sum(result.values())
        if total:
            log.info("Scheduler: fila WhatsApp processada — %s", result)
    except Exception as exc:
        log.exception("Erro ao processar fila WhatsApp: %s", exc)


def _job_channel_health() -> None:
    """Health-check dos canais WhatsApp: reconcilia estado real + alerta caídos."""
    from app.services.channel_health import run_channel_health_check  # import tardio (evita circular)
    with SessionLocal() as db:
        try:
            run_channel_health_check(db)
        except Exception:
            logging.getLogger(__name__).exception("[scheduler] channel_health falhou")


def iniciar_scheduler() -> None:
    # Sync LEVE (só insights recentes): enfileira jobs às 06h, 12h, 18h (Brasília).
    scheduler.add_job(
        _job_enfileirar_leve,
        CronTrigger(hour="6,12,18", timezone="America/Sao_Paulo"),
        id="meta_sync_leve",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
    )
    # Sync PESADO (catálogo + públicos): 1x/dia, madrugada Brasília.
    scheduler.add_job(
        _job_enfileirar_pesado,
        CronTrigger(hour=str(settings.META_SYNC_PESADO_HOUR_BRT), timezone="America/Sao_Paulo"),
        id="meta_sync_pesado",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
    )
    # Insights de IA: cron próprio ~40min após cada janela leve (dados frescos).
    scheduler.add_job(
        _job_gerar_insights_ia,
        CronTrigger(hour="6,12,18", minute=40, timezone="America/Sao_Paulo"),
        id="meta_insights_ia",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
    )
    # Sweeper de cobertura: repara contas com gasto sem insights / defasadas.
    scheduler.add_job(
        _job_sweeper,
        "interval",
        minutes=max(1, int(settings.META_SWEEPER_INTERVAL_MINUTES)),
        id="meta_sweeper",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
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
    scheduler.add_job(
        _job_leads_sem_resposta,
        "interval",
        minutes=5,
        id="leads_sem_resposta",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )
    scheduler.add_job(
        _job_followup_etiqueta,
        "interval",
        minutes=5,
        id="followup_etiqueta",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )
    scheduler.add_job(
        _job_processar_lembretes,
        "interval",
        minutes=5,
        id="processar_lembretes",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )
    scheduler.add_job(
        _job_channel_health,
        "interval",
        minutes=max(1, int(settings.HEALTH_CHECK_INTERVAL_MIN)),
        id="channel_health",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )
    scheduler.start()
    job = scheduler.get_job("meta_sync_leve")
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else "n/a"
    log.info(
        "Scheduler iniciado — enfileira LEVE 06/12/18h, PESADO %sh, sweeper %dmin (Brasília); próximo leve=%s",
        settings.META_SYNC_PESADO_HOUR_BRT,
        settings.META_SWEEPER_INTERVAL_MINUTES,
        next_run,
    )


def parar_scheduler() -> None:
    scheduler.shutdown(wait=False)

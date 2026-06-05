import calendar
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.core.deps import exigir_platform_admin
from app.models.ads_account import AdsAccount
from app.models.meta_sync_log import MetaSyncLog
from app.models.sync_job import SyncJob
from app.models.user import User
from app.services.meta_graph import MetaRateLimitError
from app.services.meta_sync import (
    MetaContaInacessivelError,
    sincronizar_conta,
    reprocessar_imagens_hq_conta,
)
from app.services.scheduler import scheduler
from app.services.object_storage import get_object, stat_object
from app.core.config import settings

router = APIRouter(prefix="/meta", tags=["meta"])


def calcular_periodo(periodo_sync: str) -> date:
    today = date.today()
    mapa = {"mes_atual": 0, "1_mes": 1, "2_meses": 2, "3_meses": 3}
    if periodo_sync in mapa:
        meses = mapa[periodo_sync]
    else:
        meses = int(periodo_sync.replace("M", ""))
    if meses == 0:
        return date(today.year, today.month, 1)
    mes = today.month - meses
    ano = today.year
    while mes <= 0:
        mes += 12
        ano -= 1
    ultimo_dia = calendar.monthrange(ano, mes)[1]
    return date(ano, mes, min(today.day, ultimo_dia))


def _buscar_meta(token: str) -> list[dict]:
    params = urllib.parse.urlencode({
        "fields": "id,name,account_status,currency",
        "access_token": token,
        "limit": 200,
    })
    url: str | None = f"https://graph.facebook.com/v21.0/me/adaccounts?{params}"
    contas: list[dict] = []
    while url:
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            try:
                msg = json.loads(body).get("error", {}).get("message", body)
            except Exception:
                msg = body
            raise HTTPException(status_code=400, detail=f"Meta API: {msg}")
        contas.extend(data.get("data", []))
        url = data.get("paging", {}).get("next")
    return contas


class MetaContaOut(BaseModel):
    account_id: str
    account_name: str
    account_status: int
    currency: str


class ContaImport(BaseModel):
    account_id: str
    nome: str


class ImportarContasInput(BaseModel):
    workspace_id: str
    token: str
    token_expira_em: datetime | None
    periodo_sync: str
    contas: list[ContaImport]


class SyncJobOut(BaseModel):
    id: str
    ads_account_id: str
    status: str
    etapa_atual: str | None
    progresso: int
    totais: dict | None
    erro: str | None
    created_at: str
    updated_at: str


class SyncSchedulerJobOut(BaseModel):
    id: str
    trigger: str
    next_run_time: str | None
    timezone: str | None


class SyncSchedulerOut(BaseModel):
    running: bool
    jobs: list[SyncSchedulerJobOut]


_ALLOWED_IMAGE_HOSTS = {"fbcdn.net", "facebook.com"}


def _host_allowed(url: str) -> bool:
    try:
        host = urllib.parse.urlparse(url).hostname or ""
        return any(host == h or host.endswith("." + h) for h in _ALLOWED_IMAGE_HOSTS)
    except Exception:
        return False


def _sync_job_out(job: SyncJob) -> SyncJobOut:
    return SyncJobOut(
        id=str(job.id),
        ads_account_id=job.ads_account_id,
        status=job.status,
        etapa_atual=job.etapa_atual,
        progresso=job.progresso,
        totais=job.totais,
        erro=job.erro,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
    )


def _sync_scheduler_job_out(job) -> SyncSchedulerJobOut:
    trigger = str(job.trigger)
    trigger_tz = getattr(job.trigger, "timezone", None)
    timezone_name = None
    if trigger_tz is not None:
        timezone_name = getattr(trigger_tz, "zone", None) or str(trigger_tz)
    next_run_time = job.next_run_time.isoformat() if job.next_run_time else None
    return SyncSchedulerJobOut(
        id=str(job.id),
        trigger=trigger,
        next_run_time=next_run_time,
        timezone=timezone_name,
    )


def _iniciar_sync_conta(ads_account_id: str, db: Session, modo_sync: str = "recorrente") -> tuple[str, bool]:
    job_ativo = db.execute(
        select(SyncJob).where(
            SyncJob.ads_account_id == ads_account_id,
            SyncJob.status.in_(("pending", "running")),
        ).order_by(SyncJob.created_at.desc())
    ).scalars().first()
    if job_ativo:
        return str(job_ativo.id), False

    job = SyncJob(ads_account_id=ads_account_id, modo_sync=modo_sync, status="pending", progresso=0)
    db.add(job)
    db.commit()
    db.refresh(job)
    return str(job.id), True


@router.get("/imagem")
def proxy_imagem(url: str = Query(...)):
    if not _host_allowed(url):
        raise HTTPException(status_code=400, detail="URL não permitida")
    try:
        resp = httpx.get(
            url,
            follow_redirects=True,
            timeout=10,
            headers={
                "Referer": "https://www.facebook.com/",
                "User-Agent": "Mozilla/5.0",
            },
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=404, detail="Imagem não encontrada")
    except (httpx.HTTPError, httpx.RequestError):
        raise HTTPException(status_code=404, detail="Imagem não encontrada")
    content_type = resp.headers.get("content-type", "image/jpeg")
    return StreamingResponse(
        iter([resp.content]),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/storage/{bucket}/{object_path:path}")
def proxy_storage(bucket: str, object_path: str):
    allowed_buckets = {
        settings.MINIO_BUCKET_CRIATIVOS,
        "whatsapp-avatars",
        "whatsapp-media",
    }
    if bucket not in allowed_buckets:
        raise HTTPException(status_code=404, detail="Bucket não permitido")
    # Restrição de path só para bucket de criativos
    if bucket == settings.MINIO_BUCKET_CRIATIVOS and not object_path.startswith("ads-accounts/"):
        raise HTTPException(status_code=404, detail="Objeto não permitido")
    try:
        obj = get_object(bucket, object_path)
        stat = stat_object(bucket, object_path)
    except Exception:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    content_type = getattr(stat, "content_type", None) or "application/octet-stream"
    return StreamingResponse(
        obj.stream(32 * 1024),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/contas", response_model=list[MetaContaOut])
def listar_contas_meta(
    token: str = Query(...),
    current_user: User = Depends(exigir_platform_admin),
):
    raw = _buscar_meta(token)
    return [
        MetaContaOut(
            account_id=c["id"],
            account_name=c.get("name", ""),
            account_status=c.get("account_status", 1),
            currency=c.get("currency", ""),
        )
        for c in raw
    ]


@router.post("/importar-contas")
def importar_contas_meta(
    body: ImportarContasInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(exigir_platform_admin),
):
    periodo_inicio = calcular_periodo(body.periodo_sync)
    criadas = 0
    atualizadas = 0
    jobs_iniciados = 0
    jobs_reutilizados = 0
    contas_para_sync: list[str] = []

    for item in body.contas:
        existing = db.execute(
            select(AdsAccount).where(
                AdsAccount.plataforma == "meta",
                AdsAccount.account_id == item.account_id,
            )
        ).scalar_one_or_none()

        if existing:
            existing.bm_token = body.token
            existing.token_expira_em = body.token_expira_em
            existing.sync_paused = False
            existing.sincronizado_em = None
            existing.periodo_sync_inicio = periodo_inicio
            nome_meta_anterior = existing.meta_account_name or existing.account_name
            existing.meta_account_name = item.nome or existing.meta_account_name
            if not existing.account_name or (
                nome_meta_anterior and existing.account_name == nome_meta_anterior
            ):
                existing.account_name = item.nome
            existing.status = "ativo"
            existing.ativo = True
            atualizadas += 1
            contas_para_sync.append(str(existing.id))
        else:
            nova = AdsAccount(
                workspace_id=uuid.UUID(body.workspace_id),
                plataforma="meta",
                account_id=item.account_id,
                account_name=item.nome,
                meta_account_name=item.nome,
                bm_token=body.token,
                token_expira_em=body.token_expira_em,
                sincronizado_em=None,
                periodo_sync_inicio=periodo_inicio,
                account_status=1,
                status="ativo",
                config={},
            )
            db.add(nova)
            criadas += 1
            db.flush()
            contas_para_sync.append(str(nova.id))

    db.commit()

    for ads_account_id in contas_para_sync:
        _, started = _iniciar_sync_conta(ads_account_id, db, modo_sync="backfill")
        if started:
            jobs_iniciados += 1
        else:
            jobs_reutilizados += 1

    return {
        "criadas": criadas,
        "atualizadas": atualizadas,
        "jobs_iniciados": jobs_iniciados,
        "jobs_reutilizados": jobs_reutilizados,
    }


def _run_sync_background(ads_account_id: str, job_id: str, modo_sync: str) -> None:
    with SessionLocal() as db:
        def _set(etapa: str, progresso: int) -> None:
            db.execute(text("""
                UPDATE sync_jobs
                SET etapa_atual = :etapa, progresso = :progresso, updated_at = NOW()
                WHERE id = :id
            """), {"etapa": etapa, "progresso": progresso, "id": job_id})
            db.commit()

        def _finalizar(status: str, *, totais: dict | None = None, erro: str | None = None) -> None:
            with SessionLocal() as status_db:
                if status == "done":
                    status_db.execute(text("""
                        UPDATE sync_jobs
                        SET status = 'done', progresso = 100, etapa_atual = 'concluido',
                            totais = CAST(:totais AS JSONB), erro = NULL, updated_at = NOW()
                        WHERE id = :id
                    """), {"totais": json.dumps(totais or {}), "id": job_id})
                else:
                    status_db.execute(text("""
                        UPDATE sync_jobs
                        SET status = 'error', erro = :erro, updated_at = NOW()
                        WHERE id = :id
                    """), {"erro": erro or "Erro no sync", "id": job_id})
                status_db.commit()

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


@router.post("/sync/{ads_account_id}", status_code=202)
def sync_conta_manual(
    ads_account_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    conta = db.get(AdsAccount, ads_account_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    job_ativo = db.execute(
        select(SyncJob).where(
            SyncJob.ads_account_id == ads_account_id,
            SyncJob.status.in_(("pending", "running")),
        ).order_by(SyncJob.created_at.desc())
    ).scalars().first()
    if conta.sync_paused and not job_ativo:
        return {"job_id": None, "status": "skipped", "reason": "sync pausado"}

    if job_ativo:
        return {"job_id": str(job_ativo.id), "status": "running"}

    job_id, started = _iniciar_sync_conta(ads_account_id, db, modo_sync="recorrente")
    return {"job_id": job_id, "status": "pending" if started else "running"}


@router.post("/reprocessar-imagens/{ads_account_id}")
def reprocessar_imagens_conta(
    ads_account_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Backfill HQ: re-resolve imagens/capas de baixa qualidade (SHARE e vídeo)
    da conta via thumbnail @1200 no nível do creative. Idempotente."""
    conta = db.get(AdsAccount, ads_account_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    return reprocessar_imagens_hq_conta(db, conta)


@router.get("/sync/job/{job_id}")
def get_sync_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    job = db.get(SyncJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return {
        "id": str(job.id),
        "ads_account_id": job.ads_account_id,
        "status": job.status,
        "etapa_atual": job.etapa_atual,
        "progresso": job.progresso,
        "totais": job.totais,
        "erro": job.erro,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }


@router.get("/sync/ativos", response_model=list[SyncJobOut])
def listar_sync_jobs_ativos(
    ads_account_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    q = select(SyncJob).where(SyncJob.status.in_(("pending", "running")))
    if ads_account_id:
        q = q.where(SyncJob.ads_account_id == ads_account_id)
    jobs = db.execute(q.order_by(SyncJob.created_at.desc())).scalars().all()
    return [_sync_job_out(job) for job in jobs]


@router.get("/sync/historico/{ads_account_id}")
def get_sync_historico(
    ads_account_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    conta = db.get(AdsAccount, ads_account_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    logs = (
        db.query(MetaSyncLog)
        .filter(MetaSyncLog.ads_account_id == conta.id)
        .order_by(MetaSyncLog.started_at.desc())
        .limit(limit)
        .all()
    )

    result = []
    for entry in logs:
        duracao = None
        if entry.finished_at and entry.started_at:
            duracao = int((entry.finished_at - entry.started_at).total_seconds())
        result.append({
            "id": str(entry.id),
            "ads_account_id": str(entry.ads_account_id),
            "sync_mode": entry.sync_mode,
            "started_at": entry.started_at.isoformat() if entry.started_at else None,
            "finished_at": entry.finished_at.isoformat() if entry.finished_at else None,
            "status": entry.status,
            "stage_failed": entry.stage_failed,
            "error_message": entry.error_message,
            "campaigns_upserted": entry.campaigns_upserted,
            "adsets_upserted": entry.adsets_upserted,
            "ads_upserted": entry.ads_upserted,
            "insights_days": entry.insights_days,
            "request_count": entry.request_count,
            "rate_limit_usage_pct": entry.rate_limit_usage_pct,
            "duracao_segundos": duracao,
        })
    return result


@router.get("/sync/scheduler", response_model=SyncSchedulerOut)
def get_sync_scheduler(_: User = Depends(exigir_platform_admin)):
    try:
        jobs = sorted(
            scheduler.get_jobs(),
            key=lambda job: job.next_run_time or datetime.max.replace(tzinfo=timezone.utc),
        )
    except Exception:
        jobs = []
    return SyncSchedulerOut(
        running=bool(getattr(scheduler, "running", False)),
        jobs=[_sync_scheduler_job_out(job) for job in jobs],
    )

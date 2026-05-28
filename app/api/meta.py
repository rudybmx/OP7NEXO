import base64
import calendar
from collections import defaultdict
import hashlib
import hmac
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.core.deps import exigir_platform_admin, get_usuario_atual, verificar_acesso_workspace
from app.models.ads_account import AdsAccount
from app.models.sync_job import SyncJob
from app.models.sync_job_event import SyncJobEvent
from app.models.user import User
from app.models.workspace import Workspace
from app.services.meta_sync import MetaContaInacessivelError, sincronizar_conta, reprocessar_imagens_hq_conta
from app.services.meta_sync_jobs import iniciar_sync_job
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
    modo_sync: str
    janela_inicio: str | None
    janela_fim: str | None
    etapa_atual: str | None
    progresso: int
    totais: dict | None
    erro: str | None
    created_at: str
    updated_at: str


class SyncJobEventOut(BaseModel):
    id: str
    tipo: str
    etapa_atual: str | None
    progresso: int | None
    mensagem: str | None
    detalhes: dict | None
    created_at: str


class SyncJobHistoryOut(BaseModel):
    id: str
    status: str
    modo_sync: str
    janela_inicio: str | None
    janela_fim: str | None
    etapa_atual: str | None
    progresso: int
    totais: dict | None
    erro: str | None
    created_at: str
    updated_at: str
    duration_seconds: float
    eventos: list[SyncJobEventOut]


class SyncCoverageDayOut(BaseModel):
    data: str
    status: str
    label: str
    detalhe: str
    has_insights: bool
    insights_count: int
    jobs_total: int
    jobs_done: int
    jobs_error: int
    jobs_skipped: int
    jobs_running: int
    jobs_pending: int


class SyncHistorySummaryOut(BaseModel):
    jobs_total: int
    jobs_done: int
    jobs_error: int
    jobs_skipped: int
    jobs_running: int
    jobs_pending: int
    dias_com_insights: int
    dias_com_job: int
    dias_ok: int
    dias_gap: int
    dias_dados_sem_job: int
    dias_job_sem_insights: int


class SyncHistoryContaOut(BaseModel):
    id: str
    workspace_id: str
    workspace_nome: str | None
    plataforma: str
    account_id: str
    account_name: str | None
    meta_account_name: str | None
    status: str
    ativo: bool
    sync_paused: bool
    sincronizado_em: str | None
    periodo_sync_inicio: str | None
    periodo_referencia_inicio: str | None


class SyncHistoricoOut(BaseModel):
    timezone: str
    conta: SyncHistoryContaOut
    resumo: SyncHistorySummaryOut
    jobs: list[SyncJobHistoryOut]
    cobertura_diaria: list[SyncCoverageDayOut]


class SignedProxyOut(BaseModel):
    url: str
    expira_em: int


class SignedStorageInput(BaseModel):
    workspace_id: str
    bucket: str
    object_path: str
    ttl_segundos: int = 300


class SignedImagemInput(BaseModel):
    workspace_id: str
    url: str
    ttl_segundos: int = 300


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
        modo_sync=job.modo_sync,
        janela_inicio=job.janela_inicio.isoformat() if job.janela_inicio else None,
        janela_fim=job.janela_fim.isoformat() if job.janela_fim else None,
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


_SYNC_HISTORY_TZ = ZoneInfo("America/Sao_Paulo")


def _sync_job_event_out(event: SyncJobEvent) -> SyncJobEventOut:
    return SyncJobEventOut(
        id=str(event.id),
        tipo=event.tipo,
        etapa_atual=event.etapa_atual,
        progresso=event.progresso,
        mensagem=event.mensagem,
        detalhes=event.detalhes,
        created_at=event.created_at.isoformat(),
    )


def _sync_job_history_out(job: SyncJob, eventos: list[SyncJobEvent]) -> SyncJobHistoryOut:
    fim = job.updated_at if job.status in ("done", "error", "skipped") else datetime.now(tz=timezone.utc)
    duration_seconds = max(0.0, (fim - job.created_at).total_seconds())
    return SyncJobHistoryOut(
        id=str(job.id),
        status=job.status,
        modo_sync=job.modo_sync,
        janela_inicio=job.janela_inicio.isoformat() if job.janela_inicio else None,
        janela_fim=job.janela_fim.isoformat() if job.janela_fim else None,
        etapa_atual=job.etapa_atual,
        progresso=job.progresso,
        totais=job.totais,
        erro=job.erro,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
        duration_seconds=duration_seconds,
        eventos=[_sync_job_event_out(event) for event in eventos],
    )


def _cobertura_label(status: str) -> tuple[str, str]:
    mapa = {
        "ok": ("OK", "Sincronização com insights"),
        "error": ("Falha", "Ao menos uma execução terminou em erro"),
        "skipped": ("Pulado", "Execução ignorada por regra de negócio"),
        "running": ("Em andamento", "Há execução ativa neste dia"),
        "job_sem_insights": ("Sem insights", "Houve job, mas não retornou insights"),
        "dados_sem_job": ("Dados sem job", "Existem insights, mas nenhum job foi registrado"),
        "gap": ("Gap", "Sem job e sem insights registrados"),
    }
    return mapa.get(status, (status, status))


def _classificar_cobertura_dia(
    *,
    has_insights: bool,
    jobs_total: int,
    jobs_done: int,
    jobs_error: int,
    jobs_skipped: int,
    jobs_running: int,
    jobs_pending: int,
) -> tuple[str, str, str]:
    if jobs_error > 0:
        status = "error"
    elif jobs_skipped > 0:
        status = "skipped"
    elif jobs_running > 0 or jobs_pending > 0:
        status = "running"
    elif jobs_total > 0 and has_insights:
        status = "ok"
    elif jobs_total > 0:
        status = "job_sem_insights"
    elif has_insights:
        status = "dados_sem_job"
    else:
        status = "gap"
    label, detalhe = _cobertura_label(status)
    return status, label, detalhe


def _iniciar_sync_conta(
    ads_account_id: str,
    db: Session,
    modo_sync: str = "recorrente",
) -> tuple[str, bool, str, str | None]:
    return iniciar_sync_job(db, ads_account_id, modo_sync=modo_sync, background=True)


_SIGN_SALT = "meta-proxy-v2"


def _assinar_payload(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    secret = settings.JWT_SECRET.encode()
    sig = hmac.new(secret, (_SIGN_SALT + ".").encode() + raw, hashlib.sha256).digest()
    token_bytes = base64.urlsafe_b64encode(raw).rstrip(b"=") + b"." + base64.urlsafe_b64encode(sig).rstrip(b"=")
    return token_bytes.decode()


def _verificar_token(token: str, expected_type: str) -> dict:
    try:
        raw_b64, sig_b64 = token.split(".", 1)
        raw = base64.urlsafe_b64decode(raw_b64 + "=" * (-len(raw_b64) % 4))
        sig = base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
    except Exception as exc:
        raise HTTPException(status_code=403, detail="Token inválido") from exc

    secret = settings.JWT_SECRET.encode()
    expected_sig = hmac.new(secret, (_SIGN_SALT + ".").encode() + raw, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=403, detail="Assinatura inválida")

    payload = json.loads(raw.decode())
    if payload.get("typ") != expected_type:
        raise HTTPException(status_code=403, detail="Tipo de token inválido")

    exp = int(payload.get("exp", 0))
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if exp <= now_ts:
        raise HTTPException(status_code=403, detail="Token expirado")

    return payload


def _is_storage_allowed(bucket: str, object_path: str) -> bool:
    allowed_buckets = {
        settings.MINIO_BUCKET_CRIATIVOS,
        "whatsapp-avatars",
        "whatsapp-media",
    }
    if bucket not in allowed_buckets:
        return False
    if bucket == settings.MINIO_BUCKET_CRIATIVOS and not object_path.startswith("ads-accounts/"):
        return False
    return True


def _build_signed_storage_url(workspace_id: str, bucket: str, object_path: str, ttl_segundos: int) -> SignedProxyOut:
    ttl = max(30, min(ttl_segundos, 900))
    exp = int(datetime.now(timezone.utc).timestamp()) + ttl
    payload = {"typ": "storage", "wid": workspace_id, "b": bucket, "o": object_path, "exp": exp}
    token = _assinar_payload(payload)
    url = f"{settings.SERVER_URL}/meta/storage-assinado?token={urllib.parse.quote(token, safe='')}"
    return SignedProxyOut(url=url, expira_em=exp)


def _build_signed_imagem_url(workspace_id: str, url: str, ttl_segundos: int) -> SignedProxyOut:
    ttl = max(30, min(ttl_segundos, 900))
    exp = int(datetime.now(timezone.utc).timestamp()) + ttl
    payload = {"typ": "imagem", "wid": workspace_id, "u": url, "exp": exp}
    token = _assinar_payload(payload)
    signed_url = f"{settings.SERVER_URL}/meta/imagem-assinada?token={urllib.parse.quote(token, safe='')}"
    return SignedProxyOut(url=signed_url, expira_em=exp)


@router.post("/storage-assinado", response_model=SignedProxyOut)
def gerar_url_storage_assinada(
    body: SignedStorageInput,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    workspace_uuid = uuid.UUID(body.workspace_id)
    verificar_acesso_workspace(usuario, workspace_uuid, db)
    if not _is_storage_allowed(body.bucket, body.object_path):
        raise HTTPException(status_code=404, detail="Objeto não permitido")
    return _build_signed_storage_url(body.workspace_id, body.bucket, body.object_path, body.ttl_segundos)


@router.get("/storage-assinado")
def proxy_storage_assinado(token: str = Query(...)):
    payload = _verificar_token(token, "storage")
    bucket = payload.get("b", "")
    object_path = payload.get("o", "")
    if not _is_storage_allowed(bucket, object_path):
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
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.post("/imagem-assinada", response_model=SignedProxyOut)
def gerar_url_imagem_assinada(
    body: SignedImagemInput,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    workspace_uuid = uuid.UUID(body.workspace_id)
    verificar_acesso_workspace(usuario, workspace_uuid, db)
    if not _host_allowed(body.url):
        raise HTTPException(status_code=400, detail="URL não permitida")
    return _build_signed_imagem_url(body.workspace_id, body.url, body.ttl_segundos)


@router.get("/imagem-assinada")
def proxy_imagem_assinada(token: str = Query(...)):
    payload = _verificar_token(token, "imagem")
    url = payload.get("u", "")
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
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.get("/imagem")
def proxy_imagem(
    url: str = Query(...),
    usuario: User = Depends(get_usuario_atual),
):
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
def proxy_storage(
    bucket: str,
    object_path: str,
    usuario: User = Depends(get_usuario_atual),
):
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
    jobs_pulados = 0
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
        _, started, status, _ = _iniciar_sync_conta(ads_account_id, db, modo_sync="backfill")
        if status == "skipped":
            jobs_pulados += 1
        if started:
            jobs_iniciados += 1
        else:
            if status == "skipped":
                continue
            jobs_reutilizados += 1

    return {
        "criadas": criadas,
        "atualizadas": atualizadas,
        "jobs_iniciados": jobs_iniciados,
        "jobs_reutilizados": jobs_reutilizados,
        "jobs_pulados": jobs_pulados,
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
    if job_ativo:
        return {"job_id": str(job_ativo.id), "status": "running"}

    job_id, started, status, reason = _iniciar_sync_conta(ads_account_id, db, modo_sync="recorrente")
    if status == "skipped":
        return {"job_id": job_id, "status": "skipped", "reason": reason}
    return {"job_id": job_id, "status": "pending" if started else status}


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
    return _sync_job_out(job).model_dump()


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


@router.get("/sync/historico/{ads_account_id}", response_model=SyncHistoricoOut)
def get_sync_history(
    ads_account_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    conta = db.get(AdsAccount, ads_account_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    workspace = db.get(Workspace, conta.workspace_id)
    jobs = db.execute(
        select(SyncJob)
        .where(SyncJob.ads_account_id == str(ads_account_id))
        .order_by(SyncJob.created_at.desc())
    ).scalars().all()

    eventos_por_job: dict[uuid.UUID, list[SyncJobEvent]] = defaultdict(list)
    if jobs:
        job_ids = [job.id for job in jobs]
        eventos = db.execute(
            select(SyncJobEvent)
            .where(SyncJobEvent.sync_job_id.in_(job_ids))
            .order_by(SyncJobEvent.created_at.asc())
        ).scalars().all()
        for evento in eventos:
            eventos_por_job[evento.sync_job_id].append(evento)

    insights_rows = db.execute(
        text("""
            SELECT data, COUNT(*) AS total
            FROM meta_insights_diarios
            WHERE ads_account_id = :ads_account_id
            GROUP BY data
        """),
        {"ads_account_id": str(ads_account_id)},
    ).fetchall()
    insights_por_dia: dict[date, int] = {
        row[0]: int(row[1] or 0)
        for row in insights_rows
        if row and row[0] is not None
    }

    hoje = datetime.now(tz=_SYNC_HISTORY_TZ).date()
    if conta.periodo_sync_inicio:
        periodo_inicio = min(conta.periodo_sync_inicio, hoje)
    else:
        datas_base = [hoje]
        if jobs:
            datas_base.append(min(job.created_at.astimezone(_SYNC_HISTORY_TZ).date() for job in jobs))
        if insights_por_dia:
            datas_base.append(min(insights_por_dia.keys()))
        periodo_inicio = min(datas_base)

    jobs_por_dia: dict[date, dict[str, Any]] = defaultdict(lambda: {
        "jobs_total": 0,
        "jobs_done": 0,
        "jobs_error": 0,
        "jobs_skipped": 0,
        "jobs_running": 0,
        "jobs_pending": 0,
    })

    for job in jobs:
        dia = job.created_at.astimezone(_SYNC_HISTORY_TZ).date()
        bucket = jobs_por_dia[dia]
        bucket["jobs_total"] += 1
        if job.status == "done":
            bucket["jobs_done"] += 1
        elif job.status == "error":
            bucket["jobs_error"] += 1
        elif job.status == "skipped":
            bucket["jobs_skipped"] += 1
        elif job.status == "running":
            bucket["jobs_running"] += 1
        elif job.status == "pending":
            bucket["jobs_pending"] += 1
        else:
            bucket["jobs_pending"] += 1

    cobertura_diaria: list[SyncCoverageDayOut] = []
    dias_ok = dias_gap = dias_dados_sem_job = dias_job_sem_insights = 0
    for offset in range((hoje - periodo_inicio).days + 1):
        dia = periodo_inicio + timedelta(days=offset)
        job_bucket = jobs_por_dia.get(dia, {
            "jobs_total": 0,
            "jobs_done": 0,
            "jobs_error": 0,
            "jobs_skipped": 0,
            "jobs_running": 0,
            "jobs_pending": 0,
        })
        insights_count = insights_por_dia.get(dia, 0)
        has_insights = insights_count > 0
        status, label, detalhe = _classificar_cobertura_dia(
            has_insights=has_insights,
            jobs_total=job_bucket["jobs_total"],
            jobs_done=job_bucket["jobs_done"],
            jobs_error=job_bucket["jobs_error"],
            jobs_skipped=job_bucket["jobs_skipped"],
            jobs_running=job_bucket["jobs_running"],
            jobs_pending=job_bucket["jobs_pending"],
        )
        if status == "ok":
            dias_ok += 1
        elif status == "gap":
            dias_gap += 1
        elif status == "dados_sem_job":
            dias_dados_sem_job += 1
        elif status == "job_sem_insights":
            dias_job_sem_insights += 1
        cobertura_diaria.append(
            SyncCoverageDayOut(
                data=dia.isoformat(),
                status=status,
                label=label,
                detalhe=detalhe,
                has_insights=has_insights,
                insights_count=insights_count,
                jobs_total=job_bucket["jobs_total"],
                jobs_done=job_bucket["jobs_done"],
                jobs_error=job_bucket["jobs_error"],
                jobs_skipped=job_bucket["jobs_skipped"],
                jobs_running=job_bucket["jobs_running"],
                jobs_pending=job_bucket["jobs_pending"],
            )
        )

    resumo = SyncHistorySummaryOut(
        jobs_total=len(jobs),
        jobs_done=sum(1 for job in jobs if job.status == "done"),
        jobs_error=sum(1 for job in jobs if job.status == "error"),
        jobs_skipped=sum(1 for job in jobs if job.status == "skipped"),
        jobs_running=sum(1 for job in jobs if job.status == "running"),
        jobs_pending=sum(1 for job in jobs if job.status == "pending"),
        dias_com_insights=len(insights_por_dia),
        dias_com_job=sum(1 for value in jobs_por_dia.values() if value["jobs_total"] > 0),
        dias_ok=dias_ok,
        dias_gap=dias_gap,
        dias_dados_sem_job=dias_dados_sem_job,
        dias_job_sem_insights=dias_job_sem_insights,
    )

    conta_out = SyncHistoryContaOut(
        id=str(conta.id),
        workspace_id=str(conta.workspace_id),
        workspace_nome=workspace.nome if workspace else None,
        plataforma=conta.plataforma,
        account_id=conta.account_id,
        account_name=conta.account_name,
        meta_account_name=conta.meta_account_name,
        status=conta.status,
        ativo=conta.ativo,
        sync_paused=conta.sync_paused,
        sincronizado_em=conta.sincronizado_em.isoformat() if conta.sincronizado_em else None,
        periodo_sync_inicio=conta.periodo_sync_inicio.isoformat() if conta.periodo_sync_inicio else None,
        periodo_referencia_inicio=periodo_inicio.isoformat(),
    )

    return SyncHistoricoOut(
        timezone="America/Sao_Paulo",
        conta=conta_out,
        resumo=resumo,
        jobs=[_sync_job_history_out(job, eventos_por_job.get(job.id, [])) for job in jobs],
        cobertura_diaria=cobertura_diaria,
    )

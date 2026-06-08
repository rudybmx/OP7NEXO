"""Google Ads — descoberta e vinculação de contas."""

import json
import threading
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.sql import text

from app.core.database import SessionLocal, get_db
from app.core.deps import exigir_platform_admin
from app.models.ads_account import AdsAccount
from app.models.ads_account_workspace_access import AdsAccountWorkspaceAccess
from app.models.google_ads_credential import GoogleAdsCredential
from app.models.sync_job import SyncJob
from app.models.user import User
from app.models.workspace import Workspace

router = APIRouter(prefix="/google-ads", tags=["google_ads"])


class VincularContaIn(BaseModel):
    credential_id: str
    customer_id: str
    customer_name: str
    workspace_id: str
    currency: str | None = None
    timezone: str | None = None


def _get_cred_or_404(cred_id: uuid.UUID, db: Session) -> GoogleAdsCredential:
    c = db.query(GoogleAdsCredential).filter(
        GoogleAdsCredential.id == cred_id,
        GoogleAdsCredential.ativo == True,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Credencial Google Ads não encontrada")
    return c


def _cred_dict(c: GoogleAdsCredential) -> dict:
    return {
        "developer_token": c.developer_token,
        "client_id": c.client_id,
        "client_secret": c.client_secret,
        "refresh_token": c.refresh_token,
        "manager_customer_id": c.manager_customer_id,
    }


@router.get("/descobrir-contas")
def descobrir_contas(
    credential_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Lista contas Google Ads acessíveis pela credencial MCC.

    Marca quais já estão cadastradas na plataforma.
    """
    from app.services.google_ads_client import listar_contas_acessiveis

    cred = _get_cred_or_404(credential_id, db)
    try:
        contas = listar_contas_acessiveis(_cred_dict(cred))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar Google Ads API: {exc}")

    # Marcar contas já cadastradas
    customer_ids = [c["customer_id"] for c in contas]
    ja_cadastradas = set()
    if customer_ids:
        rows = db.execute(
            text("SELECT account_id FROM ads_accounts WHERE plataforma='google' AND account_id = ANY(:ids) AND ativo=true"),
            {"ids": customer_ids},
        ).fetchall()
        ja_cadastradas = {r[0] for r in rows}

    for c in contas:
        c["ja_cadastrada"] = c["customer_id"] in ja_cadastradas

    return contas


@router.post("/vincular-conta", status_code=201)
def vincular_conta(
    payload: VincularContaIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Vincula uma conta Google Ads a um workspace e dispara sync inicial."""
    cred = _get_cred_or_404(uuid.UUID(payload.credential_id), db)

    workspace = db.get(Workspace, uuid.UUID(payload.workspace_id))
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    # Verifica duplicata
    existente = db.execute(
        text("""
            SELECT id FROM ads_accounts
            WHERE plataforma='google' AND account_id=:aid AND workspace_id=:wid AND ativo=true
        """),
        {"aid": payload.customer_id, "wid": str(workspace.id)},
    ).fetchone()
    if existente:
        raise HTTPException(status_code=409, detail="Conta já vinculada a este workspace")

    conta = AdsAccount(
        workspace_id=workspace.id,
        plataforma="google",
        account_id=payload.customer_id,
        account_name=payload.customer_name,
        config={"credential_id": str(cred.id)},
        ativo=True,
    )
    db.add(conta)
    db.flush()

    acesso = AdsAccountWorkspaceAccess(
        ads_account_id=conta.id,
        workspace_id=workspace.id,
    )
    db.add(acesso)
    db.commit()
    db.refresh(conta)

    # Dispara sync inicial em background
    job = SyncJob(
        ads_account_id=str(conta.id),
        modo_sync="backfill",
        status="pending",
        progresso=0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    job_id = str(job.id)
    account_id_str = str(conta.id)
    threading.Thread(
        target=_run_sync_background,
        args=(account_id_str, job_id),
        daemon=True,
    ).start()

    return {
        "id": str(conta.id),
        "customer_id": conta.account_id,
        "nome": conta.account_name,
        "workspace_id": str(workspace.id),
        "job_id": job_id,
    }


@router.get("/contas")
def listar_contas_google(
    workspace_id: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Lista contas Google Ads cadastradas, com filtro opcional por workspace."""
    q = db.query(AdsAccount).filter(
        AdsAccount.plataforma == "google",
        AdsAccount.ativo == True,
    )
    if workspace_id:
        q = q.filter(AdsAccount.workspace_id == uuid.UUID(workspace_id))
    contas = q.all()
    return [
        {
            "id": str(c.id),
            "customer_id": c.account_id,
            "nome": c.account_name,
            "workspace_id": str(c.workspace_id),
            "sincronizado_em": c.sincronizado_em.isoformat() if c.sincronizado_em else None,
            "sync_paused": c.sync_paused,
        }
        for c in contas
    ]


def _run_sync_background(ads_account_id: str, job_id: str) -> None:
    """Executa o sync Google Ads em thread separada — padrão do meta.py."""
    from app.services.google_ads_sync import sincronizar_conta_google

    with SessionLocal() as db:
        def _set(etapa: str, progresso: int) -> None:
            db.execute(text("""
                UPDATE sync_jobs
                SET etapa_atual = :etapa, progresso = :progresso, updated_at = NOW()
                WHERE id = :id
            """), {"etapa": etapa, "progresso": progresso, "id": job_id})
            db.commit()

        def _finalizar(job_status: str, *, totais: dict | None = None, erro: str | None = None) -> None:
            with SessionLocal() as sdb:
                if job_status == "done":
                    sdb.execute(text("""
                        UPDATE sync_jobs
                        SET status = 'done', progresso = 100, etapa_atual = 'concluido',
                            totais = CAST(:totais AS JSONB), erro = NULL, updated_at = NOW()
                        WHERE id = :id
                    """), {"totais": json.dumps(totais or {}), "id": job_id})
                else:
                    sdb.execute(text("""
                        UPDATE sync_jobs
                        SET status = 'error', erro = :erro, updated_at = NOW()
                        WHERE id = :id
                    """), {"erro": erro or "Erro no sync Google Ads", "id": job_id})
                sdb.commit()

        db.execute(text(
            "UPDATE sync_jobs SET status = 'running', updated_at = NOW() WHERE id = :id"
        ), {"id": job_id})
        db.commit()

        try:
            totais = sincronizar_conta_google(ads_account_id, db, on_progress=_set)
            _finalizar("done", totais=totais)
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
    """Dispara sync manual de uma conta Google Ads."""
    conta = db.get(AdsAccount, uuid.UUID(ads_account_id))
    if not conta or conta.plataforma != "google":
        raise HTTPException(status_code=404, detail="Conta Google Ads não encontrada")

    job_ativo = db.execute(
        select(SyncJob).where(
            SyncJob.ads_account_id == ads_account_id,
            SyncJob.status.in_(("pending", "running")),
        )
    ).scalar_one_or_none()
    if job_ativo:
        return {"job_id": str(job_ativo.id), "status": job_ativo.status, "ja_em_andamento": True}

    job = SyncJob(ads_account_id=ads_account_id, modo_sync="manual", status="pending", progresso=0)
    db.add(job)
    db.commit()
    db.refresh(job)

    threading.Thread(
        target=_run_sync_background,
        args=(ads_account_id, str(job.id)),
        daemon=True,
    ).start()

    return {"job_id": str(job.id), "status": "pending"}


@router.get("/sync/job/{job_id}")
def get_sync_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Retorna o status de um job de sync Google Ads."""
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

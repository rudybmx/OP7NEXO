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
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin
from app.models.ads_account import AdsAccount
from app.models.user import User
from app.services.meta_sync import sincronizar_conta

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


_ALLOWED_IMAGE_HOSTS = {"fbcdn.net", "facebook.com"}


def _host_allowed(url: str) -> bool:
    try:
        host = urllib.parse.urlparse(url).hostname or ""
        return any(host == h or host.endswith("." + h) for h in _ALLOWED_IMAGE_HOSTS)
    except Exception:
        return False


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
    agora = datetime.now(tz=timezone.utc)
    criadas = 0
    atualizadas = 0

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
            existing.sincronizado_em = agora
            existing.periodo_sync_inicio = periodo_inicio
            existing.account_name = item.nome or existing.account_name
            atualizadas += 1
        else:
            nova = AdsAccount(
                workspace_id=uuid.UUID(body.workspace_id),
                plataforma="meta",
                account_id=item.account_id,
                account_name=item.nome,
                bm_token=body.token,
                token_expira_em=body.token_expira_em,
                sincronizado_em=agora,
                periodo_sync_inicio=periodo_inicio,
                account_status=1,
                status="ativo",
                config={},
            )
            db.add(nova)
            criadas += 1

    db.commit()
    return {"criadas": criadas, "atualizadas": atualizadas}


@router.post("/sync/{ads_account_id}")
def sync_conta_manual(
    ads_account_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(exigir_platform_admin),
):
    """Dispara sincronização imediata de uma conta Meta Ads."""
    try:
        resultado = sincronizar_conta(ads_account_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro no sync: {exc}")
    return resultado

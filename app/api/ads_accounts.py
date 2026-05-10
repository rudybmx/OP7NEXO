import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin, get_usuario_atual
from app.models.ads_account import AdsAccount
from app.models.user import User
from app.models.workspace import Workspace

router = APIRouter(tags=["ads_accounts"])


class AdsAccountIn(BaseModel):
    plataforma: str
    account_id: str
    account_name: str | None = None
    token_acesso: str | None = None
    bm_id: str | None = None
    status: str = "ativo"
    config: dict = {}


class AdsAccountOut(BaseModel):
    id: str
    workspace_id: str
    plataforma: str
    account_id: str
    account_name: str | None
    bm_id: str | None
    status: str
    config: dict

    model_config = {"from_attributes": True}


def _ads_account_out(a: AdsAccount) -> AdsAccountOut:
    return AdsAccountOut(
        id=str(a.id),
        workspace_id=str(a.workspace_id),
        plataforma=a.plataforma,
        account_id=a.account_id,
        account_name=a.account_name,
        bm_id=a.bm_id,
        status=a.status,
        config=a.config or {},
    )


def _get_ads_account_or_404(ads_account_id: uuid.UUID, db: Session) -> AdsAccount:
    a = db.query(AdsAccount).filter(AdsAccount.id == ads_account_id).first()
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta ads não encontrada")
    return a


def _get_workspace_or_404(workspace_id: uuid.UUID, db: Session) -> Workspace:
    w = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace não encontrado")
    return w


@router.get("/workspaces/{workspace_id}/ads-accounts", response_model=list[AdsAccountOut])
def listar_ads_accounts(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    _get_workspace_or_404(workspace_id, db)
    contas = db.query(AdsAccount).filter(AdsAccount.workspace_id == workspace_id).all()
    return [_ads_account_out(a) for a in contas]


@router.post(
    "/workspaces/{workspace_id}/ads-accounts",
    response_model=AdsAccountOut,
    status_code=status.HTTP_201_CREATED,
)
def criar_ads_account(
    workspace_id: uuid.UUID,
    payload: AdsAccountIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    _get_workspace_or_404(workspace_id, db)

    duplicado = db.query(AdsAccount).filter(
        AdsAccount.plataforma == payload.plataforma,
        AdsAccount.account_id == payload.account_id,
    ).first()
    if duplicado:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conta já cadastrada para esta plataforma",
        )

    a = AdsAccount(
        workspace_id=workspace_id,
        plataforma=payload.plataforma,
        account_id=payload.account_id,
        account_name=payload.account_name,
        token_acesso=payload.token_acesso,
        bm_id=payload.bm_id,
        status=payload.status,
        config=payload.config,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _ads_account_out(a)


@router.put("/ads-accounts/{ads_account_id}", response_model=AdsAccountOut)
def atualizar_ads_account(
    ads_account_id: uuid.UUID,
    payload: AdsAccountIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    a = _get_ads_account_or_404(ads_account_id, db)
    a.account_name = payload.account_name
    a.token_acesso = payload.token_acesso
    a.bm_id = payload.bm_id
    a.status = payload.status
    a.config = payload.config
    db.commit()
    db.refresh(a)
    return _ads_account_out(a)


@router.delete("/ads-accounts/{ads_account_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_ads_account(
    ads_account_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    a = _get_ads_account_or_404(ads_account_id, db)
    db.delete(a)
    db.commit()

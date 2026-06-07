import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin
from app.models.google_ads_credential import GoogleAdsCredential
from app.models.user import User

router = APIRouter(prefix="/google-ads/credentials", tags=["google_ads"])


class GoogleAdsCredentialIn(BaseModel):
    nome: str
    developer_token: str
    client_id: str
    client_secret: str
    refresh_token: str
    manager_customer_id: str | None = None


class GoogleAdsCredentialUpdate(BaseModel):
    nome: str | None = None
    developer_token: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    refresh_token: str | None = None
    manager_customer_id: str | None = None
    ativo: bool | None = None


class GoogleAdsCredentialOut(BaseModel):
    id: str
    nome: str
    developer_token: str
    client_id: str
    manager_customer_id: str | None
    ativo: bool
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


def _out(c: GoogleAdsCredential) -> GoogleAdsCredentialOut:
    return GoogleAdsCredentialOut(
        id=str(c.id),
        nome=c.nome,
        developer_token=c.developer_token,
        client_id=c.client_id,
        manager_customer_id=c.manager_customer_id,
        ativo=c.ativo,
        created_at=c.created_at.isoformat(),
        updated_at=c.updated_at.isoformat(),
    )


def _get_or_404(cred_id: uuid.UUID, db: Session) -> GoogleAdsCredential:
    c = db.query(GoogleAdsCredential).filter(GoogleAdsCredential.id == cred_id).first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credencial não encontrada")
    return c


@router.get("", response_model=list[GoogleAdsCredentialOut])
def listar_credentials(
    include_all: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    q = db.query(GoogleAdsCredential)
    if not include_all:
        q = q.filter(GoogleAdsCredential.ativo == True)
    return [_out(c) for c in q.order_by(GoogleAdsCredential.nome).all()]


@router.post("", response_model=GoogleAdsCredentialOut, status_code=status.HTTP_201_CREATED)
def criar_credential(
    payload: GoogleAdsCredentialIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    c = GoogleAdsCredential(
        nome=payload.nome,
        developer_token=payload.developer_token,
        client_id=payload.client_id,
        client_secret=payload.client_secret,
        refresh_token=payload.refresh_token,
        manager_customer_id=payload.manager_customer_id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _out(c)


@router.put("/{cred_id}", response_model=GoogleAdsCredentialOut)
def atualizar_credential(
    cred_id: uuid.UUID,
    payload: GoogleAdsCredentialUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    c = _get_or_404(cred_id, db)
    for field in ("nome", "developer_token", "client_id", "client_secret", "refresh_token",
                  "manager_customer_id", "ativo"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(c, field, val)
    db.commit()
    db.refresh(c)
    return _out(c)


@router.delete("/{cred_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_credential(
    cred_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    c = _get_or_404(cred_id, db)
    c.ativo = False
    db.commit()

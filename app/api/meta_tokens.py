import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin
from app.models.meta_token import MetaToken
from app.models.user import User

router = APIRouter(prefix="/meta/tokens", tags=["meta_tokens"])


class MetaTokenIn(BaseModel):
    nome: str
    token: str
    valido_ate: str | None = None


class MetaTokenUpdate(BaseModel):
    nome: str | None = None
    token: str | None = None
    valido_ate: str | None = None
    ativo: bool | None = None


class MetaTokenOut(BaseModel):
    id: str
    nome: str
    token: str
    valido_ate: str | None
    ativo: bool
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


def _out(t: MetaToken) -> MetaTokenOut:
    return MetaTokenOut(
        id=str(t.id),
        nome=t.nome,
        token=t.token,
        valido_ate=t.valido_ate.isoformat() if t.valido_ate else None,
        ativo=t.ativo,
        created_at=t.created_at.isoformat(),
        updated_at=t.updated_at.isoformat(),
    )


def _get_or_404(token_id: uuid.UUID, db: Session) -> MetaToken:
    t = db.query(MetaToken).filter(MetaToken.id == token_id).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token não encontrado")
    return t


@router.get("", response_model=list[MetaTokenOut])
def listar_tokens(
    include_all: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    q = db.query(MetaToken)
    if not include_all:
        q = q.filter(MetaToken.ativo == True)
    return [_out(t) for t in q.order_by(MetaToken.nome).all()]


@router.post("", response_model=MetaTokenOut, status_code=status.HTTP_201_CREATED)
def criar_token(
    payload: MetaTokenIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    from datetime import date
    valido_ate = date.fromisoformat(payload.valido_ate) if payload.valido_ate else None
    t = MetaToken(
        nome=payload.nome,
        token=payload.token,
        valido_ate=valido_ate,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _out(t)


@router.put("/{token_id}", response_model=MetaTokenOut)
def atualizar_token(
    token_id: uuid.UUID,
    payload: MetaTokenUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    from datetime import date
    t = _get_or_404(token_id, db)
    if payload.nome is not None:
        t.nome = payload.nome
    if payload.token is not None:
        t.token = payload.token
    if payload.valido_ate is not None:
        t.valido_ate = date.fromisoformat(payload.valido_ate)
    if payload.ativo is not None:
        t.ativo = payload.ativo
    db.commit()
    db.refresh(t)
    return _out(t)


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_token(
    token_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    t = _get_or_404(token_id, db)
    t.ativo = False
    db.commit()

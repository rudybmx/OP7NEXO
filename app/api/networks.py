import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin, get_usuario_atual
from app.models.network import Network
from app.models.user import RoleUsuario, User

router = APIRouter(prefix="/networks", tags=["networks"])


class NetworkIn(BaseModel):
    nome: str
    slug: str
    descricao: str | None = None


class NetworkOut(BaseModel):
    id: str
    nome: str
    slug: str
    descricao: str | None
    ativo: bool

    model_config = {"from_attributes": True}


def _get_or_404(network_id: uuid.UUID, db: Session) -> Network:
    n = db.query(Network).filter(Network.id == network_id).first()
    if not n:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Network não encontrada")
    return n


def _network_out(n: Network) -> NetworkOut:
    return NetworkOut(id=str(n.id), nome=n.nome, slug=n.slug, descricao=n.descricao, ativo=n.ativo)


@router.get("", response_model=list[NetworkOut])
def listar_networks(
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    redes = db.query(Network).filter(Network.ativo.is_(True)).all()
    return [_network_out(r) for r in redes]


@router.post("", response_model=NetworkOut, status_code=status.HTTP_201_CREATED)
def criar_network(
    payload: NetworkIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    if db.query(Network).filter(Network.slug == payload.slug).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug já existe")
    n = Network(nome=payload.nome, slug=payload.slug, descricao=payload.descricao)
    db.add(n)
    db.commit()
    db.refresh(n)
    return _network_out(n)


@router.get("/{network_id}", response_model=NetworkOut)
def detalhe_network(
    network_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    n = _get_or_404(network_id, db)
    if usuario.role != RoleUsuario.platform_admin and usuario.network_id != network_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a esta network")
    return _network_out(n)


@router.put("/{network_id}", response_model=NetworkOut)
def atualizar_network(
    network_id: uuid.UUID,
    payload: NetworkIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    n = _get_or_404(network_id, db)
    conflito = db.query(Network).filter(Network.slug == payload.slug, Network.id != network_id).first()
    if conflito:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug já existe")
    n.nome = payload.nome
    n.slug = payload.slug
    n.descricao = payload.descricao
    db.commit()
    db.refresh(n)
    return _network_out(n)


@router.delete("/{network_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar_network(
    network_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    n = _get_or_404(network_id, db)
    n.ativo = False
    db.commit()

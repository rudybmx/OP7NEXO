import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, get_workspace_atual, verificar_acesso_workspace
from app.models.crm.etiqueta import CrmEtiqueta
from app.models.user import User

router = APIRouter(prefix="/etiquetas", tags=["etiquetas"])


class EtiquetaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    workspace_id: str
    nome: str
    cor: str
    ativo: bool
    criado_em: datetime


class EtiquetaIn(BaseModel):
    nome: str
    cor: str = "#25D366"


class EtiquetaUpdate(BaseModel):
    nome: str | None = None
    cor: str | None = None


def _etiqueta_out(e: CrmEtiqueta) -> EtiquetaOut:
    return EtiquetaOut(
        id=str(e.id),
        workspace_id=str(e.workspace_id),
        nome=e.nome,
        cor=e.cor,
        ativo=e.ativo,
        criado_em=e.criado_em,
    )


@router.get("", response_model=list[EtiquetaOut])
def listar_etiquetas(
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = workspace_id or (
        workspace_filter if not isinstance(workspace_filter, list) else None
    )
    if ws_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id é obrigatório")
    verificar_acesso_workspace(usuario, ws_id, db)
    etiquetas = (
        db.query(CrmEtiqueta)
        .filter(CrmEtiqueta.workspace_id == ws_id, CrmEtiqueta.ativo.is_(True))
        .order_by(CrmEtiqueta.nome)
        .all()
    )
    return [_etiqueta_out(e) for e in etiquetas]


@router.post("", response_model=EtiquetaOut, status_code=status.HTTP_201_CREATED)
def criar_etiqueta(
    data: EtiquetaIn,
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = workspace_id or (
        workspace_filter if not isinstance(workspace_filter, list) else None
    )
    if ws_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id é obrigatório")
    verificar_acesso_workspace(usuario, ws_id, db)

    existente = db.query(CrmEtiqueta).filter(
        CrmEtiqueta.workspace_id == ws_id,
        CrmEtiqueta.nome == data.nome.strip(),
        CrmEtiqueta.ativo.is_(True),
    ).first()
    if existente:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Etiqueta com este nome já existe")

    e = CrmEtiqueta(
        workspace_id=ws_id,
        nome=data.nome.strip(),
        cor=data.cor,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return _etiqueta_out(e)


@router.put("/{etiqueta_id}", response_model=EtiquetaOut)
def atualizar_etiqueta(
    etiqueta_id: uuid.UUID,
    data: EtiquetaUpdate,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    e = db.query(CrmEtiqueta).filter(CrmEtiqueta.id == etiqueta_id, CrmEtiqueta.ativo.is_(True)).first()
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etiqueta não encontrada")
    verificar_acesso_workspace(usuario, e.workspace_id, db)
    if data.nome is not None:
        e.nome = data.nome.strip()
    if data.cor is not None:
        e.cor = data.cor
    db.commit()
    db.refresh(e)
    return _etiqueta_out(e)


@router.delete("/{etiqueta_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_etiqueta(
    etiqueta_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    e = db.query(CrmEtiqueta).filter(CrmEtiqueta.id == etiqueta_id, CrmEtiqueta.ativo.is_(True)).first()
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etiqueta não encontrada")
    verificar_acesso_workspace(usuario, e.workspace_id, db)
    e.ativo = False
    db.commit()
    return None

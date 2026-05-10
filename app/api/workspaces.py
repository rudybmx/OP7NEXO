import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin, get_usuario_atual
from app.models.user import RoleUsuario, User
from app.models.workspace import Workspace

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceIn(BaseModel):
    nome: str
    razao_social: str | None = None
    cnpj: str | None = None
    endereco: dict = {}


class WorkspaceOut(BaseModel):
    id: str
    nome: str
    razao_social: str | None
    cnpj: str | None
    endereco: dict
    ativo: bool

    model_config = {"from_attributes": True}


def _workspace_out(w: Workspace) -> WorkspaceOut:
    return WorkspaceOut(
        id=str(w.id),
        nome=w.nome,
        razao_social=w.razao_social,
        cnpj=w.cnpj,
        endereco=w.endereco or {},
        ativo=w.ativo,
    )


def _get_workspace_or_404(workspace_id: uuid.UUID, db: Session) -> Workspace:
    w = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace não encontrado")
    return w


@router.get("", response_model=list[WorkspaceOut])
def listar_workspaces(
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    q = db.query(Workspace)
    if usuario.role != RoleUsuario.platform_admin:
        q = q.filter(Workspace.ativo.is_(True))
    return [_workspace_out(w) for w in q.all()]


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def criar_workspace(
    payload: WorkspaceIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    w = Workspace(
        nome=payload.nome,
        razao_social=payload.razao_social,
        cnpj=payload.cnpj,
        endereco=payload.endereco,
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return _workspace_out(w)


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def detalhe_workspace(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    w = _get_workspace_or_404(workspace_id, db)
    return _workspace_out(w)


@router.put("/{workspace_id}", response_model=WorkspaceOut)
def atualizar_workspace(
    workspace_id: uuid.UUID,
    payload: WorkspaceIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    w = _get_workspace_or_404(workspace_id, db)
    w.nome = payload.nome
    w.razao_social = payload.razao_social
    w.cnpj = payload.cnpj
    w.endereco = payload.endereco
    db.commit()
    db.refresh(w)
    return _workspace_out(w)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar_workspace(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    w = _get_workspace_or_404(workspace_id, db)
    w.ativo = False
    db.commit()

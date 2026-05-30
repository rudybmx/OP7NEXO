import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin, get_usuario_atual, get_workspace_atual, verificar_acesso_workspace
from app.models.user import RoleUsuario, User
from app.models.workspace import Workspace

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


from app.schemas.workspace import WorkspaceIn, WorkspaceOut, WorkspaceStatusIn

def _get_modulos(workspace_id: uuid.UUID, db: Session) -> list[str]:
    rows = db.execute(
        text("SELECT modulo FROM workspace_modules WHERE workspace_id = :id AND ativo = true"),
        {"id": str(workspace_id)},
    ).fetchall()
    return [r[0] for r in rows]


def _workspace_out(w: Workspace, db: Session) -> WorkspaceOut:
    return WorkspaceOut(
        id=str(w.id),
        nome=w.nome,
        razao_social=w.razao_social,
        cnpj=w.cnpj,
        endereco=w.endereco or {},
        ativo=w.ativo,
        modulos=_get_modulos(w.id, db),
    )


def _salvar_modulos(workspace_id: uuid.UUID, modulos: list[str], db: Session) -> None:
    db.execute(
        text("DELETE FROM workspace_modules WHERE workspace_id = :id"),
        {"id": str(workspace_id)},
    )
    for modulo in modulos:
        db.execute(
            text("INSERT INTO workspace_modules (workspace_id, modulo) VALUES (:id, :modulo)"),
            {"id": str(workspace_id), "modulo": modulo},
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
    workspace_acesso=Depends(get_workspace_atual),
):
    q = db.query(Workspace)
    if workspace_acesso is None:
        pass  # platform_admin — sem filtro
    elif isinstance(workspace_acesso, list):
        q = q.filter(Workspace.id.in_(workspace_acesso), Workspace.ativo.is_(True))
    else:
        q = q.filter(Workspace.id == workspace_acesso, Workspace.ativo.is_(True))
    return [_workspace_out(w, db) for w in q.all()]


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
    if payload.modulos:
        _salvar_modulos(w.id, payload.modulos, db)
        db.commit()
    return _workspace_out(w, db)


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def detalhe_workspace(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    w = _get_workspace_or_404(workspace_id, db)
    verificar_acesso_workspace(usuario, workspace_id, db)
    return _workspace_out(w, db)


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
    _salvar_modulos(w.id, payload.modulos, db)
    db.commit()
    db.refresh(w)
    return _workspace_out(w, db)


@router.patch("/{workspace_id}/status", response_model=WorkspaceOut)
def atualizar_status_workspace(
    workspace_id: uuid.UUID,
    payload: WorkspaceStatusIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    w = _get_workspace_or_404(workspace_id, db)
    w.ativo = payload.ativo
    db.commit()
    db.refresh(w)
    return _workspace_out(w, db)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar_workspace(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    w = _get_workspace_or_404(workspace_id, db)
    w.ativo = False
    db.commit()

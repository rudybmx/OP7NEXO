import uuid
from typing import Union

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verificar_token
from app.models.user import RoleUsuario, User
from app.models.user_company_access import UserCompanyAccess
from app.models.user_workspace_access import UserWorkspaceAccess
from app.models.workspace import Workspace

_bearer = HTTPBearer()


def get_usuario_atual(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = verificar_token(token)
        usuario_id: str = payload.get("sub")
        if not usuario_id:
            raise ValueError
        usuario_uuid = uuid.UUID(str(usuario_id))
    except (JWTError, ValueError, TypeError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
        )

    usuario = db.query(User).filter(User.id == usuario_uuid, User.ativo.is_(True)).first()
    if not usuario:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")

    return usuario


def exigir_platform_admin(usuario: User = Depends(get_usuario_atual)) -> User:
    if usuario.role != RoleUsuario.platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a platform_admin")
    return usuario


def listar_workspaces_autorizados(usuario: User, db: Session) -> list[Workspace]:
    if usuario.role == RoleUsuario.platform_admin:
        return (
            db.query(Workspace)
            .filter(Workspace.ativo.is_(True))
            .order_by(Workspace.nome)
            .all()
        )

    workspaces = (
        db.query(Workspace)
        .join(UserWorkspaceAccess, UserWorkspaceAccess.workspace_id == Workspace.id)
        .filter(
            UserWorkspaceAccess.user_id == usuario.id,
            UserWorkspaceAccess.ativo.is_(True),
            Workspace.ativo.is_(True),
        )
        .order_by(Workspace.nome)
        .all()
    )
    if workspaces:
        return workspaces

    if usuario.workspace_id is not None:
        workspace = (
            db.query(Workspace)
            .filter(Workspace.id == usuario.workspace_id, Workspace.ativo.is_(True))
            .first()
        )
        if workspace:
            return [workspace]

    return []


def get_workspace_atual(
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
) -> Union[uuid.UUID, list, None]:
    if usuario.role == RoleUsuario.platform_admin:
        return None

    workspaces = listar_workspaces_autorizados(usuario, db)
    if not workspaces:
        return []
    if len(workspaces) == 1:
        return workspaces[0].id
    return [w.id for w in workspaces]


def verificar_acesso_workspace(
    usuario: User,
    workspace_id: uuid.UUID,
    db: Session,
) -> None:
    if usuario.role == RoleUsuario.platform_admin:
        return

    workspaces = listar_workspaces_autorizados(usuario, db)
    if any(w.id == workspace_id for w in workspaces):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a este workspace")


def verificar_acesso_company(
    usuario: User,
    company_id: uuid.UUID,
    db: Session,
) -> None:
    """Levanta 403 se o usuário não tiver acesso à company."""
    if usuario.role == RoleUsuario.platform_admin:
        return

    if usuario.role in (RoleUsuario.network_admin,):
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company or company.network_id != usuario.network_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a esta company")
        return

    # network_viewer, company_admin, company_agent — verifica user_company_access
    acesso = db.query(UserCompanyAccess).filter(
        UserCompanyAccess.usuario_id == usuario.id,
        UserCompanyAccess.company_id == company_id,
    ).first()
    if not acesso:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a esta company")

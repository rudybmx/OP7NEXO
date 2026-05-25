import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    exigir_platform_admin,
    get_usuario_atual,
    listar_workspaces_autorizados,
    verificar_acesso_company,
)
from app.core.security import hash_senha
from app.models.company import Company
from app.models.user import RoleUsuario, User
from app.models.user_company_access import UserCompanyAccess
from app.models.user_workspace_access import UserWorkspaceAccess
from app.models.workspace import Workspace
from app.schemas.user import UsuarioIn, UsuarioAtualizarIn, AcessoIn, WorkspaceAcessoIn, WorkspaceRoleIn, WorkspaceAcessoOut, UsuarioOut, UsuarioAdminOut

router = APIRouter(tags=["users"])

# Roles que podem ser criadas por cada perfil
_ROLES_PERMITIDAS: dict[RoleUsuario, set[RoleUsuario]] = {
    RoleUsuario.platform_admin: set(RoleUsuario),
    RoleUsuario.network_admin: {
        RoleUsuario.network_viewer,
        RoleUsuario.company_admin,
        RoleUsuario.company_agent,
    },
    RoleUsuario.company_admin: {RoleUsuario.company_agent},
}


def _usuario_out(u: User) -> UsuarioOut:
    return UsuarioOut(
        id=str(u.id),
        network_id=str(u.network_id) if u.network_id else None,
        nome=u.nome,
        email=u.email,
        role=u.role.value,
        ativo=u.ativo,
    )

def _get_company_or_404(company_id: uuid.UUID, db: Session) -> Company:
    c = db.query(Company).filter(Company.id == company_id, Company.ativo.is_(True)).first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company não encontrada")
    return c

def _get_usuario_or_404(usuario_id: uuid.UUID, db: Session) -> User:
    u = db.query(User).filter(User.id == usuario_id).first()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    return u

def _get_workspace_or_404(workspace_id: uuid.UUID, db: Session) -> Workspace:
    w = db.query(Workspace).filter(Workspace.id == workspace_id, Workspace.ativo.is_(True)).first()
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace não encontrado")
    return w

def _verificar_pode_criar_role(criador: User, role_alvo: RoleUsuario) -> None:
    permitidas = _ROLES_PERMITIDAS.get(criador.role, set())
    if role_alvo not in permitidas:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Seu perfil não pode criar usuários com role '{role_alvo.value}'",
        )

def _usuario_admin_out(u: User, workspace_id: uuid.UUID | None, workspace_nome: str | None) -> UsuarioAdminOut:
    return UsuarioAdminOut(
        id=str(u.id),
        nome=u.nome,
        email=u.email,
        role=u.role.value,
        workspace_id=str(workspace_id) if workspace_id else None,
        workspace_nome=workspace_nome,
        ativo=u.ativo,
    )

def _criar_usuario_admin(payload: UsuarioIn, db: Session) -> UsuarioAdminOut:
    nome = payload.nome.strip()
    email = str(payload.email).strip().lower()
    if not nome:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome é obrigatório")
    if len(payload.senha) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha deve ter no mínimo 6 caracteres")

    workspace = _get_workspace_or_404(payload.workspace_id, db) if payload.workspace_id else None

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")

    novo = User(
        nome=nome,
        email=email,
        senha_hash=hash_senha(payload.senha),
        role=payload.role,
        workspace_id=workspace.id if workspace else None,
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return _usuario_admin_out(novo, novo.workspace_id, workspace.nome if workspace else None)

@router.get("/usuarios", response_model=list[UsuarioAdminOut])
def listar_usuarios_admin(
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    if usuario.role not in (RoleUsuario.platform_admin, RoleUsuario.company_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    base_sql = """
        SELECT
            u.id::text AS id,
            u.nome,
            u.email,
            u.role::text AS role,
            u.ativo,
            u.workspace_id::text AS workspace_id,
            w.nome AS workspace_nome
        FROM users u
        LEFT JOIN workspaces w ON w.id = u.workspace_id
    """
    if usuario.role == RoleUsuario.company_admin:
        rows = db.execute(
            text(base_sql + " WHERE u.workspace_id = :ws_id ORDER BY u.criado_em DESC"),
            {"ws_id": str(usuario.workspace_id)},
        ).mappings()
    else:
        rows = db.execute(
            text(base_sql + " ORDER BY u.criado_em DESC"),
        ).mappings()

    return [UsuarioAdminOut(**row) for row in rows]

@router.post("/usuarios", response_model=UsuarioAdminOut, status_code=status.HTTP_201_CREATED)
def criar_usuario_admin(
    payload: UsuarioIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    return _criar_usuario_admin(payload, db)

@router.post("/auth/registro-usuario", response_model=UsuarioAdminOut, status_code=status.HTTP_201_CREATED)
def registro_usuario_admin(
    payload: UsuarioIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    return _criar_usuario_admin(payload, db)

@router.get("/companies/{company_id}/users", response_model=list[UsuarioOut])
def listar_usuarios(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    _get_company_or_404(company_id, db)
    verificar_acesso_company(usuario, company_id, db)

    acessos = db.query(UserCompanyAccess).filter(UserCompanyAccess.company_id == company_id).all()
    ids = [a.usuario_id for a in acessos]
    usuarios = db.query(User).filter(User.id.in_(ids), User.ativo.is_(True)).all()
    return [_usuario_out(u) for u in usuarios]

@router.post(
    "/companies/{company_id}/users",
    response_model=UsuarioOut,
    status_code=status.HTTP_201_CREATED,
)
def criar_usuario(
    company_id: uuid.UUID,
    payload: UsuarioIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    company = _get_company_or_404(company_id, db)
    verificar_acesso_company(usuario, company_id, db)
    _verificar_pode_criar_role(usuario, payload.role)

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")

    novo = User(
        network_id=company.network_id,
        nome=payload.nome,
        email=payload.email,
        senha_hash=hash_senha(payload.senha),
        role=payload.role,
    )
    db.add(novo)
    db.flush()

    # Vincula à company automaticamente
    acesso = UserCompanyAccess(usuario_id=novo.id, company_id=company_id)
    db.add(acesso)
    db.commit()
    db.refresh(novo)
    return _usuario_out(novo)

@router.put("/users/{usuario_id}", response_model=UsuarioOut)
def atualizar_usuario(
    usuario_id: uuid.UUID,
    payload: UsuarioAtualizarIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    alvo = _get_usuario_or_404(usuario_id, db)

    # Pode editar a si mesmo ou ter permissão sobre a network/platform
    eh_si_mesmo = alvo.id == usuario.id
    eh_superior = (
        usuario.role == RoleUsuario.platform_admin
        or (usuario.role == RoleUsuario.network_admin and alvo.network_id == usuario.network_id)
    )
    if not eh_si_mesmo and not eh_superior:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para editar este usuário")

    if payload.nome is not None:
        alvo.nome = payload.nome
    if payload.email is not None:
        conflito = db.query(User).filter(User.email == payload.email, User.id != usuario_id).first()
        if conflito:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")
        alvo.email = payload.email
    if payload.senha is not None:
        alvo.senha_hash = hash_senha(payload.senha)
    if payload.role is not None and eh_superior:
        _verificar_pode_criar_role(usuario, payload.role)
        alvo.role = payload.role
    if payload.ativo is not None and eh_superior:
        alvo.ativo = payload.ativo

    db.commit()
    db.refresh(alvo)
    return _usuario_out(alvo)

@router.delete("/users/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar_usuario(
    usuario_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    alvo = _get_usuario_or_404(usuario_id, db)

    eh_superior = (
        usuario.role == RoleUsuario.platform_admin
        or (usuario.role == RoleUsuario.network_admin and alvo.network_id == usuario.network_id)
    )
    if not eh_superior:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para desativar este usuário")

    alvo.ativo = False
    db.commit()

@router.get("/me/workspaces", response_model=list[WorkspaceAcessoOut])
def listar_meus_workspaces(
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    if usuario.role == RoleUsuario.platform_admin:
        wss = db.query(Workspace).filter(Workspace.ativo.is_(True)).order_by(Workspace.nome).all()
        return [
            WorkspaceAcessoOut(
                workspace_id=str(w.id),
                workspace_nome=w.nome,
                role="admin",
                ativo=True,
                criado_em="",
                padrao=False,
            )
            for w in wss
        ]

    workspaces = listar_workspaces_autorizados(usuario, db)
    return [
        WorkspaceAcessoOut(
            workspace_id=str(w.id),
            workspace_nome=w.nome,
            role=usuario.role.value,
            ativo=True,
            criado_em="",
            padrao=str(usuario.workspace_id) == str(w.id),
        )
        for w in workspaces
    ]

@router.get("/users/{usuario_id}/workspaces", response_model=list[WorkspaceAcessoOut])
def listar_workspaces_usuario(
    usuario_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    alvo = _get_usuario_or_404(usuario_id, db)
    rows = db.execute(
        text("""
            SELECT uwa.workspace_id::text, w.nome AS workspace_nome, uwa.role, uwa.ativo,
                   uwa.criado_em::text
            FROM user_workspace_access uwa
            JOIN workspaces w ON w.id = uwa.workspace_id
            WHERE uwa.user_id = :uid
            ORDER BY w.nome
        """),
        {"uid": str(alvo.id)},
    ).mappings().all()
    return [
        WorkspaceAcessoOut(
            workspace_id=row["workspace_id"],
            workspace_nome=row["workspace_nome"],
            role=row["role"],
            ativo=row["ativo"],
            criado_em=str(row["criado_em"]),
            padrao=row["workspace_id"] == str(alvo.workspace_id),
        )
        for row in rows
    ]

@router.post("/users/{usuario_id}/workspaces", response_model=WorkspaceAcessoOut, status_code=status.HTTP_201_CREATED)
def adicionar_workspace_usuario(
    usuario_id: uuid.UUID,
    payload: WorkspaceAcessoIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    alvo = _get_usuario_or_404(usuario_id, db)
    ws = _get_workspace_or_404(payload.workspace_id, db)

    existing = db.query(UserWorkspaceAccess).filter(
        UserWorkspaceAccess.user_id == alvo.id,
        UserWorkspaceAccess.workspace_id == ws.id,
    ).first()

    if existing:
        existing.role = payload.role
        existing.ativo = True
    else:
        existing = UserWorkspaceAccess(
            user_id=alvo.id,
            workspace_id=ws.id,
            role=payload.role,
        )
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return WorkspaceAcessoOut(
        workspace_id=str(existing.workspace_id),
        workspace_nome=ws.nome,
        role=existing.role,
        ativo=existing.ativo,
        criado_em=existing.criado_em.isoformat(),
        padrao=str(alvo.workspace_id) == str(ws.id),
    )

@router.patch("/users/{usuario_id}/workspaces/{workspace_id}", response_model=WorkspaceAcessoOut)
def atualizar_role_workspace(
    usuario_id: uuid.UUID,
    workspace_id: uuid.UUID,
    payload: WorkspaceRoleIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    alvo = _get_usuario_or_404(usuario_id, db)
    uwa = db.query(UserWorkspaceAccess).filter(
        UserWorkspaceAccess.user_id == alvo.id,
        UserWorkspaceAccess.workspace_id == workspace_id,
    ).first()
    if not uwa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acesso não encontrado")

    uwa.role = payload.role
    db.commit()
    db.refresh(uwa)

    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    return WorkspaceAcessoOut(
        workspace_id=str(uwa.workspace_id),
        workspace_nome=ws.nome if ws else None,
        role=uwa.role,
        ativo=uwa.ativo,
        criado_em=uwa.criado_em.isoformat(),
        padrao=str(alvo.workspace_id) == str(workspace_id),
    )

@router.delete("/users/{usuario_id}/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_workspace_usuario(
    usuario_id: uuid.UUID,
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    alvo = _get_usuario_or_404(usuario_id, db)
    uwa = db.query(UserWorkspaceAccess).filter(
        UserWorkspaceAccess.user_id == alvo.id,
        UserWorkspaceAccess.workspace_id == workspace_id,
    ).first()
    if not uwa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acesso não encontrado")
    db.delete(uwa)
    db.commit()

@router.patch("/users/{usuario_id}/workspace-padrao/{workspace_id}", response_model=dict)
def definir_workspace_padrao(
    usuario_id: uuid.UUID,
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    alvo = _get_usuario_or_404(usuario_id, db)
    ws = _get_workspace_or_404(workspace_id, db)

    # Workspace must be in user's access list (or platform_admin can set any)
    uwa = db.query(UserWorkspaceAccess).filter(
        UserWorkspaceAccess.user_id == alvo.id,
        UserWorkspaceAccess.workspace_id == ws.id,
    ).first()
    if not uwa:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuário não tem acesso a este workspace")

    alvo.workspace_id = ws.id
    db.commit()
    return {"workspace_id": str(ws.id), "workspace_nome": ws.nome}

@router.post("/users/{usuario_id}/access", status_code=status.HTTP_200_OK)
def vincular_companies(
    usuario_id: uuid.UUID,
    payload: AcessoIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    alvo = _get_usuario_or_404(usuario_id, db)

    if alvo.role != RoleUsuario.network_viewer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Endpoint só aplicável a usuários com role 'network_viewer'",
        )

    # Quem pode vincular: platform_admin ou network_admin da mesma network
    eh_superior = (
        usuario.role == RoleUsuario.platform_admin
        or (usuario.role == RoleUsuario.network_admin and alvo.network_id == usuario.network_id)
    )
    if not eh_superior:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para vincular companies")

    # Valida que todas as companies pertencem à network do usuário alvo
    companies = db.query(Company).filter(Company.id.in_(payload.company_ids)).all()
    ids_validos = {c.id for c in companies if c.network_id == alvo.network_id}
    invalidos = [str(cid) for cid in payload.company_ids if cid not in ids_validos]
    if invalidos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Companies inválidas ou de outra network: {invalidos}",
        )

    adicionados = 0
    for cid in ids_validos:
        existe = db.query(UserCompanyAccess).filter(
            UserCompanyAccess.usuario_id == usuario_id,
            UserCompanyAccess.company_id == cid,
        ).first()
        if not existe:
            db.add(UserCompanyAccess(usuario_id=usuario_id, company_id=cid))
            adicionados += 1

    db.commit()
    return {"adicionados": adicionados, "total_vinculados": len(ids_validos)}

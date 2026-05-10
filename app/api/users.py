import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin, get_usuario_atual, verificar_acesso_company
from app.core.security import hash_senha
from app.models.company import Company
from app.models.user import RoleUsuario, User
from app.models.user_company_access import UserCompanyAccess
from app.models.workspace import Workspace

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


class UsuarioIn(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    role: RoleUsuario
    workspace_id: uuid.UUID | None = None


class UsuarioAtualizarIn(BaseModel):
    nome: str | None = None
    email: EmailStr | None = None
    senha: str | None = None
    role: RoleUsuario | None = None
    ativo: bool | None = None


class AcessoIn(BaseModel):
    company_ids: list[uuid.UUID]


class UsuarioOut(BaseModel):
    id: str
    network_id: str | None
    nome: str
    email: str
    role: str
    ativo: bool

    model_config = {"from_attributes": True}


class UsuarioAdminOut(BaseModel):
    id: str
    nome: str
    email: str
    role: str
    workspace_id: str | None
    workspace_nome: str | None
    ativo: bool

    model_config = {"from_attributes": True}


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
    )
    db.add(novo)
    db.flush()

    if workspace:
        db.execute(
            text(
                """
                INSERT INTO user_resource_access (user_id, resource_type, resource_id)
                VALUES (:user_id, 'workspace', :workspace_id)
                ON CONFLICT (user_id, resource_type, resource_id) DO NOTHING
                """
            ),
            {"user_id": str(novo.id), "workspace_id": str(workspace.id)},
        )

    db.commit()
    db.refresh(novo)
    return _usuario_admin_out(novo, workspace.id if workspace else None, workspace.nome if workspace else None)


@router.get("/usuarios", response_model=list[UsuarioAdminOut])
def listar_usuarios_admin(
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    rows = db.execute(
        text(
            """
            SELECT
                u.id::text AS id,
                u.nome,
                u.email,
                u.role::text AS role,
                u.ativo,
                ura.resource_id::text AS workspace_id,
                w.nome AS workspace_nome
            FROM users u
            LEFT JOIN LATERAL (
                SELECT resource_id
                FROM user_resource_access
                WHERE user_id = u.id
                  AND resource_type = 'workspace'
                ORDER BY criado_em DESC
                LIMIT 1
            ) ura ON TRUE
            LEFT JOIN workspaces w ON w.id = ura.resource_id
            ORDER BY u.criado_em DESC
            """
        )
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

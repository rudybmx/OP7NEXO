from pydantic import BaseModel, EmailStr

from app.models.user import RoleUsuario


class UsuarioIn(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    role: RoleUsuario = RoleUsuario.company_agent
    workspace_id: str | None = None
    ativo: bool = True
    pode_atender_canais: bool = False
    pode_acessar_crm: bool = False


class UsuarioAtualizarIn(BaseModel):
    nome: str | None = None
    email: EmailStr | None = None
    senha: str | None = None
    role: RoleUsuario | None = None
    ativo: bool | None = None
    pode_atender_canais: bool | None = None
    pode_acessar_crm: bool | None = None


class AcessoIn(BaseModel):
    company_ids: list[str]


class WorkspaceAcessoIn(BaseModel):
    workspace_id: str
    role: str = "viewer"


class WorkspaceRoleIn(BaseModel):
    role: str


class WorkspaceAcessoOut(BaseModel):
    workspace_id: str
    workspace_nome: str
    role: str
    ativo: bool
    criado_em: str
    padrao: bool


class UsuarioOut(BaseModel):
    id: str
    nome: str
    email: str
    role: str
    ativo: bool
    workspace_id: str | None = None
    workspace_nome: str | None = None
    pode_atender_canais: bool = False
    pode_acessar_crm: bool = False

    model_config = {"from_attributes": True}


class UsuarioAdminOut(BaseModel):
    id: str
    nome: str
    email: str
    role: str
    ativo: bool
    workspace_id: str | None = None
    workspace_nome: str | None = None
    pode_atender_canais: bool = False
    pode_acessar_crm: bool = False

    model_config = {"from_attributes": True}

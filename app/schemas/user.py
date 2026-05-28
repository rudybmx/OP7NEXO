from pydantic import BaseModel, EmailStr


class UsuarioIn(BaseModel):
    nome: str
    email: EmailStr
    role: str = "company_agent"
    workspace_id: str | None = None
    ativo: bool = True


class UsuarioAtualizarIn(BaseModel):
    nome: str | None = None
    email: EmailStr | None = None
    role: str | None = None
    ativo: bool | None = None


class AcessoIn(BaseModel):
    company_ids: list[str]


class WorkspaceAcessoIn(BaseModel):
    workspace_id: str


class WorkspaceRoleIn(BaseModel):
    workspace_id: str
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

    model_config = {"from_attributes": True}


class UsuarioAdminOut(BaseModel):
    id: str
    nome: str
    email: str
    role: str
    ativo: bool
    workspace_id: str | None = None

    model_config = {"from_attributes": True}

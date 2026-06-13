from pydantic import BaseModel


class WorkspaceIn(BaseModel):
    nome: str
    razao_social: str | None = None
    cnpj: str | None = None
    telefone_principal: str | None = None
    telefone_responsavel: str | None = None
    endereco: dict = {}
    modulos: list[str] = []


class WorkspaceOut(BaseModel):
    id: str
    nome: str
    razao_social: str | None
    cnpj: str | None
    telefone_principal: str | None = None
    telefone_responsavel: str | None = None
    endereco: dict
    ativo: bool
    modulos: list[str] = []

    model_config = {"from_attributes": True}


class WorkspaceStatusIn(BaseModel):
    ativo: bool

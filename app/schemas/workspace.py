from pydantic import BaseModel


class WorkspaceIn(BaseModel):
    nome: str
    razao_social: str | None = None
    cnpj: str | None = None
    endereco: dict = {}
    modulos: list[str] = []


class WorkspaceOut(BaseModel):
    id: str
    nome: str
    razao_social: str | None
    cnpj: str | None
    endereco: dict
    ativo: bool
    modulos: list[str] = []

    model_config = {"from_attributes": True}

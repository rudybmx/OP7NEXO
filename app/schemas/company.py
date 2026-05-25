from pydantic import BaseModel


class CompanyIn(BaseModel):
    network_id: str
    nome: str
    cnpj: str | None = None


class CompanyOut(BaseModel):
    id: str
    network_id: str
    nome: str
    cnpj: str | None
    ativo: bool

    model_config = {"from_attributes": True}

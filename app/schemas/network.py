from pydantic import BaseModel


class NetworkIn(BaseModel):
    nome: str


class NetworkOut(BaseModel):
    id: str
    nome: str
    ativo: bool

    model_config = {"from_attributes": True}

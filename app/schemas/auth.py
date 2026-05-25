from pydantic import BaseModel, EmailStr


class RegistroIn(BaseModel):
    nome: str
    email: EmailStr
    senha: str


class LoginIn(BaseModel):
    email: EmailStr
    senha: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UsuarioOut(BaseModel):
    id: str
    nome: str
    email: str
    role: str
    ativo: bool

    model_config = {"from_attributes": True}

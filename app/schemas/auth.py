from pydantic import BaseModel, EmailStr


class RegistroIn(BaseModel):
    nome: str
    email: EmailStr
    senha: str


class LoginIn(BaseModel):
    email: EmailStr
    senha: str
    remember: bool = False


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 0  # segundos até expirar


class UsuarioOut(BaseModel):
    id: str
    nome: str
    email: str
    role: str
    ativo: bool

    model_config = {"from_attributes": True}

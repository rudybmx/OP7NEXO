from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_usuario_atual
from app.core.security import criar_token, hash_senha, verificar_senha
from app.models.user import RoleUsuario, User
from app.schemas.auth import RegistroIn, LoginIn, TokenOut, UsuarioOut


router = APIRouter(prefix="/auth", tags=["auth"])




@router.post("/registro", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def registro(payload: RegistroIn, db: Session = Depends(get_db)):
    total = db.query(User).count()
    if total > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registro inicial já realizado. Use convite para novos usuários.",
        )

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")

    usuario = User(
        nome=payload.nome,
        email=payload.email,
        senha_hash=hash_senha(payload.senha),
        role=RoleUsuario.platform_admin,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return UsuarioOut(id=str(usuario.id), nome=usuario.nome, email=usuario.email, role=usuario.role.value, ativo=usuario.ativo)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    usuario = db.query(User).filter(User.email == payload.email, User.ativo.is_(True)).first()
    if not usuario or not verificar_senha(payload.senha, usuario.senha_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    # "Manter logado": 30 dias; caso contrário, expiração padrão (24h).
    minutos = 43200 if payload.remember else settings.JWT_EXPIRE_MINUTES
    token = criar_token(
        {
            "sub": str(usuario.id),
            "role": usuario.role.value,
            "workspace_id": str(usuario.workspace_id) if usuario.workspace_id else None,
        },
        expira_minutos=minutos,
    )
    return TokenOut(access_token=token, expires_in=minutos * 60)


@router.get("/me", response_model=UsuarioOut)
def me(usuario: User = Depends(get_usuario_atual)):
    return UsuarioOut(id=str(usuario.id), nome=usuario.nome, email=usuario.email, role=usuario.role.value, ativo=usuario.ativo)

"""Brand Kit do workspace — /design/brand-kit (identidade de marca persistida).

Um kit por workspace: cores, fonte, tom de voz, regras visuais e logo. O
`/design/gerar` carrega esse kit e aplica a marca automaticamente em toda
geração (ver `app/services/brand_kit.py`).
"""
import base64
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_usuario_atual, verificar_acesso_workspace
from app.models.criativo import CriativoBrandKit, CriativoLogo
from app.models.user import User
from app.services import brand_kit as bk_service
from app.services.object_storage import public_url, put_bytes
from app.services.upload_validation import validar_e_normalizar_imagem

router = APIRouter(prefix="/design", tags=["design-brand-kit"])

_BUCKET = settings.MINIO_BUCKET_CRIATIVOS


def _get_or_create(db: Session, workspace_id: uuid.UUID) -> CriativoBrandKit:
    bk = bk_service.obter_modelo(db, workspace_id)
    if not bk:
        bk = CriativoBrandKit(workspace_id=workspace_id)
        db.add(bk)
        db.commit()
        db.refresh(bk)
    return bk


@router.get("/brand-kit")
def obter(
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Brand kit do workspace (ou defaults vazios)."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    return bk_service.serializar(db, bk_service.obter_modelo(db, workspace_id))


class BrandKitIn(BaseModel):
    workspace_id: uuid.UUID
    primary_color: str | None = Field(default=None, max_length=20)
    secondary_color: str | None = Field(default=None, max_length=20)
    font_family: str | None = Field(default=None, max_length=120)
    tone_of_voice: str | None = Field(default=None, max_length=120)
    visual_rules: str | None = Field(default=None, max_length=2000)
    forbidden_rules: str | None = Field(default=None, max_length=2000)


@router.put("/brand-kit")
def salvar(
    payload: BrandKitIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Upsert do brand kit (um por workspace)."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    bk = _get_or_create(db, payload.workspace_id)
    for campo in bk_service.CAMPOS:
        valor = getattr(payload, campo)
        setattr(bk, campo, valor.strip() if isinstance(valor, str) and valor.strip() else None)
    db.commit()
    db.refresh(bk)
    return bk_service.serializar(db, bk)


class LogoIn(BaseModel):
    workspace_id: uuid.UUID
    image_base64: str
    nome: str = Field(default="logo", max_length=120)


@router.post("/brand-kit/logo", status_code=status.HTTP_201_CREATED)
def upload_logo(
    payload: LogoIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Sobe a logo do workspace (preserva transparência) e vincula ao brand kit."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    try:
        raw = base64.b64decode(payload.image_base64.split(",")[-1])
        norm, mime, w, h = validar_e_normalizar_imagem(raw, error_code="invalid_logo")
    except Exception:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Imagem de logo inválida")

    bk = _get_or_create(db, payload.workspace_id)
    logo = CriativoLogo(
        workspace_id=payload.workspace_id,
        nome=(payload.nome.strip() or "logo"),
        arquivo_url="",
        variant="primary",
        width=w,
        height=h,
        mime_type=mime,
    )
    db.add(logo)
    db.commit()
    db.refresh(logo)

    object_name = bk_service.logo_object_name(payload.workspace_id, logo.id)
    put_bytes(_BUCKET, object_name, norm, "image/png")
    logo.arquivo_url = public_url(_BUCKET, object_name)

    # Desativa a logo anterior (soft) e aponta o kit para a nova.
    if bk.logo_id and bk.logo_id != logo.id:
        antiga = db.query(CriativoLogo).filter(CriativoLogo.id == bk.logo_id).first()
        if antiga:
            antiga.ativo = False
    bk.logo_id = logo.id
    db.commit()
    return {"logo_url": logo.arquivo_url}


@router.delete("/brand-kit/logo")
def remover_logo(
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Desvincula a logo do brand kit (soft-delete do asset)."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    bk = bk_service.obter_modelo(db, workspace_id)
    if bk and bk.logo_id:
        antiga = db.query(CriativoLogo).filter(CriativoLogo.id == bk.logo_id).first()
        if antiga:
            antiga.ativo = False
        bk.logo_id = None
        db.commit()
    return {"ok": True}

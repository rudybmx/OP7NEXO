import secrets
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin, get_usuario_atual
from app.models.canal_entrada import CanalEntrada
from app.models.user import User
from app.models.workspace import Workspace

router = APIRouter(tags=["canais"])

TIPOS_VALIDOS = Literal[
    "whatsapp_evolution", "whatsapp_oficial", "instagram", "facebook", "webhook"
]


class CanalIn(BaseModel):
    tipo: TIPOS_VALIDOS
    nome: str
    config: dict = {}
    mensagem_boas_vindas: str | None = None
    status: str = "inativo"


class CanalUpdate(BaseModel):
    nome: str
    config: dict = {}
    mensagem_boas_vindas: str | None = None
    status: str


class CanalOut(BaseModel):
    id: str
    workspace_id: str
    tipo: str
    nome: str
    config: dict
    mensagem_boas_vindas: str | None
    webhook_token: str | None
    status: str

    model_config = {"from_attributes": True}


def _canal_out(c: CanalEntrada) -> CanalOut:
    return CanalOut(
        id=str(c.id),
        workspace_id=str(c.workspace_id),
        tipo=c.tipo,
        nome=c.nome,
        config=c.config or {},
        mensagem_boas_vindas=c.mensagem_boas_vindas,
        webhook_token=c.webhook_token,
        status=c.status,
    )


def _get_canal_or_404(canal_id: uuid.UUID, db: Session) -> CanalEntrada:
    c = db.query(CanalEntrada).filter(CanalEntrada.id == canal_id).first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canal não encontrado")
    return c


def _get_workspace_or_404(workspace_id: uuid.UUID, db: Session) -> Workspace:
    w = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace não encontrado")
    return w


@router.get("/canais", response_model=list[CanalOut])
def listar_todos_canais(
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    return [_canal_out(c) for c in db.query(CanalEntrada).all()]


@router.get("/workspaces/{workspace_id}/canais", response_model=list[CanalOut])
def listar_canais(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    _get_workspace_or_404(workspace_id, db)
    canais = db.query(CanalEntrada).filter(CanalEntrada.workspace_id == workspace_id).all()
    return [_canal_out(c) for c in canais]


@router.post(
    "/workspaces/{workspace_id}/canais",
    response_model=CanalOut,
    status_code=status.HTTP_201_CREATED,
)
def criar_canal(
    workspace_id: uuid.UUID,
    payload: CanalIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    _get_workspace_or_404(workspace_id, db)

    webhook_token = secrets.token_hex(32) if payload.tipo == "webhook" else None

    c = CanalEntrada(
        workspace_id=workspace_id,
        tipo=payload.tipo,
        nome=payload.nome,
        config=payload.config,
        mensagem_boas_vindas=payload.mensagem_boas_vindas,
        webhook_token=webhook_token,
        status=payload.status,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _canal_out(c)


@router.get("/canais/{canal_id}", response_model=CanalOut)
def detalhar_canal(
    canal_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    return _canal_out(_get_canal_or_404(canal_id, db))


@router.put("/canais/{canal_id}", response_model=CanalOut)
def atualizar_canal(
    canal_id: uuid.UUID,
    payload: CanalUpdate,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    c = _get_canal_or_404(canal_id, db)
    c.nome = payload.nome
    c.config = payload.config
    c.mensagem_boas_vindas = payload.mensagem_boas_vindas
    c.status = payload.status
    db.commit()
    db.refresh(c)
    return _canal_out(c)


@router.delete("/canais/{canal_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_canal(
    canal_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    c = _get_canal_or_404(canal_id, db)
    db.delete(c)
    db.commit()


@router.post("/webhook/{token}")
async def receber_webhook(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    canal = db.query(CanalEntrada).filter(CanalEntrada.webhook_token == token).first()
    if not canal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token inválido")

    print(f"[webhook] canal={canal.nome} workspace={canal.workspace_id} payload={payload}")
    return {"recebido": True}

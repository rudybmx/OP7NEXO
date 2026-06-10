"""Rotas do Estúdio de Criativos — /design/*.

Fase 1 (imagem). Esta fatia: geração da BASE visual via gpt-image-2 com SSE,
recuperação de estado por id e listagem de estilos. Montagem/export do criativo
final (template+logo+textos) e demais rotas vêm nas fatias seguintes.
"""
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.core.deps import get_usuario_atual, verificar_acesso_workspace
from app.models.criativo import CriativoEstilo, CriativoGeracao
from app.models.user import User
from app.services import image_gen

router = APIRouter(prefix="/design", tags=["design"])

_QUALITIES = {"low", "medium", "high", "auto"}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


class GerarBaseIn(BaseModel):
    workspace_id: uuid.UUID
    briefing: str = Field(min_length=1, max_length=4000)
    creative_format: Optional[str] = None
    estilo_id: Optional[uuid.UUID] = None
    quality: str = "low"


@router.get("/estilos")
def listar_estilos(
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Estilos globais (workspace_id NULL) + os do próprio workspace."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    rows = (
        db.query(CriativoEstilo)
        .filter(
            CriativoEstilo.ativo.is_(True),
            (CriativoEstilo.workspace_id.is_(None))
            | (CriativoEstilo.workspace_id == workspace_id),
        )
        .order_by(CriativoEstilo.workspace_id.isnot(None), CriativoEstilo.nome)
        .all()
    )
    return [
        {
            "id": str(e.id),
            "nome": e.nome,
            "thumb_url": e.thumb_url,
            "escopo": "workspace" if e.workspace_id else "global",
            "tom_default": e.tom_default,
            "formato_default": e.formato_default,
        }
        for e in rows
    ]


@router.post("/gerar-base")
def gerar_base(
    payload: GerarBaseIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Gera a BASE visual (gpt-image-2) via SSE.

    Eventos: generation.created → generation.completed | generation.failed.
    (partial images ficam para a fatia de streaming progressivo.)
    """
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    if payload.quality not in _QUALITIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "quality inválida")

    estilo_prompt = None
    if payload.estilo_id:
        estilo = (
            db.query(CriativoEstilo)
            .filter(CriativoEstilo.id == payload.estilo_id, CriativoEstilo.ativo.is_(True))
            .first()
        )
        if not estilo:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Estilo não encontrado")
        if estilo.workspace_id not in (None, payload.workspace_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Estilo de outro workspace")
        estilo_prompt = estilo.prompt_template

    # Snapshot de primitivos: o gerador roda numa sessão própria (a sessão do
    # request fecha ao terminar a função, antes do corpo SSE ser consumido).
    ws_id = payload.workspace_id
    user_id = usuario.id
    briefing = payload.briefing
    creative_format = payload.creative_format
    estilo_id = payload.estilo_id
    quality = payload.quality

    def stream():
        with SessionLocal() as gdb:
            ger = image_gen.criar_geracao(
                gdb,
                workspace_id=ws_id,
                user_id=user_id,
                briefing=briefing,
                creative_format=creative_format,
                estilo_id=estilo_id,
                estilo_prompt_template=estilo_prompt,
                quality=quality,
            )
            yield _sse("generation.created", {"generation_id": str(ger.id), "status": "pending"})

            image_gen.executar_geracao(gdb, ger)

            if ger.status == "done":
                yield _sse(
                    "generation.completed",
                    {
                        "generation_id": str(ger.id),
                        "base_image_url": ger.imagem_base_url,
                        "usage": ger.usage,
                    },
                )
            else:
                yield _sse(
                    "generation.failed",
                    {
                        "generation_id": str(ger.id),
                        "error_code": ger.error_code,
                        "error_message": ger.error_message,
                    },
                )

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/gerar-base/{generation_id}")
def obter_geracao(
    generation_id: uuid.UUID,
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Recupera estado/resultado de uma geração (reconexão após troca de tela)."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    ger = (
        db.query(CriativoGeracao)
        .filter(
            CriativoGeracao.id == generation_id,
            CriativoGeracao.workspace_id == workspace_id,
        )
        .first()
    )
    if not ger:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Geração não encontrada")
    return {
        "generation_id": str(ger.id),
        "status": ger.status,
        "base_image_url": ger.imagem_base_url,
        "creative_format": ger.creative_format,
        "generation_size": ger.generation_size,
        "usage": ger.usage,
        "error_code": ger.error_code,
        "error_message": ger.error_message,
    }

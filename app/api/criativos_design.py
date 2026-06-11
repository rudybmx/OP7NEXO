"""Rotas do Estúdio de Criativos — /design/*.

Fase 1 (imagem). Esta fatia: geração da BASE visual via gpt-image-2 com SSE,
recuperação de estado por id e listagem de estilos. Montagem/export do criativo
final (template+logo+textos) e demais rotas vêm nas fatias seguintes.
"""
import base64
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.core.deps import get_usuario_atual, verificar_acesso_workspace
from app.models.criativo import CriativoEstilo, CriativoGeracao, CriativoProjeto
from app.models.user import User
from app.services import criativo_render, image_gen
from app.services.object_storage import get_object, public_url, put_bytes
from app.services.upload_validation import validar_e_normalizar_imagem

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


class ExportarIn(BaseModel):
    workspace_id: uuid.UUID
    generation_id: uuid.UUID
    creative_format: Optional[str] = None
    layout: str = "inferior"
    headline: Optional[str] = ""
    subtitulo: Optional[str] = ""
    cta: Optional[str] = ""
    logo_base64: Optional[str] = None  # data URL ou base64 puro


@router.post("/exportar")
def exportar(
    payload: ExportarIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Monta o criativo final (base + logo + textos) e exporta no tamanho do canal.

    Render síncrono via Pillow (sem IA). Salva o PNG no MinIO e registra um
    `criativo_projetos`. Devolve a URL de download servida pela API.
    """
    verificar_acesso_workspace(usuario, payload.workspace_id, db)

    ger = (
        db.query(CriativoGeracao)
        .filter(
            CriativoGeracao.id == payload.generation_id,
            CriativoGeracao.workspace_id == payload.workspace_id,
        )
        .first()
    )
    if not ger or not ger.imagem_base_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Base não encontrada")

    bucket = settings.MINIO_BUCKET_CRIATIVOS
    base_name = f"workspaces/{ger.workspace_id}/criativos/bases/{ger.id}.png"
    try:
        base_bytes = get_object(bucket, base_name).read()
    except Exception:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo da base indisponível")

    logo_bytes = None
    if payload.logo_base64:
        try:
            raw = base64.b64decode(payload.logo_base64.split(",")[-1])
            logo_bytes, _, _, _ = validar_e_normalizar_imagem(raw, error_code="invalid_reference")
        except Exception:
            logo_bytes = None  # logo é best-effort no export

    fmt = payload.creative_format or ger.creative_format
    png = criativo_render.montar_criativo(
        base_bytes,
        creative_format=fmt,
        layout=payload.layout,
        headline=payload.headline or "",
        subtitulo=payload.subtitulo or "",
        cta=payload.cta or "",
        logo_bytes=logo_bytes,
    )

    out_name = f"workspaces/{ger.workspace_id}/criativos/exports/{ger.id}-{uuid.uuid4().hex}.png"
    put_bytes(bucket, out_name, png, "image/png")
    url = public_url(bucket, out_name)

    proj = CriativoProjeto(
        workspace_id=payload.workspace_id,
        user_id=usuario.id,
        geracao_id=ger.id,
        base_image_url=ger.imagem_base_url,
        creative_format=fmt,
        text_layers_json={
            "headline": payload.headline or "",
            "subtitulo": payload.subtitulo or "",
            "cta": payload.cta or "",
            "layout": payload.layout,
        },
        export_urls_json=[url],
        status="exportado",
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)

    return {"projeto_id": str(proj.id), "export_url": url}


def _decode_img(b64: str | None) -> bytes | None:
    """Decodifica + valida/normaliza uma imagem base64 (data URL ou pura)."""
    if not b64:
        return None
    try:
        raw = base64.b64decode(b64.split(",")[-1])
        norm, _, _, _ = validar_e_normalizar_imagem(raw, error_code="invalid_reference")
        return norm
    except Exception:
        return None


class GerarIn(BaseModel):
    workspace_id: uuid.UUID
    product: Optional[str] = None
    objective: Optional[str] = None
    audience: Optional[str] = None
    city: Optional[str] = None
    headline: Optional[str] = None
    subheadline: Optional[str] = None
    cta: Optional[str] = None
    footer: Optional[str] = None
    creative_format: Optional[str] = "feed_1x1"
    estilo: Optional[str] = None
    tone: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    cor_60: Optional[str] = None  # dominante (~60%)
    cor_30: Optional[str] = None  # secundária (~30%)
    cor_10: Optional[str] = None  # detalhe/acento (~10%)
    logo_mode: str = "compor"  # "compor" (logo real composta) | "integrar" (modelo desenha)
    briefing: Optional[str] = Field(default=None, max_length=4000)
    reference_usage: Optional[str] = "style_and_composition"
    creative_spec: Optional[dict] = None  # Modelo Reverso: spec extraído (e editado)
    densidade_ajuste: str = "fiel"  # "fiel" | "equilibrado" | "livre"
    force_real_logo: bool = False
    quality: str = "medium"
    densidade: str = "simples"  # "simples" | "rico"
    bullets: Optional[list[str]] = None
    selo: Optional[str] = None
    copy_extra: Optional[str] = Field(default=None, max_length=2000)
    logo_base64: Optional[str] = None
    referencia_base64: Optional[str] = None


@router.post("/gerar")
def gerar(
    payload: GerarIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Geração INTEGRADA (one-shot): gpt-image-2 renderiza a arte completa com
    texto + composição integrados, e a logo via multi-imagem (images.edit).

    Eventos SSE: generation.created → generation.completed | generation.failed.
    """
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    if payload.quality not in _QUALITIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "quality inválida")

    logo_bytes = _decode_img(payload.logo_base64)
    ref_bytes = _decode_img(payload.referencia_base64)

    spec = payload.model_dump(exclude={"workspace_id", "logo_base64", "referencia_base64"})
    ws_id = payload.workspace_id
    user_id = usuario.id
    tem_logo = bool(logo_bytes)
    tem_ref = bool(ref_bytes)

    def stream():
        with SessionLocal() as gdb:
            ger = image_gen.criar_geracao_integrada(
                gdb,
                workspace_id=ws_id,
                user_id=user_id,
                spec=spec,
                tem_logo=tem_logo,
                tem_referencia=tem_ref,
            )
            yield _sse("generation.created", {"generation_id": str(ger.id), "status": "pending"})

            image_gen.executar_geracao_integrada(
                gdb, ger, logo_bytes=logo_bytes, referencia_bytes=ref_bytes
            )

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


class AnalisarModeloIn(BaseModel):
    workspace_id: uuid.UUID
    referencia_base64: str


@router.post("/analisar-modelo")
def analisar_modelo(
    payload: AnalisarModeloIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Prompt-reverso: extrai um creative_spec JSON da referência (modelo de visão)."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    img = _decode_img(payload.referencia_base64)
    if not img:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Imagem de referência inválida")
    from app.services import creative_vision

    try:
        spec, usage = creative_vision.extrair_creative_spec(img)
    except Exception as exc:  # noqa: BLE001
        code, msg = image_gen._map_error(exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail={"error_code": code, "error_message": msg}
        )
    return {"creative_spec": spec, "usage": usage}


class MelhorarCopyIn(BaseModel):
    workspace_id: uuid.UUID
    campo: str
    texto_atual: Optional[str] = None
    product: Optional[str] = None
    objective: Optional[str] = None
    densidade: Optional[str] = None


@router.post("/melhorar-copy")
def melhorar_copy_endpoint(
    payload: MelhorarCopyIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Assistente de copy: gera/melhora um texto com gatilhos mentais (por objetivo)."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    from app.services import copy_assist

    try:
        texto, usage = copy_assist.melhorar_copy(
            payload.campo,
            texto_atual=payload.texto_atual,
            product=payload.product,
            objective=payload.objective,
            densidade=payload.densidade,
        )
    except Exception as exc:  # noqa: BLE001
        code, msg = image_gen._map_error(exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail={"error_code": code, "error_message": msg}
        )
    return {"texto": texto, "usage": usage}

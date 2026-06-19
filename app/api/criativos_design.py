"""Rotas do Estúdio de Criativos — /design/*.

Fase 1 (imagem). Esta fatia: geração da BASE visual via gpt-image-2 com SSE,
recuperação de estado por id e listagem de estilos. Montagem/export do criativo
final (template+logo+textos) e demais rotas vêm nas fatias seguintes.
"""
import base64
import json
import threading
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.core.deps import get_usuario_atual, verificar_acesso_workspace
from app.models.criativo import (
    CriativoEstilo,
    CriativoGeracao,
    CriativoModelo,
    CriativoPaleta,
    CriativoProjeto,
)
from app.models.user import User
from app.services import brand_kit, criativo_render, estudio_wallet, image_gen
from app.services.object_storage import get_object, public_url, put_bytes
from app.services.upload_validation import validar_e_normalizar_imagem

router = APIRouter(prefix="/design", tags=["design"])

_QUALITIES = {"low", "medium", "high", "auto"}

# Personagem (fotos de pessoa): limites de payload (5 fotos de iPhone seriam ~50MB).
MAX_PERSONAGEM_IMGS = 5
MAX_PERSONAGEM_TOTAL_B64 = 25 * 1024 * 1024  # ~25MB de base64 somados


def custo_tokens(spec: dict) -> int:
    """Custo em tokens de uma geração: Modelo Reverso=3, alta=2, demais=1."""
    if spec.get("reference_usage") == "modelo_reverso" and spec.get("creative_spec"):
        return 3
    return 2 if (spec.get("quality") or "medium").lower() == "high" else 1


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
    # Personagem: fotos da MESMA pessoa (rosto fiel) + descrição da cena.
    personagem_descricao: Optional[str] = Field(default=None, max_length=1500)
    personagem_base64: Optional[list[str]] = None


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

    spec = payload.model_dump(exclude={"workspace_id", "logo_base64", "referencia_base64", "personagem_base64"})
    ws_id = payload.workspace_id
    user_id = usuario.id

    # Brand Kit do workspace: aplica cores/tom/regras onde o usuário não setou e,
    # se não veio logo no upload, usa a logo salva da marca.
    bk = brand_kit.carregar(db, ws_id)
    brand_kit.aplicar_no_spec(spec, bk)
    if logo_bytes is None and bk:
        logo_bytes = brand_kit.logo_bytes(db, ws_id)

    # Personagem: fotos da MESMA pessoa → vão ao images.edit (gpt-image-2 já
    # processa em alta fidelidade). Valida payload ANTES de decodificar.
    personagem_bytes: list[bytes] = []
    if payload.personagem_base64:
        if len(payload.personagem_base64) > MAX_PERSONAGEM_IMGS:
            raise HTTPException(413, f"Máximo de {MAX_PERSONAGEM_IMGS} fotos de personagem.")
        if sum(len(b or "") for b in payload.personagem_base64) > MAX_PERSONAGEM_TOTAL_B64:
            raise HTTPException(413, "Fotos de personagem muito grandes — reduza o tamanho ou a quantidade.")
        for b in payload.personagem_base64[:MAX_PERSONAGEM_IMGS]:
            img = _decode_img(b)
            if img:
                personagem_bytes.append(img)
    tem_personagem = bool(personagem_bytes)
    if tem_personagem:
        spec["quality"] = "high"  # rosto fiel rende muito melhor em alta qualidade

    tem_logo = bool(logo_bytes)
    tem_ref = bool(ref_bytes)
    custo = custo_tokens(spec)

    def stream():
        with SessionLocal() as gdb:
            # Pré-checagem de saldo: bloqueia (sem chamar a OpenAI) se insuficiente.
            if not estudio_wallet.tem_saldo(gdb, ws_id, custo):
                yield _sse(
                    "generation.failed",
                    {
                        "error_code": "saldo_insuficiente",
                        "error_message": (
                            f"Saldo insuficiente: este criativo custa {custo} token(s) e o "
                            f"saldo é {estudio_wallet.saldo(gdb, ws_id)}. Carregue tokens para gerar."
                        ),
                    },
                )
                return

            ger = image_gen.criar_geracao_integrada(
                gdb,
                workspace_id=ws_id,
                user_id=user_id,
                spec=spec,
                tem_logo=tem_logo,
                tem_referencia=tem_ref,
                tem_personagem=tem_personagem,
            )
            gid = ger.id
            yield _sse("generation.created", {"generation_id": str(gid), "status": "pending"})

            # A geração (OpenAI) leva 60-180s na Alta — roda em thread (sessão DB
            # própria; SQLAlchemy não é thread-safe) enquanto o SSE emite heartbeat
            # a cada ~12s. Sem isso a conexão fica ociosa e o edge (Cloudflare/QUIC)
            # a derruba (ERR_QUIC_PROTOCOL_ERROR) mesmo o servidor concluindo.
            done_ev = threading.Event()

            def _run() -> None:
                try:
                    with SessionLocal() as wdb:
                        g = wdb.get(CriativoGeracao, gid)
                        image_gen.executar_geracao_integrada(
                            wdb, g, logo_bytes=logo_bytes, referencia_bytes=ref_bytes,
                            personagem_bytes=personagem_bytes,
                        )
                finally:
                    done_ev.set()

            threading.Thread(target=_run, daemon=True).start()
            while not done_ev.wait(timeout=12):
                yield ": keep-alive\n\n"

            # A thread commitou noutra sessão → expira o cache pra não ler "pending".
            gdb.expire_all()
            ger = gdb.get(CriativoGeracao, gid)

            if ger and ger.status == "done":
                # Débito só no sucesso (geração que falha não cobra).
                estudio_wallet.debitar(
                    gdb, ws_id, custo, "Geração de criativo", referencia=str(gid), origem="consumo"
                )
                yield _sse(
                    "generation.completed",
                    {
                        "generation_id": str(gid),
                        "base_image_url": ger.imagem_base_url,
                        "usage": ger.usage,
                        "custo_tokens": custo,
                        "saldo_tokens": estudio_wallet.saldo(gdb, ws_id),
                    },
                )
            else:
                yield _sse(
                    "generation.failed",
                    {
                        "generation_id": str(gid),
                        "error_code": (ger.error_code if ger else "erro_geracao"),
                        "error_message": (ger.error_message if ger else "Falha na geração."),
                    },
                )

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
    from app.core.ai_config import get_ai_config
    from app.services.ai_usage import registrar_uso
    registrar_uso(feature="vision", workspace_id=payload.workspace_id,
                  model=get_ai_config("vision").model, kind="text", usage=usage)
    return {"creative_spec": spec, "usage": usage}


class MelhorarCopyIn(BaseModel):
    workspace_id: uuid.UUID
    campo: str
    texto_atual: Optional[str] = None
    product: Optional[str] = None
    objective: Optional[str] = None
    densidade: Optional[str] = None
    existentes: Optional[list[str]] = None  # outros textos do criativo (não repetir)
    tone: Optional[str] = None  # tom de voz desejado
    audience: Optional[str] = None  # público-alvo


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
            existentes=payload.existentes,
            tone=payload.tone,
            audience=payload.audience,
        )
    except Exception as exc:  # noqa: BLE001
        code, msg = image_gen._map_error(exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail={"error_code": code, "error_message": msg}
        )
    from app.core.ai_config import get_ai_config
    from app.services.ai_usage import registrar_uso
    registrar_uso(feature="copy", workspace_id=payload.workspace_id,
                  model=get_ai_config("copy").model, kind="text", usage=usage)
    return {"texto": texto, "usage": usage}


class GerarCopyIn(BaseModel):
    workspace_id: uuid.UUID
    product: Optional[str] = None
    objective: Optional[str] = None
    densidade: Optional[str] = None  # "simples" | "rico"
    tone: Optional[str] = None
    audience: Optional[str] = None


@router.post("/gerar-copy")
def gerar_copy_endpoint(
    payload: GerarCopyIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Gera TODOS os textos do criativo de uma vez (botão master "Gerar textos").

    A IA fatora produto/público/diferencial/objetivo do briefing e devolve um pacote
    coerente: headline/subheadline/cta e, no rico, bullets/selo/copy_extra. Devolve `usage`.
    """
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    from app.services import copy_assist

    try:
        pacote, usage = copy_assist.gerar_pacote_copy(
            product=payload.product,
            objective=payload.objective,
            densidade=payload.densidade,
            tone=payload.tone,
            audience=payload.audience,
        )
    except Exception as exc:  # noqa: BLE001
        code, msg = image_gen._map_error(exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail={"error_code": code, "error_message": msg}
        )
    from app.core.ai_config import get_ai_config
    from app.services.ai_usage import registrar_uso
    registrar_uso(feature="copy", workspace_id=payload.workspace_id,
                  model=get_ai_config("copy").model, kind="text", usage=usage)
    return {"pacote": pacote, "usage": usage}


# ───────────────────────── Modelos curados + Meus modelos ───────────────────
def _modelo_card(m: CriativoModelo) -> dict:
    return {
        "id": str(m.id),
        "escopo": "meu" if m.workspace_id else "curado",
        "nome": m.nome,
        "nicho": m.nicho,
        "objetivo": m.objetivo,
        "nivel_consciencia": m.nivel_consciencia,
        "gancho": m.gancho,
        "creative_format": m.creative_format,
        "badge": m.badge,
        "thumb_url": m.thumb_url,
        "ai_porque": m.ai_porque,
        "estrutura": m.estrutura_json,
    }


@router.get("/modelos")
def listar_modelos(
    workspace_id: uuid.UUID = Query(...),
    nicho: Optional[str] = Query(None),
    objetivo: Optional[str] = Query(None),
    creative_format: Optional[str] = Query(None),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Modelos curados (workspace_id NULL) + os do próprio workspace ('Meus modelos')."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    q = db.query(CriativoModelo).filter(
        CriativoModelo.ativo.is_(True),
        (CriativoModelo.workspace_id.is_(None))
        | (CriativoModelo.workspace_id == workspace_id),
    )
    if nicho:
        q = q.filter(CriativoModelo.nicho == nicho)
    if objetivo:
        q = q.filter(CriativoModelo.objetivo == objetivo)
    if creative_format:
        q = q.filter(CriativoModelo.creative_format == creative_format)
    # curados primeiro (workspace_id NULL → False ordena antes), depois recentes
    rows = q.order_by(
        CriativoModelo.workspace_id.isnot(None), CriativoModelo.criado_em.desc()
    ).all()
    return [_modelo_card(m) for m in rows]


class CriarModeloIn(BaseModel):
    workspace_id: uuid.UUID
    nome: str = Field(min_length=1, max_length=120)
    image_base64: str
    nicho: Optional[str] = None
    objetivo: Optional[str] = None
    creative_format: Optional[str] = None


@router.post("/modelos", status_code=status.HTTP_201_CREATED)
def criar_modelo(
    payload: CriarModeloIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Salva um 'Meu modelo' (referência do usuário) no workspace para reuso."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    img = _decode_img(payload.image_base64)
    if not img:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Imagem inválida")

    modelo = CriativoModelo(
        workspace_id=payload.workspace_id,
        nome=payload.nome.strip(),
        nicho=payload.nicho,
        objetivo=payload.objetivo,
        creative_format=payload.creative_format,
        fonte="manual",
    )
    db.add(modelo)
    db.commit()
    db.refresh(modelo)

    bucket = settings.MINIO_BUCKET_CRIATIVOS
    object_name = f"workspaces/{payload.workspace_id}/criativos/modelos/{modelo.id}.png"
    put_bytes(bucket, object_name, img, "image/png")
    modelo.thumb_url = public_url(bucket, object_name)
    db.commit()
    db.refresh(modelo)
    return _modelo_card(modelo)


@router.delete("/modelos/{modelo_id}")
def deletar_modelo(
    modelo_id: uuid.UUID,
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Soft-delete de um 'Meu modelo' (curados globais são read-only)."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    m = (
        db.query(CriativoModelo)
        .filter(CriativoModelo.id == modelo_id, CriativoModelo.ativo.is_(True))
        .first()
    )
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modelo não encontrado")
    if m.workspace_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Modelo curado é read-only")
    if m.workspace_id != workspace_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Modelo de outro workspace")
    m.ativo = False
    db.commit()
    return {"ok": True}


# ───────────────────────── Esquemas de cores (paletas) ──────────────────────
_MAX_PALETAS = 10


class CriarPaletaIn(BaseModel):
    workspace_id: uuid.UUID
    cor_60: Optional[str] = None
    cor_30: Optional[str] = None
    cor_10: Optional[str] = None


@router.get("/paletas")
def listar_paletas(
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Esquemas de cores salvos do workspace (até 10, recentes primeiro)."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    rows = (
        db.query(CriativoPaleta)
        .filter(CriativoPaleta.ativo.is_(True), CriativoPaleta.workspace_id == workspace_id)
        .order_by(CriativoPaleta.criado_em.desc())
        .limit(_MAX_PALETAS)
        .all()
    )
    return [
        {"id": str(p.id), "cor_60": p.cor_60, "cor_30": p.cor_30, "cor_10": p.cor_10}
        for p in rows
    ]


@router.post("/paletas", status_code=status.HTTP_201_CREATED)
def criar_paleta(
    payload: CriarPaletaIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Salva o esquema 60/30/10 atual. Bloqueia ao atingir 10 (exclua um para salvar)."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    n = (
        db.query(CriativoPaleta)
        .filter(CriativoPaleta.ativo.is_(True), CriativoPaleta.workspace_id == payload.workspace_id)
        .count()
    )
    if n >= _MAX_PALETAS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Limite de {_MAX_PALETAS} esquemas de cores. Exclua um para salvar.",
        )
    p = CriativoPaleta(
        workspace_id=payload.workspace_id,
        cor_60=payload.cor_60,
        cor_30=payload.cor_30,
        cor_10=payload.cor_10,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": str(p.id), "cor_60": p.cor_60, "cor_30": p.cor_30, "cor_10": p.cor_10}


@router.delete("/paletas/{paleta_id}")
def deletar_paleta(
    paleta_id: uuid.UUID,
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Soft-delete de um esquema de cores do próprio workspace."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    p = (
        db.query(CriativoPaleta)
        .filter(CriativoPaleta.id == paleta_id, CriativoPaleta.ativo.is_(True))
        .first()
    )
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esquema não encontrado")
    if p.workspace_id != workspace_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Esquema de outro workspace")
    p.ativo = False
    db.commit()
    return {"ok": True}


# ───────────────────────── Histórico de criativos gerados ───────────────────
def _estrutura_de_params(p: dict | None) -> dict:
    """Extrai do params_json da geração a estrutura reaproveitável no gerador."""
    p = p or {}
    return {
        "objetivo": p.get("objective"),
        "densidade": p.get("densidade"),
        "headline": p.get("headline"),
        "subheadline": p.get("subheadline"),
        "cta": p.get("cta"),
        "bullets": p.get("bullets") or [],
        "selo": p.get("selo"),
    }


@router.get("/historico")
def listar_historico(
    workspace_id: uuid.UUID = Query(...),
    desde: Optional[str] = Query(None, description="ISO date/datetime; filtra criado_em >= desde"),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Criativos gerados (done) do workspace. `desde` → recorte do dia (box diário)."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    q = db.query(CriativoGeracao).filter(
        CriativoGeracao.workspace_id == workspace_id,
        CriativoGeracao.ativo.is_(True),
        CriativoGeracao.status == "done",
        CriativoGeracao.imagem_base_url.isnot(None),
    )
    if desde:
        from datetime import datetime

        try:
            q = q.filter(CriativoGeracao.criado_em >= datetime.fromisoformat(desde))
        except ValueError:
            pass
    rows = q.order_by(CriativoGeracao.criado_em.desc()).limit(100).all()
    return [
        {
            "id": str(g.id),
            "imagem_url": g.imagem_base_url,
            "creative_format": g.creative_format,
            "criado_em": g.criado_em.isoformat() if g.criado_em else None,
            "estrutura": _estrutura_de_params(g.params_json),
        }
        for g in rows
    ]


@router.delete("/historico/{geracao_id}")
def deletar_geracao(
    geracao_id: uuid.UUID,
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Soft-delete de um criativo do histórico (some da listagem; arquivo fica no MinIO)."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    g = (
        db.query(CriativoGeracao)
        .filter(CriativoGeracao.id == geracao_id, CriativoGeracao.ativo.is_(True))
        .first()
    )
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Criativo não encontrado")
    if g.workspace_id != workspace_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Criativo de outro workspace")
    g.ativo = False
    db.commit()
    return {"ok": True}

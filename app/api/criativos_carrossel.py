"""Rotas do Criativos 2.0 — /design/carrossel/*.

Carrossel newsjacking: o Diretor (LLM) monta o roteiro (`/diretor`), o usuário
revisa/edita (`PUT /{id}/roteiro`, custo ZERO) e então gera (`POST /{id}/gerar`).
A geração roda em thread de background (gpt-image-2, texto queimado); o front
acompanha por polling de `GET /{id}`. Regeneração por slide é síncrona.

Multi-tenant: todo acesso passa por `verificar_acesso_workspace` (via `_get_car`).
"""
import base64
import json
import threading
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.ai_config import get_ai_config
from app.core.database import SessionLocal, get_db
from app.core.deps import get_usuario_atual, verificar_acesso_workspace
from app.models.criativo import CriativoCarrossel, CriativoCarrosselSlide
from app.models.user import User
from app.services import carrossel_director, carrossel_gen, creative_vision
from app.services.ai_usage import registrar_uso
from app.services.image_gen import _map_error
from app.services.upload_validation import validar_e_normalizar_imagem

router = APIRouter(prefix="/design/carrossel", tags=["carrossel"])

_QUALITIES = {"low", "medium", "high"}
_MASTERS = {"9x16", "4x3"}


def _get_car(db: Session, carrossel_id: uuid.UUID, usuario: User) -> CriativoCarrossel:
    car = db.get(CriativoCarrossel, carrossel_id)
    if car is None or not car.ativo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carrossel não encontrado")
    verificar_acesso_workspace(usuario, car.workspace_id, db)
    return car


def _car_dict(car: CriativoCarrossel) -> dict:
    return {
        "id": str(car.id),
        "tema": car.tema,
        "molde": car.molde,
        "origem": car.origem,
        "composition_mode": car.composition_mode,
        "n_slides": car.n_slides,
        "master_format": car.master_format,
        "status": car.status,
        "error_code": car.error_code,
        "error_message": car.error_message,
        "director_json": car.director_json,
    }


def _slide_dict(s: CriativoCarrosselSlide) -> dict:
    return {
        "slide_index": s.slide_index,
        "intensidade": s.intensidade,
        "copy": s.copy_json,
        "direcao_imagem": s.image_prompt,
        "base_image_url": s.base_image_url,
        "formatos": s.formatos_json,
        "status": s.status,
    }


# ───────────────────────────────── Diretor ──────────────────────────────────
class DiretorIn(BaseModel):
    workspace_id: uuid.UUID
    origem: str = "manual"  # manual | referencia
    tema: Optional[str] = Field(default=None, max_length=500)
    referencia_desc: Optional[str] = Field(default=None, max_length=4000)
    referencia_base64: Optional[str] = None  # Origin B: imagem de referência de estilo
    estilo: Optional[str] = None  # integrado | chapado | ilustracao | foto
    n_slides: int = Field(default=5, ge=2, le=10)
    master_format: str = "9x16"


@router.post("/diretor")
def diretor(
    payload: DiretorIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Tema → roteiro newsjacking validado (Pydantic + repair). NÃO gera imagem."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    if not (payload.tema or payload.referencia_base64 or payload.referencia_desc):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Informe um tema ou uma referência")
    master = payload.master_format if payload.master_format in _MASTERS else "9x16"

    # Origin B — extrai o ESTILO de uma imagem de referência (reusa creative_vision).
    referencia_desc = payload.referencia_desc
    if payload.origem == "referencia" and payload.referencia_base64:
        try:
            raw = base64.b64decode(payload.referencia_base64.split(",")[-1])
            img, *_ = validar_e_normalizar_imagem(raw, error_code="invalid_reference")
        except Exception:  # noqa: BLE001
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Imagem de referência inválida")
        try:
            spec, vusage = creative_vision.extrair_creative_spec(img)
        except Exception as exc:  # noqa: BLE001
            code, msg = _map_error(exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail={"error_code": code, "error_message": msg})
        referencia_desc = (spec.get("descricao") or "").strip()
        paleta = ", ".join([c for c in (spec.get("paleta_de_cores") or []) if c])
        if paleta:
            referencia_desc = f"{referencia_desc} Paleta de cores: {paleta}."
        try:
            registrar_uso(feature="vision", workspace_id=payload.workspace_id,
                          model=get_ai_config("vision").model, kind="text", usage=vusage)
        except Exception:  # noqa: BLE001
            pass

    try:
        roteiro, usage = carrossel_director.gerar_roteiro(
            tema=payload.tema or "",
            n_slides=payload.n_slides,
            master_format=master,
            origem=payload.origem,
            referencia_desc=referencia_desc,
            db=db,
        )
    except carrossel_director.RoteiroInvalidoError as e:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"error_code": "roteiro_invalido", "error_message": str(e)},
        )

    dj = roteiro.model_dump()
    if payload.estilo:
        dj["estilo"] = payload.estilo
    if payload.origem == "referencia" and referencia_desc:
        dj["estilo_referencia"] = referencia_desc
    car = CriativoCarrossel(
        workspace_id=payload.workspace_id,
        user_id=usuario.id,
        origem=payload.origem,
        tema=payload.tema,
        molde=roteiro.molde,
        master_format=master,
        n_slides=payload.n_slides,
        director_json=dj,
        status="pending",
    )
    db.add(car)
    db.commit()
    db.refresh(car)
    try:
        registrar_uso(feature="copy", workspace_id=payload.workspace_id,
                      model=get_ai_config("copy").model, kind="text", usage=usage)
    except Exception:  # noqa: BLE001
        pass
    return {"carrossel_id": str(car.id), "director_json": car.director_json}


# ───────────────────────────── Pautas (Origin A) ────────────────────────────
class PautasIn(BaseModel):
    workspace_id: uuid.UUID
    assunto: str = Field(min_length=2, max_length=300)


@router.post("/pautas")
def pautas(
    payload: PautasIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Origin A — busca notícias (Firecrawl) e devolve 5 pautas newsjacking."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    from app.services import firecrawl_news
    try:
        res, usage = firecrawl_news.buscar_pautas(payload.assunto)
    except firecrawl_news.PautasIndisponiveisError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            detail={"error_code": "pautas_indisponiveis", "error_message": str(e)})
    try:
        registrar_uso(feature="copy", workspace_id=payload.workspace_id,
                      model=get_ai_config("copy").model, kind="text", usage=usage)
    except Exception:  # noqa: BLE001
        pass
    return {"pautas": [p.model_dump() for p in res.pautas]}


# ───────────────────────────── Editar roteiro ───────────────────────────────
class RoteiroIn(BaseModel):
    director_json: dict


@router.put("/{carrossel_id}/roteiro")
def editar_roteiro(
    carrossel_id: uuid.UUID,
    payload: RoteiroIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Persiste a edição do roteiro pelo usuário (custo ZERO). Valida o schema."""
    car = _get_car(db, carrossel_id, usuario)
    try:
        roteiro = carrossel_director.RoteiroCarrossel.model_validate(payload.director_json)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error_code": "roteiro_invalido", "error_message": str(e)[:300]},
        )
    novo = roteiro.model_dump()
    for k in ("estilo", "estilo_referencia", "personagens", "objetos"):
        v = (payload.director_json or {}).get(k)
        if v is None:
            v = (car.director_json or {}).get(k)
        if v is not None:
            novo[k] = v
    car.director_json = novo
    car.molde = roteiro.molde
    db.commit()
    return {"ok": True, "director_json": car.director_json}


# ───────────────────────────────── Gerar ────────────────────────────────────
class ItemRefIn(BaseModel):
    descricao: str = ""
    imagem_base64: Optional[str] = None


class GerarIn(BaseModel):
    quality: str = "medium"
    personagens: list[ItemRefIn] = Field(default_factory=list)
    objetos: list[ItemRefIn] = Field(default_factory=list)


def _criar_slides(db: Session, car: CriativoCarrossel) -> int:
    """Cria/atualiza as rows de slide a partir do director_json (idempotente)."""
    slides_roteiro = (car.director_json or {}).get("slides") or []
    existentes = {
        s.slide_index: s
        for s in db.query(CriativoCarrosselSlide).filter(
            CriativoCarrosselSlide.carrossel_id == car.id
        ).all()
    }
    for sd in slides_roteiro:
        idx = int(sd.get("index"))
        copy = sd.get("copy") or {}
        if idx in existentes:
            s = existentes[idx]
            s.copy_json = copy
            s.image_prompt = sd.get("direcao_imagem")
            s.intensidade = sd.get("intensidade")
            s.status = "pending"
        else:
            db.add(CriativoCarrosselSlide(
                carrossel_id=car.id,
                slide_index=idx,
                intensidade=sd.get("intensidade"),
                copy_json=copy,
                image_prompt=sd.get("direcao_imagem"),
                status="pending",
            ))
    db.commit()
    return len(slides_roteiro)


@router.post("/{carrossel_id}/gerar")
def gerar(
    carrossel_id: uuid.UUID,
    payload: GerarIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Cria os slides e dispara a geração em background. Retorna 202 + custo.

    O front acompanha por polling de GET /{id} (status do carrossel + dos slides).
    """
    car = _get_car(db, carrossel_id, usuario)
    quality = payload.quality if payload.quality in _QUALITIES else "medium"

    # Personagens & objetos: fotos vão IN-MEMORY para a geração (rosto fiel via images.edit);
    # descrições ficam no director_json (persistidas, entram no prompt de cada slide).
    fotos: list[bytes] = []

    def _coletar(itens: list[ItemRefIn]) -> list[dict]:
        descs: list[dict] = []
        for it in (itens or [])[:5]:
            if it.imagem_base64:
                try:
                    raw = base64.b64decode(it.imagem_base64.split(",")[-1])
                    img, *_ = validar_e_normalizar_imagem(raw, error_code="invalid_reference")
                    fotos.append(img)
                except Exception:  # noqa: BLE001
                    pass
            if (it.descricao or "").strip():
                descs.append({"descricao": it.descricao.strip()})
        return descs

    dj = dict(car.director_json or {})
    dj["personagens"] = _coletar(payload.personagens)
    dj["objetos"] = _coletar(payload.objetos)
    car.director_json = dj

    total = _criar_slides(db, car)
    if total == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Roteiro sem slides")
    car.status = "queued"
    db.commit()
    custo = carrossel_gen.custo_carrossel(total, quality)

    cid = car.id
    fotos_gen = fotos or None

    def _run() -> None:
        with SessionLocal() as bdb:
            c = bdb.get(CriativoCarrossel, cid)
            if c is not None:
                carrossel_gen.gerar_carrossel(bdb, c, quality, fotos_gen)

    threading.Thread(target=_run, daemon=True).start()
    return {"carrossel_id": str(car.id), "total": total, "custo_tokens": custo, "status": "queued"}


@router.post("/{carrossel_id}/slides/{slide_index}/regenerar")
def regenerar_slide(
    carrossel_id: uuid.UUID,
    slide_index: int,
    payload: GerarIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Regenera UM slide (síncrono, ~20s). Débito só no sucesso."""
    car = _get_car(db, carrossel_id, usuario)
    quality = payload.quality if payload.quality in _QUALITIES else "medium"
    try:
        ger = carrossel_gen.regenerar_slide(db, car, slide_index, quality)
    except PermissionError:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail={"error_code": "saldo_insuficiente"})
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    return {
        "slide_index": slide_index,
        "status": ger.status,
        "url": ger.imagem_base_url,
        "error_code": ger.error_code,
        "error_message": ger.error_message,
    }


@router.get("/{carrossel_id}")
def obter(
    carrossel_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Estado do carrossel + slides (polling/reconexão)."""
    car = _get_car(db, carrossel_id, usuario)
    slides = (
        db.query(CriativoCarrosselSlide)
        .filter(CriativoCarrosselSlide.carrossel_id == car.id)
        .order_by(CriativoCarrosselSlide.slide_index.asc())
        .all()
    )
    return {"carrossel": _car_dict(car), "slides": [_slide_dict(s) for s in slides]}

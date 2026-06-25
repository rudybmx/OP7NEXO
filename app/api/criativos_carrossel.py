"""Rotas do Criativos 2.0 — /design/carrossel/*.

Carrossel newsjacking: o Diretor (LLM) monta o roteiro (`/diretor`), o usuário
revisa/edita (`PUT /{id}/roteiro`, custo ZERO) e então gera (`POST /{id}/gerar`).
A geração roda em thread de background (gpt-image-2, texto queimado); o front
acompanha por polling de `GET /{id}`. Regeneração por slide é síncrona.

Multi-tenant: todo acesso passa por `verificar_acesso_workspace` (via `_get_car`).
"""
import base64
import json
import logging
import threading
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.ai_config import get_ai_config
from app.core.database import SessionLocal, get_db
from app.core.deps import get_usuario_atual, verificar_acesso_workspace
from app.models.criativo import CriativoCarrossel, CriativoCarrosselSlide, CriativoGeracao
from app.models.user import User
from app.services import carrossel_analise, carrossel_director, carrossel_gen, creative_vision
from app.services.ai_usage import registrar_uso
from app.services.image_gen import _map_error
from app.services.upload_validation import validar_e_normalizar_imagem

log = logging.getLogger(__name__)

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


def _slide_dict(s: CriativoCarrosselSlide, ger: CriativoGeracao | None = None) -> dict:
    d = {
        "slide_index": s.slide_index,
        "intensidade": s.intensidade,
        "copy": s.copy_json,
        "direcao_imagem": s.image_prompt,
        "base_image_url": s.base_image_url,
        "formatos": s.formatos_json,
        "status": s.status,
        "error_code": None,
        "error_message": None,
    }
    if s.status == "error" and ger is not None:
        d["error_code"] = ger.error_code
        d["error_message"] = ger.error_message
    return d


# ───────────────────────────────── Diretor ──────────────────────────────────
class DiretorIn(BaseModel):
    workspace_id: uuid.UUID
    origem: str = "manual"  # manual | referencia
    tema: Optional[str] = Field(default=None, max_length=500)
    referencia_desc: Optional[str] = Field(default=None, max_length=4000)
    referencia_base64: Optional[str] = None  # Origin B: imagem de referência de estilo
    estilo: Optional[str] = None  # integrado | chapado | ilustracao | foto
    molde: Optional[str] = None   # A | B | C (força a estrutura); None = IA escolhe
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
            molde=payload.molde,
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
    except firecrawl_news.SemNoticiasError as e:
        # Sem notícia para o termo: resultado benigno, não é erro de gateway.
        return {"pautas": [], "aviso": str(e)}
    except firecrawl_news.PautasIndisponiveisError as e:
        log.warning("[pautas] upstream indisponível assunto=%r: %s", payload.assunto, e)
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
    modelo_base64: Optional[str] = None                          # modelo de referência GERAL (imagem)
    modelos_slide: dict[str, str] = Field(default_factory=dict)  # index(str) -> base64 (1 modelo por slide)
    objetos_slide: dict[str, ItemRefIn] = Field(default_factory=dict)  # index(str) -> {descricao,imagem_base64} (1 objeto/slide)


def _coletar_refs(itens: list[ItemRefIn]) -> tuple[list[dict], dict[int, bytes]]:
    """Pool de refs: descrições (persistem no director_json, por índice) + fotos
    decodificadas IN-MEMORY mapeadas pelo MESMO índice do pool (rosto/objeto fiel via
    images.edit). NÃO pula itens — o índice tem que casar com a seleção por slide
    (`director_json.slides[i].personagens_idx/objetos_idx`)."""
    descs: list[dict] = []
    bmap: dict[int, bytes] = {}
    for i, it in enumerate((itens or [])[:5]):
        descs.append({"descricao": (it.descricao or "").strip()})
        if it.imagem_base64:
            try:
                raw = base64.b64decode(it.imagem_base64.split(",")[-1])
                img, *_ = validar_e_normalizar_imagem(raw, error_code="invalid_reference")
                bmap[i] = img
            except Exception:  # noqa: BLE001
                pass
    return descs, bmap


def _decode_modelo(b64: Optional[str]) -> Optional[bytes]:
    if not b64:
        return None
    try:
        raw = base64.b64decode(b64.split(",")[-1])
        img, *_ = validar_e_normalizar_imagem(raw, error_code="invalid_reference")
        return img
    except Exception:  # noqa: BLE001
        return None


def _coletar_modelos(payload: "GerarIn") -> tuple[Optional[bytes], dict[int, bytes]]:
    """Modelo de referência (imagem) p/ images.edit: geral + por-slide (index->bytes)."""
    geral = _decode_modelo(payload.modelo_base64)
    porslide: dict[int, bytes] = {}
    for k, v in (payload.modelos_slide or {}).items():
        img = _decode_modelo(v)
        if img is not None:
            try:
                porslide[int(k)] = img
            except (ValueError, TypeError):
                pass
    return geral, porslide


def _coletar_objetos_slide(payload: "GerarIn", dj: dict) -> dict[int, bytes]:
    """Objeto POR SLIDE: grava a descrição em dj.slides[i].objeto e devolve bytes {index: bytes}."""
    slides = {int(s["index"]): s for s in (dj.get("slides") or []) if s.get("index") is not None}
    bmap: dict[int, bytes] = {}
    for k, it in (payload.objetos_slide or {}).items():
        try:
            idx = int(k)
        except (ValueError, TypeError):
            continue
        if idx in slides:
            slides[idx]["objeto"] = {"descricao": (it.descricao or "").strip()}
        img = _decode_modelo(it.imagem_base64)
        if img is not None:
            bmap[idx] = img
    return bmap


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

    # Personagens & objetos: fotos vão IN-MEMORY para a geração (rosto/objeto fiel via
    # images.edit), indexadas pelo pool; descrições ficam no director_json (persistidas,
    # entram no prompt de cada slide). Cada slide usa só as refs que seleciona.
    pers_descs, pers_bytes = _coletar_refs(payload.personagens)
    dj = dict(car.director_json or {})
    dj["personagens"] = pers_descs
    osbytes = _coletar_objetos_slide(payload, dj)  # grava dj.slides[i].objeto + bytes do objeto/slide
    car.director_json = dj

    total = _criar_slides(db, car)
    if total == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Roteiro sem slides")
    car.status = "queued"
    db.commit()
    custo = carrossel_gen.custo_carrossel(total, quality)

    cid = car.id
    pgen, osgen = (pers_bytes or None), (osbytes or None)
    mgen, msgen = _coletar_modelos(payload)

    def _run() -> None:
        with SessionLocal() as bdb:
            c = bdb.get(CriativoCarrossel, cid)
            if c is not None:
                carrossel_gen.gerar_carrossel(bdb, c, quality, pgen, osgen, mgen, msgen or None)

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
    # Refresh dos refs (personagem do pool + objeto do slide) — fiel na regeneração isolada.
    pers_descs, pers_bytes = _coletar_refs(payload.personagens)
    dj = dict(car.director_json or {})
    if payload.personagens:
        dj["personagens"] = pers_descs
    osbytes = _coletar_objetos_slide(payload, dj)
    car.director_json = dj
    db.commit()
    mgen, msgen = _coletar_modelos(payload)
    try:
        ger = carrossel_gen.regenerar_slide(db, car, slide_index, quality, pers_bytes or None, osbytes or None, mgen, msgen or None)
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
    # Junta a geração de cada slide (error_code/message ficam lá) — batch, sem N+1.
    ger_ids = [s.geracao_id for s in slides if s.geracao_id]
    gers = (
        {g.id: g for g in db.query(CriativoGeracao).filter(CriativoGeracao.id.in_(ger_ids)).all()}
        if ger_ids else {}
    )
    return {"carrossel": _car_dict(car), "slides": [_slide_dict(s, gers.get(s.geracao_id)) for s in slides]}


# ───────────────────────────── Análise (advisory) ───────────────────────────
class AnaliseIn(BaseModel):
    personagens: list[ItemRefIn] = Field(default_factory=list)
    objetos: list[ItemRefIn] = Field(default_factory=list)


@router.post("/{carrossel_id}/analise")
def analise(
    carrossel_id: uuid.UUID,
    payload: Optional[AnaliseIn] = None,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Análise completa por IA ANTES de gerar (advisory, custo ZERO).

    Lê o roteiro PERSISTIDO (o front faz PUT /roteiro antes) + as descrições de
    personagens/objetos do payload (estado vivo da tela). Não persiste nada.
    """
    car = _get_car(db, carrossel_id, usuario)
    payload = payload or AnaliseIn()
    dj = dict(car.director_json or {})
    if payload.personagens:
        dj["personagens"] = [{"descricao": (it.descricao or "").strip()} for it in payload.personagens[:5]]
    if payload.objetos:
        dj["objetos"] = [{"descricao": (it.descricao or "").strip()} for it in payload.objetos[:5]]
    try:
        resultado, usage = carrossel_analise.analisar_carrossel(car, dj_override=dj)
    except Exception as exc:  # noqa: BLE001
        code, msg = _map_error(exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            detail={"error_code": code, "error_message": msg})
    registrar_uso(feature="copy", workspace_id=car.workspace_id,
                  model=get_ai_config("copy").model, kind="text", usage=usage)
    return resultado.model_dump()


@router.post("/{carrossel_id}/ajustar")
def ajustar(
    carrossel_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """A IA reescreve o roteiro na MELHOR versão (mesmo assunto/molde/nº de slides). Custo ZERO."""
    car = _get_car(db, carrossel_id, usuario)
    try:
        roteiro, usage = carrossel_director.ajustar_roteiro(car, db=db)
    except carrossel_director.RoteiroInvalidoError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            detail={"error_code": "ajuste_invalido", "error_message": str(e)[:300]})
    # Preserva as refs por slide (personagens_idx/objeto/estilo_referencia) e os pools globais.
    novo = roteiro.model_dump()
    old_slides = {int(s.get("index")): s for s in ((car.director_json or {}).get("slides") or [])
                  if s.get("index") is not None}
    for s in (novo.get("slides") or []):
        old = old_slides.get(int(s.get("index", -1)))
        if old:
            for k in ("personagens_idx", "objetos_idx", "objeto", "estilo_referencia"):
                if old.get(k) is not None:
                    s[k] = old[k]
    for k in ("estilo", "estilo_referencia", "personagens", "objetos"):
        v = (car.director_json or {}).get(k)
        if v is not None:
            novo[k] = v
    car.director_json = novo
    car.molde = roteiro.molde
    db.commit()
    registrar_uso(feature="copy", workspace_id=car.workspace_id,
                  model=get_ai_config("copy").model, kind="text", usage=usage)
    return {"director_json": car.director_json}


# ─────────────────────────────── Históricos ─────────────────────────────────
@router.get("")
def listar(
    workspace_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
    limit: int = 60,
):
    """Histórico desta tela: carrosséis do workspace (recentes primeiro)."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    cars = (
        db.query(CriativoCarrossel)
        .filter(CriativoCarrossel.workspace_id == workspace_id, CriativoCarrossel.ativo.is_(True))
        .order_by(CriativoCarrossel.criado_em.desc())
        .limit(max(1, min(int(limit), 200)))
        .all()
    )
    out = []
    for c in cars:
        slides = (
            db.query(CriativoCarrosselSlide)
            .filter(CriativoCarrosselSlide.carrossel_id == c.id)
            .order_by(CriativoCarrosselSlide.slide_index.asc())
            .all()
        )
        urls = [s.base_image_url for s in slides if s.base_image_url]
        out.append({
            **_car_dict(c),
            "criado_em": c.criado_em.isoformat() if c.criado_em else None,
            "capa": urls[0] if urls else None,
            "thumbs": urls,
            "n_prontos": len(urls),
        })
    return {"carrosseis": out}


@router.delete("/{carrossel_id}")
def excluir(
    carrossel_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Soft-delete do carrossel (some do histórico)."""
    car = _get_car(db, carrossel_id, usuario)
    car.ativo = False
    db.commit()
    return {"ok": True}

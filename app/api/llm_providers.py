"""Providers e modelos de LLM (Central de Agentes, Fase 1) — platform_admin.

Tokens cifrados com Fernet em repouso; a API só devolve máscara (constituição regra 6).
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import llm_crypto
from app.core.database import get_db
from app.core.deps import exigir_platform_admin
from app.models.agente import LlmProvider, LlmProviderModelo, LlmProviderToken
from app.models.user import User
from app.schemas.llm_provider import (
    ModeloIn,
    ModeloOut,
    ProviderIn,
    ProviderOut,
    ProviderTokenIn,
    ProviderTokenOut,
    ProviderUpdate,
)

router = APIRouter(tags=["llm_providers"])


def _modelo_out(m: LlmProviderModelo) -> ModeloOut:
    return ModeloOut(
        id=str(m.id),
        nome_modelo=m.nome_modelo,
        label_display=m.label_display,
        ativo=m.ativo,
    )


def _provider_out(p: LlmProvider) -> ProviderOut:
    tok = p.token
    return ProviderOut(
        id=str(p.id),
        nome=p.nome,
        base_url=p.base_url,
        tipo=p.tipo,
        ativo=p.ativo,
        descricao=p.descricao,
        token_configurado=bool(tok and tok.token_encrypted),
        token_mask=(tok.token_mask if tok else ""),
        modelos=[_modelo_out(m) for m in sorted(p.modelos, key=lambda x: x.nome_modelo)],
    )


def _get_provider_or_404(provider_id: uuid.UUID, db: Session) -> LlmProvider:
    p = db.query(LlmProvider).filter(LlmProvider.id == provider_id).first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider não encontrado")
    return p


@router.get("/llm-providers", response_model=list[ProviderOut])
def listar_providers(
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    rows = db.query(LlmProvider).order_by(LlmProvider.nome).all()
    return [_provider_out(p) for p in rows]


@router.post("/llm-providers", response_model=ProviderOut, status_code=status.HTTP_201_CREATED)
def criar_provider(
    payload: ProviderIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    p = LlmProvider(
        nome=payload.nome,
        base_url=payload.base_url,
        tipo=payload.tipo,
        descricao=payload.descricao,
        ativo=payload.ativo,
    )
    db.add(p)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe provider com esse nome")
    db.refresh(p)
    return _provider_out(p)


@router.put("/llm-providers/{provider_id}", response_model=ProviderOut)
def atualizar_provider(
    provider_id: uuid.UUID,
    payload: ProviderUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    p = _get_provider_or_404(provider_id, db)
    if payload.nome is not None:
        p.nome = payload.nome
    if payload.base_url is not None:
        p.base_url = payload.base_url
    if payload.tipo is not None:
        p.tipo = payload.tipo
    if payload.descricao is not None:
        p.descricao = payload.descricao
    if payload.ativo is not None:
        p.ativo = payload.ativo
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe provider com esse nome")
    db.refresh(p)
    return _provider_out(p)


@router.get("/llm-providers/{provider_id}/token", response_model=ProviderTokenOut)
def obter_token_mascarado(
    provider_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    p = _get_provider_or_404(provider_id, db)
    tok = p.token
    return ProviderTokenOut(
        provider_id=str(p.id),
        configurado=bool(tok and tok.token_encrypted),
        token_mask=(tok.token_mask if tok else ""),
        ativo=(tok.ativo if tok else False),
    )


@router.post("/llm-providers/{provider_id}/token", response_model=ProviderTokenOut)
def salvar_token(
    provider_id: uuid.UUID,
    payload: ProviderTokenIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    p = _get_provider_or_404(provider_id, db)
    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Token vazio")

    try:
        cipher = llm_crypto.encrypt(token)
    except llm_crypto.LLMTokenCryptoError as exc:
        # Chave de cifra ausente/inválida no servidor — erro de configuração, não do cliente.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    mask = llm_crypto.mask(token)

    tok = p.token
    if tok is None:
        tok = LlmProviderToken(provider_id=p.id, token_encrypted=cipher, token_mask=mask, ativo=True)
        db.add(tok)
    else:
        tok.token_encrypted = cipher
        tok.token_mask = mask
        tok.ativo = True
    db.commit()
    db.refresh(tok)
    return ProviderTokenOut(
        provider_id=str(p.id),
        configurado=True,
        token_mask=tok.token_mask,
        ativo=tok.ativo,
    )


@router.post(
    "/llm-providers/{provider_id}/modelos",
    response_model=ModeloOut,
    status_code=status.HTTP_201_CREATED,
)
def adicionar_modelo(
    provider_id: uuid.UUID,
    payload: ModeloIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    p = _get_provider_or_404(provider_id, db)
    m = LlmProviderModelo(
        provider_id=p.id,
        nome_modelo=payload.nome_modelo,
        label_display=payload.label_display,
        ativo=payload.ativo,
    )
    db.add(m)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Modelo já existe neste provider")
    db.refresh(m)
    return _modelo_out(m)


@router.delete("/llm-providers/{provider_id}/modelos/{modelo_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_modelo(
    provider_id: uuid.UUID,
    modelo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    m = (
        db.query(LlmProviderModelo)
        .filter(LlmProviderModelo.id == modelo_id, LlmProviderModelo.provider_id == provider_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modelo não encontrado")
    db.delete(m)
    db.commit()

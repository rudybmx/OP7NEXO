"""Link público de conexão de canal WhatsApp — endpoints SEM autenticação.

Gated apenas pelo token público (canal_connect_tokens). Reusa o núcleo de
conexão/status de `app/api/canais.py` (Evolution e WAHA). Regras de ouro e
anti-hijack: o status público nunca toca o status administrativo do canal e o
token consumido nunca re-arma a sessão.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.canal_entrada import CanalEntrada
from app.models.workspace import Workspace
from app.services import connect_token
from app.services.rate_limit import RateLimitError, dentro_do_limite

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public/conectar", tags=["public-conectar"])

TIPOS_SUPORTADOS = ("whatsapp_evolution", "whatsapp_waha")


def _aplicar_rate_limit(chave: str, limite: int, janela_s: int, *, fail_open: bool) -> None:
    try:
        if not dentro_do_limite(chave, limite, janela_s, fail_open=fail_open):
            raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde alguns instantes.")
    except RateLimitError:
        raise HTTPException(status_code=503, detail="Serviço temporariamente indisponível. Tente novamente.")


def _carregar_token_e_canal(token: str, db: Session) -> tuple[connect_token.CanalConnectToken, CanalEntrada]:
    row = connect_token.buscar_token_valido(db, token)
    if not row:
        raise HTTPException(status_code=404, detail="Link expirado ou inválido")
    canal = db.get(CanalEntrada, row.canal_id)
    if not canal:
        raise HTTPException(status_code=404, detail="Link expirado ou inválido")
    if canal.tipo not in TIPOS_SUPORTADOS:
        raise HTTPException(status_code=400, detail="Este canal não suporta conexão por link")
    return row, canal


@router.get("/{token}")
def info(token: str, db: Session = Depends(get_db)):
    _aplicar_rate_limit(f"pubconnect:info:{token}", 60, 10, fail_open=True)
    row, canal = _carregar_token_e_canal(token, db)
    # Token consumido: confirma conexão SEM expor número/cliente (anti-hijack de link antigo).
    if row.status == "consumed":
        return {
            "canal_nome": None,
            "cliente_nome": None,
            "tipo": canal.tipo,
            "connection_status": "connected",
            "numero_telefone": None,
        }
    ws = db.get(Workspace, canal.workspace_id)
    return {
        "canal_nome": canal.nome,
        "cliente_nome": ws.nome if ws else None,
        "tipo": canal.tipo,
        "connection_status": canal.connection_status,
        "numero_telefone": canal.numero_telefone,
    }


@router.post("/{token}/iniciar")
def iniciar(token: str, db: Session = Depends(get_db)):
    _aplicar_rate_limit(f"pubconnect:iniciar:{token}", 5, 10, fail_open=False)
    row, canal = _carregar_token_e_canal(token, db)
    # Anti-hijack: token consumido nunca re-arma — mesmo se a sessão caiu depois.
    if row.status == "consumed":
        return {
            "connection_status": "connected",
            "qr_code": None,
            "pairing_code": None,
            "message": "Este número já foi conectado.",
        }

    from app.api.canais import _conectar_evolution, _conectar_waha

    if canal.tipo == "whatsapp_waha":
        resultado = _conectar_waha(canal, db)
    else:
        resultado = _conectar_evolution(canal, db)

    # Guard por estado real: _conectar_* devolve 'connected' sem re-armar se já estava aberto.
    if resultado.connection_status == "connected":
        connect_token.consumir_tokens_do_canal(db, canal.id)

    return {
        "connection_status": resultado.connection_status,
        "qr_code": resultado.qr_code,
        "pairing_code": resultado.pairing_code,
        "message": resultado.message,
    }


@router.get("/{token}/status")
def status(token: str, db: Session = Depends(get_db)):
    _aplicar_rate_limit(f"pubconnect:status:{token}", 30, 10, fail_open=True)
    row, canal = _carregar_token_e_canal(token, db)
    if row.status == "consumed":
        return {
            "connection_status": "connected",
            "qr_code": None,
            "pairing_code": None,
            "numero_telefone": None,
        }

    from app.api.canais import _status_evolution_core, _status_waha

    if canal.tipo == "whatsapp_waha":
        resultado = _status_waha(canal, db)
    else:
        # publico=True: regra de ouro (não toca status administrativo, não ressuscita).
        resultado = _status_evolution_core(canal, db, publico=True)

    if resultado.get("connection_status") == "connected":
        connect_token.consumir_tokens_do_canal(db, canal.id)

    return {
        "connection_status": resultado.get("connection_status"),
        "qr_code": resultado.get("qr_code"),
        "pairing_code": resultado.get("pairing_code"),
        "numero_telefone": resultado.get("numero_telefone"),
    }


class PareamentoIn(BaseModel):
    telefone: str


@router.post("/{token}/parear")
def parear(payload: PareamentoIn, token: str, db: Session = Depends(get_db)):
    _aplicar_rate_limit(f"pubconnect:parear:{token}", 5, 3600, fail_open=False)
    row, canal = _carregar_token_e_canal(token, db)
    if row.status == "consumed":
        raise HTTPException(status_code=409, detail="Canal já conectado")
    if canal.tipo != "whatsapp_evolution":
        raise HTTPException(
            status_code=400,
            detail="Pareamento por número disponível apenas no WhatsApp Evolution",
        )

    from app.api.canais import _parear_evolution

    return _parear_evolution(canal, db, payload.telefone)

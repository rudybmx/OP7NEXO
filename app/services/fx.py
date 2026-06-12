"""Cotação USD→BRL diária, cacheada em `fx_rates`.

Busca lazy: se já há linha de hoje, devolve; senão tenta a API pública (sem chave)
da AwesomeAPI (cotação do dia), grava e devolve. Se a API falhar/demorar, usa a
última cotação conhecida. Timeout curto para não travar o painel.
"""
from __future__ import annotations

import logging
from datetime import date

import httpx
from sqlalchemy.orm import Session

from app.models.fx_rate import FxRate

log = logging.getLogger(__name__)

_TIMEOUT = 3.0


def _buscar_taxa() -> tuple[float, str] | None:
    """Tenta provedores grátis (sem chave). Devolve (usd_brl, fonte) ou None."""
    # 1) open.er-api.com — estável, sem chave
    try:
        resp = httpx.get("https://open.er-api.com/v6/latest/USD", timeout=_TIMEOUT)
        resp.raise_for_status()
        brl = float(resp.json()["rates"]["BRL"])
        if brl > 0:
            return brl, "open.er-api"
    except Exception as exc:  # noqa: BLE001
        log.warning("[fx] open.er-api falhou: %s", exc)
    # 2) AwesomeAPI — fallback (tem quota no tier grátis)
    try:
        resp = httpx.get("https://economia.awesomeapi.com.br/json/last/USD-BRL", timeout=_TIMEOUT)
        resp.raise_for_status()
        brl = float(resp.json()["USDBRL"]["bid"])
        if brl > 0:
            return brl, "awesomeapi"
    except Exception as exc:  # noqa: BLE001
        log.warning("[fx] awesomeapi falhou: %s", exc)
    return None


def _ultima(db: Session) -> FxRate | None:
    return db.query(FxRate).order_by(FxRate.dia.desc()).first()


def cotacao_usd_brl(db: Session) -> dict | None:
    """Devolve {dia, usd_brl, fonte} ou None se nunca houve cotação e a API falhou."""
    hoje = date.today()
    row = db.query(FxRate).filter(FxRate.dia == hoje).first()
    if row is not None:
        return {"dia": row.dia.isoformat(), "usd_brl": float(row.usd_brl), "fonte": row.fonte}

    # busca a cotação do dia
    taxa = _buscar_taxa()
    if taxa is not None:
        valor, fonte = taxa
        try:
            db.add(FxRate(dia=hoje, usd_brl=valor, fonte=fonte))
            db.commit()
        except Exception as exc:  # noqa: BLE001 — corrida no insert; ignora
            log.warning("[fx] falha ao gravar cotação: %s", exc)
            db.rollback()
        return {"dia": hoje.isoformat(), "usd_brl": valor, "fonte": fonte}

    # nenhuma API respondeu → última conhecida
    ult = _ultima(db)
    if ult is not None:
        return {"dia": ult.dia.isoformat(), "usd_brl": float(ult.usd_brl), "fonte": (ult.fonte or "") + " (cache)"}
    return None

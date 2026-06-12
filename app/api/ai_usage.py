"""Consumo & Custo de IA (Fase 2) — endpoints platform_admin.

- GET /ai/usage/summary  → totais + quebra (feature|model|workspace) num período, USD e BRL.
- GET /ai/usage/pricing  / PUT /ai/usage/pricing/{model}  → tabela de preços editável.
- GET /ai/usage/fx       → cotação USD-BRL do dia.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin
from app.models.ai_model_pricing import AiModelPricing
from app.models.user import User
from app.services.ai_usage import invalidate_pricing_cache
from app.services.fx import cotacao_usd_brl

router = APIRouter(prefix="/ai/usage", tags=["ai_usage"])

# Whitelist de agrupamento → expressão SQL (nunca interpolar o param cru).
_GROUP_SQL = {
    "feature": "ai.feature",
    "model": "ai.model",
    "workspace": "ai.workspace_id",
}


class PricingOut(BaseModel):
    model: str
    kind: str
    input_usd_1m: float | None
    output_usd_1m: float | None
    image_prices_json: dict | None
    ativo: bool


class PricingUpdate(BaseModel):
    kind: str | None = None
    input_usd_1m: float | None = None
    output_usd_1m: float | None = None
    image_prices_json: dict | None = None
    ativo: bool | None = None


def _pricing_out(p: AiModelPricing) -> PricingOut:
    return PricingOut(
        model=p.model,
        kind=p.kind,
        input_usd_1m=float(p.input_usd_1m) if p.input_usd_1m is not None else None,
        output_usd_1m=float(p.output_usd_1m) if p.output_usd_1m is not None else None,
        image_prices_json=p.image_prices_json,
        ativo=p.ativo,
    )


@router.get("/summary")
def resumo(
    inicio: date | None = Query(None),
    fim: date | None = Query(None),
    group_by: str = Query("feature"),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    if group_by not in _GROUP_SQL:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "group_by inválido")
    if fim is None:
        fim = date.today()
    if inicio is None:
        inicio = fim - timedelta(days=30)
    params = {"inicio": inicio.isoformat(), "fim": (fim + timedelta(days=1)).isoformat()}
    janela = "ai.created_at >= CAST(:inicio AS date) AND ai.created_at < CAST(:fim AS date)"

    totais = db.execute(text(f"""
        SELECT COUNT(*) AS chamadas,
               COALESCE(SUM(ai.tokens_total), 0) AS tokens,
               COALESCE(SUM(ai.cost_usd), 0) AS custo_usd,
               COUNT(*) FILTER (WHERE ai.pricing_source = 'sem_preco') AS sem_preco
        FROM ai_usage_log ai
        WHERE {janela}
    """), params).fetchone()

    col = _GROUP_SQL[group_by]
    nome_expr = "COALESCE(w.nome, 'Plataforma')" if group_by == "workspace" else col
    join = "LEFT JOIN workspaces w ON w.id = ai.workspace_id" if group_by == "workspace" else ""
    linhas = db.execute(text(f"""
        SELECT {nome_expr} AS chave,
               COUNT(*) AS chamadas,
               COALESCE(SUM(ai.tokens_total), 0) AS tokens,
               COALESCE(SUM(ai.cost_usd), 0) AS custo_usd
        FROM ai_usage_log ai
        {join}
        WHERE {janela}
        GROUP BY {col}, chave
        ORDER BY custo_usd DESC NULLS LAST, chamadas DESC
    """), params).fetchall()

    fx = cotacao_usd_brl(db)
    taxa = fx["usd_brl"] if fx else None

    def brl(usd):
        return round(float(usd) * taxa, 2) if taxa is not None else None

    return {
        "inicio": inicio.isoformat(),
        "fim": fim.isoformat(),
        "group_by": group_by,
        "fx": fx,
        "totais": {
            "chamadas": totais[0],
            "tokens": int(totais[1]),
            "custo_usd": round(float(totais[2]), 4),
            "custo_brl": brl(totais[2]),
            "sem_preco": totais[3],
        },
        "itens": [
            {
                "chave": r[0],
                "chamadas": r[1],
                "tokens": int(r[2]),
                "custo_usd": round(float(r[3]), 4),
                "custo_brl": brl(r[3]),
            }
            for r in linhas
        ],
    }


@router.get("/pricing", response_model=list[PricingOut])
def listar_precos(
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    rows = db.query(AiModelPricing).order_by(AiModelPricing.model).all()
    return [_pricing_out(p) for p in rows]


@router.put("/pricing/{model}", response_model=PricingOut)
def atualizar_preco(
    model: str,
    payload: PricingUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    p = db.query(AiModelPricing).filter(AiModelPricing.model == model).first()
    if p is None:
        p = AiModelPricing(model=model, kind=payload.kind or "text")
        db.add(p)
    if payload.kind is not None:
        p.kind = payload.kind
    if payload.input_usd_1m is not None:
        p.input_usd_1m = payload.input_usd_1m
    if payload.output_usd_1m is not None:
        p.output_usd_1m = payload.output_usd_1m
    if payload.image_prices_json is not None:
        p.image_prices_json = payload.image_prices_json
    if payload.ativo is not None:
        p.ativo = payload.ativo
    db.commit()
    db.refresh(p)
    invalidate_pricing_cache(model)
    return _pricing_out(p)


@router.get("/fx")
def cotacao(
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    fx = cotacao_usd_brl(db)
    if fx is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Cotação indisponível")
    return fx

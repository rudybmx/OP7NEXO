"""Registro de consumo de IA + cálculo de custo (Fase 2).

`registrar_uso(...)` é a única função que os call sites chamam. Ela:
- abre a PRÓPRIA sessão (NÃO recebe `db`) — telemetria nunca envenena a transação
  de produto (constraint/erro no INSERT não derruba a geração/insight/copy);
- calcula o custo em USD com o preço VIGENTE do modelo e CONGELA no registro
  (`cost_usd` snapshot) — mudar o preço depois não altera o histórico;
- é best-effort: qualquer exceção é engolida e logada.

Custo: texto = prompt/1e6*input + completion/1e6*output. Imagem = image_count * preço(qualidade).
Modelo sem preço → cost_usd=NULL, pricing_source='sem_preco'.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from decimal import Decimal

log = logging.getLogger(__name__)

# cache curto de preços (igual padrão do resolver de config)
_PRICE_TTL = 60.0
_plock = threading.Lock()
_pcache: dict[str, tuple[float, dict | None]] = {}


def _pricing_for(model: str) -> dict | None:
    """Devolve dict de preço do modelo (ou None). Cacheado com TTL curto."""
    now = time.monotonic()
    with _plock:
        hit = _pcache.get(model)
        if hit and now - hit[0] < _PRICE_TTL:
            return hit[1]
    data: dict | None = None
    try:
        from app.core.database import SessionLocal
        from app.models.ai_model_pricing import AiModelPricing

        db = SessionLocal()
        try:
            row = (
                db.query(AiModelPricing)
                .filter(AiModelPricing.model == model, AiModelPricing.ativo.is_(True))
                .first()
            )
            if row is not None:
                data = {
                    "kind": row.kind,
                    "input_usd_1m": float(row.input_usd_1m) if row.input_usd_1m is not None else None,
                    "output_usd_1m": float(row.output_usd_1m) if row.output_usd_1m is not None else None,
                    "image_prices_json": row.image_prices_json or {},
                }
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        log.warning("[ai_usage] falha ao ler preço de %s: %s", model, exc)
        return None
    with _plock:
        _pcache[model] = (now, data)
    return data


def invalidate_pricing_cache(model: str | None = None) -> None:
    with _plock:
        if model is None:
            _pcache.clear()
        else:
            _pcache.pop(model, None)


def _calcular_custo(
    pricing: dict | None, kind: str, tp: int, tc: int, image_count: int, quality: str | None
) -> Decimal | None:
    if not pricing:
        return None
    if kind == "image":
        precos = pricing.get("image_prices_json") or {}
        q = (quality or "auto").lower()
        unit = precos.get(q)
        if unit is None:
            unit = precos.get("auto") or precos.get("medium")
        if unit is None:
            return None
        return Decimal(str(unit)) * Decimal(image_count or 0)
    # texto
    i = pricing.get("input_usd_1m")
    o = pricing.get("output_usd_1m")
    if i is None and o is None:
        return None
    custo = Decimal(0)
    if i is not None:
        custo += Decimal(tp or 0) / Decimal(1_000_000) * Decimal(str(i))
    if o is not None:
        custo += Decimal(tc or 0) / Decimal(1_000_000) * Decimal(str(o))
    return custo


def registrar_uso(
    *,
    feature: str,
    workspace_id: uuid.UUID | str | None,
    model: str,
    provider: str | None = "openai",
    kind: str = "text",
    usage: dict | None = None,
    image_count: int = 0,
    quality: str | None = None,
    size: str | None = None,
    request_id: str | None = None,
    status: str = "ok",
) -> None:
    """Registra uma chamada de IA. Best-effort: nunca levanta exceção."""
    try:
        usage = usage or {}
        tp = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
        tc = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
        tt = int(usage.get("total_tokens") or (tp + tc))

        pricing = _pricing_for(model)
        custo = _calcular_custo(pricing, kind, tp, tc, image_count, quality)
        pricing_source = "db" if custo is not None else "sem_preco"

        from app.core.database import SessionLocal
        from app.models.ai_usage_log import AiUsageLog

        db = SessionLocal()
        try:
            ws = str(workspace_id) if workspace_id else None
            row = AiUsageLog(
                feature=feature,
                workspace_id=uuid.UUID(ws) if ws else None,
                model=model,
                provider=provider,
                kind=kind,
                tokens_prompt=tp,
                tokens_completion=tc,
                tokens_total=tt,
                image_count=image_count,
                image_quality=quality,
                image_size=size,
                cost_usd=custo,
                pricing_source=pricing_source,
                request_id=request_id,
                status=status,
            )
            db.add(row)
            db.commit()
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — telemetria nunca quebra a feature
        log.warning("[ai_usage] falha ao registrar uso (feature=%s model=%s): %s", feature, model, exc)

"""Painel Central de IA — config global (platform_admin) + insights agregados.

- GET  /ai/settings            → config efetiva por feature (modelo/base_url) + source + chave MASCARADA.
- PUT  /ai/settings/{feature}  → upsert do override (chave opcional; nunca apaga se ausente).
- GET  /ai/insights            → insights de IA recentes (os "perdidos"), filtro opcional por workspace.

A config é GLOBAL (sem workspace). A chave de API NUNCA é retornada inteira
(constituição regra 6) — só máscara. Ao salvar, invalida o cache do resolver.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.ai_config import FEATURES, get_ai_config, invalidate_cache
from app.core.database import get_db
from app.core.deps import exigir_platform_admin
from app.models.ai_setting import AiSetting
from app.models.user import User

router = APIRouter(prefix="/ai", tags=["ai_settings"])

_LABELS = {
    "insights": "Insights de campanha",
    "image": "Geração de imagem",
    "vision": "Visão (referência → spec)",
    "copy": "Copy (textos)",
    "agent": "Agente de atendimento",
}


def _mask(secret: str | None) -> str:
    """Máscara segura: primeiros 6 + últimos 4. Nunca devolve a chave inteira."""
    if not secret:
        return ""
    if len(secret) <= 12:
        return "•" * len(secret)
    return f"{secret[:6]}…{secret[-4:]}"


class AiSettingOut(BaseModel):
    feature: str
    label: str
    provider: str | None
    model: str
    base_url: str
    source: str          # "db" | "env"
    ativo: bool
    has_override: bool   # existe linha com algum campo não-nulo aplicado
    api_key_mask: str    # mascarada (do override, se houver)


class AiSettingUpdate(BaseModel):
    provider: str | None = None
    model: str | None = None
    base_url: str | None = None
    api_key: str | None = None   # ausente = mantém; "" = limpa override
    ativo: bool | None = None


class AiInsightOut(BaseModel):
    id: str
    workspace_id: str
    workspace_nome: str | None
    ads_account_id: str | None
    account_name: str | None
    modulo: str
    tipo: str
    titulo: str
    mensagem: str
    acao: str | None
    model_usado: str | None
    gerado_em: str | None


def _row_for(feature: str, db: Session) -> AiSetting | None:
    return db.query(AiSetting).filter(AiSetting.feature == feature).first()


def _out(feature: str, row: AiSetting | None) -> AiSettingOut:
    cfg = get_ai_config(feature)
    has_override = bool(row and row.ativo and (row.model or row.api_key or row.base_url))
    return AiSettingOut(
        feature=feature,
        label=_LABELS.get(feature, feature),
        provider=(row.provider if row else None),
        model=cfg.model,
        base_url=cfg.base_url,
        source=cfg.source,
        ativo=(row.ativo if row else True),
        has_override=has_override,
        api_key_mask=_mask(row.api_key) if row else "",
    )


@router.get("/settings", response_model=list[AiSettingOut])
def listar_config(
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    rows = {r.feature: r for r in db.query(AiSetting).all()}
    return [_out(f, rows.get(f)) for f in FEATURES]


@router.put("/settings/{feature}", response_model=AiSettingOut)
def atualizar_config(
    feature: str,
    payload: AiSettingUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    if feature not in FEATURES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Feature inválida")

    row = _row_for(feature, db)
    if row is None:
        row = AiSetting(feature=feature)
        db.add(row)

    if payload.provider is not None:
        row.provider = payload.provider or None
    if payload.model is not None:
        row.model = payload.model or None
    if payload.base_url is not None:
        row.base_url = payload.base_url or None
    if payload.api_key is not None:
        # ausente (None) = mantém; "" = limpa o override (cai pro .env)
        row.api_key = payload.api_key or None
    if payload.ativo is not None:
        row.ativo = payload.ativo

    db.commit()
    db.refresh(row)
    invalidate_cache(feature)
    return _out(feature, row)


@router.get("/insights", response_model=list[AiInsightOut])
def listar_insights(
    workspace_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Insights de IA recentes agregados. platform_admin vê todos os workspaces;
    `workspace_id` filtra opcionalmente."""
    sql = """
        SELECT ai.id, ai.workspace_id, w.nome AS workspace_nome,
               ai.ads_account_id, aa.account_name,
               ai.modulo, ai.tipo, ai.titulo, ai.mensagem, ai.acao,
               ai.model_usado, ai.gerado_em
        FROM ai_insights ai
        LEFT JOIN workspaces w ON w.id = ai.workspace_id
        LEFT JOIN ads_accounts aa ON aa.id = ai.ads_account_id
        WHERE (:ws IS NULL OR ai.workspace_id = CAST(:ws AS uuid))
        ORDER BY ai.gerado_em DESC
        LIMIT :limit
    """
    rows = db.execute(text(sql), {"ws": str(workspace_id) if workspace_id else None, "limit": limit}).fetchall()
    return [
        AiInsightOut(
            id=str(r[0]),
            workspace_id=str(r[1]),
            workspace_nome=r[2],
            ads_account_id=str(r[3]) if r[3] else None,
            account_name=r[4],
            modulo=r[5],
            tipo=r[6],
            titulo=r[7],
            mensagem=r[8],
            acao=r[9],
            model_usado=r[10],
            gerado_em=r[11].isoformat() if r[11] else None,
        )
        for r in rows
    ]

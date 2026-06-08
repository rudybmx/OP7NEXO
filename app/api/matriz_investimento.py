"""Rotas da Matriz de Investimento — planejado (aprovado) vs realizado por canal/mês."""

import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, verificar_acesso_workspace
from app.models.user import User

router = APIRouter(prefix="/workspaces", tags=["matriz-investimento"])

CANAIS = [
    {"canal": "meta",     "label": "Meta Ads",     "sem_integracao": False},
    {"canal": "google",   "label": "Google Ads",   "sem_integracao": False},
    {"canal": "tiktok",   "label": "TikTok Ads",   "sem_integracao": True},
    {"canal": "linkedin", "label": "LinkedIn Ads",  "sem_integracao": True},
]


# ── Schemas ───────────────────────────────────────────────────────────────────

class MesValorIn(BaseModel):
    mes: int
    aprovado: float


class CanalIn(BaseModel):
    canal: str
    meses: list[MesValorIn]


class MatrizPutIn(BaseModel):
    year: int
    canais: list[CanalIn]


class MesValorOut(BaseModel):
    mes: int
    aprovado: float
    realizado: float


class CanalOut(BaseModel):
    canal: str
    label: str
    sem_integracao: bool
    meses: list[MesValorOut]


class MatrizOut(BaseModel):
    workspace_id: str
    year: int
    updated_at: Optional[str]
    updated_by: Optional[str]
    canais: list[CanalOut]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _buscar_realizado_meta(db: Session, workspace_id: uuid.UUID, year: int) -> dict[int, float]:
    ini = date(year, 1, 1)
    fim = date(year + 1, 1, 1)
    # meta_campanhas_insights não tem workspace_id — filtra via join com ads_accounts
    rows = db.execute(text("""
        SELECT EXTRACT(month FROM mci.data)::int AS mes, SUM(mci.spend)
        FROM meta_campanhas_insights mci
        JOIN ads_accounts aa ON aa.id = mci.ads_account_id
        WHERE aa.workspace_id = :ws
          AND mci.data >= :ini
          AND mci.data <  :fim
        GROUP BY EXTRACT(month FROM mci.data)
    """), {"ws": str(workspace_id), "ini": ini, "fim": fim}).fetchall()
    return {row[0]: float(row[1]) for row in rows}


def _buscar_realizado_google(db: Session, workspace_id: uuid.UUID, year: int) -> dict[int, float]:
    ini = date(year, 1, 1)
    fim = date(year + 1, 1, 1)
    # google_dados_diarios tem data DATE + custo (granularidade diária)
    rows = db.execute(text("""
        SELECT EXTRACT(month FROM data)::int AS mes, SUM(custo)
        FROM google_dados_diarios
        WHERE workspace_id = :ws
          AND data >= :ini
          AND data <  :fim
        GROUP BY EXTRACT(month FROM data)
    """), {"ws": str(workspace_id), "ini": ini, "fim": fim}).fetchall()
    return {row[0]: float(row[1]) for row in rows}


def _buscar_aprovado(db: Session, workspace_id: uuid.UUID, year: int) -> dict[tuple[str, int], float]:
    rows = db.execute(text("""
        SELECT canal, mes, aprovado
        FROM matriz_investimento
        WHERE workspace_id = :ws AND year = :year
    """), {"ws": str(workspace_id), "year": year}).fetchall()
    return {(row[0], row[1]): float(row[2]) for row in rows}


def _buscar_metadata(db: Session, workspace_id: uuid.UUID, year: int):
    return db.execute(text("""
        SELECT updated_at, updated_by
        FROM matriz_investimento
        WHERE workspace_id = :ws AND year = :year
        ORDER BY updated_at DESC
        LIMIT 1
    """), {"ws": str(workspace_id), "year": year}).fetchone()


def _montar_resposta(
    db: Session,
    workspace_id: uuid.UUID,
    year: int,
) -> MatrizOut:
    aprovado_map = _buscar_aprovado(db, workspace_id, year)
    realizado_meta = _buscar_realizado_meta(db, workspace_id, year)
    realizado_google = _buscar_realizado_google(db, workspace_id, year)
    meta_row = _buscar_metadata(db, workspace_id, year)

    canais_out = []
    for info in CANAIS:
        canal = info["canal"]
        if canal == "meta":
            real_map = realizado_meta
        elif canal == "google":
            real_map = realizado_google
        else:
            real_map = {}

        meses = [
            MesValorOut(
                mes=m,
                aprovado=aprovado_map.get((canal, m), 0.0),
                realizado=real_map.get(m, 0.0),
            )
            for m in range(1, 13)
        ]
        canais_out.append(CanalOut(
            canal=canal,
            label=info["label"],
            sem_integracao=info["sem_integracao"],
            meses=meses,
        ))

    updated_at = meta_row[0].isoformat() if meta_row and meta_row[0] else None
    updated_by = meta_row[1] if meta_row else None

    return MatrizOut(
        workspace_id=str(workspace_id),
        year=year,
        updated_at=updated_at,
        updated_by=updated_by,
        canais=canais_out,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/matriz-investimento", response_model=MatrizOut)
def get_matriz(
    workspace_id: uuid.UUID,
    year: int = Query(default=2026, ge=2020, le=2040),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    verificar_acesso_workspace(usuario, workspace_id, db)
    return _montar_resposta(db, workspace_id, year)


@router.put("/{workspace_id}/matriz-investimento", response_model=MatrizOut)
def put_matriz(
    workspace_id: uuid.UUID,
    body: MatrizPutIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    verificar_acesso_workspace(usuario, workspace_id, db)

    for canal_in in body.canais:
        for mes_val in canal_in.meses:
            db.execute(text("""
                INSERT INTO matriz_investimento
                    (workspace_id, year, canal, mes, aprovado, updated_at, updated_by)
                VALUES
                    (:ws, :year, :canal, :mes, :aprovado, now(), :updated_by)
                ON CONFLICT ON CONSTRAINT uq_matriz_investimento
                DO UPDATE SET
                    aprovado   = EXCLUDED.aprovado,
                    updated_at = now(),
                    updated_by = EXCLUDED.updated_by
            """), {
                "ws": str(workspace_id),
                "year": body.year,
                "canal": canal_in.canal,
                "mes": mes_val.mes,
                "aprovado": mes_val.aprovado,
                "updated_by": usuario.email,
            })
    db.commit()

    return _montar_resposta(db, workspace_id, body.year)

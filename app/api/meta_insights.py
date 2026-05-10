import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual
from app.models.user import User

router = APIRouter(prefix="/meta/insights", tags=["meta_insights"])


def _conta_ids_da_query(workspace_id: str, conta_ids: list[str], db: Session) -> list[uuid.UUID]:
    if conta_ids:
        rows = db.execute(
            text(
                "SELECT id FROM ads_accounts "
                "WHERE workspace_id = :ws::uuid AND account_id = ANY(:ids) AND plataforma = 'meta'"
            ),
            {"ws": workspace_id, "ids": conta_ids},
        ).fetchall()
    else:
        rows = db.execute(
            text(
                "SELECT id FROM ads_accounts "
                "WHERE workspace_id = :ws::uuid AND plataforma = 'meta'"
            ),
            {"ws": workspace_id},
        ).fetchall()
    return [r[0] for r in rows]


def _safe_div(num: float, den: float) -> float:
    return round(num / den, 4) if den else 0.0


@router.get("/visao-geral")
def visao_geral(
    workspace_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    conta_ids: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_usuario_atual),
):
    ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
    account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db)

    if not account_uuids:
        return {
            "kpis": {"spend": 0.0, "leads": 0, "impressions": 0, "reach": 0, "clicks": 0,
                     "ctr": 0.0, "cpc": 0.0, "cpm": 0.0, "cpl": 0.0, "frequencia": 0.0},
            "contas": [],
            "dados_diarios": [],
            "periodo": {"inicio": str(data_inicio), "fim": str(data_fim)},
        }

    kpi_row = db.execute(
        text(
            "SELECT "
            "  COALESCE(SUM(spend),0) AS spend, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(impressions),0) AS impressions, "
            "  COALESCE(SUM(reach),0) AS reach, "
            "  COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_insights_diarios "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchone()

    spend = float(kpi_row[0])
    leads = int(kpi_row[1])
    impressions = int(kpi_row[2])
    reach = int(kpi_row[3])
    clicks = int(kpi_row[4])

    kpis = {
        "spend": spend,
        "leads": leads,
        "impressions": impressions,
        "reach": reach,
        "clicks": clicks,
        "ctr": _safe_div(clicks, impressions) * 100,
        "cpc": _safe_div(spend, clicks),
        "cpm": _safe_div(spend, impressions) * 1000,
        "cpl": _safe_div(spend, leads),
        "frequencia": _safe_div(impressions, reach),
    }

    conta_rows = db.execute(
        text(
            "SELECT "
            "  a.id::text, a.account_id, a.account_name, "
            "  COALESCE(SUM(d.spend),0) AS spend, "
            "  COALESCE(SUM(d.leads),0) AS leads, "
            "  COALESCE(SUM(d.impressions),0) AS impressions, "
            "  COALESCE(SUM(d.reach),0) AS reach, "
            "  COALESCE(SUM(d.clicks),0) AS clicks "
            "FROM ads_accounts a "
            "JOIN meta_insights_diarios d ON d.ads_account_id = a.id "
            "WHERE a.id = ANY(:ids) "
            "  AND d.data BETWEEN :ini AND :fim "
            "GROUP BY a.id, a.account_id, a.account_name"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    contas = []
    for r in conta_rows:
        sp = float(r[3]); ld = int(r[4]); imp = int(r[5]); rch = int(r[6]); cl = int(r[7])
        contas.append({
            "id": r[0],
            "account_id": r[1],
            "account_name": r[2],
            "spend": sp,
            "leads": ld,
            "cpl": _safe_div(sp, ld),
            "ctr": _safe_div(cl, imp) * 100,
            "cpc": _safe_div(sp, cl),
            "cpm": _safe_div(sp, imp) * 1000,
            "impressions": imp,
            "reach": rch,
            "frequencia": _safe_div(imp, rch),
            "saldo": None,
        })

    diario_rows = db.execute(
        text(
            "SELECT data, "
            "  COALESCE(SUM(spend),0) AS spend, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(impressions),0) AS impressions, "
            "  COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_insights_diarios "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "GROUP BY data ORDER BY data"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    dados_diarios = [
        {"data": str(r[0]), "spend": float(r[1]), "leads": int(r[2]),
         "impressions": int(r[3]), "clicks": int(r[4])}
        for r in diario_rows
    ]

    return {
        "kpis": kpis,
        "contas": contas,
        "dados_diarios": dados_diarios,
        "periodo": {"inicio": str(data_inicio), "fim": str(data_fim)},
    }


@router.get("/campanhas")
def campanhas(
    workspace_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    conta_ids: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_usuario_atual),
):
    ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
    account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db)

    if not account_uuids:
        return []

    rows = db.execute(
        text(
            "SELECT "
            "  campaign_id, "
            "  MAX(nome) AS nome, "
            "  MAX(status) AS status, "
            "  MAX(objetivo) AS objetivo, "
            "  COALESCE(SUM(spend),0) AS spend, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(impressions),0) AS impressions, "
            "  COALESCE(SUM(reach),0) AS reach, "
            "  COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_campanhas_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "GROUP BY campaign_id "
            "ORDER BY spend DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    result = []
    for r in rows:
        sp = float(r[4]); ld = int(r[5]); imp = int(r[6]); rch = int(r[7]); cl = int(r[8])
        result.append({
            "campaign_id": r[0],
            "nome": r[1],
            "status": r[2],
            "objetivo": r[3],
            "spend": sp,
            "leads": ld,
            "cpl": _safe_div(sp, ld),
            "ctr": _safe_div(cl, imp) * 100,
            "cpc": _safe_div(sp, cl),
            "cpm": _safe_div(sp, imp) * 1000,
            "impressions": imp,
            "reach": rch,
            "clicks": cl,
        })
    return result

import json
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
                "WHERE workspace_id = CAST(:ws AS uuid) AND account_id = ANY(:ids) AND plataforma = 'meta'"
            ),
            {"ws": workspace_id, "ids": conta_ids},
        ).fetchall()
    else:
        rows = db.execute(
            text(
                "SELECT id FROM ads_accounts "
                "WHERE workspace_id = CAST(:ws AS uuid) AND plataforma = 'meta'"
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
            "  COALESCE(SUM(clicks),0) AS clicks, "
            "  COALESCE(SUM(leads_whatsapp),0) AS leads_whatsapp, "
            "  COALESCE(SUM(leads_instagram),0) AS leads_instagram, "
            "  COALESCE(SUM(leads_messenger),0) AS leads_messenger, "
            "  COALESCE(SUM(leads_formulario),0) AS leads_formulario, "
            "  COALESCE(SUM(link_click),0) AS link_click, "
            "  COALESCE(SUM(leads_mensagem),0) AS leads_conversa_7d "
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
        "leads_whatsapp": int(kpi_row[5]),
        "leads_instagram": int(kpi_row[6]),
        "leads_messenger": int(kpi_row[7]),
        "leads_formulario": int(kpi_row[8]),
        "link_click": int(kpi_row[9]),
        "leads_conversa_7d": int(kpi_row[10]),
    }

    conta_rows = db.execute(
        text(
            "SELECT "
            "  a.id::text, a.account_id, a.account_name, "
            "  COALESCE(a.balance, 0) AS balance, "
            "  COALESCE(SUM(d.spend),0) AS spend, "
            "  COALESCE(SUM(d.leads),0) AS leads, "
            "  COALESCE(SUM(d.impressions),0) AS impressions, "
            "  COALESCE(SUM(d.reach),0) AS reach, "
            "  COALESCE(SUM(d.clicks),0) AS clicks, "
            "  COALESCE(SUM(d.leads_whatsapp),0) AS leads_whatsapp, "
            "  COALESCE(SUM(d.leads_instagram),0) AS leads_instagram, "
            "  COALESCE(SUM(d.leads_messenger),0) AS leads_messenger, "
            "  COALESCE(SUM(d.leads_formulario),0) AS leads_formulario, "
            "  COALESCE(SUM(d.link_click),0) AS link_click, "
            "  COALESCE(SUM(d.leads_mensagem),0) AS leads_conversa_7d "
            "FROM ads_accounts a "
            "JOIN meta_insights_diarios d ON d.ads_account_id = a.id "
            "WHERE a.id = ANY(:ids) "
            "  AND d.data BETWEEN :ini AND :fim "
            "GROUP BY a.id, a.account_id, a.account_name, a.balance"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    contas = []
    for r in conta_rows:
        bal = float(r[3])
        sp = float(r[4]); ld = int(r[5]); imp = int(r[6]); rch = int(r[7]); cl = int(r[8])
        contas.append({
            "id": r[0],
            "account_id": r[1],
            "account_name": r[2],
            "saldo": bal,
            "spend": sp,
            "leads": ld,
            "cpl": _safe_div(sp, ld),
            "ctr": _safe_div(cl, imp) * 100,
            "cpc": _safe_div(sp, cl),
            "cpm": _safe_div(sp, imp) * 1000,
            "impressions": imp,
            "reach": rch,
            "frequencia": _safe_div(imp, rch),
            "leads_whatsapp": int(r[9]),
            "leads_instagram": int(r[10]),
            "leads_messenger": int(r[11]),
            "leads_formulario": int(r[12]),
            "link_click": int(r[13]),
            "leads_conversa_7d": int(r[14]),
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

    canal_rows = db.execute(
        text(
            "SELECT breakdown_value, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(spend),0) AS spend "
            "FROM meta_publicos_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "  AND breakdown_type = 'placement' "
            "GROUP BY breakdown_value "
            "ORDER BY leads DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    total_leads_canal = sum(int(r[1]) for r in canal_rows) or 1
    leads_por_canal = [
        {
            "canal": r[0],
            "leads": int(r[1]),
            "spend": float(r[2]),
            "percentual": round(int(r[1]) / total_leads_canal * 100, 1),
        }
        for r in canal_rows
    ]

    criativo_rows = db.execute(
        text(
            "SELECT "
            "  ad_id, "
            "  MAX(nome) AS nome, "
            "  MAX(thumbnail_url) AS thumbnail_url, "
            "  MAX(tipo_criativo) AS tipo_criativo, "
            "  MAX(image_url_hq) AS image_url_hq, "
            "  MAX(link_anuncio) AS link_anuncio, "
            "  MAX(carousel_items::text) AS carousel_items, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(spend),0) AS spend, "
            "  COALESCE(SUM(impressions),0) AS impressions, "
            "  COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_anuncios_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "  AND (thumbnail_url IS NOT NULL OR image_url_hq IS NOT NULL) "
            "GROUP BY ad_id "
            "ORDER BY leads DESC "
            "LIMIT 5"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    top_criativos = []
    for r in criativo_rows:
        ld = int(r[7]); sp = float(r[8]); imp = int(r[9]); cl = int(r[10])
        carousel_raw = r[6]
        top_criativos.append({
            "id": r[0],
            "nome": r[1],
            "thumbnail_url": r[4] or r[2],
            "tipo": r[3] or "IMAGE",
            "image_url_hq": r[4],
            "link_anuncio": r[5],
            "carousel_items": json.loads(carousel_raw) if carousel_raw else [],
            "leads": ld,
            "spend": sp,
            "cpl": _safe_div(sp, ld),
            "ctr": _safe_div(cl, imp) * 100,
        })

    return {
        "kpis": kpis,
        "contas": contas,
        "dados_diarios": dados_diarios,
        "leads_por_canal": leads_por_canal,
        "top_criativos": top_criativos,
        "periodo": {"inicio": str(data_inicio), "fim": str(data_fim)},
    }


@router.get("/campanhas-hierarquia")
def campanhas_hierarquia(
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

    camp_rows = db.execute(
        text(
            "SELECT campaign_id, MAX(nome) AS nome, MAX(status) AS status, "
            "  MAX(objetivo) AS objetivo, "
            "  COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(impressions),0) AS impressions, "
            "  COALESCE(SUM(reach),0) AS reach, COALESCE(SUM(clicks),0) AS clicks, "
            "  MAX(orcamento_diario) AS orcamento_diario "
            "FROM meta_campanhas_insights "
            "WHERE ads_account_id = ANY(:ids) AND data BETWEEN :ini AND :fim "
            "GROUP BY campaign_id ORDER BY spend DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    ad_rows = db.execute(
        text(
            "SELECT ad_id, MAX(adset_id) AS adset_id, MAX(adset_name) AS adset_name, "
            "  MAX(campaign_id) AS campaign_id, MAX(nome) AS nome, "
            "  MAX(status) AS status, MAX(tipo_criativo) AS tipo_criativo, "
            "  MAX(thumbnail_url) AS thumbnail_url, MAX(image_url_hq) AS image_url_hq, "
            "  MAX(link_anuncio) AS link_anuncio, MAX(creative_id) AS creative_id, "
            "  COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(impressions),0) AS impressions, "
            "  COALESCE(SUM(reach),0) AS reach, COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_anuncios_insights "
            "WHERE ads_account_id = ANY(:ids) AND data BETWEEN :ini AND :fim "
            "GROUP BY ad_id ORDER BY spend DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    camps: dict = {}
    for r in camp_rows:
        sp = float(r[4]); ld = int(r[5]); imp = int(r[6]); rch = int(r[7]); cl = int(r[8])
        camps[r[0]] = {
            "campaign_id": r[0],
            "nome": r[1],
            "status": (r[2] or "ACTIVE").upper(),
            "objetivo": r[3] or "",
            "spend": sp, "leads": ld, "impressions": imp, "reach": rch, "clicks": cl,
            "ctr": _safe_div(cl, imp) * 100,
            "cpc": _safe_div(sp, cl),
            "cpm": _safe_div(sp, imp) * 1000,
            "cpl": _safe_div(sp, ld),
            "orcamento_diario": float(r[9]) if r[9] else None,
            "conjuntos": {},
        }

    for r in ad_rows:
        ad_id = r[0]; adset_id = r[1] or ""; adset_name = r[2] or adset_id
        camp_id = r[3]
        if camp_id not in camps:
            continue
        camp = camps[camp_id]

        if adset_id not in camp["conjuntos"]:
            camp["conjuntos"][adset_id] = {
                "adset_id": adset_id,
                "adset_name": adset_name,
                "status": "ACTIVE",
                "spend": 0.0, "leads": 0, "impressions": 0, "reach": 0, "clicks": 0,
                "anuncios": [],
            }
        adset = camp["conjuntos"][adset_id]

        sp = float(r[11]); ld = int(r[12]); imp = int(r[13]); rch = int(r[14]); cl = int(r[15])
        adset["spend"] += sp
        adset["leads"] += ld
        adset["impressions"] += imp
        adset["reach"] += rch
        adset["clicks"] += cl

        adset["anuncios"].append({
            "ad_id": ad_id,
            "nome": r[4],
            "status": (r[5] or "ACTIVE").upper(),
            "tipo_criativo": r[6] or "IMAGE",
            "thumbnail_url": r[8] or r[7],
            "image_url_hq": r[8],
            "link_anuncio": r[9],
            "creative_id": r[10],
            "spend": sp, "leads": ld, "impressions": imp, "reach": rch, "clicks": cl,
            "ctr": _safe_div(cl, imp) * 100,
            "cpc": _safe_div(sp, cl),
            "cpm": _safe_div(sp, imp) * 1000,
            "cpl": _safe_div(sp, ld),
        })

    result = []
    for camp in camps.values():
        conjuntos = []
        for adset in camp["conjuntos"].values():
            sp = adset["spend"]; ld = adset["leads"]
            imp = adset["impressions"]; rch = adset["reach"]; cl = adset["clicks"]
            conjuntos.append({
                "adset_id": adset["adset_id"],
                "adset_name": adset["adset_name"],
                "status": adset["status"],
                "spend": sp, "leads": ld, "impressions": imp, "reach": rch, "clicks": cl,
                "ctr": _safe_div(cl, imp) * 100,
                "cpc": _safe_div(sp, cl),
                "cpm": _safe_div(sp, imp) * 1000,
                "cpl": _safe_div(sp, ld),
                "anuncios": adset["anuncios"],
            })
        c = {k: v for k, v in camp.items() if k != "conjuntos"}
        c["conjuntos"] = conjuntos
        result.append(c)

    return result


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


@router.get("/anuncios")
def anuncios(
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
            "  ad_id, "
            "  MAX(adset_id) AS adset_id, "
            "  MAX(adset_name) AS adset_name, "
            "  MAX(campaign_id) AS campaign_id, "
            "  MAX(nome) AS nome, "
            "  MAX(status) AS status, "
            "  MAX(tipo_criativo) AS tipo_criativo, "
            "  MAX(thumbnail_url) AS thumbnail_url, "
            "  MAX(image_url_hq) AS image_url_hq, "
            "  MAX(link_anuncio) AS link_anuncio, "
            "  COALESCE(SUM(spend),0) AS spend, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(impressions),0) AS impressions, "
            "  COALESCE(SUM(reach),0) AS reach, "
            "  COALESCE(SUM(clicks),0) AS clicks, "
            "  COUNT(DISTINCT data) AS dias_ativo "
            "FROM meta_anuncios_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "GROUP BY ad_id "
            "ORDER BY spend DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    if not rows:
        return []

    # Score calculation helpers
    all_spends = [float(r[10]) for r in rows]
    all_leads = [int(r[11]) for r in rows]
    all_cpls = [_safe_div(float(r[10]), int(r[11])) for r in rows]
    valid_cpls = [c for c in all_cpls if c > 0]
    media_cpl = sum(valid_cpls) / len(valid_cpls) if valid_cpls else 0
    max_leads = max(all_leads) if all_leads else 1

    result = []
    for r in rows:
        sp = float(r[10]); ld = int(r[11]); imp = int(r[12])
        rch = int(r[13]); cl = int(r[14]); dias = int(r[15])

        ctr = _safe_div(cl, imp) * 100
        cpc = _safe_div(sp, cl)
        cpm = _safe_div(sp, imp) * 1000
        cpl = _safe_div(sp, ld)
        freq = _safe_div(imp, rch) if rch else 0

        # Score
        if media_cpl > 0 and cpl > 0:
            cpl_score = 40 if cpl <= media_cpl * 0.7 else (25 if cpl <= media_cpl else 10)
        else:
            cpl_score = 10
        ctr_score = 25 if ctr >= 3 else (15 if ctr >= 1.5 else 5)
        leads_score = round((ld / max_leads) * 20) if max_leads > 0 else 0
        freq_score = 15 if freq <= 2 else (10 if freq <= 3 else 0)
        score = cpl_score + ctr_score + leads_score + freq_score

        result.append({
            "ad_id": r[0],
            "adset_id": r[1],
            "adset_name": r[2],
            "campaign_id": r[3],
            "nome": r[4],
            "status": r[5],
            "tipo_criativo": r[6] or "IMAGE",
            "thumbnail_url": r[7],
            "image_url_hq": r[8],
            "link_anuncio": r[9],
            "spend": sp,
            "leads": ld,
            "impressions": imp,
            "reach": rch,
            "clicks": cl,
            "ctr": round(ctr, 4),
            "cpc": round(cpc, 4),
            "cpm": round(cpm, 4),
            "cpl": round(cpl, 4),
            "frequencia": round(freq, 4),
            "score": score,
            "dias_ativo": dias,
        })
    return result


@router.get("/criativos")
def criativos(
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
            "  MAX(creative_id) AS creative_id, "
            "  MAX(tipo_criativo) AS tipo_criativo, "
            "  MAX(thumbnail_url) AS thumbnail_url, "
            "  MAX(image_url_hq) AS image_url_hq, "
            "  MAX(link_anuncio) AS link_anuncio, "
            "  MAX(status) AS status, "
            "  COUNT(DISTINCT ad_id) AS total_anuncios, "
            "  COUNT(DISTINCT campaign_id) AS total_campanhas, "
            "  COUNT(DISTINCT data) AS dias_ativo, "
            "  COALESCE(SUM(spend),0) AS spend, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(impressions),0) AS impressions, "
            "  COALESCE(SUM(reach),0) AS reach, "
            "  COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_anuncios_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "  AND creative_id IS NOT NULL "
            "GROUP BY creative_id "
            "ORDER BY SUM(leads) DESC, SUM(spend) DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    if not rows:
        return []

    all_leads = [int(r[10]) for r in rows]
    all_spends = [float(r[9]) for r in rows]
    all_cpls = [_safe_div(float(r[9]), int(r[10])) for r in rows]
    valid_cpls = [c for c in all_cpls if c > 0]
    media_cpl = sum(valid_cpls) / len(valid_cpls) if valid_cpls else 0
    max_leads = max(all_leads) if all_leads else 1

    result = []
    for r in rows:
        cid = r[0]
        if not cid:
            continue
        sp = float(r[9]); ld = int(r[10]); imp = int(r[11])
        rch = int(r[12]); cl = int(r[13])

        ctr = _safe_div(cl, imp) * 100
        cpc = _safe_div(sp, cl)
        cpm = _safe_div(sp, imp) * 1000
        cpl = _safe_div(sp, ld)
        freq = _safe_div(imp, rch) if rch else 0

        if media_cpl > 0 and cpl > 0:
            cpl_score = 40 if cpl <= media_cpl * 0.7 else (25 if cpl <= media_cpl else 10)
        else:
            cpl_score = 10
        ctr_score = 25 if ctr >= 3 else (15 if ctr >= 1.5 else 5)
        leads_score = round((ld / max_leads) * 20) if max_leads > 0 else 0
        freq_score = 15 if freq <= 2 else (10 if freq <= 3 else 0)
        score = cpl_score + ctr_score + leads_score + freq_score

        result.append({
            "creative_id": cid,
            "tipo_criativo": r[1] or "IMAGE",
            "thumbnail_url": r[2],
            "image_url_hq": r[3],
            "link_anuncio": r[4],
            "status": r[5],
            "total_anuncios": int(r[6]),
            "total_campanhas": int(r[7]),
            "dias_ativo": int(r[8]),
            "spend": sp,
            "leads": ld,
            "impressions": imp,
            "reach": rch,
            "clicks": cl,
            "ctr": round(ctr, 4),
            "cpc": round(cpc, 4),
            "cpm": round(cpm, 4),
            "cpl": round(cpl, 4),
            "frequencia": round(freq, 4),
            "score": score,
        })
    return result


@router.get("/ia")
def insights_ia(
    workspace_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_usuario_atual),
):
    from app.services.ia_insights import (
        gerar_e_salvar_insights,
        buscar_todos_insights_vigentes,
    )

    account_uuids = _conta_ids_da_query(workspace_id, [], db)
    if not account_uuids:
        return []

    # Aggregate KPIs
    kpi_row = db.execute(
        text(
            "SELECT "
            "  COALESCE(SUM(spend),0), COALESCE(SUM(leads),0), "
            "  COALESCE(SUM(impressions),0), COALESCE(SUM(reach),0), "
            "  COALESCE(SUM(clicks),0) "
            "FROM meta_insights_diarios "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchone()

    sp = float(kpi_row[0]); ld = int(kpi_row[1])
    imp = int(kpi_row[2]); rch = int(kpi_row[3]); cl = int(kpi_row[4])
    kpis_global = {
        "spend": sp, "leads": ld, "impressions": imp, "reach": rch, "clicks": cl,
        "ctr": _safe_div(cl, imp) * 100,
        "cpc": _safe_div(sp, cl),
        "cpm": _safe_div(sp, imp) * 1000,
        "cpl": _safe_div(sp, ld),
        "frequencia": _safe_div(imp, rch),
    }

    # Per-account KPIs
    conta_rows = db.execute(
        text(
            "SELECT a.id::text, a.account_id, a.account_name, "
            "  COALESCE(SUM(d.spend),0), COALESCE(SUM(d.leads),0), "
            "  COALESCE(SUM(d.impressions),0), COALESCE(SUM(d.reach),0), "
            "  COALESCE(SUM(d.clicks),0) "
            "FROM ads_accounts a "
            "JOIN meta_insights_diarios d ON d.ads_account_id = a.id "
            "WHERE a.id = ANY(:ids) "
            "  AND d.data BETWEEN :ini AND :fim "
            "GROUP BY a.id, a.account_id, a.account_name"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchall()

    contas_resumo = []
    for r in conta_rows:
        acc_sp = float(r[3]); acc_ld = int(r[4])
        acc_imp = int(r[5]); acc_rch = int(r[6]); acc_cl = int(r[7])
        contas_resumo.append({
            "ads_account_id": r[0],
            "account_id": r[1],
            "account_name": r[2],
            "spend": acc_sp,
            "leads": acc_ld,
            "impressions": acc_imp,
            "reach": acc_rch,
            "clicks": acc_cl,
            "cpl": _safe_div(acc_sp, acc_ld),
            "ctr": _safe_div(acc_cl, acc_imp) * 100,
            "cpm": _safe_div(acc_sp, acc_imp) * 1000,
            "frequencia": _safe_div(acc_imp, acc_rch),
        })

    data_ini_str = str(data_inicio)
    data_fim_str = str(data_fim)

    # Generate per-account insights
    for conta in contas_resumo:
        kpis_conta = {
            "spend": conta["spend"], "leads": conta["leads"],
            "impressions": conta["impressions"], "reach": conta["reach"],
            "clicks": conta["clicks"], "cpl": conta["cpl"],
            "ctr": conta["ctr"], "cpm": conta["cpm"],
            "frequencia": conta["frequencia"],
        }
        gerar_e_salvar_insights(
            workspace_id=workspace_id,
            ads_account_id=conta["ads_account_id"],
            kpis=kpis_conta,
            contas=contas_resumo,
            data_inicio=data_ini_str,
            data_fim=data_fim_str,
            db=db,
        )

    # Generate workspace-level insight
    gerar_e_salvar_insights(
        workspace_id=workspace_id,
        ads_account_id=None,
        kpis=kpis_global,
        contas=contas_resumo,
        data_inicio=data_ini_str,
        data_fim=data_fim_str,
        db=db,
    )

    return buscar_todos_insights_vigentes(workspace_id, db)


@router.patch("/{insight_id}/resolver")
def resolver_insight(
    insight_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_usuario_atual),
):
    db.execute(
        text("UPDATE ai_insights SET resolvido = true WHERE id = CAST(:id AS uuid)"),
        {"id": insight_id},
    )
    db.commit()
    return {"ok": True}

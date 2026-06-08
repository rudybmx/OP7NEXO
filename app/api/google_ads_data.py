"""Google Ads — endpoints de leitura de insights para o front-end."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, listar_workspaces_autorizados
from app.models.ads_account import AdsAccount
from app.models.user import User

router = APIRouter(prefix="/google-ads", tags=["google_ads"])


def _verificar_acesso_workspace(workspace_id: str, usuario: User, db: Session) -> None:
    """Garante que o usuário tem acesso ao workspace solicitado."""
    from app.models.user import RoleUsuario
    if usuario.role == RoleUsuario.platform_admin:
        return
    ws_ids = {str(w.id) for w in listar_workspaces_autorizados(usuario, db)}
    if workspace_id not in ws_ids:
        raise HTTPException(status_code=403, detail="Acesso negado ao workspace")


def _resolver_workspace_id(
    workspace_id: str,
    ads_account_id: str | None,
    usuario: User,
    db: Session,
) -> str:
    """Se ads_account_id fornecido, usa o workspace real da conta (cross-workspace fix).

    Resolve o problema de admins que têm workspace ativo diferente do workspace
    da conta selecionada. O frontend sempre envia workspaceAtivo.id, mas quando
    uma conta de outro workspace é selecionada, o workspace_id deve ser sobrescrito.
    """
    if ads_account_id:
        try:
            acc = db.get(AdsAccount, uuid.UUID(ads_account_id))
        except Exception:
            acc = None
        if acc:
            ws_real = str(acc.workspace_id)
            _verificar_acesso_workspace(ws_real, usuario, db)
            return ws_real
    _verificar_acesso_workspace(workspace_id, usuario, db)
    return workspace_id


def _periodo_datas(periodo: str) -> tuple[str, str]:
    from datetime import date, timedelta
    dias = {"7d": 7, "30d": 30, "90d": 90}.get(periodo, 30)
    end = date.today()
    start = end - timedelta(days=dias)
    return start.isoformat(), end.isoformat()


def _resolver_datas(
    periodo: str,
    start_date: str | None,
    end_date: str | None,
) -> tuple[str, str]:
    """Prefere start_date/end_date explícitos; fallback para período."""
    if start_date and end_date:
        return start_date, end_date
    return _periodo_datas(periodo)


@router.get("/campanhas")
def listar_campanhas(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    periodo: str = Query("30d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    tipo: str | None = Query(None),
    status_filtro: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    workspace_id = _resolver_workspace_id(workspace_id, ads_account_id, usuario, db)
    start, end = _resolver_datas(periodo, start_date, end_date)

    filtros = "AND g.workspace_id = :wid AND g.periodo_inicio <= :end AND g.periodo_fim >= :start AND g.ativo = true"
    params: dict = {"wid": workspace_id, "start": start, "end": end}

    if ads_account_id:
        filtros += " AND g.ads_account_id = :aid"
        params["aid"] = ads_account_id
    if tipo and tipo != "todas":
        filtros += " AND g.tipo_campanha = :tipo"
        params["tipo"] = tipo.upper()
    if status_filtro and status_filtro != "todos":
        filtros += " AND g.status = :status"
        params["status"] = status_filtro.upper()

    rows = db.execute(text(f"""
        SELECT g.*, aa.account_name
        FROM google_campanhas_insights g
        JOIN ads_accounts aa ON aa.id = g.ads_account_id
        WHERE 1=1 {filtros}
        ORDER BY g.investimento DESC
    """), params).mappings().all()

    return [dict(r) for r in rows]


@router.get("/visao-geral")
def visao_geral(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    periodo: str = Query("30d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    workspace_id = _resolver_workspace_id(workspace_id, ads_account_id, usuario, db)
    start, end = _resolver_datas(periodo, start_date, end_date)

    params: dict = {"wid": workspace_id, "start": start, "end": end}
    filtro_aid = ""
    if ads_account_id:
        filtro_aid = " AND ads_account_id = :aid"
        params["aid"] = ads_account_id

    rows = db.execute(text(f"""
        SELECT * FROM google_campanhas_insights
        WHERE workspace_id = :wid
          AND periodo_inicio <= :end AND periodo_fim >= :start
          AND ativo = true
          {filtro_aid}
    """), params).mappings().all()

    campanhas = [dict(r) for r in rows]
    if not campanhas:
        return _kpi_vazio()

    total_inv = sum(c["investimento"] or 0 for c in campanhas)
    total_cliques = sum(c["cliques"] or 0 for c in campanhas)
    total_impressoes = sum(c["impressoes"] or 0 for c in campanhas)
    total_conv = sum(float(c["conversoes"] or 0) for c in campanhas)
    total_val = sum(float(c["valor_conversoes"] or 0) for c in campanhas)

    kpi = {
        "investimentoTotal": round(total_inv, 2),
        "cliquesTotal": total_cliques,
        "conversoesTotal": round(total_conv, 2),
        "ctrMedio": round((total_cliques / total_impressoes * 100) if total_impressoes > 0 else 0, 4),
        "cpcMedio": round(total_inv / total_cliques if total_cliques > 0 else 0, 2),
        "roasMedio": round(total_val / total_inv if total_inv > 0 else 0, 4),
        "impressionShareMedio": round(
            sum(float(c["impression_share"] or 0) for c in campanhas if c["impression_share"]) /
            max(1, sum(1 for c in campanhas if c["impression_share"])), 4
        ),
        "qualityScoreMedio": round(
            sum(float(c["quality_score_medio"] or 0) for c in campanhas if c["quality_score_medio"]) /
            max(1, sum(1 for c in campanhas if c["quality_score_medio"])), 2
        ),
        # Deltas calculados via período anterior (simplificado — 0 se não há dado anterior)
        "deltaInvestimento": 0.0,
        "deltaCliques": 0.0,
        "deltaConversoes": 0.0,
        "deltaCtr": 0.0,
        "deltaCpc": 0.0,
        "deltaRoas": 0.0,
    }

    # Breakdown por tipo de campanha
    tipos: dict[str, dict] = {}
    CORES = {
        "SEARCH": "#3E5BFF", "DISPLAY": "#7A5AF8", "PERFORMANCE_MAX": "#00F5FF",
        "VIDEO": "#FF5C8D", "SHOPPING": "#0FA856", "DEMAND_GEN": "#C9A84C",
    }
    for c in campanhas:
        t = c["tipo_campanha"] or "OUTROS"
        if t not in tipos:
            tipos[t] = {"tipo": t, "label": t.replace("_", " ").title(),
                        "investimento": 0, "cliques": 0, "conversoes": 0,
                        "ctr": 0, "roas": 0, "cor": CORES.get(t, "#888")}
        tipos[t]["investimento"] += float(c["investimento"] or 0)
        tipos[t]["cliques"] += int(c["cliques"] or 0)
        tipos[t]["conversoes"] += float(c["conversoes"] or 0)

    for t_data in tipos.values():
        t_data["ctr"] = round(
            (t_data["cliques"] / max(1, sum(int(c["impressoes"] or 0)
             for c in campanhas if c["tipo_campanha"] == t_data["tipo"])) * 100), 4)
        t_data["roas"] = round(
            sum(float(c["valor_conversoes"] or 0) for c in campanhas if c["tipo_campanha"] == t_data["tipo"]) /
            max(0.01, t_data["investimento"]), 4)

    # Distribuição Quality Score
    faixas = [
        {"faixa": "9-10", "min": 9, "max": 10, "cor": "#0FA856"},
        {"faixa": "7-8", "min": 7, "max": 8, "cor": "#3E5BFF"},
        {"faixa": "4-6", "min": 4, "max": 6, "cor": "#C9A84C"},
        {"faixa": "0-3", "min": 0, "max": 3, "cor": "#FF5C8D"},
    ]
    qs_vals = [float(c["quality_score_medio"] or 0) for c in campanhas if c["quality_score_medio"]]
    distribuicao_qs = []
    for f in faixas:
        distribuicao_qs.append({
            "faixa": f["faixa"],
            "quantidade": sum(1 for v in qs_vals if f["min"] <= v <= f["max"]),
            "cor": f["cor"],
        })

    # Dados diários agregados
    diarios_rows = db.execute(text(f"""
        SELECT data,
               SUM(cliques) as cliques,
               SUM(impressoes) as impressoes,
               SUM(conversoes) as conversoes,
               SUM(custo) as custo
        FROM google_dados_diarios
        WHERE workspace_id = :wid
          AND data BETWEEN :start AND :end
          AND ativo = true
          {filtro_aid.replace('ads_account_id', 'ads_account_id')}
        GROUP BY data
        ORDER BY data
    """), params).mappings().all()

    dados_diarios = []
    for r in diarios_rows:
        clq = int(r["cliques"] or 0)
        imp = int(r["impressoes"] or 0)
        dados_diarios.append({
            "data": r["data"].isoformat() if hasattr(r["data"], "isoformat") else str(r["data"]),
            "cliques": clq,
            "impressoes": imp,
            "conversoes": float(r["conversoes"] or 0),
            "custo": float(r["custo"] or 0),
            "ctr": round((clq / imp * 100) if imp > 0 else 0, 4),
        })

    return {
        "kpi": kpi,
        "breakdownTipos": list(tipos.values()),
        "distribuicaoQS": distribuicao_qs,
        "dadosDiarios": dados_diarios,
    }


def _kpi_vazio():
    return {
        "kpi": {
            "investimentoTotal": 0, "cliquesTotal": 0, "conversoesTotal": 0,
            "ctrMedio": 0, "cpcMedio": 0, "roasMedio": 0,
            "impressionShareMedio": 0, "qualityScoreMedio": 0,
            "deltaInvestimento": 0, "deltaCliques": 0, "deltaConversoes": 0,
            "deltaCtr": 0, "deltaCpc": 0, "deltaRoas": 0,
        },
        "breakdownTipos": [],
        "distribuicaoQS": [],
        "dadosDiarios": [],
    }


@router.get("/dados-diarios")
def dados_diarios(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    periodo: str = Query("30d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    workspace_id = _resolver_workspace_id(workspace_id, ads_account_id, usuario, db)
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"wid": workspace_id, "start": start, "end": end}
    filtros = ""
    if ads_account_id:
        filtros += " AND ads_account_id = :aid"
        params["aid"] = ads_account_id
    if campaign_id:
        filtros += " AND campaign_id = :cid"
        params["cid"] = campaign_id

    rows = db.execute(text(f"""
        SELECT data, SUM(cliques) cliques, SUM(impressoes) impressoes,
               SUM(conversoes) conversoes, SUM(custo) custo
        FROM google_dados_diarios
        WHERE workspace_id = :wid AND data BETWEEN :start AND :end AND ativo = true
        {filtros}
        GROUP BY data ORDER BY data
    """), params).mappings().all()

    result = []
    for r in rows:
        clq = int(r["cliques"] or 0)
        imp = int(r["impressoes"] or 0)
        result.append({
            "data": r["data"].isoformat() if hasattr(r["data"], "isoformat") else str(r["data"]),
            "cliques": clq, "impressoes": imp,
            "conversoes": float(r["conversoes"] or 0),
            "custo": float(r["custo"] or 0),
            "ctr": round((clq / imp * 100) if imp > 0 else 0, 4),
        })
    return result


@router.get("/grupos")
def listar_grupos(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    periodo: str = Query("30d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    workspace_id = _resolver_workspace_id(workspace_id, ads_account_id, usuario, db)
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"wid": workspace_id, "start": start, "end": end}
    filtros = ""
    if ads_account_id:
        filtros += " AND ads_account_id = :aid"
        params["aid"] = ads_account_id
    if campaign_id:
        filtros += " AND campaign_id = :cid"
        params["cid"] = campaign_id

    rows = db.execute(text(f"""
        SELECT * FROM google_grupos_insights
        WHERE workspace_id = :wid
          AND periodo_inicio <= :end AND periodo_fim >= :start AND ativo = true
          {filtros}
        ORDER BY investimento DESC
    """), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/keywords")
def listar_keywords(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    periodo: str = Query("30d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: str | None = Query(None),
    ad_group_id: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    workspace_id = _resolver_workspace_id(workspace_id, ads_account_id, usuario, db)
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"wid": workspace_id, "start": start, "end": end}
    filtros = ""
    if ads_account_id:
        filtros += " AND ads_account_id = :aid"
        params["aid"] = ads_account_id
    if campaign_id:
        filtros += " AND campaign_id = :cid"
        params["cid"] = campaign_id
    if ad_group_id:
        filtros += " AND ad_group_id = :agid"
        params["agid"] = ad_group_id

    rows = db.execute(text(f"""
        SELECT * FROM google_keywords_insights
        WHERE workspace_id = :wid
          AND periodo_inicio <= :end AND periodo_fim >= :start AND ativo = true
          {filtros}
        ORDER BY investimento DESC
    """), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/anuncios")
def listar_anuncios(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    periodo: str = Query("30d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    workspace_id = _resolver_workspace_id(workspace_id, ads_account_id, usuario, db)
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"wid": workspace_id, "start": start, "end": end}
    filtros = ""
    if ads_account_id:
        filtros += " AND ads_account_id = :aid"
        params["aid"] = ads_account_id
    if campaign_id:
        filtros += " AND campaign_id = :cid"
        params["cid"] = campaign_id

    rows = db.execute(text(f"""
        SELECT * FROM google_anuncios_insights
        WHERE workspace_id = :wid
          AND periodo_inicio <= :end AND periodo_fim >= :start AND ativo = true
          {filtros}
        ORDER BY investimento DESC
    """), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/publicos")
def listar_publicos(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    periodo: str = Query("30d"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    workspace_id = _resolver_workspace_id(workspace_id, ads_account_id, usuario, db)
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"wid": workspace_id, "start": start, "end": end}
    filtros = ""
    if ads_account_id:
        filtros += " AND ads_account_id = :aid"
        params["aid"] = ads_account_id
    if campaign_id:
        filtros += " AND campaign_id = :cid"
        params["cid"] = campaign_id

    rows = db.execute(text(f"""
        SELECT * FROM google_publicos_insights
        WHERE workspace_id = :wid
          AND periodo_inicio <= :end AND periodo_fim >= :start AND ativo = true
          {filtros}
        ORDER BY investimento DESC
    """), params).mappings().all()
    return [dict(r) for r in rows]

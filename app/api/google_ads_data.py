"""Google Ads — endpoints de leitura de insights para o front-end."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, listar_workspaces_autorizados, verificar_acesso_workspace
from app.models.ads_account import AdsAccount
from app.models.user import User
from app.services.ads_account_access import listar_ads_account_ids_acessiveis

router = APIRouter(prefix="/google-ads", tags=["google_ads"])


def _conta_ids_google(
    workspace_id: str,
    ads_account_id: str | None,
    db: Session,
    usuario: User,
) -> list:
    """Resolve IDs de contas Google acessíveis ao workspace (padrão Meta Ads).

    Usa ads_account_workspace_access para suportar cross-workspace access.
    Se ads_account_id fornecido, filtra para aquela conta específica.
    """
    verificar_acesso_workspace(usuario, uuid.UUID(workspace_id), db)
    ads_account_uuid = uuid.UUID(ads_account_id) if ads_account_id else None
    return listar_ads_account_ids_acessiveis(
        db,
        uuid.UUID(workspace_id),
        ads_account_uuid=ads_account_uuid,
        plataforma="google",
        include_inactive=True,
    )


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


# ─── Helpers de fatiamento diário ───────────────────────────────────────────
# Métricas somáveis vêm das tabelas google_*_diarios (fatiadas por data);
# metadados + impression_share + quality_score continuam do snapshot de janela.

def _derivar(inv: float, clq: int, imp: int, conv: float, val: float) -> dict:
    """Recalcula métricas derivadas a partir das somas da fatia selecionada."""
    return {
        "ctr": round((clq / imp * 100) if imp > 0 else 0, 6),
        "cpc_medio": round(inv / clq if clq > 0 else 0, 2),
        "cpm": round((inv / imp * 1000) if imp > 0 else 0, 2),
        "roas": round(val / inv if inv > 0 else 0, 4),
        "taxa_conversao": round((conv / clq * 100) if clq > 0 else 0, 6),
        "custo_conversao": round(inv / conv if conv > 0 else 0, 2),
    }


def _agg_diario(db, tabela: str, key_cols: list[str], params: dict,
                filtros: str = "", custo_col: str = "investimento",
                com_valor: bool = True) -> dict:
    """Agrega uma tabela diária por entidade na fatia de datas.

    Retorna dict: chave = tupla (ads_account_id, *key_cols) em str;
    valor = dict com investimento/cliques/impressoes/conversoes/valor_conversoes.
    """
    val_sel = "SUM(valor_conversoes) AS valor_conversoes" if com_valor else "0 AS valor_conversoes"
    cols = ", ".join(key_cols)
    rows = db.execute(text(f"""
        SELECT ads_account_id, {cols},
               SUM({custo_col}) AS investimento,
               SUM(cliques) AS cliques,
               SUM(impressoes) AS impressoes,
               SUM(conversoes) AS conversoes,
               {val_sel}
        FROM {tabela}
        WHERE ads_account_id = ANY(:ids) AND data BETWEEN :start AND :end AND ativo = true
        {filtros}
        GROUP BY ads_account_id, {cols}
    """), params).mappings().all()
    out: dict = {}
    for r in rows:
        key = (str(r["ads_account_id"]),) + tuple(str(r[c]) for c in key_cols)
        out[key] = {
            "investimento": float(r["investimento"] or 0),
            "cliques": int(r["cliques"] or 0),
            "impressoes": int(r["impressoes"] or 0),
            "conversoes": float(r["conversoes"] or 0),
            "valor_conversoes": float(r["valor_conversoes"] or 0),
        }
    return out


def _overlay(snapshot_rows, daily_by_key, key_cols: list[str]) -> list[dict]:
    """Sobrepõe métricas da fatia diária nos metadados do snapshot.

    Mantém IS/quality_score/metadados do snapshot; substitui métricas somáveis
    e derivadas pelos valores da fatia. Descarta entidades sem atividade na fatia
    (padrão Meta: lista só o que teve atividade no range)."""
    out: list[dict] = []
    for r in snapshot_rows:
        d = dict(r)
        key = (str(d["ads_account_id"]),) + tuple(str(d[c]) for c in key_cols)
        agg = daily_by_key.get(key)
        if not agg:
            continue
        inv = agg["investimento"]; clq = agg["cliques"]; imp = agg["impressoes"]
        conv = agg["conversoes"]; val = agg["valor_conversoes"]
        d["investimento"] = round(inv, 2)
        d["cliques"] = clq
        d["impressoes"] = imp
        d["conversoes"] = round(conv, 4)
        if "valor_conversoes" in d:
            d["valor_conversoes"] = round(val, 2)
        d.update(_derivar(inv, clq, imp, conv, val))
        out.append(d)
    out.sort(key=lambda x: x.get("investimento", 0) or 0, reverse=True)
    return out


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
    account_ids = _conta_ids_google(workspace_id, ads_account_id, db, usuario)
    if not account_ids:
        return []
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"ids": account_ids, "start": start, "end": end}

    # Snapshot de janela (metadados + impression_share + quality_score)
    snap_filtros = "AND g.ativo = true"
    if tipo and tipo != "todas":
        snap_filtros += " AND g.tipo_campanha = :tipo"
        params["tipo"] = tipo.upper()
    if status_filtro and status_filtro != "todos":
        snap_filtros += " AND g.status = :status"
        params["status"] = status_filtro.upper()

    snap = db.execute(text(f"""
        SELECT g.*, aa.account_name
        FROM google_campanhas_insights g
        JOIN ads_accounts aa ON aa.id = g.ads_account_id
        WHERE g.ads_account_id = ANY(:ids) {snap_filtros}
    """), params).mappings().all()

    # Métricas somáveis fatiadas por data (google_dados_diarios usa coluna 'custo')
    daily = _agg_diario(db, "google_dados_diarios", ["campaign_id"], params, custo_col="custo")
    return _overlay(snap, daily, ["campaign_id"])


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
    account_ids = _conta_ids_google(workspace_id, ads_account_id, db, usuario)
    if not account_ids:
        return _kpi_vazio()
    start, end = _resolver_datas(periodo, start_date, end_date)

    params: dict = {"ids": account_ids, "start": start, "end": end}

    # Métricas somáveis fatiadas por data (por campanha)
    daily_camp = _agg_diario(db, "google_dados_diarios", ["campaign_id"], params, custo_col="custo")
    if not daily_camp:
        return _kpi_vazio()

    total_inv = sum(v["investimento"] for v in daily_camp.values())
    total_cliques = sum(v["cliques"] for v in daily_camp.values())
    total_impressoes = sum(v["impressoes"] for v in daily_camp.values())
    total_conv = sum(v["conversoes"] for v in daily_camp.values())
    total_val = sum(v["valor_conversoes"] for v in daily_camp.values())

    # Snapshot de janela — tipo_campanha + impression_share + quality_score
    # (não-somáveis): restrito às campanhas com atividade na fatia.
    snap_rows = db.execute(text("""
        SELECT * FROM google_campanhas_insights
        WHERE ads_account_id = ANY(:ids) AND ativo = true
    """), params).mappings().all()
    snap_by_camp = {(str(r["ads_account_id"]), str(r["campaign_id"])): dict(r) for r in snap_rows}
    ativas = [snap_by_camp[k] for k in daily_camp if k in snap_by_camp]

    kpi = {
        "investimentoTotal": round(total_inv, 2),
        "cliquesTotal": total_cliques,
        "conversoesTotal": round(total_conv, 2),
        "ctrMedio": round((total_cliques / total_impressoes * 100) if total_impressoes > 0 else 0, 4),
        "cpcMedio": round(total_inv / total_cliques if total_cliques > 0 else 0, 2),
        "roasMedio": round(total_val / total_inv if total_inv > 0 else 0, 4),
        "impressionShareMedio": round(
            sum(float(c["impression_share"] or 0) for c in ativas if c.get("impression_share")) /
            max(1, sum(1 for c in ativas if c.get("impression_share"))), 4
        ),
        "qualityScoreMedio": round(
            sum(float(c["quality_score_medio"] or 0) for c in ativas if c.get("quality_score_medio")) /
            max(1, sum(1 for c in ativas if c.get("quality_score_medio"))), 2
        ),
        # Deltas calculados via período anterior (simplificado — 0 se não há dado anterior)
        "deltaInvestimento": 0.0,
        "deltaCliques": 0.0,
        "deltaConversoes": 0.0,
        "deltaCtr": 0.0,
        "deltaCpc": 0.0,
        "deltaRoas": 0.0,
    }

    # Breakdown por tipo de campanha (métricas da fatia; tipo via snapshot)
    CORES = {
        "SEARCH": "#3E5BFF", "DISPLAY": "#7A5AF8", "PERFORMANCE_MAX": "#00F5FF",
        "VIDEO": "#FF5C8D", "SHOPPING": "#0FA856", "DEMAND_GEN": "#C9A84C",
    }
    tipos: dict[str, dict] = {}
    for key, agg in daily_camp.items():
        snap_c = snap_by_camp.get(key)
        t = (snap_c.get("tipo_campanha") if snap_c else None) or "OUTROS"
        if t not in tipos:
            tipos[t] = {"tipo": t, "label": t.replace("_", " ").title(),
                        "investimento": 0.0, "cliques": 0, "conversoes": 0.0,
                        "ctr": 0, "roas": 0, "cor": CORES.get(t, "#888"),
                        "_imp": 0, "_val": 0.0}
        tipos[t]["investimento"] += agg["investimento"]
        tipos[t]["cliques"] += agg["cliques"]
        tipos[t]["conversoes"] += agg["conversoes"]
        tipos[t]["_imp"] += agg["impressoes"]
        tipos[t]["_val"] += agg["valor_conversoes"]

    for t_data in tipos.values():
        imp = t_data.pop("_imp"); val = t_data.pop("_val")
        t_data["ctr"] = round((t_data["cliques"] / imp * 100) if imp > 0 else 0, 4)
        t_data["roas"] = round(val / t_data["investimento"], 4) if t_data["investimento"] > 0 else 0
        t_data["investimento"] = round(t_data["investimento"], 2)
        t_data["conversoes"] = round(t_data["conversoes"], 2)

    # Distribuição Quality Score (snapshot das campanhas ativas na fatia)
    faixas = [
        {"faixa": "9-10", "min": 9, "max": 10, "cor": "#0FA856"},
        {"faixa": "7-8", "min": 7, "max": 8, "cor": "#3E5BFF"},
        {"faixa": "4-6", "min": 4, "max": 6, "cor": "#C9A84C"},
        {"faixa": "0-3", "min": 0, "max": 3, "cor": "#FF5C8D"},
    ]
    qs_vals = [float(c["quality_score_medio"] or 0) for c in ativas if c.get("quality_score_medio")]
    distribuicao_qs = []
    for f in faixas:
        distribuicao_qs.append({
            "faixa": f["faixa"],
            "quantidade": sum(1 for v in qs_vals if f["min"] <= v <= f["max"]),
            "cor": f["cor"],
        })

    # Dados diários agregados
    diarios_rows = db.execute(text("""
        SELECT data,
               SUM(cliques) as cliques,
               SUM(impressoes) as impressoes,
               SUM(conversoes) as conversoes,
               SUM(custo) as custo
        FROM google_dados_diarios
        WHERE ads_account_id = ANY(:ids)
          AND data BETWEEN :start AND :end
          AND ativo = true
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
    account_ids = _conta_ids_google(workspace_id, ads_account_id, db, usuario)
    if not account_ids:
        return []
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"ids": account_ids, "start": start, "end": end}
    filtros = ""
    if campaign_id:
        filtros += " AND campaign_id = :cid"
        params["cid"] = campaign_id

    rows = db.execute(text(f"""
        SELECT data, SUM(cliques) cliques, SUM(impressoes) impressoes,
               SUM(conversoes) conversoes, SUM(custo) custo
        FROM google_dados_diarios
        WHERE ads_account_id = ANY(:ids) AND data BETWEEN :start AND :end AND ativo = true
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
    account_ids = _conta_ids_google(workspace_id, ads_account_id, db, usuario)
    if not account_ids:
        return []
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"ids": account_ids, "start": start, "end": end}
    filtros = ""
    if campaign_id:
        filtros += " AND campaign_id = :cid"
        params["cid"] = campaign_id

    snap = db.execute(text(f"""
        SELECT * FROM google_grupos_insights
        WHERE ads_account_id = ANY(:ids) AND ativo = true
          {filtros}
    """), params).mappings().all()
    daily = _agg_diario(db, "google_grupos_diarios", ["grupo_id", "tipo_grupo"],
                        params, filtros=filtros, custo_col="investimento")
    return _overlay(snap, daily, ["grupo_id", "tipo_grupo"])


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
    account_ids = _conta_ids_google(workspace_id, ads_account_id, db, usuario)
    if not account_ids:
        return []
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"ids": account_ids, "start": start, "end": end}
    filtros = ""
    if campaign_id:
        filtros += " AND campaign_id = :cid"
        params["cid"] = campaign_id
    if ad_group_id:
        filtros += " AND ad_group_id = :agid"
        params["agid"] = ad_group_id

    snap = db.execute(text(f"""
        SELECT * FROM google_keywords_insights
        WHERE ads_account_id = ANY(:ids) AND ativo = true
          {filtros}
    """), params).mappings().all()
    daily = _agg_diario(db, "google_keywords_diarios", ["criterion_id"],
                        params, filtros=filtros, custo_col="investimento")
    return _overlay(snap, daily, ["criterion_id"])


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
    account_ids = _conta_ids_google(workspace_id, ads_account_id, db, usuario)
    if not account_ids:
        return []
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"ids": account_ids, "start": start, "end": end}
    filtros = ""
    if campaign_id:
        filtros += " AND campaign_id = :cid"
        params["cid"] = campaign_id

    snap = db.execute(text(f"""
        SELECT * FROM google_anuncios_insights
        WHERE ads_account_id = ANY(:ids) AND ativo = true
          {filtros}
    """), params).mappings().all()
    daily = _agg_diario(db, "google_anuncios_diarios", ["ad_id"],
                        params, filtros=filtros, custo_col="investimento")
    return _overlay(snap, daily, ["ad_id"])


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
    account_ids = _conta_ids_google(workspace_id, ads_account_id, db, usuario)
    if not account_ids:
        return []
    start, end = _resolver_datas(periodo, start_date, end_date)
    params: dict = {"ids": account_ids, "start": start, "end": end}
    filtros = ""
    if campaign_id:
        filtros += " AND campaign_id = :cid"
        params["cid"] = campaign_id

    snap = db.execute(text(f"""
        SELECT * FROM google_publicos_insights
        WHERE ads_account_id = ANY(:ids) AND ativo = true
          {filtros}
    """), params).mappings().all()
    daily = _agg_diario(db, "google_publicos_diarios", ["criterion_id"],
                        params, filtros=filtros, custo_col="investimento", com_valor=False)

    itens = []
    for r in snap:
        d = dict(r)
        key = (str(d["ads_account_id"]), str(d["criterion_id"]))
        agg = daily.get(key)
        if not agg:
            continue
        inv = agg["investimento"]; clq = agg["cliques"]; imp = agg["impressoes"]
        leads = int(round(agg["conversoes"]))
        d["investimento"] = round(inv, 2)
        d["leads"] = leads
        d["cpl"] = round(inv / leads, 2) if leads > 0 else 0.0
        d["ctr"] = round((clq / imp * 100) if imp > 0 else 0, 6)
        itens.append(d)

    total_leads = sum(i["leads"] for i in itens) or 1
    for i in itens:
        i["percentual"] = round(i["leads"] / total_leads * 100, 4)
    itens.sort(key=lambda x: x.get("investimento", 0) or 0, reverse=True)
    return itens

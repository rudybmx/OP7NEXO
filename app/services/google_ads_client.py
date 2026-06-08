"""Google Ads API client — instanciação e queries GAQL via search_stream."""

from __future__ import annotations

from datetime import date, timedelta

from google.ads.googleads.client import GoogleAdsClient


def get_client(cred: dict) -> GoogleAdsClient:
    """Cria GoogleAdsClient a partir de um dict de credenciais.

    login_customer_id é OBRIGATÓRIO para acesso via MCC — sem ele a API
    retorna PERMISSION_DENIED ao tentar ler contas filhas.
    """
    config = {
        "developer_token": cred["developer_token"],
        "client_id": cred["client_id"],
        "client_secret": cred["client_secret"],
        "refresh_token": cred["refresh_token"],
        "use_proto_plus": True,
    }
    if cred.get("manager_customer_id"):
        config["login_customer_id"] = cred["manager_customer_id"]
    return GoogleAdsClient.load_from_dict(config)


def _periodo_datas(periodo: str) -> tuple[str, str]:
    """Converte '7d'/'30d'/'90d' em (start_date, end_date) ISO."""
    dias = {"7d": 7, "30d": 30, "90d": 90}.get(periodo, 30)
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=dias - 1)
    return start.isoformat(), end.isoformat()


def listar_contas_acessiveis(cred: dict) -> list[dict]:
    """Retorna lista de contas cliente acessíveis pelo MCC da credencial."""
    client = get_client(cred)
    ga_service = client.get_service("GoogleAdsService")
    query = """
        SELECT
            customer_client.client_customer,
            customer_client.level,
            customer_client.descriptive_name,
            customer_client.currency_code,
            customer_client.time_zone
        FROM customer_client
        WHERE customer_client.level <= 1
          AND customer_client.status = 'ENABLED'
    """
    manager_id = cred.get("manager_customer_id", "")
    stream = ga_service.search_stream(customer_id=manager_id, query=query)
    contas = []
    for batch in stream:
        for row in batch.results:
            cc = row.customer_client
            # client_customer retorna resource name "customers/123456789"
            customer_id = cc.client_customer.split("/")[-1] if cc.client_customer else ""
            if customer_id == manager_id:
                continue  # pula o próprio MCC
            contas.append({
                "customer_id": customer_id,
                "nome": cc.descriptive_name or customer_id,
                "currency": cc.currency_code,
                "timezone": cc.time_zone,
            })
    return contas


# ─── GAQL Queries ───────────────────────────────────────────────────────────

QUERY_CAMPANHAS = """
SELECT
    campaign.id, campaign.name, campaign.advertising_channel_type,
    campaign.status, campaign_budget.amount_micros,
    metrics.cost_micros, metrics.clicks, metrics.impressions,
    metrics.conversions, metrics.conversions_value,
    metrics.search_impression_share,
    metrics.search_budget_lost_impression_share,
    metrics.search_rank_lost_impression_share,
    metrics.search_absolute_top_impression_share
FROM campaign
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND campaign.status != 'REMOVED'
"""

QUERY_QUALITY_SCORE = """
SELECT
    campaign.id,
    ad_group_criterion.quality_info.quality_score
FROM keyword_view
WHERE ad_group_criterion.status != 'REMOVED'
  AND campaign.status != 'REMOVED'
"""

QUERY_DADOS_DIARIOS = """
SELECT
    campaign.id, segments.date,
    metrics.clicks, metrics.impressions, metrics.conversions,
    metrics.cost_micros
FROM campaign
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND campaign.status != 'REMOVED'
"""

QUERY_GRUPOS = """
SELECT
    campaign.id, campaign.bidding_strategy_type,
    campaign.target_cpa.target_cpa_micros,
    campaign.target_roas.target_roas,
    ad_group.id, ad_group.name, ad_group.status,
    metrics.cost_micros, metrics.clicks, metrics.impressions,
    metrics.conversions, metrics.conversions_value
FROM ad_group
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND ad_group.status != 'REMOVED'
"""

QUERY_ASSET_GROUPS = """
SELECT
    campaign.id,
    asset_group.id, asset_group.name, asset_group.status,
    metrics.cost_micros, metrics.clicks, metrics.impressions,
    metrics.conversions, metrics.conversions_value
FROM asset_group
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND asset_group.status != 'REMOVED'
"""

QUERY_KEYWORDS = """
SELECT
    campaign.id, ad_group.id,
    ad_group_criterion.criterion_id,
    ad_group_criterion.keyword.text,
    ad_group_criterion.keyword.match_type,
    ad_group_criterion.quality_info.quality_score,
    metrics.cost_micros, metrics.clicks, metrics.impressions,
    metrics.conversions
FROM keyword_view
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND ad_group_criterion.status != 'REMOVED'
"""

QUERY_ANUNCIOS = """
SELECT
    campaign.id, ad_group.id,
    ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
    ad_group_ad.ad_strength, ad_group_ad.status,
    metrics.cost_micros, metrics.clicks, metrics.impressions,
    metrics.conversions
FROM ad_group_ad
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND ad_group_ad.status != 'REMOVED'
"""

QUERY_PUBLICOS = """
SELECT
    campaign.id,
    ad_group_criterion.criterion_id,
    metrics.cost_micros, metrics.clicks, metrics.impressions,
    metrics.conversions
FROM audience_view
WHERE segments.date BETWEEN '{start}' AND '{end}'
"""


def _m(v) -> float:
    """Converte micros para reais (divide por 1M). Retorna 0.0 se None."""
    return (v or 0) / 1_000_000.0


def _safe(v) -> float:
    """Retorna float direto, 0.0 se None (para campos que JÁ são float)."""
    return float(v or 0)


def _derive(investimento: float, cliques: int, impressoes: int,
            conversoes: float, val_conv: float) -> dict:
    """Calcula métricas derivadas para evitar NaN/None no JSON."""
    return {
        "ctr": (cliques / impressoes * 100) if impressoes > 0 else 0.0,
        "cpc_medio": investimento / cliques if cliques > 0 else 0.0,
        "roas": val_conv / investimento if investimento > 0 else 0.0,
        "taxa_conversao": (conversoes / cliques * 100) if cliques > 0 else 0.0,
        "custo_conversao": investimento / conversoes if conversoes > 0 else 0.0,
        "cpm": (investimento / impressoes * 1000) if impressoes > 0 else 0.0,
    }


def buscar_dados_conta(cred: dict, customer_id: str, periodo: str = "30d") -> dict:
    """Executa todas as queries e retorna dados brutos parseados."""
    client = get_client(cred)
    ga = client.get_service("GoogleAdsService")
    start, end = _periodo_datas(periodo)

    def stream(query: str) -> list:
        rows = []
        for batch in ga.search_stream(customer_id=customer_id,
                                       query=query.format(start=start, end=end)):
            rows.extend(batch.results)
        return rows

    # ── Campanhas ──────────────────────────────────────────────────────────
    campanhas_raw = stream(QUERY_CAMPANHAS)
    campanhas = []
    for row in campanhas_raw:
        inv = _m(row.metrics.cost_micros)
        cliques = int(row.metrics.clicks)
        imp = int(row.metrics.impressions)
        conv = _safe(row.metrics.conversions)
        val = _safe(row.metrics.conversions_value)
        der = _derive(inv, cliques, imp, conv, val)
        campanhas.append({
            "campaign_id": str(row.campaign.id),
            "campaign_name": row.campaign.name,
            "tipo_campanha": row.campaign.advertising_channel_type.name,
            "status": row.campaign.status.name,
            "orcamento_diario": _m(row.campaign_budget.amount_micros),
            "investimento": inv,
            "cliques": cliques,
            "impressoes": imp,
            "conversoes": conv,
            "valor_conversoes": val,
            "impression_share": _safe(row.metrics.search_impression_share) or 0.0,
            "is_perdido_budget": _safe(row.metrics.search_budget_lost_impression_share) or 0.0,
            "is_perdido_rank": _safe(row.metrics.search_rank_lost_impression_share) or 0.0,
            "absolute_top_is": _safe(row.metrics.search_absolute_top_impression_share) or 0.0,
            **der,
        })

    # ── Quality Score (sem segmento de data) ───────────────────────────────
    qs_rows = []
    for batch in ga.search_stream(customer_id=customer_id, query=QUERY_QUALITY_SCORE):
        qs_rows.extend(batch.results)
    qs_por_campanha: dict[str, list[int]] = {}
    for row in qs_rows:
        cid = str(row.campaign.id)
        qs = row.ad_group_criterion.quality_info.quality_score
        if qs and qs > 0:
            qs_por_campanha.setdefault(cid, []).append(qs)
    for c in campanhas:
        scores = qs_por_campanha.get(c["campaign_id"], [])
        c["quality_score_medio"] = round(sum(scores) / len(scores), 2) if scores else 0.0

    # ── Dados Diários ──────────────────────────────────────────────────────
    dados_diarios = []
    for row in stream(QUERY_DADOS_DIARIOS):
        inv = _m(row.metrics.cost_micros)
        cliques = int(row.metrics.clicks)
        imp = int(row.metrics.impressions)
        conv = _safe(row.metrics.conversions)
        dados_diarios.append({
            "campaign_id": str(row.campaign.id),
            "data": row.segments.date,
            "cliques": cliques,
            "impressoes": imp,
            "conversoes": conv,
            "custo": inv,
            "ctr": (cliques / imp * 100) if imp > 0 else 0.0,
        })

    # ── Grupos (ad_group) ─────────────────────────────────────────────────
    grupos = []
    for row in stream(QUERY_GRUPOS):
        inv = _m(row.metrics.cost_micros)
        cliques = int(row.metrics.clicks)
        imp = int(row.metrics.impressions)
        conv = _safe(row.metrics.conversions)
        val = _safe(row.metrics.conversions_value)
        der = _derive(inv, cliques, imp, conv, val)
        grupos.append({
            "grupo_id": str(row.ad_group.id),
            "grupo_nome": row.ad_group.name,
            "campaign_id": str(row.campaign.id),
            "status": row.ad_group.status.name,
            "is_pmax": False,
            "tipo_grupo": "AD_GROUP",
            "estrategia_lance": row.campaign.bidding_strategy_type.name,
            "target_cpa": _m(row.campaign.target_cpa.target_cpa_micros),
            "target_roas": _safe(row.campaign.target_roas.target_roas),
            "investimento": inv, "cliques": cliques, "impressoes": imp,
            "conversoes": conv, "valor_conversoes": val,
            **der,
        })

    # ── Asset Groups (PMax) ────────────────────────────────────────────────
    for row in stream(QUERY_ASSET_GROUPS):
        inv = _m(row.metrics.cost_micros)
        cliques = int(row.metrics.clicks)
        imp = int(row.metrics.impressions)
        conv = _safe(row.metrics.conversions)
        val = _safe(row.metrics.conversions_value)
        der = _derive(inv, cliques, imp, conv, val)
        grupos.append({
            "grupo_id": str(row.asset_group.id),
            "grupo_nome": row.asset_group.name,
            "campaign_id": str(row.campaign.id),
            "status": row.asset_group.status.name,
            "is_pmax": True,
            "tipo_grupo": "ASSET_GROUP",
            "estrategia_lance": None,
            "target_cpa": None,
            "target_roas": None,
            "investimento": inv, "cliques": cliques, "impressoes": imp,
            "conversoes": conv, "valor_conversoes": val,
            **der,
        })

    # ── Keywords ───────────────────────────────────────────────────────────
    keywords = []
    for row in stream(QUERY_KEYWORDS):
        inv = _m(row.metrics.cost_micros)
        cliques = int(row.metrics.clicks)
        imp = int(row.metrics.impressions)
        conv = _safe(row.metrics.conversions)
        keywords.append({
            "criterion_id": str(row.ad_group_criterion.criterion_id),
            "ad_group_id": str(row.ad_group.id),
            "campaign_id": str(row.campaign.id),
            "keyword_text": row.ad_group_criterion.keyword.text,
            "match_type": row.ad_group_criterion.keyword.match_type.name,
            "quality_score": row.ad_group_criterion.quality_info.quality_score or 0,
            "investimento": inv, "cliques": cliques, "impressoes": imp, "conversoes": conv,
            "ctr": (cliques / imp * 100) if imp > 0 else 0.0,
            "cpc_medio": inv / cliques if cliques > 0 else 0.0,
            "custo_conversao": inv / conv if conv > 0 else 0.0,
        })

    # ── Anúncios ───────────────────────────────────────────────────────────
    anuncios = []
    for row in stream(QUERY_ANUNCIOS):
        inv = _m(row.metrics.cost_micros)
        cliques = int(row.metrics.clicks)
        imp = int(row.metrics.impressions)
        conv = _safe(row.metrics.conversions)
        anuncios.append({
            "ad_id": str(row.ad_group_ad.ad.id),
            "ad_group_id": str(row.ad_group.id),
            "campaign_id": str(row.campaign.id),
            "titulo": row.ad_group_ad.ad.name or "",
            "tipo_anuncio": row.ad_group_ad.ad.type_.name if hasattr(row.ad_group_ad.ad, "type_") else "",
            "ad_strength": row.ad_group_ad.ad_strength.name if row.ad_group_ad.ad_strength else None,
            "status": row.ad_group_ad.status.name,
            "investimento": inv, "cliques": cliques, "impressoes": imp, "conversoes": conv,
            "ctr": (cliques / imp * 100) if imp > 0 else 0.0,
            "cpc_medio": inv / cliques if cliques > 0 else 0.0,
            "custo_conversao": inv / conv if conv > 0 else 0.0,
        })

    # ── Públicos ───────────────────────────────────────────────────────────
    # audience_view não é suportado em todos os tipos de conta — fail-safe
    publicos = []
    try:
        for row in stream(QUERY_PUBLICOS):
            inv = _m(row.metrics.cost_micros)
            cliques = int(row.metrics.clicks)
            imp = int(row.metrics.impressions)
            conv = _safe(row.metrics.conversions)
            leads = int(conv)
            crit_id = str(row.ad_group_criterion.criterion_id)
            publicos.append({
                "criterion_id": crit_id,
                "campaign_id": str(row.campaign.id),
                "audience_name": f"Público {crit_id}",
                "leads": leads,
                "investimento": inv,
                "cpl": inv / leads if leads > 0 else 0.0,
                "ctr": (cliques / imp * 100) if imp > 0 else 0.0,
                "percentual": 0.0,
            })
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "audience_view query falhou (conta pode não suportar este recurso): %s", exc
        )
        publicos = []

    return {
        "campanhas": campanhas,
        "dados_diarios": dados_diarios,
        "grupos": grupos,
        "keywords": keywords,
        "anuncios": anuncios,
        "publicos": publicos,
        "periodo": {"start": start, "end": end},
    }

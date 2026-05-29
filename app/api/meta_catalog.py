import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, verificar_acesso_workspace
from app.models.user import User
from app.services.ads_account_access import listar_ads_account_ids_acessiveis
from app.services.object_storage import reescrever_carousel_urls
from app.api.meta_delivery import (
    resolver_veiculacao_campanha,
    resolver_veiculacao_conjunto,
    resolver_veiculacao_anuncio,
    serializar_veiculacao,
    VEICULACAO_ATIVO,
    VEICULACAO_DESATIVADO,
    VEICULACAO_CONCLUIDO,
    VEICULACAO_PROGRAMADO,
    VEICULACAO_APRENDIZADO,
    VEICULACAO_APRENDIZADO_LIMITADO,
    VEICULACAO_EM_ANALISE,
    VEICULACAO_REJEITADO,
    VEICULACAO_PROCESSANDO,
    VEICULACAO_ERRO_CONTA,
    VEICULACAO_ITENS_AUSENTES,
)
from app.services.meta_tracking import extrair_tracking_info

router = APIRouter(prefix="/meta/catalogo", tags=["meta_catalog"])


def _contas_workspace(
    db: Session,
    workspace_id: str,
    ads_account_id: str | None,
) -> list[uuid.UUID]:
    workspace_uuid = uuid.UUID(workspace_id)
    ads_account_uuid = uuid.UUID(ads_account_id) if ads_account_id else None
    return listar_ads_account_ids_acessiveis(
        db,
        workspace_uuid,
        ads_account_uuid=ads_account_uuid,
        plataforma="meta",
        include_inactive=True,
    )


def _conta_ids_da_query(workspace_id: str, conta_ids: list[str], db: Session) -> list[uuid.UUID]:
    workspace_uuid = uuid.UUID(workspace_id)
    return listar_ads_account_ids_acessiveis(
        db,
        workspace_uuid,
        conta_ids=conta_ids,
        plataforma="meta",
        include_inactive=True,
    )


def _safe_div(num: float, den: float) -> float:
    return round(num / den, 4) if den else 0.0


def _safe_float(valor) -> float:
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def _valor_orcamento(daily_budget: float | None, lifetime_budget: float | None) -> float | None:
    for valor in (daily_budget, lifetime_budget):
        if valor is None:
            continue
        numero = _safe_float(valor)
        if numero > 0:
            return numero
    return None


def _tem_investimento(*, spend: float) -> bool:
    return spend > 0


def _is_ativo_veiculacao(raw: str | None) -> bool:
    return (raw or "").upper() in {VEICULACAO_ATIVO, VEICULACAO_APRENDIZADO, VEICULACAO_APRENDIZADO_LIMITADO}


def _status_resumo(ativo_efetivo: bool, leads_periodo: int) -> str:
    if ativo_efetivo:
        return "ATIVA"
    if leads_periodo > 0:
        return "COM_RESULTADO"
    return "INATIVA"


def _normalizar_texto(valor: str | None) -> str:
    return (valor or "").strip().upper()


def _mapear_objetivo(
    objetivo_bruto: str | None,
    optimization_goal: str | None = None,
    billing_event: str | None = None,
) -> str:
    objetivo = _normalizar_texto(objetivo_bruto)
    if objetivo in {"OUTCOME_AWARENESS", "REACH"}:
        return "RECONHECIMENTO"
    if objetivo in {"OUTCOME_TRAFFIC", "LINK_CLICKS"}:
        return "TRAFEGO"
    if objetivo in {"OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT", "MESSAGES", "PAGE_LIKES", "VIDEO_VIEWS"}:
        return "ENGAJAMENTO"
    if objetivo in {"OUTCOME_LEADS", "LEAD_GENERATION"}:
        return "CADASTROS"
    if objetivo == "OUTCOME_SALES":
        return "VENDAS"

    if objetivo == "CONVERSIONS":
        hints = " ".join(
            filtro for filtro in (
                _normalizar_texto(optimization_goal),
                _normalizar_texto(billing_event),
            )
            if filtro
        )
        if any(hint in hints for hint in ("PURCHASE", "CHECKOUT", "CART", "SALE", "VALUE")):
            return "VENDAS"
        if any(hint in hints for hint in ("LEAD", "REGISTRATION", "SIGNUP", "SIGN_UP", "FORM")):
            return "CADASTROS"
        return "CONVERSOES"

    return "CONVERSOES"


def _objetivo_label(codigo: str) -> str:
    return {
        "RECONHECIMENTO": "Reconhecimento",
        "TRAFEGO": "Tráfego",
        "ENGAJAMENTO": "Engajamento",
        "CADASTROS": "Cadastros",
        "VENDAS": "Vendas",
        "CONVERSOES": "Conversões",
    }.get(codigo, "Conversões")


def _objetivo_descricao(codigo: str) -> str:
    return {
        "RECONHECIMENTO": "Campanhas para ampliar alcance e lembrança da marca.",
        "TRAFEGO": "Campanhas para direcionar visitas e cliques para um destino.",
        "ENGAJAMENTO": "Campanhas para gerar interações, mensagens e consumo de conteúdo.",
        "CADASTROS": "Campanhas para capturar leads, formulários e registros.",
        "VENDAS": "Campanhas para compras e conversões de venda.",
        "CONVERSOES": "Objetivo legado usado como fallback quando a Meta não permite separar vendas e cadastros com segurança.",
    }.get(codigo, "Objetivo legado usado como fallback quando a Meta não permite separar vendas e cadastros com segurança.")


def _desmembrar_breakdown_plataforma(breakdown_value: str | None) -> tuple[str | None, str | None]:
    if not breakdown_value:
        return None, None
    valor = breakdown_value.strip()
    if not valor:
        return None, None
    if "|" in valor:
        plataforma, posicao = valor.split("|", 1)
    else:
        plataforma, posicao = valor, None
    plataforma = plataforma.strip().lower() or None
    posicao = posicao.strip().lower() if posicao else None
    return plataforma, posicao


def _plataforma_canonica(
    publisher_platform: str | None,
    destination_type: str | None = None,
) -> tuple[str | None, str | None]:
    destino = _normalizar_texto(destination_type)
    if destino == "WHATSAPP":
        return "whatsapp", "WhatsApp"

    plataforma = _normalizar_texto(publisher_platform).lower()
    if plataforma == "instagram":
        return "instagram", "Instagram"
    if plataforma == "whatsapp":
        return "whatsapp", "WhatsApp"
    if plataforma in {"facebook", "messenger", "audience_network", "threads"}:
        return "facebook", "Facebook"
    return None, None


def _rotular_posicao_plataforma(platform_position: str | None) -> str | None:
    if not platform_position:
        return None
    pos = _normalizar_texto(platform_position).lower()
    if not pos or pos in {"unknown", "none", "null"}:
        return None
    posicoes = {
        "feed": "Feed",
        "stories": "Stories",
        "reels": "Reels",
        "reels_overlay": "Reels Overlay",
        "marketplace": "Marketplace",
        "search": "Search",
        "instream_video": "In-stream Video",
        "messenger_inbox": "Inbox",
        "audience_network": "Audience Network",
        "facebook_reels": "Reels",
        "facebook_stories": "Stories",
        "instagram_reels": "Reels",
        "instagram_stories": "Stories",
        "instagram_feed": "Feed",
        "facebook_feed": "Feed",
    }
    if pos in posicoes:
        return posicoes[pos]
    for prefix in ("facebook_", "instagram_", "messenger_", "threads_"):
        if pos.startswith(prefix):
            pos = pos[len(prefix):]
            break
    pos = pos.replace("_", " ").strip()
    return pos.title() if pos else None


def _agrupar_plataformas_campanha(
    placement_rows: list[dict],
    destination_whatsapp: bool = False,
) -> tuple[list[str], list[dict]]:
    if destination_whatsapp:
        detalhes: list[str] = ["Destino: WhatsApp"]
        entregas: list[str] = []
        for row in placement_rows:
            publisher_platform, platform_position = _desmembrar_breakdown_plataforma(row.get("breakdown_value"))
            familia, label = _plataforma_canonica(publisher_platform)
            if not familia or familia == "whatsapp":
                continue
            detalhe = _rotular_posicao_plataforma(platform_position)
            texto = label if not detalhe else f"{label} {detalhe}"
            if texto not in entregas:
                entregas.append(texto)
        if entregas:
            detalhes.append("Entrega: " + ", ".join(entregas))
        return ["whatsapp"], [{"codigo": "whatsapp", "label": "WhatsApp", "detalhes": detalhes}]

    agregados: dict[str, dict] = {}
    prioridade = {"whatsapp": 0, "instagram": 1, "facebook": 2}
    for row in placement_rows:
        publisher_platform, platform_position = _desmembrar_breakdown_plataforma(row.get("breakdown_value"))
        familia, label = _plataforma_canonica(publisher_platform)
        if not familia:
            continue
        detalhe = _rotular_posicao_plataforma(platform_position)
        item = agregados.setdefault(
            familia,
            {"codigo": familia, "label": label, "detalhes": [], "_spend": 0.0},
        )
        if detalhe and detalhe not in item["detalhes"]:
            item["detalhes"].append(detalhe)
        item["_spend"] += float(row.get("spend") or 0)

    resumo = sorted(
        agregados.values(),
        key=lambda item: (prioridade.get(item["codigo"], 99), -item["_spend"]),
    )
    for item in resumo:
        item.pop("_spend", None)
    return [item["codigo"] for item in resumo], resumo


@router.get("/gerenciador")
def catalogo_gerenciador(
    workspace_id: str = Query(...),
    data_inicio: str = Query(...),
    data_fim: str = Query(...),
    conta_ids: str | None = Query(None),
    ads_account_id: str | None = Query(None),
    status: str | None = Query(None),
    veiculacao: str | None = Query(None),
    resultado: str = Query("performance"),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    verificar_acesso_workspace(usuario, uuid.UUID(workspace_id), db)
    if ads_account_id:
        account_uuids = _contas_workspace(db, workspace_id, ads_account_id)
    else:
        ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
        account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db)
    if not account_uuids:
        return []

    only_performance = (resultado or "performance").lower() != "todos"

    params: dict = {"ids": account_uuids, "ini": data_inicio, "fim": data_fim}
    status_filter = ""
    if status:
        status_filter = " AND c.effective_status = :status "
        params["status"] = status.upper()

    camp_rows = db.execute(
        text(
            "SELECT c.campaign_id, c.nome, c.objetivo, c.effective_status AS status, "
            "c.daily_budget AS orcamento_diario, c.stop_time, c.lifetime_budget, c.spend_total, "
            "c.raw_payload->>'optimization_goal' AS optimization_goal, "
            "c.raw_payload->>'billing_event' AS billing_event "
            "FROM meta_campaigns_catalog c "
            "WHERE c.ads_account_id = ANY(:ids) "
            f"{status_filter}"
            "ORDER BY c.last_seen_at DESC"
        ),
        params,
    ).mappings().all()
    if not camp_rows:
        return []

    camp_ids = [r["campaign_id"] for r in camp_rows if r["campaign_id"]]
    adset_rows = db.execute(
        text(
            "SELECT a.adset_id, a.campaign_id, a.nome AS adset_name, a.effective_status AS status, "
            "a.end_time, a.daily_budget AS orcamento_diario, a.lifetime_budget, a.spend_total, "
            "a.raw_payload->>'destination_type' AS destination_type, "
            "a.raw_payload->>'optimization_goal' AS optimization_goal, "
            "a.raw_payload->>'billing_event' AS billing_event "
            "FROM meta_adsets_catalog a "
            "WHERE a.ads_account_id = ANY(:ids) "
            "  AND a.campaign_id = ANY(:camp_ids) "
            "ORDER BY a.last_seen_at DESC"
    ),
    {"ids": account_uuids, "camp_ids": camp_ids},
    ).mappings().all()

    placement_rows = db.execute(
        text(
            "SELECT campaign_id, breakdown_value, "
            "COALESCE(SUM(spend),0) AS spend, "
            "COALESCE(SUM(leads),0) AS leads, "
            "COALESCE(SUM(impressions),0) AS impressions, "
            "COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_publicos_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "  AND breakdown_type = 'placement' "
            "  AND campaign_id = ANY(:camp_ids) "
            "GROUP BY campaign_id, breakdown_value"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "camp_ids": camp_ids},
    ).mappings().all()

    ad_rows = db.execute(
        text(
            "SELECT ad.ad_id, ad.adset_id, ad.campaign_id, ad.nome, ad.effective_status AS status, "
            "COALESCE(cr.tipo_criativo, 'IMAGE') AS tipo_criativo, "
            "cr.thumbnail_url, cr.image_url_hq, cr.link_anuncio, "
            "COALESCE(cr.creative_id, ad.creative_id, ad.ad_id) AS creative_id "
            "FROM meta_ads_catalog ad "
            "LEFT JOIN meta_creatives_catalog cr "
            "  ON cr.ads_account_id = ad.ads_account_id "
            " AND (cr.ad_id = ad.ad_id OR cr.creative_id = ad.creative_id) "
            "WHERE ad.ads_account_id = ANY(:ids) "
            "  AND ad.campaign_id = ANY(:camp_ids)"
        ),
        {"ids": account_uuids, "camp_ids": camp_ids},
    ).mappings().all()

    camp_metrics = db.execute(
        text(
            "SELECT campaign_id, COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(leads),0) AS leads, "
            "COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(reach),0) AS reach, "
            "COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_campanhas_insights "
            "WHERE ads_account_id = ANY(:ids) AND data BETWEEN :ini AND :fim "
            "GROUP BY campaign_id"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).mappings().all()
    camp_m = {r["campaign_id"]: r for r in camp_metrics}

    adset_metrics = db.execute(
        text(
            "SELECT adset_id, COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(leads),0) AS leads, "
            "COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(reach),0) AS reach, "
            "COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_anuncios_insights "
            "WHERE ads_account_id = ANY(:ids) AND data BETWEEN :ini AND :fim "
            "GROUP BY adset_id"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).mappings().all()
    adset_m = {r["adset_id"]: r for r in adset_metrics}

    campaign_budget_map: dict[str, float | None] = {}
    campaign_budget_label_map: dict[str, str | None] = {}
    adset_budget_map: dict[str, float | None] = {}
    adset_budget_label_map: dict[str, str | None] = {}
    adset_budget_sum_by_campaign: dict[str, float] = {}
    campaign_destination_whatsapp_map: dict[str, bool] = {}
    campaign_platform_rows_map: dict[str, list[dict]] = {}

    for c in camp_rows:
        campaign_id = str(c["campaign_id"])
        budget = _valor_orcamento(c.get("orcamento_diario"), c.get("lifetime_budget"))
        if budget is not None:
            campaign_budget_map[campaign_id] = budget
            if _safe_float(c.get("orcamento_diario")) > 0:
                campaign_budget_label_map[campaign_id] = "Orçamento diário da campanha"
            else:
                campaign_budget_label_map[campaign_id] = "Orçamento vitalício da campanha"

    for a in adset_rows:
        adset_id = str(a["adset_id"])
        if _normalizar_texto(a.get("destination_type")) == "WHATSAPP":
            campaign_destination_whatsapp_map[str(a["campaign_id"])] = True
        budget = _valor_orcamento(a.get("orcamento_diario"), a.get("lifetime_budget"))
        if budget is not None:
            adset_budget_map[adset_id] = budget
            if _safe_float(a.get("orcamento_diario")) > 0:
                adset_budget_label_map[adset_id] = "Orçamento diário do conjunto"
            else:
                adset_budget_label_map[adset_id] = "Orçamento vitalício do conjunto"
            adset_budget_sum_by_campaign[str(a["campaign_id"])] = (
                adset_budget_sum_by_campaign.get(str(a["campaign_id"]), 0.0) + budget
            )

    for row in placement_rows:
        campaign_id = str(row["campaign_id"])
        campanha_rows = campaign_platform_rows_map.setdefault(campaign_id, [])
        campanha_rows.append(dict(row))

    ad_metrics = db.execute(
        text(
            "SELECT ad_id, COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(leads),0) AS leads, "
            "COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(reach),0) AS reach, "
            "COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_anuncios_insights "
            "WHERE ads_account_id = ANY(:ids) AND data BETWEEN :ini AND :fim "
            "GROUP BY ad_id"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).mappings().all()
    ad_m = {r["ad_id"]: r for r in ad_metrics}

    campaign_objective_hints: dict[str, tuple[str | None, str | None]] = {}
    for a in adset_rows:
        opt_goal = a.get("optimization_goal")
        billing_event = a.get("billing_event")
        if opt_goal or billing_event:
            campaign_objective_hints.setdefault(str(a["campaign_id"]), (opt_goal, billing_event))

    campaign_status_map: dict[str, str] = {}
    campaign_motivo_map: dict[str, str | None] = {}
    for c in camp_rows:
        veic, motivo = resolver_veiculacao_campanha(dict(c))
        campaign_status_map[str(c["campaign_id"])] = veic
        campaign_motivo_map[str(c["campaign_id"])] = motivo

    adsets_by_campaign: dict[str, list[dict]] = {}
    adset_status_map: dict[str, str] = {}
    adset_motivo_map: dict[str, str | None] = {}
    for a in adset_rows:
        camp_status = campaign_status_map.get(str(a["campaign_id"]), VEICULACAO_DESATIVADO)
        adset_effective_status, adset_motivo = resolver_veiculacao_conjunto(dict(a), camp_status)
        adset_status_map[str(a["adset_id"])] = adset_effective_status
        adset_motivo_map[str(a["adset_id"])] = adset_motivo
        mm = adset_m.get(a["adset_id"], {})
        sp = float(mm.get("spend", 0) or 0)
        ld = int(mm.get("leads", 0) or 0)
        imp = int(mm.get("impressions", 0) or 0)
        rch = int(mm.get("reach", 0) or 0)
        cl = int(mm.get("clicks", 0) or 0)
        budget = adset_budget_map.get(str(a["adset_id"]))
        budget_label = adset_budget_label_map.get(str(a["adset_id"]))
        if budget is None and campaign_budget_map.get(str(a["campaign_id"])) is not None:
            budget_label = "Gerenciado pela campanha"
        if only_performance and not _tem_investimento(spend=sp):
            continue
        adsets_by_campaign.setdefault(a["campaign_id"], []).append({
            "adset_id": a["adset_id"],
            "adset_name": a["adset_name"],
            "status": adset_effective_status,
            "veiculacao": adset_effective_status,
            "veiculacao_label": serializar_veiculacao(adset_effective_status, adset_motivo)["veiculacao_label"],
            "veiculacao_motivo": adset_motivo,
            "veiculacao_resumo": _status_resumo(_is_ativo_veiculacao(adset_effective_status), ld),
            "orcamento_diario": budget,
            "orcamento_label": budget_label,
            "spend": sp,
            "leads": ld,
            "impressions": imp,
            "reach": rch,
            "clicks": cl,
            "ctr": _safe_div(cl, imp) * 100,
            "cpc": _safe_div(sp, cl),
            "cpm": _safe_div(sp, imp) * 1000,
            "anuncios": [],
        })

    adsets_by_id: dict[str, dict] = {}
    for csets in adsets_by_campaign.values():
        for s in csets:
            adsets_by_id[s["adset_id"]] = s

    campaign_platforms_map: dict[str, list[str]] = {}
    campaign_platform_resumo_map: dict[str, list[dict]] = {}
    for campaign_id in camp_ids:
        plataformas, plataformas_resumo = _agrupar_plataformas_campanha(
            campaign_platform_rows_map.get(str(campaign_id), []),
            campaign_destination_whatsapp_map.get(str(campaign_id), False),
        )
        campaign_platforms_map[str(campaign_id)] = plataformas
        campaign_platform_resumo_map[str(campaign_id)] = plataformas_resumo

    for campaign_id, conjuntos in adsets_by_campaign.items():
        plataformas = campaign_platforms_map.get(str(campaign_id), [])
        plataformas_resumo = campaign_platform_resumo_map.get(str(campaign_id), [])
        for cj in conjuntos:
            cj["plataformas"] = plataformas
            cj["plataformas_resumo"] = plataformas_resumo

    for a in ad_rows:
        campaign_status = campaign_status_map.get(str(a["campaign_id"]), VEICULACAO_DESATIVADO)
        adset_status = adset_status_map.get(str(a["adset_id"]), VEICULACAO_DESATIVADO)
        ad_effective_status, ad_motivo = resolver_veiculacao_anuncio(dict(a), campaign_status, adset_status)
        mm = ad_m.get(a["ad_id"], {})
        sp = float(mm.get("spend", 0) or 0)
        ld = int(mm.get("leads", 0) or 0)
        imp = int(mm.get("impressions", 0) or 0)
        rch = int(mm.get("reach", 0) or 0)
        cl = int(mm.get("clicks", 0) or 0)
        campanha_plataformas = campaign_platforms_map.get(str(a["campaign_id"]), [])
        campanha_plataformas_resumo = campaign_platform_resumo_map.get(str(a["campaign_id"]), [])
        if only_performance and not _tem_investimento(spend=sp):
            continue
        ad_obj = {
            "ad_id": a["ad_id"],
            "nome": a["nome"],
            "status": ad_effective_status,
            "veiculacao": ad_effective_status,
            "veiculacao_label": serializar_veiculacao(ad_effective_status, ad_motivo)["veiculacao_label"],
            "veiculacao_motivo": ad_motivo,
            "veiculacao_resumo": _status_resumo(_is_ativo_veiculacao(ad_effective_status), ld),
            "creative_id": a["creative_id"],
            "tipo_criativo": a["tipo_criativo"],
            "thumbnail_url": a["thumbnail_url"],
            "image_url_hq": a["image_url_hq"],
            "link_anuncio": a["link_anuncio"],
            "spend": sp,
            "leads": ld,
            "impressions": imp,
            "reach": rch,
            "clicks": cl,
            "ctr": _safe_div(cl, imp) * 100,
            "cpc": _safe_div(sp, cl),
            "cpm": _safe_div(sp, imp) * 1000,
            "plataformas": campanha_plataformas,
            "plataformas_resumo": campanha_plataformas_resumo,
        }
        if a["adset_id"] in adsets_by_id:
            adsets_by_id[a["adset_id"]]["anuncios"].append(ad_obj)
        else:
            adset_metrica = adset_m.get(a["adset_id"], {})
            adset_sp = float(adset_metrica.get("spend", 0) or 0)
            adset_ld = int(adset_metrica.get("leads", 0) or 0)
            adset_imp = int(adset_metrica.get("impressions", 0) or 0)
            adset_rch = int(adset_metrica.get("reach", 0) or 0)
            adset_cl = int(adset_metrica.get("clicks", 0) or 0)
            if only_performance and not _tem_investimento(spend=adset_sp):
                continue
            fallback_adset_status = adset_status_map.get(str(a["adset_id"]), VEICULACAO_DESATIVADO)
            fallback_adset_motivo = adset_motivo_map.get(str(a["adset_id"]))
            adsets_by_campaign.setdefault(a["campaign_id"], []).append({
                "adset_id": a["adset_id"],
                "adset_name": a["adset_id"],
                "status": fallback_adset_status,
                "veiculacao": fallback_adset_status,
                "veiculacao_label": serializar_veiculacao(fallback_adset_status, fallback_adset_motivo)["veiculacao_label"],
                "veiculacao_motivo": fallback_adset_motivo,
                "veiculacao_resumo": _status_resumo(_is_ativo_veiculacao(fallback_adset_status), adset_ld),
                "spend": adset_sp,
                "leads": adset_ld,
                "impressions": adset_imp,
                "reach": adset_rch,
                "clicks": adset_cl,
                "ctr": _safe_div(adset_cl, adset_imp) * 100,
                "cpc": _safe_div(adset_sp, adset_cl),
                "cpm": _safe_div(adset_sp, adset_imp) * 1000,
                "plataformas": campanha_plataformas,
                "plataformas_resumo": campanha_plataformas_resumo,
                "anuncios": [ad_obj],
            })

    veic_filtro = (veiculacao or "").strip().upper()
    resumo_filtro = veic_filtro if veic_filtro in {"ATIVA", "INATIVA", "COM_RESULTADO"} else ""

    out = []
    for c in camp_rows:
        mm = camp_m.get(c["campaign_id"], {})
        sp = float(mm.get("spend", 0) or 0)
        ld = int(mm.get("leads", 0) or 0)
        imp = int(mm.get("impressions", 0) or 0)
        rch = int(mm.get("reach", 0) or 0)
        cl = int(mm.get("clicks", 0) or 0)
        effective_campaign_status = campaign_status_map.get(str(c["campaign_id"]), "PAUSED")
        motivo_campanha = campaign_motivo_map.get(str(c["campaign_id"]))
        budget = campaign_budget_map.get(str(c["campaign_id"]))
        budget_label = campaign_budget_label_map.get(str(c["campaign_id"]))
        if only_performance and not _tem_investimento(spend=sp):
            continue

        conjuntos_visiveis = adsets_by_campaign.get(c["campaign_id"], [])
        if only_performance:
            conjuntos_visiveis = [
                cj for cj in conjuntos_visiveis
                if _tem_investimento(spend=float(cj.get("spend", 0) or 0))
            ]
            for cj in conjuntos_visiveis:
                cj["anuncios"] = [
                    a for a in cj.get("anuncios", [])
                    if _tem_investimento(spend=float(a.get("spend", 0) or 0))
                ]

        if budget is None:
            budget = adset_budget_sum_by_campaign.get(str(c["campaign_id"]))
            if budget is not None:
                budget_label = "Soma dos orçamentos dos conjuntos"

        ad_statuses = [
            (a.get("status") or "").upper()
            for s in conjuntos_visiveis
            for a in s.get("anuncios", [])
        ]
        if ad_statuses:
            ativos = sum(1 for s in ad_statuses if _is_ativo_veiculacao(s))
            inativos = len(ad_statuses) - ativos
        else:
            ativos = 1 if _is_ativo_veiculacao(effective_campaign_status) else 0
            inativos = 0 if ativos else 1
        veiculacao_resumo = _status_resumo(_is_ativo_veiculacao(effective_campaign_status), ld)

        if resumo_filtro and veiculacao_resumo != resumo_filtro:
            continue
        if veic_filtro and effective_campaign_status != veic_filtro:
            continue

        objetivo_original = c["objetivo"]
        objetivo_optimization_goal = c.get("optimization_goal")
        objetivo_billing_event = c.get("billing_event")
        if not objetivo_optimization_goal and not objetivo_billing_event:
            objetivo_optimization_goal, objetivo_billing_event = campaign_objective_hints.get(
                str(c["campaign_id"]),
                (None, None),
            )
        objetivo_mapeado = _mapear_objetivo(
            objetivo_original,
            objetivo_optimization_goal,
            objetivo_billing_event,
        )
        camp_id = str(c["campaign_id"])

        out.append({
            "campaign_id": c["campaign_id"],
            "nome": c["nome"],
            "status": effective_campaign_status,
            "veiculacao": effective_campaign_status,
            "veiculacao_label": serializar_veiculacao(effective_campaign_status, motivo_campanha)["veiculacao_label"],
            "veiculacao_motivo": motivo_campanha,
            "objetivo": objetivo_original,
            "objetivo_original": objetivo_original,
            "objetivo_mapeado": objetivo_mapeado,
            "objetivo_label": _objetivo_label(objetivo_mapeado),
            "objetivo_descricao": _objetivo_descricao(objetivo_mapeado),
            "optimization_goal": objetivo_optimization_goal,
            "billing_event": objetivo_billing_event,
            "orcamento_diario": budget,
            "orcamento_label": budget_label,
            "plataformas": campaign_platforms_map.get(camp_id, []),
            "plataformas_resumo": campaign_platform_resumo_map.get(camp_id, []),
            "spend": sp,
            "leads": ld,
            "impressions": imp,
            "reach": rch,
            "clicks": cl,
            "ctr": _safe_div(cl, imp) * 100,
            "cpc": _safe_div(sp, cl),
            "cpm": _safe_div(sp, imp) * 1000,
            "qtd_anuncios_ativos": ativos,
            "qtd_anuncios_inativos": inativos,
            "veiculacao_resumo": veiculacao_resumo,
            "conjuntos": conjuntos_visiveis,
        })
    return out


@router.get("/campanhas")
def catalogo_campanhas(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    verificar_acesso_workspace(usuario, uuid.UUID(workspace_id), db)
    contas = _contas_workspace(db, workspace_id, ads_account_id)
    if not contas:
        return []
    params = {"ids": contas, "limit": limit}
    filtro_status = ""
    if status:
        filtro_status = " AND effective_status = :status "
        params["status"] = status.upper()
    rows = db.execute(
        text(
            "SELECT id::text, ads_account_id::text, campaign_id, nome, objetivo, "
            "effective_status, configured_status, start_time, stop_time, daily_budget, "
            "lifetime_budget, last_seen_at "
            "FROM meta_campaigns_catalog "
            "WHERE ads_account_id = ANY(:ids) "
            f"{filtro_status}"
            "ORDER BY last_seen_at DESC "
            "LIMIT :limit"
        ),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/conjuntos")
def catalogo_conjuntos(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    campaign_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(1000, ge=1, le=5000),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    verificar_acesso_workspace(usuario, uuid.UUID(workspace_id), db)
    contas = _contas_workspace(db, workspace_id, ads_account_id)
    if not contas:
        return []
    params = {"ids": contas, "limit": limit}
    filtros = []
    if campaign_id:
        filtros.append("campaign_id = :campaign_id")
        params["campaign_id"] = campaign_id
    if status:
        filtros.append("effective_status = :status")
        params["status"] = status.upper()
    where_extra = f" AND {' AND '.join(filtros)} " if filtros else ""
    rows = db.execute(
        text(
            "SELECT id::text, ads_account_id::text, adset_id, campaign_id, nome, "
            "effective_status, configured_status, start_time, end_time, daily_budget, "
            "lifetime_budget, bid_strategy, last_seen_at "
            "FROM meta_adsets_catalog "
            "WHERE ads_account_id = ANY(:ids) "
            f"{where_extra}"
            "ORDER BY last_seen_at DESC "
            "LIMIT :limit"
        ),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/anuncios")
def catalogo_anuncios(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    verificar_acesso_workspace(usuario, uuid.UUID(workspace_id), db)
    contas = _contas_workspace(db, workspace_id, ads_account_id)
    if not contas:
        return []
    params = {"ids": contas, "limit": limit}
    filtros = []
    if campaign_id:
        filtros.append("campaign_id = :campaign_id")
        params["campaign_id"] = campaign_id
    if adset_id:
        filtros.append("adset_id = :adset_id")
        params["adset_id"] = adset_id
    if status:
        filtros.append("effective_status = :status")
        params["status"] = status.upper()
    where_extra = f" AND {' AND '.join(filtros)} " if filtros else ""
    rows = db.execute(
        text(
            "SELECT id::text, ads_account_id::text, ad_id, campaign_id, adset_id, creative_id, nome, "
            "effective_status, configured_status, last_seen_at "
            "FROM meta_ads_catalog "
            "WHERE ads_account_id = ANY(:ids) "
            f"{where_extra}"
            "ORDER BY last_seen_at DESC "
            "LIMIT :limit"
        ),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/criativos")
def catalogo_criativos(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    campaign_id: str | None = Query(None),
    tipo: str | None = Query(None),
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    verificar_acesso_workspace(usuario, uuid.UUID(workspace_id), db)
    contas = _contas_workspace(db, workspace_id, ads_account_id)
    if not contas:
        return []
    params = {"ids": contas, "limit": limit}
    filtros = []
    if campaign_id:
        filtros.append("campaign_id = :campaign_id")
        params["campaign_id"] = campaign_id
    if tipo:
        filtros.append("tipo_criativo = :tipo")
        params["tipo"] = tipo.upper()
    where_extra = f" AND {' AND '.join(filtros)} " if filtros else ""
    rows = db.execute(
        text(
            "SELECT id::text, ads_account_id::text, creative_id, ad_id, campaign_id, adset_id, "
            "nome, object_type, tipo_criativo, effective_object_story_id, video_id, thumbnail_url, "
            "image_url_hq, link_anuncio, carousel_items, image_hash, meta_image_url_tmp, "
            "meta_permalink_url, original_width, original_height, hq_source, hq_last_resolved_at, last_seen_at, "
            "headline, destination_url, url_tags, utm_source, utm_medium, utm_campaign, utm_content, utm_term, "
            "raw_payload, "
            "(SELECT COALESCE(jsonb_agg(jsonb_build_object("
            "'creative_id', cc.creative_id, 'card_index', cc.card_index, 'image_hash', cc.image_hash, "
            "'video_id', cc.video_id, 'image_url_hq', cc.image_url_hq, 'source_type', cc.source_type, "
            "'link', cc.link, 'name', cc.name, 'description', cc.description"
            ") ORDER BY cc.card_index), '[]'::jsonb) "
            " FROM meta_creative_cards_catalog cc "
            " WHERE cc.ads_account_id = meta_creatives_catalog.ads_account_id "
            "   AND cc.creative_id = meta_creatives_catalog.creative_id"
            ") AS carousel_cards "
            "FROM meta_creatives_catalog "
            "WHERE ads_account_id = ANY(:ids) "
            f"{where_extra}"
            "ORDER BY last_seen_at DESC "
            "LIMIT :limit"
        ),
        params,
    ).mappings().all()
    result: list[dict] = []
    for row in rows:
        data = dict(row)
        raw_payload = data.pop("raw_payload", None)
        utm_populated = data.get("utm_source") is not None or data.get("destination_url") is not None
        if not utm_populated:
            if isinstance(raw_payload, str):
                try:
                    raw_payload = json.loads(raw_payload)
                except Exception:
                    raw_payload = {}
            tracking = extrair_tracking_info(
                raw_payload if isinstance(raw_payload, dict) else {},
                headline_fallback=data.get("nome"),
            )
            data.update(tracking)
        carousel_cards = data.get("carousel_cards")
        if isinstance(carousel_cards, list):
            data["carousel_cards"] = reescrever_carousel_urls(
                carousel_cards,
                str(data.get("ads_account_id") or ""),
                str(data.get("creative_id") or ""),
            )
        result.append(data)
    return result


@router.get("/videos")
def catalogo_videos(
    workspace_id: str = Query(...),
    ads_account_id: str | None = Query(None),
    campaign_id: str | None = Query(None),
    limit: int = Query(1000, ge=1, le=5000),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    verificar_acesso_workspace(usuario, uuid.UUID(workspace_id), db)
    contas = _contas_workspace(db, workspace_id, ads_account_id)
    if not contas:
        return []
    params = {"ids": contas, "limit": limit}
    where_extra = ""
    if campaign_id:
        where_extra = " AND campaign_id = :campaign_id "
        params["campaign_id"] = campaign_id
    rows = db.execute(
        text(
            "SELECT id::text, ads_account_id::text, video_id, creative_id, ad_id, campaign_id, adset_id, "
            "thumbnail_url, image_url_hq, source_url, last_seen_at "
            "FROM meta_videos_catalog "
            "WHERE ads_account_id = ANY(:ids) "
            f"{where_extra}"
            "ORDER BY last_seen_at DESC "
            "LIMIT :limit"
        ),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]

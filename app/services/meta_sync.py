"""Meta Ads sync engine.

Sincroniza dados de uma conta de anúncios Meta nas tabelas:
  - meta_insights_diarios
  - meta_campanhas_insights
  - meta_anuncios_insights
  - meta_publicos_insights
"""
import json
import logging
from datetime import date, datetime, timezone
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.ads_account import AdsAccount

log = logging.getLogger(__name__)

META_API_VERSION = "v21.0"
META_BASE = f"https://graph.facebook.com/{META_API_VERSION}"

LEAD_ACTION_TYPES = {
    # Conversa iniciada (janela 7d) usada como lead principal em campanhas de mensagem
    "onsite_conversion.messaging_conversation_started_7d",
}


# ── helpers ────────────────────────────────────────────────────────────────────

def _extrair_leads(actions: list[dict]) -> int:
    conversa_7d = _valor_action(actions, "onsite_conversion.messaging_conversation_started_7d")
    formulario_unico = _extrair_lead_formulario_unico(actions)
    return conversa_7d + formulario_unico


def _extrair_link_click(actions: list[dict]) -> int:
    return sum(
        int(float(a.get("value", 0)))
        for a in actions
        if a.get("action_type") == "link_click"
    )


def _valor_action(actions: list[dict], action_type: str) -> int:
    for a in actions:
        if a.get("action_type") == action_type:
            return int(float(a.get("value", 0)))
    return 0


def _extrair_lead_formulario_unico(actions: list[dict]) -> int:
    # Meta costuma retornar mais de um action_type para o mesmo lead de formulário.
    # Para não duplicar contagem, usamos o maior valor entre os tipos equivalentes.
    return max(
        _valor_action(actions, "lead"),
        _valor_action(actions, "onsite_conversion.lead_grouped"),
        _valor_action(actions, "offsite_conversion.fb_pixel_lead"),
    )


def _extrair_leads_por_tipo(actions: list[dict]) -> tuple[int, int]:
    """Retorna (leads_mensagem, leads_cadastro)."""
    msgs = _valor_action(actions, "onsite_conversion.messaging_conversation_started_7d")
    cadastros = _extrair_lead_formulario_unico(actions)
    return msgs, cadastros


_WHATSAPP_ACTION_TYPES = {
    "onsite_conversion.messaging_conversation_started_7d",
}

def _extrair_leads_por_canal(actions: list[dict]) -> tuple[int, int, int, int]:
    """Retorna (leads_whatsapp, leads_instagram, leads_messenger, leads_formulario).

    Usa action_type como critério principal (publisher_platform não é confiável
    para leads de mensagem). WhatsApp recebe os action_types de mensageria;
    Instagram e Messenger não são distinguíveis sem breakdown adicional.
    """
    whatsapp = 0
    formulario = _extrair_lead_formulario_unico(actions)
    for a in actions:
        at = a.get("action_type", "")
        val = int(float(a.get("value", 0)))
        if at in _WHATSAPP_ACTION_TYPES:
            whatsapp += val
    return whatsapp, 0, 0, formulario


def _paginar(client: httpx.Client, url: str, params: dict) -> list[dict]:
    """Busca todas as páginas de um endpoint Meta."""
    resultados: list[dict] = []
    current_url: str | None = url
    current_params: dict | None = params

    while current_url:
        if current_params is not None:
            resp = client.get(current_url, params=current_params)
        else:
            resp = client.get(current_url)

        if resp.status_code != 200:
            body = resp.json()
            err = body.get("error", {})
            log.error("Meta API erro %s em %s: %s", resp.status_code, url, err.get("message", resp.text))
            break

        data = resp.json()
        resultados.extend(data.get("data", []))
        next_url = data.get("paging", {}).get("next")
        current_url = next_url
        current_params = None  # próximas páginas já têm tudo na URL

    log.info("_paginar %s → %d registros", url, len(resultados))
    return resultados


def _construir_link_facebook(story_id: str | None) -> str | None:
    if story_id:
        return f"https://www.facebook.com/{story_id}"
    return None


def _fetch_criativos_batch(client: httpx.Client, ad_ids: list[str], token: str) -> dict[str, dict]:
    """Busca criativo HQ, tipo e link para ad_ids em batches de 50."""
    criativos: dict[str, dict] = {}
    fields = (
        "creative{id,name,object_type,image_url,thumbnail_url,video_id,"
        "instagram_permalink_url,effective_object_story_id,"
        "object_story_spec{link_data{child_attachments{picture,image_url,video_id,link}}}}"
    )
    for i in range(0, len(ad_ids), 50):
        batch = ad_ids[i:i + 50]
        resp = client.get(
            f"{META_BASE}/",
            params={
                "access_token": token,
                "ids": ",".join(batch),
                "fields": fields,
                "thumbnail_width": 1200,
                "thumbnail_height": 628,
            },
        )
        if resp.status_code != 200:
            err = resp.json().get("error", {})
            log.warning("Erro criativos batch: %s", err.get("message", resp.text[:200]))
            continue

        for ad_id, ad_data in resp.json().items():
            creative = ad_data.get("creative") or {}
            story_spec = creative.get("object_story_spec") or {}
            link_data = story_spec.get("link_data") or {}
            child_attachments = link_data.get("child_attachments") or []

            if len(child_attachments) > 1:
                tipo = "CAROUSEL"
                carousel_items = [
                    {
                        "picture": c.get("picture") or c.get("image_url"),
                        "video_id": c.get("video_id"),
                        "link": c.get("link"),
                    }
                    for c in child_attachments
                ]
            elif creative.get("video_id"):
                tipo = "VIDEO"
                carousel_items = []
            else:
                tipo = "IMAGE"
                carousel_items = []

            image_url_hq = (
                creative.get("image_url")
                or creative.get("thumbnail_url")
                or (child_attachments[0].get("picture") if child_attachments else None)
            )

            link_anuncio = (
                creative.get("instagram_permalink_url")
                or _construir_link_facebook(creative.get("effective_object_story_id"))
            )

            criativos[ad_id] = {
                "id": creative.get("id"),
                "thumbnail_url": creative.get("thumbnail_url"),
                "tipo": tipo,
                "image_url_hq": image_url_hq,
                "link_anuncio": link_anuncio,
                "carousel_items": carousel_items,
            }
    return criativos


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _safe_int(val: Any, default: int = 0) -> int:
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return default


# ── sync principal ─────────────────────────────────────────────────────────────

def sincronizar_conta(ads_account_id: str, db: Session) -> dict:
    conta: AdsAccount | None = db.get(AdsAccount, ads_account_id)
    if not conta:
        raise ValueError(f"AdsAccount {ads_account_id} não encontrada")

    if conta.status != "ativo":
        return {"skipped": True, "reason": "conta inativa"}

    if not conta.bm_token:
        return {"skipped": True, "reason": "sem token"}

    if conta.token_expira_em and conta.token_expira_em < datetime.now(tz=timezone.utc):
        return {"skipped": True, "reason": "token expirado"}

    token = conta.bm_token
    meta_account_id = conta.account_id  # e.g. "act_123456789"
    since = (conta.periodo_sync_inicio or date.today().replace(day=1)).isoformat()
    until = date.today().isoformat()
    time_range = json.dumps({"since": since, "until": until})

    totais: dict[str, int] = {
        "diarios": 0,
        "campanhas": 0,
        "anuncios": 0,
        "publicos": 0,
    }

    with httpx.Client(timeout=60.0) as client:
        resp_saldo = client.get(
            f"{META_BASE}/{meta_account_id}",
            params={"access_token": token, "fields": "balance,amount_spent,spend_cap,currency"},
        )
        if resp_saldo.status_code == 200:
            saldo_data = resp_saldo.json()
            db.execute(text("""
                UPDATE ads_accounts SET
                    balance      = :balance,
                    amount_spent = :amount_spent,
                    spend_cap    = :spend_cap
                WHERE id = :id
            """), {
                "id": str(conta.id),
                "balance":      float(saldo_data.get("balance", 0)) / 100,
                "amount_spent": float(saldo_data.get("amount_spent", 0)) / 100,
                "spend_cap":    float(saldo_data.get("spend_cap", 0)) / 100,
            })
            db.commit()
        else:
            log.warning("Erro ao buscar saldo %s: %s", meta_account_id, resp_saldo.text[:200])

        _sync_diarios(client, db, meta_account_id, token, time_range, totais)
        _sync_campanhas(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_anuncios(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_publicos_demograficos(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_publicos_placement(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_publicos_device(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_publicos_hourly(client, db, meta_account_id, token, time_range, conta.id, totais)

    conta.sincronizado_em = datetime.now(tz=timezone.utc)
    db.commit()
    log.info("Sync conta %s concluído: %s", meta_account_id, totais)
    return {"ok": True, "conta": meta_account_id, "totais": totais}


# ── sync diários ───────────────────────────────────────────────────────────────

def _sync_diarios(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    time_range: str,
    totais: dict,
) -> None:
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/insights",
        {
            "access_token": token,
            "fields": "spend,impressions,reach,clicks,actions,cpm,cpc,ctr,frequency",
            "time_range": time_range,
            "time_increment": 1,
            "limit": 500,
        },
    )

    for r in rows:
        actions = r.get("actions") or []
        leads = _extrair_leads(actions)
        link_click = _extrair_link_click(actions)
        leads_msg, leads_cad = _extrair_leads_por_tipo(actions)
        leads_whatsapp, leads_instagram, leads_messenger, leads_formulario = _extrair_leads_por_canal(actions)
        d = r.get("date_start")
        db.execute(text("""
            INSERT INTO meta_insights_diarios
                (ads_account_id, data, spend, impressions, reach, clicks, leads,
                 cpl, cpc, cpm, ctr, frequencia, leads_mensagem, leads_cadastro,
                 leads_whatsapp, leads_instagram, leads_messenger, leads_formulario, link_click)
            SELECT
                aa.id, :data, :spend, :impressions, :reach, :clicks, :leads,
                CASE WHEN :leads > 0 THEN :spend / :leads ELSE 0 END,
                :cpc, :cpm, :ctr, :frequencia, :leads_mensagem, :leads_cadastro,
                :leads_whatsapp, :leads_instagram, :leads_messenger, :leads_formulario, :link_click
            FROM ads_accounts aa
            WHERE aa.account_id = :account_id AND aa.plataforma = 'meta'
            ON CONFLICT (ads_account_id, data) DO UPDATE SET
                spend            = EXCLUDED.spend,
                impressions      = EXCLUDED.impressions,
                reach            = EXCLUDED.reach,
                clicks           = EXCLUDED.clicks,
                leads            = EXCLUDED.leads,
                cpl              = EXCLUDED.cpl,
                cpc              = EXCLUDED.cpc,
                cpm              = EXCLUDED.cpm,
                ctr              = EXCLUDED.ctr,
                frequencia       = EXCLUDED.frequencia,
                leads_mensagem   = EXCLUDED.leads_mensagem,
                leads_cadastro   = EXCLUDED.leads_cadastro,
                leads_whatsapp   = EXCLUDED.leads_whatsapp,
                leads_instagram  = EXCLUDED.leads_instagram,
                leads_messenger  = EXCLUDED.leads_messenger,
                leads_formulario = EXCLUDED.leads_formulario,
                link_click       = EXCLUDED.link_click
        """), {
            "account_id": account_id,
            "data": d,
            "spend": _safe_float(r.get("spend")),
            "impressions": _safe_int(r.get("impressions")),
            "reach": _safe_int(r.get("reach")),
            "clicks": _safe_int(r.get("clicks")),
            "leads": leads,
            "cpc": _safe_float(r.get("cpc")),
            "cpm": _safe_float(r.get("cpm")),
            "ctr": _safe_float(r.get("ctr")),
            "frequencia": _safe_float(r.get("frequency")),
            "leads_mensagem": leads_msg,
            "leads_cadastro": leads_cad,
            "leads_whatsapp": leads_whatsapp,
            "leads_instagram": leads_instagram,
            "leads_messenger": leads_messenger,
            "leads_formulario": leads_formulario,
            "link_click": link_click,
        })
        totais["diarios"] += 1
    db.commit()


# ── sync campanhas ─────────────────────────────────────────────────────────────

def _sync_campanhas(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    time_range: str,
    ads_account_uuid: Any,
    totais: dict,
) -> None:
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/insights",
        {
            "access_token": token,
            "fields": (
                "spend,impressions,reach,clicks,actions,cpm,cpc,ctr,frequency,"
                "campaign_id,campaign_name,objective"
            ),
            "level": "campaign",
            "time_range": time_range,
            "time_increment": 1,
            "limit": 500,
        },
    )

    camp_orcamentos: dict[str, float] = {}
    try:
        camp_budget_rows = _paginar(
            client,
            f"{META_BASE}/{account_id}/campaigns",
            {
                "access_token": token,
                "fields": "id,daily_budget,lifetime_budget,status",
                "limit": 500,
            },
        )
        for cb in camp_budget_rows:
            raw = cb.get("daily_budget") or cb.get("lifetime_budget") or 0
            camp_orcamentos[cb["id"]] = int(raw) / 100
    except Exception:
        pass

    adset_por_campanha: dict[str, list[float]] = {}
    try:
        adset_rows = _paginar(
            client,
            f"{META_BASE}/{account_id}/adsets",
            {
                "access_token": token,
                "fields": "id,campaign_id,daily_budget,status",
                "limit": 500,
            },
        )
        for ab in adset_rows:
            cid = ab.get("campaign_id")
            raw = ab.get("daily_budget") or 0
            if cid and raw:
                adset_por_campanha.setdefault(cid, []).append(int(raw) / 100)
    except Exception:
        pass

    def calcular_orcamento(campaign_id: str) -> float | None:
        if campaign_id in camp_orcamentos and camp_orcamentos[campaign_id] > 0:
            return camp_orcamentos[campaign_id]
        budgets = adset_por_campanha.get(campaign_id)
        if budgets:
            return sum(budgets)
        return None

    for r in rows:
        actions = r.get("actions") or []
        leads = _extrair_leads(actions)
        spend = _safe_float(r.get("spend"))
        camp_id = r.get("campaign_id")
        orcamento = calcular_orcamento(camp_id) if camp_id else None
        db.execute(text("""
            INSERT INTO meta_campanhas_insights
                (ads_account_id, campaign_id, nome, objetivo, status, data,
                 spend, leads, impressions, reach, clicks, ctr, cpc, cpm, frequencia,
                 orcamento_diario)
            VALUES
                (:ads_account_id, :campaign_id, :nome, :objetivo, :status, :data,
                 :spend, :leads, :impressions, :reach, :clicks, :ctr, :cpc, :cpm, :frequencia,
                 :orcamento_diario)
            ON CONFLICT (ads_account_id, campaign_id, data) DO UPDATE SET
                nome             = EXCLUDED.nome,
                objetivo         = EXCLUDED.objetivo,
                status           = EXCLUDED.status,
                spend            = EXCLUDED.spend,
                leads            = EXCLUDED.leads,
                impressions      = EXCLUDED.impressions,
                reach            = EXCLUDED.reach,
                clicks           = EXCLUDED.clicks,
                ctr              = EXCLUDED.ctr,
                cpc              = EXCLUDED.cpc,
                cpm              = EXCLUDED.cpm,
                frequencia       = EXCLUDED.frequencia,
                orcamento_diario = COALESCE(EXCLUDED.orcamento_diario, meta_campanhas_insights.orcamento_diario)
        """), {
            "ads_account_id": str(ads_account_uuid),
            "campaign_id": camp_id,
            "nome": r.get("campaign_name"),
            "objetivo": r.get("objective"),
            "status": "ACTIVE",
            "data": r.get("date_start"),
            "spend": spend,
            "leads": leads,
            "impressions": _safe_int(r.get("impressions")),
            "reach": _safe_int(r.get("reach")),
            "clicks": _safe_int(r.get("clicks")),
            "ctr": _safe_float(r.get("ctr")),
            "cpc": _safe_float(r.get("cpc")),
            "cpm": _safe_float(r.get("cpm")),
            "frequencia": _safe_float(r.get("frequency")),
            "orcamento_diario": orcamento,
        })
        totais["campanhas"] += 1
    db.commit()


# ── sync anúncios ──────────────────────────────────────────────────────────────

def _sync_anuncios(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    time_range: str,
    ads_account_uuid: Any,
    totais: dict,
) -> None:
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/insights",
        {
            "access_token": token,
            "fields": (
                "spend,impressions,reach,clicks,actions,cpm,cpc,ctr,frequency,"
                "ad_id,ad_name,adset_id,adset_name,campaign_id"
            ),
            "level": "ad",
            "time_range": time_range,
            "time_increment": 1,
            "limit": 500,
        },
    )

    ad_ids = list({r["ad_id"] for r in rows if r.get("ad_id")})
    criativos = _fetch_criativos_batch(client, ad_ids, token) if ad_ids else {}
    log.info("Criativos buscados: %d de %d ads únicos", len(criativos), len(ad_ids))

    for r in rows:
        actions = r.get("actions") or []
        leads = _extrair_leads(actions)
        ad_id = r.get("ad_id")
        creative = criativos.get(ad_id) or {}
        creative_id = creative.get("id")
        thumbnail_url = creative.get("thumbnail_url")
        tipo_criativo = creative.get("tipo", "IMAGE")
        image_url_hq = creative.get("image_url_hq")
        link_anuncio = creative.get("link_anuncio")
        carousel_raw = creative.get("carousel_items") or []
        carousel_json = json.dumps(carousel_raw) if carousel_raw else None
        ad_status = "ACTIVE"
        spend = _safe_float(r.get("spend"))
        db.execute(text("""
            INSERT INTO meta_anuncios_insights
                (ads_account_id, ad_id, adset_id, adset_name, campaign_id, nome,
                 status, creative_id, thumbnail_url, tipo_criativo, image_url_hq,
                 link_anuncio, carousel_items, data,
                 spend, leads, impressions, reach, clicks, ctr, cpc, cpm, frequencia)
            VALUES
                (:ads_account_id, :ad_id, :adset_id, :adset_name, :campaign_id, :nome,
                 :status, :creative_id, :thumbnail_url, :tipo_criativo, :image_url_hq,
                 :link_anuncio, CAST(:carousel_items AS JSONB), :data,
                 :spend, :leads, :impressions, :reach, :clicks, :ctr, :cpc, :cpm, :frequencia)
            ON CONFLICT (ads_account_id, ad_id, data) DO UPDATE SET
                adset_id      = EXCLUDED.adset_id,
                adset_name    = EXCLUDED.adset_name,
                campaign_id   = EXCLUDED.campaign_id,
                nome          = EXCLUDED.nome,
                status        = EXCLUDED.status,
                creative_id   = EXCLUDED.creative_id,
                thumbnail_url = EXCLUDED.thumbnail_url,
                tipo_criativo = EXCLUDED.tipo_criativo,
                image_url_hq  = EXCLUDED.image_url_hq,
                link_anuncio  = EXCLUDED.link_anuncio,
                carousel_items = EXCLUDED.carousel_items,
                spend         = EXCLUDED.spend,
                leads         = EXCLUDED.leads,
                impressions   = EXCLUDED.impressions,
                reach         = EXCLUDED.reach,
                clicks        = EXCLUDED.clicks,
                ctr           = EXCLUDED.ctr,
                cpc           = EXCLUDED.cpc,
                cpm           = EXCLUDED.cpm,
                frequencia    = EXCLUDED.frequencia
        """), {
            "ads_account_id": str(ads_account_uuid),
            "ad_id": ad_id,
            "adset_id": r.get("adset_id"),
            "adset_name": r.get("adset_name"),
            "campaign_id": r.get("campaign_id"),
            "nome": r.get("ad_name"),
            "status": ad_status,
            "creative_id": creative_id,
            "thumbnail_url": thumbnail_url,
            "tipo_criativo": tipo_criativo,
            "image_url_hq": image_url_hq,
            "link_anuncio": link_anuncio,
            "carousel_items": carousel_json,
            "data": r.get("date_start"),
            "spend": spend,
            "leads": leads,
            "impressions": _safe_int(r.get("impressions")),
            "reach": _safe_int(r.get("reach")),
            "clicks": _safe_int(r.get("clicks")),
            "ctr": _safe_float(r.get("ctr")),
            "cpc": _safe_float(r.get("cpc")),
            "cpm": _safe_float(r.get("cpm")),
            "frequencia": _safe_float(r.get("frequency")),
        })
        totais["anuncios"] += 1
    db.commit()


# ── sync públicos ──────────────────────────────────────────────────────────────

def _sync_publicos_demograficos(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    time_range: str,
    ads_account_uuid: Any,
    totais: dict,
) -> None:
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/insights",
        {
            "access_token": token,
            "fields": "spend,impressions,clicks,actions,ctr",
            "breakdowns": "age,gender",
            "time_range": time_range,
            "time_increment": 1,
            "limit": 500,
        },
    )
    for r in rows:
        actions = r.get("actions") or []
        leads = _extrair_leads(actions)
        spend = _safe_float(r.get("spend"))
        cpl = spend / leads if leads > 0 else 0.0
        breakdown_value = f"{r.get('age','?')}|{r.get('gender','?')}"
        db.execute(text("""
            INSERT INTO meta_publicos_insights
                (ads_account_id, data, breakdown_type, breakdown_value,
                 leads, spend, impressions, clicks, ctr, cpl)
            VALUES
                (:ads_account_id, :data, 'demographic', :breakdown_value,
                 :leads, :spend, :impressions, :clicks, :ctr, :cpl)
            ON CONFLICT (ads_account_id, data, breakdown_type, breakdown_value) DO UPDATE SET
                leads       = EXCLUDED.leads,
                spend       = EXCLUDED.spend,
                impressions = EXCLUDED.impressions,
                clicks      = EXCLUDED.clicks,
                ctr         = EXCLUDED.ctr,
                cpl         = EXCLUDED.cpl
        """), {
            "ads_account_id": str(ads_account_uuid),
            "data": r.get("date_start"),
            "breakdown_value": breakdown_value,
            "leads": leads,
            "spend": spend,
            "impressions": _safe_int(r.get("impressions")),
            "clicks": _safe_int(r.get("clicks")),
            "ctr": _safe_float(r.get("ctr")),
            "cpl": cpl,
        })
        totais["publicos"] += 1
    db.commit()


def _sync_publicos_placement(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    time_range: str,
    ads_account_uuid: Any,
    totais: dict,
) -> None:
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/insights",
        {
            "access_token": token,
            "fields": "spend,impressions,clicks,actions,ctr",
            "breakdowns": "publisher_platform,platform_position",
            "time_range": time_range,
            "time_increment": 1,
            "limit": 500,
        },
    )
    for r in rows:
        actions = r.get("actions") or []
        leads = _extrair_leads(actions)
        spend = _safe_float(r.get("spend"))
        cpl = spend / leads if leads > 0 else 0.0
        platform = r.get("publisher_platform", "?")
        position = r.get("platform_position", "?")
        breakdown_value = f"{platform}|{position}"
        db.execute(text("""
            INSERT INTO meta_publicos_insights
                (ads_account_id, data, breakdown_type, breakdown_value,
                 leads, spend, impressions, clicks, ctr, cpl)
            VALUES
                (:ads_account_id, :data, 'placement', :breakdown_value,
                 :leads, :spend, :impressions, :clicks, :ctr, :cpl)
            ON CONFLICT (ads_account_id, data, breakdown_type, breakdown_value) DO UPDATE SET
                leads       = EXCLUDED.leads,
                spend       = EXCLUDED.spend,
                impressions = EXCLUDED.impressions,
                clicks      = EXCLUDED.clicks,
                ctr         = EXCLUDED.ctr,
                cpl         = EXCLUDED.cpl
        """), {
            "ads_account_id": str(ads_account_uuid),
            "data": r.get("date_start"),
            "breakdown_value": breakdown_value,
            "leads": leads,
            "spend": spend,
            "impressions": _safe_int(r.get("impressions")),
            "clicks": _safe_int(r.get("clicks")),
            "ctr": _safe_float(r.get("ctr")),
            "cpl": cpl,
        })
        totais["publicos"] += 1
    db.commit()


def _sync_publicos_device(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    time_range: str,
    ads_account_uuid: Any,
    totais: dict,
) -> None:
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/insights",
        {
            "access_token": token,
            "fields": "spend,impressions,clicks,actions,ctr",
            "breakdowns": "device_platform",
            "time_range": time_range,
            "time_increment": 1,
            "limit": 500,
        },
    )
    for r in rows:
        actions = r.get("actions") or []
        leads = _extrair_leads(actions)
        spend = _safe_float(r.get("spend"))
        cpl = spend / leads if leads > 0 else 0.0
        breakdown_value = r.get("device_platform", "unknown")
        db.execute(text("""
            INSERT INTO meta_publicos_insights
                (ads_account_id, data, breakdown_type, breakdown_value,
                 leads, spend, impressions, clicks, ctr, cpl)
            VALUES
                (:ads_account_id, :data, 'device', :breakdown_value,
                 :leads, :spend, :impressions, :clicks, :ctr, :cpl)
            ON CONFLICT (ads_account_id, data, breakdown_type, breakdown_value) DO UPDATE SET
                leads       = EXCLUDED.leads,
                spend       = EXCLUDED.spend,
                impressions = EXCLUDED.impressions,
                clicks      = EXCLUDED.clicks,
                ctr         = EXCLUDED.ctr,
                cpl         = EXCLUDED.cpl
        """), {
            "ads_account_id": str(ads_account_uuid),
            "data": r.get("date_start"),
            "breakdown_value": breakdown_value,
            "leads": leads,
            "spend": spend,
            "impressions": _safe_int(r.get("impressions")),
            "clicks": _safe_int(r.get("clicks")),
            "ctr": _safe_float(r.get("ctr")),
            "cpl": cpl,
        })
        totais["publicos"] += 1
    db.commit()


def _sync_publicos_hourly(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    time_range: str,
    ads_account_uuid: Any,
    totais: dict,
) -> None:
    from datetime import date as _date
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/insights",
        {
            "access_token": token,
            "fields": "spend,impressions,clicks,actions",
            "breakdowns": "hourly_stats_aggregated_by_advertiser_time_zone",
            "time_range": time_range,
            "time_increment": 1,
            "limit": 500,
        },
    )
    for r in rows:
        actions = r.get("actions") or []
        leads = _extrair_leads(actions)
        spend = _safe_float(r.get("spend"))
        cpl = spend / leads if leads > 0 else 0.0
        date_str = r.get("date_start")
        try:
            dia_semana = _date.fromisoformat(date_str).weekday()  # 0=seg, 6=dom
        except Exception:
            dia_semana = 0
        hora_raw = r.get("hourly_stats_aggregated_by_advertiser_time_zone", "00:00:00")
        try:
            hora = int(str(hora_raw)[:2])  # "HH:00:00 - HH:59:59" → int(HH)
        except (ValueError, IndexError):
            hora = 0
        breakdown_value = f"{dia_semana}|{hora}"
        db.execute(text("""
            INSERT INTO meta_publicos_insights
                (ads_account_id, data, breakdown_type, breakdown_value,
                 leads, spend, impressions, clicks, ctr, cpl)
            VALUES
                (:ads_account_id, :data, 'hourly', :breakdown_value,
                 :leads, :spend, :impressions, :clicks, 0, :cpl)
            ON CONFLICT (ads_account_id, data, breakdown_type, breakdown_value) DO UPDATE SET
                leads       = EXCLUDED.leads,
                spend       = EXCLUDED.spend,
                impressions = EXCLUDED.impressions,
                clicks      = EXCLUDED.clicks,
                cpl         = EXCLUDED.cpl
        """), {
            "ads_account_id": str(ads_account_uuid),
            "data": date_str,
            "breakdown_value": breakdown_value,
            "leads": leads,
            "spend": spend,
            "impressions": _safe_int(r.get("impressions")),
            "clicks": _safe_int(r.get("clicks")),
            "cpl": cpl,
        })
        totais["publicos"] += 1
    db.commit()

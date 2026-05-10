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
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
}


# ── helpers ────────────────────────────────────────────────────────────────────

def _extrair_leads(actions: list[dict]) -> int:
    return sum(
        int(float(a.get("value", 0)))
        for a in actions
        if a.get("action_type") in LEAD_ACTION_TYPES
    )


def _extrair_leads_por_tipo(actions: list[dict]) -> tuple[int, int]:
    """Retorna (leads_mensagem, leads_cadastro)."""
    msgs = sum(
        int(float(a.get("value", 0)))
        for a in actions
        if a.get("action_type") == "onsite_conversion.messaging_first_reply"
    )
    cadastros = sum(
        int(float(a.get("value", 0)))
        for a in actions
        if a.get("action_type") == "offsite_conversion.fb_pixel_lead"
    )
    return msgs, cadastros


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
            log.error("Meta API erro %s: %s", resp.status_code, err.get("message", resp.text))
            break

        data = resp.json()
        resultados.extend(data.get("data", []))
        next_url = data.get("paging", {}).get("next")
        current_url = next_url
        current_params = None  # próximas páginas já têm tudo na URL

    return resultados


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
        _sync_diarios(client, db, meta_account_id, token, time_range, totais)
        _sync_campanhas(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_anuncios(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_publicos_demograficos(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_publicos_placement(client, db, meta_account_id, token, time_range, conta.id, totais)

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
        leads_msg, leads_cad = _extrair_leads_por_tipo(actions)
        db.execute(text("""
            INSERT INTO meta_insights_diarios
                (ads_account_id, data, spend, impressions, reach, clicks, leads,
                 cpl, cpc, cpm, ctr, frequencia, leads_mensagem, leads_cadastro)
            SELECT
                aa.id, :data, :spend, :impressions, :reach, :clicks, :leads,
                CASE WHEN :leads > 0 THEN :spend / :leads ELSE 0 END,
                :cpc, :cpm, :ctr, :frequencia, :leads_mensagem, :leads_cadastro
            FROM ads_accounts aa
            WHERE aa.account_id = :account_id AND aa.plataforma = 'meta'
            ON CONFLICT (ads_account_id, data) DO UPDATE SET
                spend        = EXCLUDED.spend,
                impressions  = EXCLUDED.impressions,
                reach        = EXCLUDED.reach,
                clicks       = EXCLUDED.clicks,
                leads        = EXCLUDED.leads,
                cpl          = EXCLUDED.cpl,
                cpc          = EXCLUDED.cpc,
                cpm          = EXCLUDED.cpm,
                ctr          = EXCLUDED.ctr,
                frequencia   = EXCLUDED.frequencia,
                leads_mensagem  = EXCLUDED.leads_mensagem,
                leads_cadastro  = EXCLUDED.leads_cadastro
        """), {
            "account_id": account_id,
            "data": r.get("date_start"),
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
    for r in rows:
        actions = r.get("actions") or []
        leads = _extrair_leads(actions)
        spend = _safe_float(r.get("spend"))
        db.execute(text("""
            INSERT INTO meta_campanhas_insights
                (ads_account_id, campaign_id, nome, objetivo, data,
                 spend, leads, impressions, reach, clicks, ctr, cpc, cpm, frequencia)
            VALUES
                (:ads_account_id, :campaign_id, :nome, :objetivo, :data,
                 :spend, :leads, :impressions, :reach, :clicks, :ctr, :cpc, :cpm, :frequencia)
            ON CONFLICT (ads_account_id, campaign_id, data) DO UPDATE SET
                nome        = EXCLUDED.nome,
                objetivo    = EXCLUDED.objetivo,
                spend       = EXCLUDED.spend,
                leads       = EXCLUDED.leads,
                impressions = EXCLUDED.impressions,
                reach       = EXCLUDED.reach,
                clicks      = EXCLUDED.clicks,
                ctr         = EXCLUDED.ctr,
                cpc         = EXCLUDED.cpc,
                cpm         = EXCLUDED.cpm,
                frequencia  = EXCLUDED.frequencia
        """), {
            "ads_account_id": str(ads_account_uuid),
            "campaign_id": r.get("campaign_id"),
            "nome": r.get("campaign_name"),
            "objetivo": r.get("objective"),
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
                "ad_id,ad_name,adset_id,campaign_id,"
                "creative{id,thumbnail_url,body}"
            ),
            "level": "ad",
            "time_range": time_range,
            "time_increment": 1,
            "limit": 500,
        },
    )
    for r in rows:
        actions = r.get("actions") or []
        leads = _extrair_leads(actions)
        creative = r.get("creative") or {}
        creative_id = creative.get("id")
        thumbnail_url = creative.get("thumbnail_url")
        spend = _safe_float(r.get("spend"))
        db.execute(text("""
            INSERT INTO meta_anuncios_insights
                (ads_account_id, ad_id, adset_id, campaign_id, nome,
                 creative_id, thumbnail_url, data,
                 spend, leads, impressions, reach, clicks, ctr, cpc, cpm, frequencia)
            VALUES
                (:ads_account_id, :ad_id, :adset_id, :campaign_id, :nome,
                 :creative_id, :thumbnail_url, :data,
                 :spend, :leads, :impressions, :reach, :clicks, :ctr, :cpc, :cpm, :frequencia)
            ON CONFLICT (ads_account_id, ad_id, data) DO UPDATE SET
                adset_id      = EXCLUDED.adset_id,
                campaign_id   = EXCLUDED.campaign_id,
                nome          = EXCLUDED.nome,
                creative_id   = EXCLUDED.creative_id,
                thumbnail_url = EXCLUDED.thumbnail_url,
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
            "ad_id": r.get("ad_id"),
            "adset_id": r.get("adset_id"),
            "campaign_id": r.get("campaign_id"),
            "nome": r.get("ad_name"),
            "creative_id": creative_id,
            "thumbnail_url": thumbnail_url,
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

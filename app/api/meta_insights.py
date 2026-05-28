import logging
import json
import time
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, listar_workspaces_autorizados, verificar_acesso_workspace
from app.services.cache_utils import cache_get, cache_key, cache_prune, cache_set
from app.services.ads_account_access import listar_ads_account_ids_acessiveis
from app.api.meta_delivery import (
    resolver_veiculacao_anuncio,
    resolver_veiculacao_campanha,
    resolver_veiculacao_conjunto,
    resolver_veiculacao_criativo,
    serializar_veiculacao,
    VEICULACAO_APRENDIZADO,
    VEICULACAO_APRENDIZADO_LIMITADO,
    VEICULACAO_ATIVO,
    VEICULACAO_CONCLUIDO,
    VEICULACAO_DESATIVADO,
    VEICULACAO_EM_ANALISE,
    VEICULACAO_ERRO_CONTA,
    VEICULACAO_ITENS_AUSENTES,
    VEICULACAO_PROCESSANDO,
    VEICULACAO_PROGRAMADO,
    VEICULACAO_REJEITADO,
)
from app.services.meta_tracking import extrair_tracking_info
from app.models.user import User

router = APIRouter(prefix="/meta/insights", tags=["meta_insights"])
logger = logging.getLogger(__name__)

_DETALHE_CACHE_TTL_SECONDS = 300
_DETALHE_CACHE: dict[tuple[str, ...], tuple[float, dict]] = {}
_RESPOSTA_CACHE_TTL_SECONDS = 120
_RESPOSTA_CACHE: dict[tuple[str, ...], tuple[float, dict]] = {}


def _conta_ids_da_query(workspace_id: str, conta_ids: list[str], db: Session, usuario: User | None = None) -> list[uuid.UUID]:
    if usuario is not None:
        verificar_acesso_workspace(usuario, uuid.UUID(workspace_id), db)
    return listar_ads_account_ids_acessiveis(
        db,
        uuid.UUID(workspace_id),
        conta_ids=conta_ids,
        plataforma="meta",
        include_inactive=True,
    )


def _workspace_padrao_detalhe(usuario: User, db: Session) -> uuid.UUID:
    if usuario.workspace_id is not None:
        workspace_uuid = uuid.UUID(str(usuario.workspace_id))
        verificar_acesso_workspace(usuario, workspace_uuid, db)
        return workspace_uuid

    workspaces = listar_workspaces_autorizados(usuario, db)
    if workspaces:
        return workspaces[0].id

    raise HTTPException(status_code=403, detail="Sem workspace acessível para o usuário")


def _periodo_padrao_detalhe(data_inicio: date | None, data_fim: date | None) -> tuple[date, date]:
    fim = data_fim or date.today()
    inicio = data_inicio or (fim - timedelta(days=29))
    if inicio > fim:
        inicio, fim = fim, inicio
    return inicio, fim


def _detalhe_cache_key(
    *,
    workspace_id: str,
    lookup_type: str,
    lookup_id: str,
    data_inicio: date,
    data_fim: date,
    conta_ids: list[str],
    sync_version: str | None,
) -> tuple[str, ...]:
    contas = tuple(sorted({c.strip() for c in conta_ids if c and c.strip()}))
    sync_marker = (sync_version or '').strip()
    return (
        workspace_id,
        lookup_type,
        lookup_id,
        str(data_inicio),
        str(data_fim),
        sync_marker,
        *contas,
    )


def _detalhe_cache_get(key: tuple[str, ...]) -> dict | None:
    return cache_get(_DETALHE_CACHE, key)


def _detalhe_cache_prune(now: float | None = None) -> None:
    cache_prune(_DETALHE_CACHE, now)


def _detalhe_cache_set(key: tuple[str, ...], payload: dict) -> None:
    cache_set(_DETALHE_CACHE, key, payload, _DETALHE_CACHE_TTL_SECONDS)


def _resposta_cache_get(key: tuple[str, ...]) -> dict | None:
    return cache_get(_RESPOSTA_CACHE, key)


def _resposta_cache_set(key: tuple[str, ...], payload: dict) -> None:
    cache_set(_RESPOSTA_CACHE, key, payload, _RESPOSTA_CACHE_TTL_SECONDS)


def _normalizar_status_modal(*values: str | None) -> str:
    raw_values = {
        _normalizar_texto(value).upper()
        for value in values
        if value and _normalizar_texto(value)
    }
    if raw_values.intersection({
        "ACTIVE",
        "LEARNING",
        "LEARNING_LIMITED",
        VEICULACAO_ATIVO,
        VEICULACAO_APRENDIZADO,
        VEICULACAO_APRENDIZADO_LIMITADO,
    }):
        return "Ativo"
    if raw_values.intersection({"ARCHIVED", "DELETED"}):
        return "Desativado"
    return "Pausado"


def _tipo_modal(tipo_criativo: str | None) -> str:
    tipo = _normalizar_texto(tipo_criativo).upper()
    if tipo in {"VIDEO", "CAROUSEL"}:
        return tipo
    return "IMAGE"


def _plataforma_modal(publisher_platform: str | None) -> str | None:
    plataforma = _normalizar_texto(publisher_platform).lower()
    if plataforma == "instagram":
        return "instagram"
    if plataforma in {"facebook", "messenger", "audience_network", "threads"}:
        return "facebook"
    return None


def _formato_periodo_modal(data_inicio: date, data_fim: date) -> str:
    return f"{data_inicio.strftime('%d/%m/%Y')} - {data_fim.strftime('%d/%m/%Y')}"


def _safe_div(num: float, den: float) -> float:
    return round(num / den, 4) if den else 0.0


def _executar_query_com_fallback(db: Session, stmt, params: dict, *, contexto: str, loader, default):
    inicio = time.perf_counter()
    try:
        resultado = loader(db.execute(stmt, params))
    except Exception:
        logger.exception("Falha ao carregar %s", contexto)
        return default

    duracao_ms = (time.perf_counter() - inicio) * 1000
    if duracao_ms >= 1000:
        tamanho = None
        try:
            tamanho = len(resultado)  # type: ignore[arg-type]
        except TypeError:
            tamanho = None
        detalhe_tamanho = f" rows={tamanho}" if tamanho is not None else ""
        logger.info("Consulta lenta em %s: %.1f ms%s", contexto, duracao_ms, detalhe_tamanho)
    return resultado


def _tem_resultado_anuncio(*, result_count: int, leads: int = 0, usar_leads_como_fallback: bool = False) -> bool:
    if int(result_count or 0) > 0:
        return True
    return usar_leads_como_fallback and int(leads or 0) > 0


def _creative_key_sql(alias: str = "a", creative_alias: str = "cr") -> str:
    return f"COALESCE(NULLIF({alias}.creative_id, ''), {creative_alias}.creative_id, {alias}.ad_id)"


def _status_rank(status: str) -> int:
    s = (status or "").upper()
    if s == "ACTIVE":
        return 4
    if s == "PAUSED":
        return 3
    if s == "ARCHIVED":
        return 2
    if s == "DELETED":
        return 1
    return 0


def _resolver_veiculacao(statuses: list[str]) -> str:
    if not statuses:
        return "PAUSED"
    normalizados = [(s or "").upper() for s in statuses if s]
    if "ACTIVE" in normalizados:
        return "ACTIVE"
    if "PAUSED" in normalizados:
        return "PAUSED"
    if "ARCHIVED" in normalizados:
        return "ARCHIVED"
    if "DELETED" in normalizados:
        return "DELETED"
    return normalizados[0] if normalizados else "PAUSED"


def _resumo_status(veiculacao: str, leads: int) -> str:
    if (veiculacao or "").upper() == "ACTIVE":
        return "ATIVA"
    if leads > 0:
        return "COM_RESULTADO"
    return "INATIVA"


def _normalizar_status(raw: str | None, default: str = "PAUSED") -> str:
    s = (raw or "").strip().upper()
    if not s:
        return default
    if s == "ACTIVE":
        return "ACTIVE"
    return "PAUSED"


def _is_concluido(
    *,
    end_time: datetime | None,
    lifetime_budget: float | None,
    spend_total: float | None,
) -> tuple[bool, str | None]:
    now = datetime.now(timezone.utc)
    if end_time and end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)
    if end_time and end_time < now:
        return True, end_time.strftime("%d/%m/%Y %H:%M")
    lb = float(lifetime_budget or 0)
    st = float(spend_total or 0)
    if lb > 0 and st >= lb:
        return True, "Orçamento vitalício atingido"
    return False, None


def _carregar_status_contexto(account_uuids: list[uuid.UUID], db: Session) -> dict:
    camp_rows = db.execute(
        text(
            "SELECT campaign_id, MAX(configured_status) AS configured_status, MAX(effective_status) AS effective_status, "
            "MAX(start_time) AS start_time, "
            "MAX(stop_time) AS stop_time, MAX(lifetime_budget) AS lifetime_budget, "
            "MAX(spend_total) AS spend_total "
            "FROM meta_campaigns_catalog "
            "WHERE ads_account_id = ANY(:ids) "
            "GROUP BY campaign_id"
        ),
        {"ids": account_uuids},
    ).fetchall()
    adset_rows = db.execute(
        text(
            "SELECT adset_id, MAX(campaign_id) AS campaign_id, MAX(configured_status) AS configured_status, MAX(effective_status) AS effective_status, "
            "MAX(start_time) AS start_time, "
            "MAX(end_time) AS end_time, MAX(lifetime_budget) AS lifetime_budget, "
            "MAX(spend_total) AS spend_total "
            "FROM meta_adsets_catalog "
            "WHERE ads_account_id = ANY(:ids) "
            "GROUP BY adset_id"
        ),
        {"ids": account_uuids},
    ).fetchall()
    ad_rows = db.execute(
        text(
            "SELECT ad_id, MAX(campaign_id) AS campaign_id, MAX(adset_id) AS adset_id, "
            "MAX(configured_status) AS configured_status, MAX(effective_status) AS effective_status "
            "FROM meta_ads_catalog "
            "WHERE ads_account_id = ANY(:ids) "
            "GROUP BY ad_id"
        ),
        {"ids": account_uuids},
    ).fetchall()

    camp_by_id = {
        r[0]: {
            "base_status": _normalizar_status(r[1] or r[2], "PAUSED"),
            "status": r[1],
            "configured_status": r[1],
            "effective_status": r[2],
            "start_time": r[3],
            "stop_time": r[4],
            "lifetime_budget": float(r[5]) if r[5] is not None else None,
            "spend_total": float(r[6]) if r[6] is not None else 0.0,
        }
        for r in camp_rows
    }
    adset_by_id = {
        r[0]: {
            "campaign_id": r[1],
            "base_status": _normalizar_status(r[2] or r[3], "PAUSED"),
            "status": r[2],
            "configured_status": r[2],
            "effective_status": r[3],
            "start_time": r[4],
            "end_time": r[5],
            "lifetime_budget": float(r[6]) if r[6] is not None else None,
            "spend_total": float(r[7]) if r[7] is not None else 0.0,
        }
        for r in adset_rows
    }
    ad_by_id = {
        r[0]: {
            "campaign_id": r[1],
            "adset_id": r[2],
            "base_status": _normalizar_status(r[3] or r[4], "ACTIVE"),
            "status": r[3],
            "configured_status": r[3],
            "effective_status": r[4],
        }
        for r in ad_rows
    }
    return {"campaigns": camp_by_id, "adsets": adset_by_id, "ads": ad_by_id}


def _build_status_resolvers(status_ctx: dict):
    cache_c: dict[str, tuple[str, str | None]] = {}
    cache_s: dict[str, tuple[str, str | None]] = {}
    cache_a: dict[str, tuple[str, str | None]] = {}

    def resolve_campaign(campaign_id: str, fallback_status: str | None = None) -> tuple[str, str | None]:
        if campaign_id in cache_c:
            return cache_c[campaign_id]
        meta = status_ctx["campaigns"].get(campaign_id)
        if not meta:
            cache_c[campaign_id] = (_normalizar_status(fallback_status, "PAUSED"), None)
            return cache_c[campaign_id]
        concluido, motivo = _is_concluido(
            end_time=meta["stop_time"],
            lifetime_budget=meta["lifetime_budget"],
            spend_total=meta["spend_total"],
        )
        if concluido:
            cache_c[campaign_id] = ("PAUSED", motivo)
            return cache_c[campaign_id]
        if meta["base_status"] != "ACTIVE":
            cache_c[campaign_id] = ("PAUSED", "PAUSADA")
            return cache_c[campaign_id]
        cache_c[campaign_id] = ("ACTIVE", None)
        return cache_c[campaign_id]

    def resolve_adset(
        adset_id: str,
        fallback_status: str | None = None,
        campaign_id: str | None = None,
    ) -> tuple[str, str | None]:
        if adset_id in cache_s:
            return cache_s[adset_id]
        meta = status_ctx["adsets"].get(adset_id)
        if not meta:
            cache_s[adset_id] = (_normalizar_status(fallback_status, "PAUSED"), None)
            return cache_s[adset_id]
        parent_campaign_id = meta["campaign_id"] or campaign_id
        parent_status, _ = (
            resolve_campaign(parent_campaign_id)
            if parent_campaign_id
            else (_normalizar_status(fallback_status, "PAUSED"), None)
        )
        if parent_status != "ACTIVE":
            cache_s[adset_id] = ("PAUSED", "PAI_INATIVO")
            return cache_s[adset_id]
        concluido, motivo = _is_concluido(
            end_time=meta["end_time"],
            lifetime_budget=meta["lifetime_budget"],
            spend_total=meta["spend_total"],
        )
        if concluido:
            cache_s[adset_id] = ("PAUSED", motivo)
            return cache_s[adset_id]
        if meta["base_status"] != "ACTIVE":
            cache_s[adset_id] = ("PAUSED", "PAUSADA")
            return cache_s[adset_id]
        cache_s[adset_id] = ("ACTIVE", None)
        return cache_s[adset_id]

    def resolve_ad(ad_id: str, campaign_id: str | None = None, adset_id: str | None = None) -> tuple[str, str | None]:
        if ad_id in cache_a:
            return cache_a[ad_id]
        meta = status_ctx["ads"].get(ad_id, {})
        camp_id = campaign_id or meta.get("campaign_id")
        set_id = adset_id or meta.get("adset_id")
        if camp_id:
            camp_status, _ = resolve_campaign(camp_id)
            if camp_status != "ACTIVE":
                cache_a[ad_id] = ("PAUSED", "PAI_INATIVO")
                return cache_a[ad_id]
        if set_id:
            adset_status, _ = resolve_adset(set_id, campaign_id=camp_id)
            if adset_status != "ACTIVE":
                cache_a[ad_id] = ("PAUSED", "PAI_INATIVO")
                return cache_a[ad_id]
        base_status = _normalizar_status(meta.get("base_status"), "ACTIVE")
        if base_status != "ACTIVE":
            cache_a[ad_id] = ("PAUSED", "PAUSADA")
            return cache_a[ad_id]
        cache_a[ad_id] = ("ACTIVE", None)
        return cache_a[ad_id]

    return resolve_campaign, resolve_adset, resolve_ad


def _normalizar_texto(valor: str | None) -> str:
    return (valor or "").strip().upper()


def _safe_float(valor) -> float:
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def _parse_jsonb(valor):
    if not valor:
        return {}
    if isinstance(valor, dict):
        return valor
    if isinstance(valor, list):
        return valor
    if isinstance(valor, str):
        try:
            return json.loads(valor)
        except Exception:
            return {}
    return {}


def _status_base_from_veiculacao(veiculacao: str | None) -> str:
    s = _normalizar_texto(veiculacao)
    if s in {"ATIVO", "APRENDIZADO", "APRENDIZADO_LIMITADO"}:
        return "ACTIVE" if s == "ATIVO" else "LEARNING"
    if s in {"CONCLUIDO", "DESATIVADO", "PROGRAMADO", "EM_ANALISE", "REJEITADO", "PROCESSANDO", "ERRO_CONTA", "ITENS_AUSENTES"}:
        return "PAUSED"
    return "PAUSED"


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


def _agrupar_plataformas(
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
        return ["whatsapp"], [
            {
                "codigo": "whatsapp",
                "label": "WhatsApp",
                "detalhes": detalhes,
            }
        ]

    resumo_map: dict[str, dict] = {}
    for row in placement_rows:
        publisher_platform, platform_position = _desmembrar_breakdown_plataforma(row.get("breakdown_value"))
        familia, label = _plataforma_canonica(publisher_platform)
        if not familia:
            continue
        detalhe = _rotular_posicao_plataforma(platform_position)
        item = resumo_map.setdefault(
            familia,
            {"codigo": familia, "label": label, "detalhes": []},
        )
        if detalhe and detalhe not in item["detalhes"]:
            item["detalhes"].append(detalhe)
    ordem = {"whatsapp": 0, "instagram": 1, "facebook": 2}
    resumo = sorted(resumo_map.values(), key=lambda item: ordem.get(item["codigo"], 99))
    return [item["codigo"] for item in resumo], resumo


def _texto_primeiro(*valores) -> str | None:
    for valor in valores:
        if valor is None:
            continue
        if isinstance(valor, (int, float)):
            texto = str(valor).strip()
        else:
            texto = str(valor).strip()
        if texto:
            return texto
    return None


def _extrair_call_to_action(data: dict | None) -> str | None:
    if not data or not isinstance(data, dict):
        return None
    value = data.get("value")
    if isinstance(value, dict):
        return _texto_primeiro(
            value.get("cta_type"),
            value.get("link_caption"),
            value.get("text"),
            value.get("call_to_action_type"),
        )
    return _texto_primeiro(
        data.get("cta_type"),
        data.get("link_caption"),
        data.get("text"),
    )


def _extrair_pixel_id_tracking_specs(tracking_specs) -> str | None:
    def _scan(node, key_hint: str | None = None) -> str | None:
        if isinstance(node, dict):
            if key_hint and "pixel" in key_hint.lower():
                for value in node.values():
                    found = _scan(value, key_hint)
                    if found:
                        return found
            for key, value in node.items():
                key_norm = str(key).strip().lower()
                if "pixel" in key_norm:
                    found = _scan(value, key_norm)
                    if found:
                        return found
            for value in node.values():
                found = _scan(value, key_hint)
                if found:
                    return found
            return None
        if isinstance(node, list):
            for item in node:
                found = _scan(item, key_hint)
                if found:
                    return found
            return None
        if key_hint and "pixel" in key_hint.lower():
            return _texto_primeiro(node)
        return None

    return _scan(tracking_specs)


def _extrair_textos_criativo(raw_payload: dict | None, link_anuncio: str | None) -> dict[str, str | None]:
    creative = raw_payload or {}
    story_spec = creative.get("object_story_spec") or {}
    link_data = story_spec.get("link_data") or {}
    video_data = story_spec.get("video_data") or {}
    photo_data = story_spec.get("photo_data") or {}
    template_data = story_spec.get("template_data") or {}
    child_attachments = link_data.get("child_attachments") or []
    first_child = child_attachments[0] if child_attachments else {}
    tracking_specs = creative.get("tracking_specs")

    ad_text = _texto_primeiro(
        link_data.get("message"),
        video_data.get("message"),
        template_data.get("message"),
        photo_data.get("message"),
        first_child.get("description"),
        first_child.get("name"),
        creative.get("body"),
        creative.get("message"),
    )

    ad_title = _texto_primeiro(
        link_data.get("name"),
        video_data.get("title"),
        video_data.get("name"),
        template_data.get("name"),
        photo_data.get("name"),
        first_child.get("name"),
        creative.get("title"),
    )

    ad_description = _texto_primeiro(
        link_data.get("description"),
        video_data.get("description"),
        template_data.get("description"),
        photo_data.get("description"),
        first_child.get("description"),
        creative.get("description"),
    )

    ad_cta = _extrair_call_to_action(link_data.get("call_to_action"))
    if not ad_cta:
        ad_cta = _extrair_call_to_action(video_data.get("call_to_action"))
    if not ad_cta:
        ad_cta = _extrair_call_to_action(template_data.get("call_to_action"))
    if not ad_cta:
        ad_cta = _extrair_call_to_action(photo_data.get("call_to_action"))
    if not ad_cta:
        ad_cta = _extrair_call_to_action(first_child.get("call_to_action"))

    ad_url = _texto_primeiro(
        link_data.get("link"),
        link_data.get("website_url"),
        video_data.get("link"),
        template_data.get("link"),
        photo_data.get("link"),
        first_child.get("link"),
        link_anuncio,
    )

    tracking_info = extrair_tracking_info(
        creative,
        headline_fallback=ad_title,
        destination_fallback=ad_url,
        url_tags_fallback=creative.get("url_tags"),
    )

    return {
        "ad_text": ad_text,
        "ad_title": ad_title,
        "headline": tracking_info.get("headline"),
        "ad_description": ad_description,
        "ad_cta": ad_cta,
        "ad_url": ad_url,
        "pixel_id": _extrair_pixel_id_tracking_specs(tracking_specs),
        "url_tags": tracking_info.get("url_tags"),
        "destination_url": tracking_info.get("destination_url"),
        "utm_source": tracking_info.get("utm_source"),
        "utm_campaign": tracking_info.get("utm_campaign"),
        "utm_medium": tracking_info.get("utm_medium"),
        "utm_content": tracking_info.get("utm_content"),
        "utm_term": tracking_info.get("utm_term"),
    }


def _historico_retencao_video(video_3_sec: int, video_p100: int, video_p75: int, video_p50: int, video_p25: int) -> list[dict]:
    base = float(video_3_sec or 0)
    if base <= 0:
        return []
    pontos = [
        ("P25", _safe_div(video_p25, base) * 100, video_p25),
        ("P50", _safe_div(video_p50, base) * 100, video_p50),
        ("P75", _safe_div(video_p75, base) * 100, video_p75),
        ("P100", _safe_div(video_p100, base) * 100, video_p100),
    ]
    return [
        {
            "label": label,
            "percentage": round(float(pct), 2),
            "views_count": int(count),
        }
        for label, pct, count in pontos
    ]


def _score_anuncio(cpl: float, ctr: float, leads: int, frequencia: float, status_base: str) -> int:
    if cpl <= 0.50:
        cpl_score = 40
    elif cpl <= 1.00:
        cpl_score = 32
    elif cpl <= 2.00:
        cpl_score = 20
    elif cpl <= 5.00:
        cpl_score = 10
    else:
        cpl_score = 0

    if ctr >= 3.0:
        ctr_score = 25
    elif ctr >= 2.0:
        ctr_score = 18
    elif ctr >= 1.0:
        ctr_score = 10
    elif ctr >= 0.5:
        ctr_score = 5
    else:
        ctr_score = 0

    if leads >= 200:
        leads_score = 20
    elif leads >= 50:
        leads_score = 14
    elif leads >= 10:
        leads_score = 8
    elif leads >= 1:
        leads_score = 3
    else:
        leads_score = 0

    if frequencia <= 2.0:
        freq_score = 15
    elif frequencia <= 2.5:
        freq_score = 10
    elif frequencia <= 3.0:
        freq_score = 5
    elif frequencia <= 3.5:
        freq_score = 2
    else:
        freq_score = 0

    score = cpl_score + ctr_score + leads_score + freq_score
    if status_base == "PAUSED":
        score = round(score * 0.7)
    return min(max(score, 0), 100)


def _texto_ordenacao(valor: str | None) -> str:
    return (valor or "").strip().casefold()


def _ordenar_anuncios(items: list[dict], ordenar_por: str | None) -> None:
    campo = _normalizar_texto(ordenar_por).lower()
    if campo in {"campanha", "campaign", "campaign_name"}:
        items.sort(
            key=lambda item: (
                _texto_ordenacao(str(item.get("campaign_name") or item.get("campaign_id") or "")),
                _texto_ordenacao(str(item.get("adset_name") or item.get("adset_id") or "")),
                _texto_ordenacao(str(item.get("nome") or item.get("id") or "")),
            )
        )
        return

    if campo in {"conjunto", "adset", "adset_name"}:
        items.sort(
            key=lambda item: (
                _texto_ordenacao(str(item.get("adset_name") or item.get("adset_id") or "")),
                _texto_ordenacao(str(item.get("campaign_name") or item.get("campaign_id") or "")),
                _texto_ordenacao(str(item.get("nome") or item.get("id") or "")),
            )
        )
        return

    if campo in {"anuncio", "nome"}:
        items.sort(
            key=lambda item: (
                _texto_ordenacao(str(item.get("nome") or item.get("id") or "")),
                _texto_ordenacao(str(item.get("campaign_name") or item.get("campaign_id") or "")),
                _texto_ordenacao(str(item.get("adset_name") or item.get("adset_id") or "")),
            )
        )
        return

    reverse = True
    chave = "score"

    if campo == "leads":
        chave = "leads"
    elif campo == "cpl":
        chave = "cpl"
        reverse = False
    elif campo == "ctr":
        chave = "ctr"
    elif campo == "spend":
        chave = "investimento"
    elif campo == "hookrate":
        chave = "hook_rate"
    elif campo == "frequencia":
        chave = "frequencia"

    missing = float("-inf") if reverse else float("inf")

    def valor(item: dict) -> float:
        bruto = item.get(chave)
        if bruto is None:
            return missing
        try:
            return float(bruto)
        except (TypeError, ValueError):
            return missing

    items.sort(key=lambda item: _texto_ordenacao(str(item.get("nome") or item.get("id") or "")))
    items.sort(key=valor, reverse=reverse)


def _preview_media_anuncio(item: dict) -> str | None:
    carousel_items = item.get("carousel_items") or []
    if isinstance(carousel_items, list):
        for card in carousel_items:
            if not isinstance(card, dict):
                continue
            media = card.get("image_url_hq") or card.get("picture")
            if media:
                return str(media)
    return str(item.get("image_url_hq") or item.get("thumbnail_url") or "") or None


def _nome_base_carrossel(nome: str | None) -> str | None:
    texto = str(nome or "").strip()
    if not texto or "CARROSSEL" not in texto.upper():
        return None
    if texto.startswith("[") and "]" in texto:
        return texto.split("]")[0].strip() + "]"
    return texto


@router.get("/anuncios-performance")
def anuncios_performance(
    workspace_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    conta_ids: str | None = Query(None),
    campaign_ids: str | None = Query(None),
    campaign_id: str | None = Query(None),
    platform_filter: str | None = Query(None),
    status_filter: str | None = Query(None),
    tipo: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=100),
    ordenar_por: str | None = Query("campanha"),
    resultado: str = Query("performance"),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
    account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db, usuario)
    if not account_uuids:
        return {
            "items": [],
            "page": page,
            "limit": limit,
            "total": 0,
            "has_more": False,
            "resumo": {
                "investimento_total": 0.0,
                "leads_total": 0,
                "ctr_medio": 0.0,
                "frequencia_media": 0.0,
            },
            "campanhas_disponiveis": [],
            "plataformas_disponiveis": [],
        }

    campaign_filter_ids = [c.strip() for c in campaign_ids.split(",")] if campaign_ids else []
    if campaign_id and campaign_id != "todas":
        campaign_filter_ids = [campaign_id]

    base_where = [
        "a.ads_account_id = ANY(:ids)",
        "a.data BETWEEN :ini AND :fim",
    ]
    params: dict = {"ids": account_uuids, "ini": data_inicio, "fim": data_fim}
    if campaign_filter_ids:
        base_where.append("a.campaign_id = ANY(:campaign_ids)")
        params["campaign_ids"] = campaign_filter_ids

    rows = db.execute(
        text(
            "SELECT "
            "  a.ad_id, "
            "  MAX(a.adset_id) AS adset_id, "
            "  MAX(a.adset_name) AS adset_name, "
            "  MAX(a.campaign_id) AS campaign_id, "
            "  MAX(ad.creative_id) AS catalog_creative_id, "
            "  MAX(c.nome) AS campaign_name, "
            "  MAX(a.nome) AS nome, "
            "  MAX(a.status) AS status, "
            "  MAX(a.tipo_criativo) AS tipo_criativo, "
            "  MAX(a.thumbnail_url) AS thumbnail_url, "
            "  MAX(a.image_url_hq) AS image_url_hq, "
            "  MAX(a.link_anuncio) AS link_anuncio, "
            "  MAX(a.carousel_items::text) AS carousel_items, "
            "  MAX(a.creative_id) AS creative_id, "
            "  COALESCE(SUM(a.spend),0) AS spend, "
            "  COALESCE(SUM(a.leads),0) AS leads, "
            "  COALESCE(SUM(a.impressions),0) AS impressions, "
            "  COALESCE(SUM(a.reach),0) AS reach, "
            "  COALESCE(SUM(a.clicks),0) AS clicks, "
            "  COALESCE(SUM(a.link_click),0) AS link_click, "
            "  COALESCE(SUM(a.result_count),0) AS result_count, "
            "  MAX(a.result_indicator) AS result_indicator, "
            "  COUNT(DISTINCT a.data) AS dias_ativo "
            "FROM meta_anuncios_insights a "
            "LEFT JOIN meta_campaigns_catalog c "
            "  ON c.ads_account_id = a.ads_account_id AND c.campaign_id = a.campaign_id "
            "LEFT JOIN meta_ads_catalog ad "
            "  ON ad.ads_account_id = a.ads_account_id AND ad.ad_id = a.ad_id "
            f"WHERE {' AND '.join(base_where)} "
            "GROUP BY a.ad_id "
            "ORDER BY COALESCE(SUM(a.spend),0) DESC, COALESCE(SUM(a.leads),0) DESC"
        ),
        params,
    ).mappings().all()

    if not rows:
        return {
            "items": [],
            "page": page,
            "limit": limit,
            "total": 0,
            "has_more": False,
            "resumo": {
                "investimento_total": 0.0,
                "leads_total": 0,
                "ctr_medio": 0.0,
                "frequencia_media": 0.0,
            },
            "campanhas_disponiveis": [],
            "plataformas_disponiveis": [],
        }

    tem_resultado_bruto = any(int(r.get("result_count") or 0) > 0 for r in rows)
    tem_leads_periodo = any(int(r.get("leads") or 0) > 0 for r in rows)
    usar_leads_como_fallback = not tem_resultado_bruto and tem_leads_periodo

    status_ctx = _carregar_status_contexto(account_uuids, db)

    creative_ids = [str(r["creative_id"]) for r in rows if r.get("creative_id")]
    ad_ids = [str(r["ad_id"]) for r in rows if r.get("ad_id")]
    creative_map: dict[str, dict] = {}
    creative_rows = []
    if creative_ids or ad_ids:
        creative_rows = db.execute(
            text(
                "SELECT creative_id, ad_id, "
                "MAX(tipo_criativo) AS tipo_criativo, "
                "MAX(thumbnail_url) AS thumbnail_url, "
                "MAX(image_url_hq) AS image_url_hq, "
                "MAX(link_anuncio) AS link_anuncio, "
                "MAX(video_id) AS video_id, "
                "MAX(meta_permalink_url) AS meta_permalink_url, "
                "(ARRAY_AGG(carousel_items ORDER BY last_seen_at DESC))[1] AS carousel_items, "
                "(ARRAY_AGG(raw_payload ORDER BY last_seen_at DESC))[1] AS raw_payload "
                "FROM meta_creatives_catalog "
                "WHERE ads_account_id = ANY(:ids) "
                "  AND (creative_id = ANY(:creative_ids) OR ad_id = ANY(:ad_ids)) "
                "GROUP BY creative_id, ad_id"
            ),
            {"ids": account_uuids, "creative_ids": creative_ids, "ad_ids": ad_ids},
        ).mappings().all()
        for r in creative_rows:
            data = dict(r)
            creative_id_key = str(data.get("creative_id") or "")
            ad_id_key = str(data.get("ad_id") or "")
            if creative_id_key:
                creative_map[creative_id_key] = data
            if ad_id_key:
                creative_map[ad_id_key] = data

    video_ids = sorted({
        str(r["video_id"])
        for r in creative_rows
        if r.get("video_id")
    }) if creative_rows else []
    video_map: dict[str, dict] = {}
    if video_ids:
        video_rows = db.execute(
            text(
                "SELECT video_id, "
                "MAX(thumbnail_url) AS thumbnail_url, "
                "MAX(image_url_hq) AS image_url_hq, "
                "MAX(source_url) AS source_url "
                "FROM meta_videos_catalog "
                "WHERE ads_account_id = ANY(:ids) "
                "  AND video_id = ANY(:video_ids) "
                "GROUP BY video_id"
            ),
            {"ids": account_uuids, "video_ids": video_ids},
        ).mappings().all()
        video_map = {str(r["video_id"]): dict(r) for r in video_rows}

    video_metrics_map: dict[str, dict] = {}
    if ad_ids:
        video_rows = db.execute(
            text(
                "SELECT ad_id, "
                "COALESCE(SUM(video_views),0) AS video_views, "
                "COALESCE(SUM(thruplay),0) AS thruplay, "
                "COALESCE(SUM(video_p25),0) AS video_p25, "
                "COALESCE(SUM(video_p50),0) AS video_p50, "
                "COALESCE(SUM(video_p75),0) AS video_p75, "
                "COALESCE(SUM(video_p100),0) AS video_p100, "
                "COALESCE(SUM(video_3_sec),0) AS video_3_sec, "
                "AVG(NULLIF(video_avg_pct_watched_actions, 0)) AS avg_watch_time "
                "FROM meta_video_metrics_daily "
                "WHERE ads_account_id = ANY(:ids) "
                "  AND ad_id = ANY(:ad_ids) "
                "  AND data BETWEEN :ini AND :fim "
                "GROUP BY ad_id"
            ),
            {"ids": account_uuids, "ad_ids": ad_ids, "ini": data_inicio, "fim": data_fim},
        ).mappings().all()
        video_metrics_map = {str(r["ad_id"]): dict(r) for r in video_rows}

    campaign_platform_rows = db.execute(
        text(
            "SELECT campaign_id, breakdown_value, "
            "COALESCE(SUM(leads),0) AS leads, "
            "COALESCE(SUM(spend),0) AS spend "
            "FROM meta_publicos_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "  AND breakdown_type = 'placement' "
            f"{' AND campaign_id = ANY(:campaign_ids)' if campaign_filter_ids else ''} "
            "GROUP BY campaign_id, breakdown_value "
            "ORDER BY leads DESC, spend DESC"
        ),
        params,
    ).mappings().all()

    destination_rows = db.execute(
        text(
            "SELECT campaign_id, "
            "BOOL_OR(UPPER(COALESCE(raw_payload->>'destination_type', '')) = 'WHATSAPP') AS destination_whatsapp "
            "FROM meta_ads_catalog "
            "WHERE ads_account_id = ANY(:ids) "
            f"{' AND campaign_id = ANY(:campaign_ids)' if campaign_filter_ids else ''} "
            "GROUP BY campaign_id"
        ),
        params,
    ).mappings().all()

    destination_map = {
        str(r["campaign_id"]): bool(r.get("destination_whatsapp"))
        for r in destination_rows
        if r.get("campaign_id")
    }

    plataformas_por_campanha: dict[str, dict] = {}
    for row in campaign_platform_rows:
        campaign_id_row = str(row.get("campaign_id") or "")
        if not campaign_id_row:
            continue
        bucket = plataformas_por_campanha.setdefault(
            campaign_id_row,
            {"rows": [], "codes": [], "resumo": []},
        )
        bucket["rows"].append(dict(row))

    for campaign_id_row, bucket in plataformas_por_campanha.items():
        codes, resumo = _agrupar_plataformas(bucket["rows"], destination_map.get(campaign_id_row, False))
        bucket["codes"] = codes
        bucket["resumo"] = resumo

    only_performance = (resultado or "performance").lower() != "todos"

    items: list[dict] = []
    campanha_options_map: dict[str, str] = {}
    plataforma_options_map: dict[str, str] = {}

    for row in rows:
        spend = float(row.get("spend") or 0)
        leads = int(row.get("leads") or 0)
        impressions = int(row.get("impressions") or 0)
        reach = int(row.get("reach") or 0)
        clicks = int(row.get("clicks") or 0)
        link_click = int(row.get("link_click") or 0)
        result_count = int(row.get("result_count") or 0)
        result_indicator = str(row.get("result_indicator") or "").strip() or None
        dias_ativo = int(row.get("dias_ativo") or 0)
        campaign_id_row = str(row.get("campaign_id") or "")
        catalog_creative_id = str(row.get("catalog_creative_id") or "")
        adset_id = str(row.get("adset_id") or "")
        ad_id = str(row.get("ad_id") or "")
        nome = str(row.get("nome") or ad_id)
        campaign_name = str(row.get("campaign_name") or campaign_id_row or nome)

        if only_performance and not _tem_resultado_anuncio(
            result_count=result_count,
            leads=leads,
            usar_leads_como_fallback=usar_leads_como_fallback,
        ):
            continue

        camp_meta = status_ctx["campaigns"].get(campaign_id_row, {})
        camp_status, camp_motivo = resolver_veiculacao_campanha(camp_meta)
        adset_meta = status_ctx["adsets"].get(adset_id, {})
        adset_status, adset_motivo = resolver_veiculacao_conjunto(adset_meta, camp_status)
        ad_meta = status_ctx["ads"].get(ad_id, {})
        ad_status, motivo_inatividade = resolver_veiculacao_anuncio(ad_meta, camp_status, adset_status)
        if motivo_inatividade is None:
            motivo_inatividade = adset_motivo or camp_motivo

        creative_row = (
            creative_map.get(str(row.get("creative_id") or ""))
            or creative_map.get(catalog_creative_id)
            or creative_map.get(str(row.get("ad_id") or ""))
            or {}
        )
        raw_payload = _parse_jsonb(creative_row.get("raw_payload"))
        extra_texts = _extrair_textos_criativo(raw_payload if isinstance(raw_payload, dict) else {}, row.get("link_anuncio"))
        carousel_items = _parse_jsonb(row.get("carousel_items"))
        if not isinstance(carousel_items, list) or not carousel_items:
            carousel_items = _parse_jsonb(creative_row.get("carousel_items"))
        if not isinstance(carousel_items, list):
            carousel_items = []
        tipo_criativo = str(creative_row.get("tipo_criativo") or row.get("tipo_criativo") or "IMAGE").upper()
        if tipo_criativo not in {"IMAGE", "VIDEO", "CAROUSEL"}:
            tipo_criativo = "IMAGE"
        if tipo_criativo != "VIDEO" and carousel_items:
            tipo_criativo = "CAROUSEL"

        plataforma_info = plataformas_por_campanha.get(campaign_id_row, {"codes": [], "resumo": []})
        plataformas_codes = plataforma_info.get("codes") or []
        plataformas_resumo = plataforma_info.get("resumo") or []
        platform_display_name = ", ".join(item["label"] for item in plataformas_resumo) if plataformas_resumo else "Não identificado"
        video_id = str(creative_row.get("video_id") or "") or None
        video_row = video_map.get(video_id or "") if video_id else {}
        video_thumbnail_url = (
            video_row.get("thumbnail_url")
            or creative_row.get("thumbnail_url")
            or row.get("image_url_hq")
            or row.get("thumbnail_url")
        )
        video_image_url_hq = (
            video_row.get("image_url_hq")
            or creative_row.get("image_url_hq")
            or row.get("image_url_hq")
            or row.get("thumbnail_url")
            or video_thumbnail_url
        )
        video_source_url = video_row.get("source_url") or None

        campanha_options_map[campaign_id_row] = campaign_name
        for p in plataformas_resumo:
            plataforma_options_map[p["codigo"]] = p["label"]

        ctr = (_safe_float(row.get("clicks")) / impressions) * 100 if impressions else 0.0
        cpc = spend / clicks if clicks else 0.0
        cpm = spend / impressions * 1000 if impressions else 0.0
        cpl = spend / leads if leads else 0.0
        frequencia = impressions / reach if reach else 0.0
        status_base = _status_base_from_veiculacao(ad_status)
        score = _score_anuncio(cpl, ctr, leads, frequencia, status_base)

        video_metrics = None
        retention_data = []
        hook_rate = None
        hold_rate_25 = None
        hold_rate_50 = None
        hold_rate_75 = None
        hold_rate_100 = None
        if tipo_criativo == "VIDEO":
            video_rows = video_metrics_map.get(ad_id, {})
            video_metrics = {
                "video_views": int(video_rows.get("video_views") or 0),
                "thruplay": int(video_rows.get("thruplay") or 0),
                "p25": int(video_rows.get("video_p25") or 0),
                "p50": int(video_rows.get("video_p50") or 0),
                "p75": int(video_rows.get("video_p75") or 0),
                "p100": int(video_rows.get("video_p100") or 0),
                "video_3_sec": int(video_rows.get("video_3_sec") or 0),
                "avg_watch_time": round(float(video_rows.get("avg_watch_time") or 0), 1),
            }
            video_3_sec = int(video_rows.get("video_3_sec") or 0)
            hold_rate_25 = _safe_div(int(video_rows.get("video_p25") or 0), video_3_sec) * 100 if video_3_sec else None
            hold_rate_50 = _safe_div(int(video_rows.get("video_p50") or 0), video_3_sec) * 100 if video_3_sec else None
            hold_rate_75 = _safe_div(int(video_rows.get("video_p75") or 0), video_3_sec) * 100 if video_3_sec else None
            hold_rate_100 = _safe_div(int(video_rows.get("video_p100") or 0), video_3_sec) * 100 if video_3_sec else None
            hook_rate = _safe_div(video_3_sec, impressions) * 100 if impressions else None
            retention_data = _historico_retencao_video(
                video_3_sec,
                int(video_rows.get("video_p100") or 0),
                int(video_rows.get("video_p75") or 0),
                int(video_rows.get("video_p50") or 0),
                int(video_rows.get("video_p25") or 0),
            )

        items.append({
            "id": ad_id,
            "nome": nome,
            "campaign_id": campaign_id_row,
            "campaign_name": campaign_name,
            "adset_id": adset_id,
            "adset_name": str(row.get("adset_name") or adset_id),
            "creative_id": str(row.get("creative_id") or catalog_creative_id or "") or None,
            "creative_type": tipo_criativo,
            "video_id": video_id,
            "video_source_url": video_source_url,
            "video_thumbnail_url": video_thumbnail_url,
            "video_thumbnail_hq_url": video_image_url_hq,
            "thumbnail_url": video_thumbnail_url or creative_row.get("thumbnail_url") or row.get("image_url_hq") or row.get("thumbnail_url"),
            "image_url_hq": video_image_url_hq,
            "permalink_url": creative_row.get("meta_permalink_url"),
            "link_anuncio": creative_row.get("link_anuncio") or row.get("link_anuncio"),
            "carousel_items": carousel_items,
            "result_count": result_count,
            "result_indicator": result_indicator,
            "status": status_base,
            "veiculacao": ad_status,
            **serializar_veiculacao(ad_status, motivo_inatividade),
            "plataformas": plataformas_codes,
            "plataformas_resumo": plataformas_resumo,
            "platform_display_name": platform_display_name,
            "ad_text": extra_texts.get("ad_text"),
            "ad_title": extra_texts.get("ad_title"),
            "headline": extra_texts.get("headline") or extra_texts.get("ad_title"),
            "ad_description": extra_texts.get("ad_description"),
            "ad_cta": extra_texts.get("ad_cta"),
            "ad_url": extra_texts.get("ad_url"),
            "destination_url": extra_texts.get("destination_url") or extra_texts.get("ad_url"),
            "pixel_id": extra_texts.get("pixel_id"),
            "url_tags": extra_texts.get("url_tags"),
            "utm_source": extra_texts.get("utm_source"),
            "utm_campaign": extra_texts.get("utm_campaign"),
            "utm_medium": extra_texts.get("utm_medium"),
            "utm_content": extra_texts.get("utm_content"),
            "utm_term": extra_texts.get("utm_term"),
            "investimento": spend,
            "leads": leads,
            "cliques": clicks,
            "link_clicks": link_click,
            "impressoes": impressions,
            "alcance": reach,
            "cpl": round(cpl, 4),
            "ctr": round(ctr, 4),
            "cpc": round(cpc, 4),
            "cpm": round(cpm, 4),
            "frequencia": round(frequencia, 4),
            "hook_rate": round(hook_rate, 2) if hook_rate is not None else None,
            "hold_rate_25": round(hold_rate_25, 2) if hold_rate_25 is not None else None,
            "hold_rate_50": round(hold_rate_50, 2) if hold_rate_50 is not None else None,
            "hold_rate_75": round(hold_rate_75, 2) if hold_rate_75 is not None else None,
            "hold_rate_100": round(hold_rate_100, 2) if hold_rate_100 is not None else None,
            "video_metrics": video_metrics,
            "video_retention_data": retention_data,
            "score": score,
            "score_ia": score,
            "dias_ativo": dias_ativo,
        })

    preview_por_grupo: dict[tuple[str, str], dict] = {}
    for item in items:
        nome_base = _nome_base_carrossel(item.get("nome"))
        if not nome_base:
            continue
        if _preview_media_anuncio(item):
            preview_por_grupo.setdefault((str(item.get("campaign_id") or ""), nome_base), item)

    for item in items:
        if _preview_media_anuncio(item):
            continue
        nome_base = _nome_base_carrossel(item.get("nome"))
        if not nome_base:
            continue
        sibling = preview_por_grupo.get((str(item.get("campaign_id") or ""), nome_base))
        if not sibling or sibling is item:
            continue
        item["thumbnail_url"] = item.get("thumbnail_url") or sibling.get("thumbnail_url") or sibling.get("image_url_hq")
        item["image_url_hq"] = item.get("image_url_hq") or sibling.get("image_url_hq") or sibling.get("thumbnail_url")
        if not item.get("carousel_items"):
            item["carousel_items"] = sibling.get("carousel_items") or []

    platform_filter_set = {
        c.strip().lower()
        for c in (platform_filter.split(",") if platform_filter else [])
        if c.strip()
    }
    status_filter_norm = _normalizar_texto(status_filter)
    tipo_filter_norm = _normalizar_texto(tipo)

    if platform_filter_set:
        items = [
            item for item in items
            if platform_filter_set.intersection(set(item.get("plataformas") or []))
        ]

    if status_filter_norm and status_filter_norm not in {"TODOS", "ALL"}:
        items = [item for item in items if _normalizar_texto(item.get("veiculacao")) == status_filter_norm]

    if tipo_filter_norm and tipo_filter_norm not in {"TODOS", "ALL"}:
        items = [item for item in items if _normalizar_texto(item.get("creative_type")) == tipo_filter_norm]

    resumo_base = items[:]
    _ordenar_anuncios(items, ordenar_por)

    total = len(items)
    inicio = (page - 1) * limit
    fim = inicio + limit
    paged = items[inicio:fim]

    resumo_total_investimento = sum(float(item.get("investimento") or 0) for item in resumo_base)
    resumo_total_leads = sum(int(item.get("leads") or 0) for item in resumo_base)
    resumo_total_ctr = sum(float(item.get("ctr") or 0) for item in resumo_base)
    resumo_total_frequencia = sum(float(item.get("frequencia") or 0) for item in resumo_base)
    resumo_contagem = len(resumo_base)
    resumo = {
        "investimento_total": round(resumo_total_investimento, 2),
        "leads_total": int(resumo_total_leads),
        "ctr_medio": round(_safe_div(resumo_total_ctr, resumo_contagem), 4),
        "frequencia_media": round(_safe_div(resumo_total_frequencia, resumo_contagem), 4),
    }

    campanhas_disponiveis = [
        {"id": cid, "nome": nome}
        for cid, nome in sorted(campanha_options_map.items(), key=lambda item: item[1].lower())
    ]
    plataformas_disponiveis = [
        {"codigo": codigo, "label": label}
        for codigo, label in sorted(plataforma_options_map.items(), key=lambda item: item[1].lower())
    ]

    return {
        "items": paged,
        "page": page,
        "limit": limit,
        "total": total,
        "has_more": fim < total,
        "resumo": resumo,
        "campanhas_disponiveis": campanhas_disponiveis,
        "plataformas_disponiveis": plataformas_disponiveis,
    }


@router.get("/visao-geral")
def visao_geral(
    workspace_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    conta_ids: str | None = Query(None),
    sync_version: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
    account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db, usuario)
    cache_key_visao = cache_key(
        "meta",
        "visao-geral",
        workspace_id,
        str(data_inicio),
        str(data_fim),
        (sync_version or "").strip(),
        *sorted(str(account_id) for account_id in account_uuids),
    )
    cached = _resposta_cache_get(cache_key_visao)
    if cached is not None:
        logger.info(
            "meta.visao_geral cache_hit workspace=%s contas=%d",
            workspace_id,
            len(account_uuids),
        )
        return cached

    def _payload_vazio() -> dict:
        return {
            "kpis": {
                "spend": 0.0,
                "leads": 0,
                "impressions": 0,
                "reach": 0,
                "clicks": 0,
                "ctr": 0.0,
                "cpc": 0.0,
                "cpm": 0.0,
                "cpl": 0.0,
                "frequencia": 0.0,
                "leads_whatsapp": 0,
                "leads_instagram": 0,
                "leads_messenger": 0,
                "leads_formulario": 0,
                "link_click": 0,
                "leads_conversa_7d": 0,
            },
            "contas": [],
            "dados_diarios": [],
            "leads_por_canal": [],
            "top_criativos": [],
            "periodo": {"inicio": str(data_inicio), "fim": str(data_fim)},
        }

    if not account_uuids:
        payload = _payload_vazio()
        _resposta_cache_set(cache_key_visao, payload)
        return payload

    started_at = time.perf_counter()
    payload = _payload_vazio()

    kpi_row = _executar_query_com_fallback(
        db,
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
        contexto="visao_geral.kpis",
        loader=lambda result: result.fetchone(),
        default=(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    )

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

    conta_rows = _executar_query_com_fallback(
        db,
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
        contexto="visao_geral.contas",
        loader=lambda result: result.fetchall(),
        default=[],
    )

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

    diario_rows = _executar_query_com_fallback(
        db,
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
        contexto="visao_geral.diario",
        loader=lambda result: result.fetchall(),
        default=[],
    )

    dados_diarios = [
        {"data": str(r[0]), "spend": float(r[1]), "leads": int(r[2]),
         "impressions": int(r[3]), "clicks": int(r[4])}
        for r in diario_rows
    ]

    canal_rows = _executar_query_com_fallback(
        db,
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
        contexto="visao_geral.leads_por_canal",
        loader=lambda result: result.fetchall(),
        default=[],
    )

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

    criativo_rows = _executar_query_com_fallback(
        db,
        text(
            "SELECT "
            "  COALESCE(NULLIF(a.creative_id, ''), cr.creative_id, a.ad_id) AS creative_id, "
            "  MAX(a.nome) AS nome, "
            "  MAX(COALESCE(cr.thumbnail_url, a.thumbnail_url)) AS thumbnail_url, "
            "  MAX(COALESCE(cr.tipo_criativo, a.tipo_criativo)) AS tipo_criativo, "
            "  MAX(COALESCE(cr.image_url_hq, a.image_url_hq, cr.thumbnail_url, a.thumbnail_url)) AS image_url_hq, "
            "  MAX(COALESCE(cr.link_anuncio, a.link_anuncio)) AS link_anuncio, "
            "  MAX(COALESCE(cr.carousel_items::text, a.carousel_items::text)) AS carousel_items, "
            "  (ARRAY_AGG(cr.raw_payload ORDER BY cr.last_seen_at DESC))[1] AS raw_payload, "
            "  ARRAY_AGG(DISTINCT a.ad_id) AS ad_ids, "
            "  COALESCE(SUM(a.leads),0) AS leads, "
            "  COALESCE(SUM(a.spend),0) AS spend, "
            "  COALESCE(SUM(a.impressions),0) AS impressions, "
            "  COALESCE(SUM(a.clicks),0) AS clicks, "
            "  COALESCE(SUM(a.link_click),0) AS link_click, "
            "  COALESCE(AVG(a.cpm),0) AS cpm, "
            "  COALESCE(AVG(a.frequencia),0) AS frequencia "
            "FROM meta_anuncios_insights a "
            "LEFT JOIN meta_creatives_catalog cr "
            "  ON cr.ads_account_id = a.ads_account_id "
            " AND (cr.creative_id = a.creative_id OR cr.ad_id = a.ad_id) "
            "WHERE a.ads_account_id = ANY(:ids) "
            "  AND a.data BETWEEN :ini AND :fim "
            "GROUP BY COALESCE(NULLIF(a.creative_id, ''), cr.creative_id, a.ad_id) "
            "HAVING MAX(COALESCE(cr.thumbnail_url, a.thumbnail_url, cr.image_url_hq, a.image_url_hq)) IS NOT NULL "
            "ORDER BY leads DESC "
            "LIMIT 5"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
        contexto="visao_geral.top_criativos",
        loader=lambda result: result.mappings().all(),
        default=[],
    )

    top_criativos = []
    video_ad_ids: list[str] = []
    for r in criativo_rows:
        ad_ids_raw = r.get("ad_ids") or []
        ad_ids = [str(x) for x in ad_ids_raw if x]
        if _normalizar_texto(r.get("tipo_criativo")) == "VIDEO":
            video_ad_ids.extend(ad_ids)

        raw_payload = _parse_jsonb(r.get("raw_payload"))
        tracking_info = extrair_tracking_info(
            raw_payload if isinstance(raw_payload, dict) else {},
            headline_fallback=str(r.get("nome") or ""),
            url_tags_fallback=raw_payload.get("url_tags") if isinstance(raw_payload, dict) else None,
        )
        ld = int(r.get("leads") or 0)
        sp = float(r.get("spend") or 0)
        imp = int(r.get("impressions") or 0)
        cl = int(r.get("clicks") or 0)
        link_click = int(r.get("link_click") or 0)
        cpm = float(r.get("cpm") or 0)
        freq = float(r.get("frequencia") or 0)
        carousel_raw = r.get("carousel_items")
        carousel_items = _parse_jsonb(carousel_raw)
        if not isinstance(carousel_items, list):
            carousel_items = []
        tipo_criativo = str(r.get("tipo_criativo") or "IMAGE").upper()
        if tipo_criativo not in {"IMAGE", "VIDEO", "CAROUSEL"}:
            tipo_criativo = "IMAGE"
        if tipo_criativo != "VIDEO" and carousel_items:
            tipo_criativo = "CAROUSEL"

        top_criativos.append({
            "id": r.get("creative_id"),
            "nome": r.get("nome"),
            "thumbnail_url": r.get("image_url_hq") or r.get("thumbnail_url"),
            "tipo": tipo_criativo,
            "image_url_hq": r.get("image_url_hq"),
            "link_anuncio": r.get("link_anuncio"),
            "headline": tracking_info.get("headline"),
            "destination_url": tracking_info.get("destination_url"),
            "url_tags": tracking_info.get("url_tags"),
            "utm_source": tracking_info.get("utm_source"),
            "utm_campaign": tracking_info.get("utm_campaign"),
            "utm_medium": tracking_info.get("utm_medium"),
            "utm_content": tracking_info.get("utm_content"),
            "utm_term": tracking_info.get("utm_term"),
            "carousel_items": carousel_items,
            "leads": ld,
            "spend": sp,
            "cpl": _safe_div(sp, ld),
            "ctr": _safe_div(cl, imp) * 100,
            "link_click": link_click,
            "cpm": cpm,
            "frequencia": freq,
        })

    video_metrics_map: dict[str, dict] = {}
    if video_ad_ids:
        video_rows = _executar_query_com_fallback(
            db,
            text(
                "SELECT ad_id, "
                "  COALESCE(SUM(video_views),0) AS video_views, "
                "  COALESCE(SUM(thruplay),0) AS thruplay, "
                "  COALESCE(SUM(video_p25),0) AS video_p25, "
                "  COALESCE(SUM(video_p50),0) AS video_p50, "
                "  COALESCE(SUM(video_p75),0) AS video_p75, "
                "  COALESCE(SUM(video_p100),0) AS video_p100, "
                "  COALESCE(SUM(video_3_sec),0) AS video_3_sec "
                "FROM meta_video_metrics_daily "
                "WHERE ads_account_id = ANY(:ids) "
                "  AND ad_id = ANY(:ad_ids) "
                "  AND data BETWEEN :ini AND :fim "
                "GROUP BY ad_id"
            ),
            {"ids": account_uuids, "ad_ids": sorted(set(video_ad_ids)), "ini": data_inicio, "fim": data_fim},
            contexto="visao_geral.video_metrics",
            loader=lambda result: result.mappings().all(),
            default=[],
        )
        video_metrics_map = {str(r["ad_id"]): dict(r) for r in video_rows}

    ad_ids_por_criativo = {
        str(row.get("creative_id")): [str(ad_id) for ad_id in (row.get("ad_ids") or []) if ad_id]
        for row in criativo_rows
    }

    for item in top_criativos:
        if item["tipo"] != "VIDEO":
            item["video_metrics"] = None
            continue
        source_ids = ad_ids_por_criativo.get(str(item["id"]), [])
        if not source_ids:
            item["video_metrics"] = None
            continue
        if not any(ad_id in video_metrics_map for ad_id in source_ids):
            item["video_metrics"] = None
            continue
        item["video_metrics"] = {
            "video_views": sum(int(video_metrics_map.get(ad_id, {}).get("video_views") or 0) for ad_id in source_ids),
            "thruplay": sum(int(video_metrics_map.get(ad_id, {}).get("thruplay") or 0) for ad_id in source_ids),
            "p25": sum(int(video_metrics_map.get(ad_id, {}).get("video_p25") or 0) for ad_id in source_ids),
            "p50": sum(int(video_metrics_map.get(ad_id, {}).get("video_p50") or 0) for ad_id in source_ids),
            "p75": sum(int(video_metrics_map.get(ad_id, {}).get("video_p75") or 0) for ad_id in source_ids),
            "p100": sum(int(video_metrics_map.get(ad_id, {}).get("video_p100") or 0) for ad_id in source_ids),
            "video_3_sec": sum(int(video_metrics_map.get(ad_id, {}).get("video_3_sec") or 0) for ad_id in source_ids),
        }

    payload = {
        "kpis": kpis,
        "contas": contas,
        "dados_diarios": dados_diarios,
        "leads_por_canal": leads_por_canal,
        "top_criativos": top_criativos,
        "periodo": {"inicio": str(data_inicio), "fim": str(data_fim)},
    }
    _resposta_cache_set(cache_key_visao, payload)
    elapsed_ms = (time.perf_counter() - started_at) * 1000
    logger.info(
        "meta.visao_geral elapsed_ms=%.1f contas=%d contas_ret=%d diarios=%d canais=%d criativos=%d cache=false",
        elapsed_ms,
        len(account_uuids),
        len(contas),
        len(dados_diarios),
        len(leads_por_canal),
        len(top_criativos),
    )
    return payload


@router.get("/campanhas-hierarquia")
def campanhas_hierarquia(
    workspace_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    conta_ids: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
    account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db, usuario)
    if not account_uuids:
        return []
    status_ctx = _carregar_status_contexto(account_uuids, db)
    resolve_campaign, resolve_adset, resolve_ad = _build_status_resolvers(status_ctx)

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
        camp_status, motivo_inatividade = resolve_campaign(r[0], r[2])
        camps[r[0]] = {
            "campaign_id": r[0],
            "nome": r[1],
            "status": camp_status,
            "veiculacao": camp_status,
            "veiculacao_resumo": _resumo_status(camp_status, ld),
            "motivo_inatividade": motivo_inatividade,
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
                "status": "PAUSED",
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

        ad_status, ad_motivo = resolve_ad(ad_id, camp_id, adset_id)
        if _status_rank(ad_status) > _status_rank(adset["status"]):
            adset["status"] = ad_status

        adset["anuncios"].append({
            "ad_id": ad_id,
            "nome": r[4],
            "status": ad_status,
            "veiculacao": ad_status,
            "veiculacao_resumo": _resumo_status(ad_status, ld),
            "motivo_inatividade": ad_motivo,
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
            adset_status, adset_motivo = resolve_adset(adset["adset_id"], adset["status"], camp["campaign_id"])
            conjuntos.append({
                "adset_id": adset["adset_id"],
                "adset_name": adset["adset_name"],
                "status": adset_status,
                "veiculacao": adset_status,
                "veiculacao_resumo": _resumo_status(adset_status, ld),
                "motivo_inatividade": adset_motivo,
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
    usuario: User = Depends(get_usuario_atual),
):
    ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
    account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db, usuario)

    if not account_uuids:
        return []
    status_ctx = _carregar_status_contexto(account_uuids, db)
    resolve_campaign, _, _ = _build_status_resolvers(status_ctx)

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
        camp_status, motivo_inatividade = resolve_campaign(r[0], r[2])
        result.append({
            "campaign_id": r[0],
            "nome": r[1],
            "status": camp_status,
            "veiculacao": camp_status,
            "veiculacao_resumo": _resumo_status(camp_status, ld),
            "motivo_inatividade": motivo_inatividade,
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
    usuario: User = Depends(get_usuario_atual),
):
    ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
    account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db, usuario)
    if not account_uuids:
        return []
    status_ctx = _carregar_status_contexto(account_uuids, db)
    _, _, resolve_ad = _build_status_resolvers(status_ctx)

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
        ad_status, motivo_inatividade = resolve_ad(r[0], r[3], r[1])

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
            "status": ad_status,
            "veiculacao": ad_status,
            "veiculacao_resumo": _resumo_status(ad_status, ld),
            "motivo_inatividade": motivo_inatividade,
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
            "score_ia": score,
            "dias_ativo": dias,
        })
    return result


@router.get("/anuncio-detalhe")
def anuncio_detalhe(
    workspace_id: str | None = Query(None),
    lookup_id: str = Query(...),
    lookup_type: str = Query("ad"),
    data_inicio: date | None = Query(None),
    data_fim: date | None = Query(None),
    conta_ids: str | None = Query(None),
    sync_version: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    lookup_type_norm = _normalizar_texto(lookup_type).lower()
    if lookup_type_norm not in {"ad", "creative"}:
        raise HTTPException(status_code=400, detail="lookup_type deve ser 'ad' ou 'creative'")

    data_inicio, data_fim = _periodo_padrao_detalhe(data_inicio, data_fim)
    workspace_uuid = _workspace_padrao_detalhe(usuario, db) if workspace_id is None else None
    if workspace_uuid is not None:
        workspace_id = str(workspace_uuid)
    else:
        try:
            workspace_uuid = uuid.UUID(workspace_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="workspace_id inválido")

    conta_ids_filtro = [c.strip() for c in conta_ids.split(",") if c.strip()] if conta_ids else []
    account_uuids = _conta_ids_da_query(str(workspace_uuid), conta_ids_filtro, db, usuario)
    cache_key = _detalhe_cache_key(
        workspace_id=str(workspace_uuid),
        lookup_type=lookup_type_norm,
        lookup_id=lookup_id,
        data_inicio=data_inicio,
        data_fim=data_fim,
        conta_ids=conta_ids_filtro,
        sync_version=sync_version,
    )
    cached = _detalhe_cache_get(cache_key)
    if cached is not None:
        return cached

    if not account_uuids:
        payload = {
            "id": lookup_id,
            "lookup_type": lookup_type_norm,
            "lookup_id": lookup_id,
            "period": {
                "inicio": str(data_inicio),
                "fim": str(data_fim),
                "label": _formato_periodo_modal(data_inicio, data_fim),
            },
            "ad_id": lookup_id if lookup_type_norm == "ad" else None,
            "creative_id": lookup_id if lookup_type_norm == "creative" else None,
            "name": lookup_id,
            "status": "Pausado",
            "creative_type": "IMAGE",
            "thumbnail_url": None,
            "image_url_hq": None,
            "meta_url": None,
            "campaign_id": None,
            "campaign_name": None,
            "adset_id": None,
            "adset_name": None,
            "spend": 0.0,
            "leads": 0,
            "impressions": 0,
            "reach": 0,
            "clicks": 0,
            "link_click": 0,
            "cpl": 0.0,
            "ctr": 0.0,
            "frequencia": 0.0,
            "score_ia": 0,
            "dias_ativo": 0,
            "trend": [],
            "platforms": [],
            "comparativo": [],
            "distribution": [],
            "headline": None,
            "destination_url": None,
            "url_tags": None,
            "utm_source": None,
            "utm_medium": None,
            "utm_campaign": None,
            "utm_content": None,
            "utm_term": None,
            "pixel_id": None,
            "video_metrics": None,
            "period_rank": 1,
            "period_total": 1,
        }
        _detalhe_cache_set(cache_key, payload)
        return payload

    status_ctx = _carregar_status_contexto(account_uuids, db)
    creative_key_sql = _creative_key_sql()
    creative_key_sql_ad = _creative_key_sql("ad", "cr")

    metric_filter_sql = "a.ad_id = :lookup_id" if lookup_type_norm == "ad" else f"{creative_key_sql} = :lookup_id"
    metric_rows = db.execute(
        text(
            "SELECT "
            "  a.data, "
            "  a.ad_id, "
            "  MAX(a.campaign_id) AS campaign_id, "
            "  MAX(c.nome) AS campaign_name, "
            "  MAX(a.adset_id) AS adset_id, "
            "  MAX(a.adset_name) AS adset_name, "
            "  MAX(a.nome) AS nome, "
            "  MAX(a.status) AS status, "
            "  MAX(a.tipo_criativo) AS tipo_criativo, "
            "  MAX(a.thumbnail_url) AS thumbnail_url, "
            "  MAX(a.image_url_hq) AS image_url_hq, "
            "  MAX(a.link_anuncio) AS link_anuncio, "
            "  MAX(a.creative_id) AS creative_id, "
            "  MAX(cr.creative_id) AS catalog_creative_id, "
            "  MAX(cr.meta_permalink_url) AS meta_permalink_url, "
            "  (ARRAY_AGG(cr.raw_payload ORDER BY cr.last_seen_at DESC))[1] AS raw_payload, "
            "  (ARRAY_AGG(cr.carousel_items ORDER BY cr.last_seen_at DESC))[1] AS carousel_items, "
            "  MAX(cr.video_id) AS video_id, "
            "  a.publisher_platform, "
            "  COALESCE(SUM(a.spend),0) AS spend, "
            "  COALESCE(SUM(a.leads),0) AS leads, "
            "  COALESCE(SUM(a.impressions),0) AS impressions, "
            "  COALESCE(SUM(a.reach),0) AS reach, "
            "  COALESCE(SUM(a.clicks),0) AS clicks, "
            "  COALESCE(SUM(a.link_click),0) AS link_click "
            "FROM meta_anuncios_insights a "
            "LEFT JOIN meta_campaigns_catalog c "
            "  ON c.ads_account_id = a.ads_account_id AND c.campaign_id = a.campaign_id "
            "LEFT JOIN meta_creatives_catalog cr "
            "  ON cr.ads_account_id = a.ads_account_id "
            " AND (cr.creative_id = a.creative_id OR cr.ad_id = a.ad_id) "
            "WHERE a.ads_account_id = ANY(:ids) "
            "  AND a.data BETWEEN :ini AND :fim "
            f"  AND {metric_filter_sql} "
            "GROUP BY a.data, a.ad_id, a.publisher_platform "
            "ORDER BY a.data ASC, a.ad_id ASC, a.publisher_platform ASC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "lookup_id": lookup_id},
    ).mappings().all()

    creative_meta_row = db.execute(
        text(
            "SELECT "
            "  creative_id, ad_id, campaign_id, adset_id, nome, tipo_criativo, "
            "  thumbnail_url, image_url_hq, link_anuncio, meta_permalink_url, "
            "  headline, destination_url, url_tags, utm_source, utm_medium, utm_campaign, "
            "  utm_content, utm_term, video_id, raw_payload, carousel_items, last_seen_at "
            "FROM meta_creatives_catalog "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND (creative_id = :lookup_id OR ad_id = :lookup_id) "
            "ORDER BY last_seen_at DESC "
            "LIMIT 1"
        ),
        {"ids": account_uuids, "lookup_id": lookup_id},
    ).mappings().first()
    creative_meta_row = dict(creative_meta_row or {})

    raw_rows = [dict(r) for r in metric_rows]
    first_row = raw_rows[0] if raw_rows else {}

    current_ad_id = str(first_row.get("ad_id") or creative_meta_row.get("ad_id") or lookup_id)
    current_creative_id = str(
        creative_meta_row.get("creative_id")
        or first_row.get("creative_id")
        or first_row.get("catalog_creative_id")
        or lookup_id
    )
    current_campaign_id = str(first_row.get("campaign_id") or creative_meta_row.get("campaign_id") or "") or None
    current_adset_id = str(first_row.get("adset_id") or creative_meta_row.get("adset_id") or "") or None
    current_campaign_name = str(first_row.get("campaign_name") or current_campaign_id or "") or None
    current_adset_name = str(first_row.get("adset_name") or current_adset_id or "") or None
    current_name = str(
        creative_meta_row.get("nome")
        or first_row.get("nome")
        or lookup_id
    )
    current_type = _tipo_modal(
        creative_meta_row.get("tipo_criativo")
        or first_row.get("tipo_criativo")
        or "IMAGE"
    )
    carousel_items = _parse_jsonb(creative_meta_row.get("carousel_items"))
    if not isinstance(carousel_items, list) or not carousel_items:
        carousel_items = _parse_jsonb(first_row.get("carousel_items"))
    if not isinstance(carousel_items, list):
        carousel_items = []
    if current_type != "VIDEO" and carousel_items:
        current_type = "CAROUSEL"

    first_carousel_media = None
    for card in carousel_items:
        if not isinstance(card, dict):
            continue
        candidate = card.get("image_url_hq") or card.get("picture")
        if candidate:
            first_carousel_media = candidate
            break

    current_thumbnail = (
        creative_meta_row.get("image_url_hq")
        or creative_meta_row.get("thumbnail_url")
        or first_row.get("image_url_hq")
        or first_row.get("thumbnail_url")
        or first_carousel_media
    )
    current_image_hq = (
        creative_meta_row.get("image_url_hq")
        or first_row.get("image_url_hq")
        or first_row.get("thumbnail_url")
        or creative_meta_row.get("thumbnail_url")
        or first_carousel_media
    )
    current_meta_url = (
        creative_meta_row.get("link_anuncio")
        or creative_meta_row.get("meta_permalink_url")
        or first_row.get("link_anuncio")
    )

    raw_payload = _parse_jsonb(creative_meta_row.get("raw_payload") if creative_meta_row else {})
    if not isinstance(raw_payload, dict):
        raw_payload = {}

    tracking_info = extrair_tracking_info(
        raw_payload,
        headline_fallback=str(creative_meta_row.get("headline") or first_row.get("nome") or current_name),
        destination_fallback=str(creative_meta_row.get("destination_url") or first_row.get("link_anuncio") or current_meta_url or ""),
        url_tags_fallback=creative_meta_row.get("url_tags") or raw_payload.get("url_tags"),
    )
    pixel_id = _extrair_pixel_id_tracking_specs(raw_payload.get("tracking_specs") or raw_payload)

    spend_total = sum(float(r.get("spend") or 0) for r in raw_rows)
    leads_total = sum(int(r.get("leads") or 0) for r in raw_rows)
    impressions_total = sum(int(r.get("impressions") or 0) for r in raw_rows)
    reach_total = sum(int(r.get("reach") or 0) for r in raw_rows)
    clicks_total = sum(int(r.get("clicks") or 0) for r in raw_rows)
    link_click_total = sum(int(r.get("link_click") or 0) for r in raw_rows)
    dias_ativo = len({str(r.get("data")) for r in raw_rows if r.get("data")})

    status_vals: list[str | None] = []
    for ad_id in sorted({str(r.get("ad_id") or "") for r in raw_rows if r.get("ad_id")}):
        ad_meta = status_ctx["ads"].get(ad_id, {})
        status_vals.extend([
            ad_meta.get("status"),
            ad_meta.get("configured_status"),
            ad_meta.get("effective_status"),
            ad_meta.get("base_status"),
        ])
    if not status_vals:
        ad_meta = status_ctx["ads"].get(current_ad_id, {})
        status_vals.extend([
            ad_meta.get("status"),
            ad_meta.get("configured_status"),
            ad_meta.get("effective_status"),
            ad_meta.get("base_status"),
        ])
    status_label = _normalizar_status_modal(*status_vals)

    score_base = "ACTIVE" if status_label == "Ativo" else "PAUSED"
    ctr_total = _safe_div(clicks_total, impressions_total) * 100
    cpl_total = _safe_div(spend_total, leads_total)
    frequencia_total = _safe_div(impressions_total, reach_total)
    score_ia = _score_anuncio(cpl_total, ctr_total, leads_total, frequencia_total, score_base)

    trend_start = max(data_inicio, data_fim - timedelta(days=13))
    spine_days = (data_fim - trend_start).days + 1
    trend_rows = db.execute(
        text(
            "SELECT data, "
            "  COALESCE(SUM(a.spend),0) AS spend, "
            "  COALESCE(SUM(a.leads),0) AS leads, "
            "  COALESCE(SUM(a.impressions),0) AS impressions, "
            "  COALESCE(SUM(a.clicks),0) AS clicks "
            "FROM meta_anuncios_insights a "
            "LEFT JOIN meta_creatives_catalog cr "
            "  ON cr.ads_account_id = a.ads_account_id "
            " AND (cr.creative_id = a.creative_id OR cr.ad_id = a.ad_id) "
            "WHERE a.ads_account_id = ANY(:ids) "
            "  AND a.data BETWEEN :ini AND :fim "
            f"  AND {metric_filter_sql} "
            "GROUP BY data "
            "ORDER BY data"
        ),
        {"ids": account_uuids, "ini": trend_start, "fim": data_fim, "lookup_id": lookup_id},
    ).fetchall()
    trend_map = {
        trend_start + timedelta(days=index): {"date": (trend_start + timedelta(days=index)).isoformat(), "cpl": 0.0, "leads": 0}
        for index in range(spine_days)
    }
    for row in trend_rows:
        data_row = row[0]
        if isinstance(data_row, datetime):
            data_row = data_row.date()
        if data_row in trend_map:
            spend_day = float(row[1] or 0)
            leads_day = int(row[2] or 0)
            trend_map[data_row]["leads"] = leads_day
            trend_map[data_row]["cpl"] = round(_safe_div(spend_day, leads_day), 4)
    trend = [trend_map[key] for key in sorted(trend_map.keys())]

    platform_agg: dict[str, dict] = {}
    for row in raw_rows:
        platform_code = _plataforma_modal(row.get("publisher_platform"))
        if not platform_code:
            continue
        item = platform_agg.setdefault(
            platform_code,
            {"platform": platform_code, "leads": 0, "spend": 0.0, "impressions": 0, "clicks": 0},
        )
        item["leads"] += int(row.get("leads") or 0)
        item["spend"] += float(row.get("spend") or 0)
        item["impressions"] += int(row.get("impressions") or 0)
        item["clicks"] += int(row.get("clicks") or 0)

    platforms = []
    for codigo, item in sorted(platform_agg.items(), key=lambda entry: entry[1]["spend"], reverse=True):
        platforms.append(
            {
                "platform": codigo,
                "leads": int(item["leads"]),
                "spend": round(float(item["spend"]), 2),
                "ctr": round(_safe_div(float(item["clicks"]), float(item["impressions"])) * 100, 4),
                "cpl": round(_safe_div(float(item["spend"]), int(item["leads"])), 4),
            }
        )

    lookup_key_for_distribution = current_creative_id or lookup_id
    distribution_rows = db.execute(
        text(
            "SELECT "
            "  a.campaign_id, "
            "  MAX(c.nome) AS campaign_name, "
            "  a.adset_id, "
            "  MAX(a.adset_name) AS adset_name, "
            "  MAX(a.status) AS status, "
            "  COALESCE(SUM(a.leads),0) AS leads, "
            "  COALESCE(SUM(a.spend),0) AS spend, "
            "  COALESCE(SUM(a.impressions),0) AS impressions, "
            "  COALESCE(SUM(a.clicks),0) AS clicks "
            "FROM meta_anuncios_insights a "
            "LEFT JOIN meta_campaigns_catalog c "
            "  ON c.ads_account_id = a.ads_account_id AND c.campaign_id = a.campaign_id "
            "LEFT JOIN meta_creatives_catalog cr "
            "  ON cr.ads_account_id = a.ads_account_id "
            " AND (cr.creative_id = a.creative_id OR cr.ad_id = a.ad_id) "
            "WHERE a.ads_account_id = ANY(:ids) "
            "  AND a.data BETWEEN :ini AND :fim "
            f"  AND {creative_key_sql} = :lookup_key "
            "GROUP BY a.campaign_id, a.adset_id "
            "ORDER BY leads DESC, spend DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "lookup_key": lookup_key_for_distribution},
    ).mappings().all()
    distribution = []
    for row in distribution_rows:
        spend_row = float(row.get("spend") or 0)
        leads_row = int(row.get("leads") or 0)
        impressions_row = int(row.get("impressions") or 0)
        clicks_row = int(row.get("clicks") or 0)
        distribution.append(
            {
                "campaign_id": str(row.get("campaign_id") or ""),
                "campaign_name": str(row.get("campaign_name") or row.get("campaign_id") or ""),
                "adset_id": str(row.get("adset_id") or ""),
                "adset_name": str(row.get("adset_name") or row.get("adset_id") or ""),
                "status": _normalizar_status_modal(row.get("status")),
                "leads": leads_row,
                "spend": round(spend_row, 2),
                "cpl": round(_safe_div(spend_row, leads_row), 4),
                "ctr": round(_safe_div(clicks_row, impressions_row) * 100, 4),
            }
        )

    comparativo = []
    if lookup_type_norm == "ad" and current_campaign_id and current_adset_id:
        comparativo_rows = db.execute(
            text(
                "SELECT "
                "  a.ad_id, "
                "  MAX(a.nome) AS nome, "
                "  MAX(COALESCE(cr.thumbnail_url, a.thumbnail_url, cr.image_url_hq, a.image_url_hq)) AS thumbnail_url, "
                "  MAX(a.status) AS status, "
                "  MAX(a.creative_id) AS creative_id, "
                "  COALESCE(SUM(a.leads),0) AS leads, "
                "  COALESCE(SUM(a.spend),0) AS spend, "
                "  COALESCE(SUM(a.impressions),0) AS impressions, "
                "  COALESCE(SUM(a.clicks),0) AS clicks "
                "FROM meta_anuncios_insights a "
                "LEFT JOIN meta_creatives_catalog cr "
                "  ON cr.ads_account_id = a.ads_account_id "
                " AND (cr.creative_id = a.creative_id OR cr.ad_id = a.ad_id) "
                "WHERE a.ads_account_id = ANY(:ids) "
                "  AND a.data BETWEEN :ini AND :fim "
                "  AND a.campaign_id = :campaign_id "
                "  AND a.adset_id = :adset_id "
                "GROUP BY a.ad_id "
                "ORDER BY leads DESC, spend DESC"
            ),
            {
                "ids": account_uuids,
                "ini": data_inicio,
                "fim": data_fim,
                "campaign_id": current_campaign_id,
                "adset_id": current_adset_id,
            },
        ).mappings().all()
        for row in comparativo_rows:
            spend_row = float(row.get("spend") or 0)
            leads_row = int(row.get("leads") or 0)
            impressions_row = int(row.get("impressions") or 0)
            clicks_row = int(row.get("clicks") or 0)
            ad_id_row = str(row.get("ad_id") or "")
            comparativo.append(
                {
                    "ad_id": ad_id_row,
                    "creative_id": str(row.get("creative_id") or "") or None,
                    "name": str(row.get("nome") or ad_id_row),
                    "thumbnail_url": row.get("thumbnail_url"),
                    "status": _normalizar_status_modal(row.get("status")),
                    "leads": leads_row,
                    "spend": round(spend_row, 2),
                    "cpl": round(_safe_div(spend_row, leads_row), 4),
                    "ctr": round(_safe_div(clicks_row, impressions_row) * 100, 4),
                    "is_current": ad_id_row == current_ad_id,
                }
            )
        if comparativo and not any(item["is_current"] for item in comparativo):
            comparativo[0]["is_current"] = True

    video_metrics = None
    video_rows = db.execute(
        text(
            "SELECT "
            "  COALESCE(SUM(vm.video_views),0) AS video_views, "
            "  COALESCE(SUM(vm.thruplay),0) AS thruplay, "
            "  COALESCE(SUM(vm.video_p25),0) AS video_p25, "
            "  COALESCE(SUM(vm.video_p50),0) AS video_p50, "
            "  COALESCE(SUM(vm.video_p75),0) AS video_p75, "
            "  COALESCE(SUM(vm.video_p100),0) AS video_p100, "
            "  COALESCE(SUM(vm.video_3_sec),0) AS video_3_sec "
            "FROM meta_video_metrics_daily vm "
            "JOIN meta_ads_catalog ad ON ad.ad_id = vm.ad_id AND ad.ads_account_id = vm.ads_account_id "
            "LEFT JOIN meta_creatives_catalog cr "
            "  ON cr.ads_account_id = ad.ads_account_id "
            " AND (cr.creative_id = ad.creative_id OR cr.ad_id = ad.ad_id) "
            "WHERE vm.ads_account_id = ANY(:ids) "
            "  AND vm.data BETWEEN :ini AND :fim "
            f"  AND {creative_key_sql_ad} = :lookup_key "
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "lookup_key": lookup_key_for_distribution},
    ).fetchone()
    if video_rows and any(int(v or 0) > 0 for v in video_rows):
        video_3_sec = int(video_rows[6] or 0)
        video_views = int(video_rows[0] or 0)
        thruplay = int(video_rows[1] or 0)
        p25 = int(video_rows[2] or 0)
        p50 = int(video_rows[3] or 0)
        p75 = int(video_rows[4] or 0)
        p100 = int(video_rows[5] or 0)
        hook_rate = _safe_div(video_3_sec, impressions_total) * 100 if impressions_total else 0.0
        hold_rate = _safe_div(p50, video_3_sec) * 100 if video_3_sec else 0.0
        ctr_link = _safe_div(link_click_total, impressions_total) * 100 if impressions_total else 0.0
        video_metrics = {
            "video_views": video_views,
            "thruplay": thruplay,
            "p25": p25,
            "p50": p50,
            "p75": p75,
            "p100": p100,
            "video_3_sec": video_3_sec,
            "hook_rate": round(hook_rate, 4),
            "hold_rate": round(hold_rate, 4),
            "ctr_link": round(ctr_link, 4),
        }

    period_total = 1
    period_rank = 1
    rank_row = db.execute(
        text(
            "WITH creative_totals AS ( "
            "  SELECT "
            f"    {creative_key_sql} AS creative_key, "
            "    COALESCE(SUM(a.spend),0) AS spend, "
            "    COALESCE(SUM(a.leads),0) AS leads "
            "  FROM meta_anuncios_insights a "
            "  LEFT JOIN meta_creatives_catalog cr "
            "    ON cr.ads_account_id = a.ads_account_id "
            "   AND (cr.creative_id = a.creative_id OR cr.ad_id = a.ad_id) "
            "  WHERE a.ads_account_id = ANY(:ids) "
            "    AND a.data BETWEEN :ini AND :fim "
            "  GROUP BY creative_key "
            ") "
            "SELECT rank, total "
            "FROM ( "
            "  SELECT "
            "    creative_key, "
            "    ROW_NUMBER() OVER (ORDER BY leads DESC, spend DESC, creative_key ASC) AS rank, "
            "    COUNT(*) OVER () AS total "
            "  FROM creative_totals "
            ") ranked "
            "WHERE creative_key = :lookup_key "
            "LIMIT 1"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "lookup_key": lookup_key_for_distribution},
    ).fetchone()
    if rank_row:
        period_rank = int(rank_row[0] or 1)
        period_total = int(rank_row[1] or 1)

    payload = {
        "id": lookup_id,
        "lookup_type": lookup_type_norm,
        "lookup_id": lookup_id,
        "period": {
            "inicio": str(data_inicio),
            "fim": str(data_fim),
            "label": _formato_periodo_modal(data_inicio, data_fim),
        },
        "ad_id": current_ad_id,
        "creative_id": current_creative_id,
        "name": current_name,
        "status": status_label,
        "creative_type": current_type,
        "thumbnail_url": current_thumbnail,
        "image_url_hq": current_image_hq,
        "carousel_items": carousel_items,
        "meta_url": current_meta_url,
        "campaign_id": current_campaign_id,
        "campaign_name": current_campaign_name,
        "adset_id": current_adset_id,
        "adset_name": current_adset_name,
        "spend": round(spend_total, 2),
        "leads": leads_total,
        "impressions": impressions_total,
        "reach": reach_total,
        "clicks": clicks_total,
        "link_click": link_click_total,
        "cpl": round(cpl_total, 4),
        "ctr": round(ctr_total, 4),
        "frequencia": round(frequencia_total, 4),
        "score_ia": score_ia,
        "dias_ativo": dias_ativo,
        "trend": trend,
        "platforms": platforms,
        "comparativo": comparativo,
        "distribution": distribution,
        "headline": tracking_info.get("headline"),
        "destination_url": tracking_info.get("destination_url"),
        "url_tags": tracking_info.get("url_tags"),
        "utm_source": tracking_info.get("utm_source"),
        "utm_medium": tracking_info.get("utm_medium"),
        "utm_campaign": tracking_info.get("utm_campaign"),
        "utm_content": tracking_info.get("utm_content"),
        "utm_term": tracking_info.get("utm_term"),
        "pixel_id": pixel_id,
        "video_metrics": video_metrics,
        "period_rank": period_rank,
        "period_total": period_total,
    }
    _detalhe_cache_set(cache_key, payload)
    return payload


@router.get("/anuncios/{ad_id}")
def anuncio_detalhe_por_ad_id(
    ad_id: str,
    workspace_id: str | None = Query(None),
    lookup_type: str = Query("ad"),
    data_inicio: date | None = Query(None),
    data_fim: date | None = Query(None),
    conta_ids: str | None = Query(None),
    sync_version: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    return anuncio_detalhe(
        workspace_id=workspace_id,
        lookup_id=ad_id,
        lookup_type=lookup_type,
        data_inicio=data_inicio,
        data_fim=data_fim,
        conta_ids=conta_ids,
        sync_version=sync_version,
        db=db,
        usuario=usuario,
    )


@router.get("/criativos")
def criativos(
    workspace_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    conta_ids: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    try:
        ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
        account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db, usuario)
        if not account_uuids:
            return []
        status_ctx = _carregar_status_contexto(account_uuids, db)
        _, _, resolve_ad = _build_status_resolvers(status_ctx)

        extra_where = ""
        extra_params: dict = {}
        if campaign_id and campaign_id != 'todas':
            extra_where += " AND campaign_id = :campaign_id"
            extra_params["campaign_id"] = campaign_id
        if adset_id and adset_id != 'todos':
            extra_where += " AND adset_id = :adset_id"
            extra_params["adset_id"] = adset_id

        creative_key_sql = _creative_key_sql()

        rows = db.execute(
            text(
                "SELECT "
                f"  {creative_key_sql} AS creative_id, "
                "  MAX(a.tipo_criativo) AS tipo_criativo, "
                "  MAX(a.thumbnail_url) AS thumbnail_url, "
                "  MAX(a.image_url_hq) AS image_url_hq, "
                "  MAX(a.link_anuncio) AS link_anuncio, "
                "  ARRAY_AGG(DISTINCT a.ad_id) AS ad_ids, "
                "  COUNT(DISTINCT a.ad_id) AS total_anuncios, "
                "  COUNT(DISTINCT a.campaign_id) AS total_campanhas, "
                "  COUNT(DISTINCT a.data) AS dias_ativo, "
                "  COALESCE(SUM(a.spend),0) AS spend, "
                "  COALESCE(SUM(a.leads),0) AS leads, "
                "  COALESCE(SUM(a.impressions),0) AS impressions, "
                "  COALESCE(SUM(a.reach),0) AS reach, "
                "  COALESCE(SUM(a.clicks),0) AS clicks, "
                "  COALESCE(SUM(a.link_click),0) AS link_click, "
                "  COALESCE(AVG(a.cpm),0) AS cpm, "
                "  COALESCE(AVG(a.frequencia),0) AS frequencia, "
                "  vm.video_views, vm.thruplay, vm.video_p25, vm.video_p50, vm.video_p75, vm.video_p100, vm.video_3_sec "
                "FROM meta_anuncios_insights a "
                "LEFT JOIN ("
                f"    SELECT {_creative_key_sql('ad', 'cr')} AS creative_id, "
                "           COALESCE(SUM(vm.video_views),0) AS video_views, "
                "           COALESCE(SUM(vm.thruplay),0) AS thruplay, "
                "           COALESCE(SUM(vm.video_p25),0) AS video_p25, "
                "           COALESCE(SUM(vm.video_p50),0) AS video_p50, "
                "           COALESCE(SUM(vm.video_p75),0) AS video_p75, "
                "           COALESCE(SUM(vm.video_p100),0) AS video_p100, "
                "           COALESCE(SUM(vm.video_3_sec),0) AS video_3_sec "
                "    FROM meta_video_metrics_daily vm "
                "    JOIN meta_ads_catalog ad ON ad.ad_id = vm.ad_id AND ad.ads_account_id = vm.ads_account_id "
                "    LEFT JOIN meta_creatives_catalog cr "
                "      ON cr.ads_account_id = ad.ads_account_id "
                "     AND (cr.ad_id = ad.ad_id OR cr.creative_id = ad.creative_id) "
                "    WHERE vm.ads_account_id = ANY(:ids) AND vm.data BETWEEN :ini AND :fim "
                f"    GROUP BY {_creative_key_sql('ad', 'cr')} "
                f") vm ON vm.creative_id = {creative_key_sql} "
                "WHERE a.ads_account_id = ANY(:ids) "
                "  AND a.data BETWEEN :ini AND :fim "
                "  AND a.campaign_id IN ("
                "      SELECT campaign_id FROM meta_campaigns_catalog "
                "      WHERE ads_account_id = ANY(:ids)"
                "  )"
                + extra_where +
                f" GROUP BY {creative_key_sql}, vm.video_views, vm.thruplay, vm.video_p25, vm.video_p50, vm.video_p75, vm.video_p100, vm.video_3_sec "
                "ORDER BY SUM(a.leads) DESC, SUM(a.spend) DESC"
            ),
            {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, **extra_params},
        ).mappings().all()

        if not rows:
            return []

        all_leads = [int(r["leads"]) for r in rows]
        all_spends = [float(r["spend"]) for r in rows]
        all_cpls = [_safe_div(float(r["spend"]), int(r["leads"])) for r in rows]
        valid_cpls = [c for c in all_cpls if c > 0]
        media_cpl = sum(valid_cpls) / len(valid_cpls) if valid_cpls else 0
        max_leads = max(all_leads) if all_leads else 1

        result = []
        for r in rows:
            cid = r["creative_id"]
            if not cid:
                continue
            sp = float(r["spend"])
            ld = int(r["leads"])
            imp = int(r["impressions"])
            rch = int(r["reach"])
            cl = int(r["clicks"])
            ad_ids_raw = r.get("ad_ids")
            ad_ids = [x for x in (ad_ids_raw or []) if x]
            statuses_ads = []
            motivos_ads = []
            for ad_id in ad_ids:
                s, m = resolve_ad(ad_id)
                statuses_ads.append(s)
                if m:
                    motivos_ads.append(m)
            veiculacao = _resolver_veiculacao(statuses_ads)
            motivo_inatividade = motivos_ads[0] if motivos_ads else None

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

            video_metrics = None
            if r.get("video_views") is not None:
                video_metrics = {
                    "video_views": int(r.get("video_views") or 0),
                    "thruplay": int(r.get("thruplay") or 0),
                    "p25": int(r.get("video_p25") or 0),
                    "p50": int(r.get("video_p50") or 0),
                    "p75": int(r.get("video_p75") or 0),
                    "p100": int(r.get("video_p100") or 0),
                    "video_3_sec": int(r.get("video_3_sec") or 0),
                }
            result.append({
                "creative_id": cid,
                "tipo_criativo": r["tipo_criativo"] or "IMAGE",
                "thumbnail_url": r["thumbnail_url"],
                "image_url_hq": r["image_url_hq"],
                "link_anuncio": r["link_anuncio"],
                "status": veiculacao,
                "veiculacao": veiculacao,
                "veiculacao_resumo": _resumo_status(veiculacao, ld),
                "motivo_inatividade": motivo_inatividade,
                "total_anuncios": int(r["total_anuncios"]),
                "total_campanhas": int(r["total_campanhas"]),
                "dias_ativo": int(r["dias_ativo"]),
                "spend": sp,
                "leads": ld,
                "impressions": imp,
                "reach": rch,
                "clicks": cl,
                "link_click": int(r.get("link_click") or 0),
                "ctr": round(ctr, 4),
                "cpc": round(cpc, 4),
                "cpm": round(cpm, 4),
                "cpl": round(cpl, 4),
                "frequencia": round(freq, 4),
                "score": score,
                "score_ia": score,
                "video_metrics": video_metrics,
            })
        return result
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Erro em /meta/insights/criativos: %s", exc)
        raise HTTPException(status_code=500, detail=f"Erro ao buscar criativos: {exc}")


@router.get("/videos")
def videos(
    workspace_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    conta_ids: str | None = Query(None),
    campaign_id: str | None = Query(None),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
    account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db, usuario)
    if not account_uuids:
        return []
    filters = ""
    params: dict = {"ids": account_uuids, "ini": data_inicio, "fim": data_fim}
    if campaign_id and campaign_id != "todas":
        filters += " AND mv.campaign_id = :campaign_id"
        params["campaign_id"] = campaign_id
    if status and status != "todos":
        filters += " AND COALESCE(ai.status, 'PAUSED') = :status"
        params["status"] = status.upper()
    rows = db.execute(text(
        "SELECT mv.video_id, mv.creative_id, mv.ad_id, mv.campaign_id, mv.adset_id, "
        "MAX(COALESCE(mv.image_url_hq, mv.thumbnail_url)) AS thumbnail_url, "
        "MAX(mv.source_url) AS source_url, "
        "MAX(ai.nome) AS anuncio_nome, MAX(ai.adset_name) AS adset_nome, MAX(ai.status) AS status, "
        "COALESCE(SUM(vm.video_views),0) AS video_views, "
        "COALESCE(SUM(vm.video_play_actions),0) AS video_play_actions, "
        "COALESCE(SUM(vm.video_p25),0) AS video_p25, COALESCE(SUM(vm.video_p50),0) AS video_p50, "
        "COALESCE(SUM(vm.video_p75),0) AS video_p75, COALESCE(SUM(vm.video_p95),0) AS video_p95, "
        "COALESCE(SUM(vm.video_p100),0) AS video_p100, COALESCE(SUM(vm.thruplay),0) AS thruplay, "
        "AVG(vm.cost_per_thruplay) AS cost_per_thruplay "
        "FROM meta_videos_catalog mv "
        "LEFT JOIN meta_video_metrics_daily vm "
        "  ON vm.ads_account_id = mv.ads_account_id AND vm.video_id = mv.video_id "
        " AND vm.ad_id = mv.ad_id AND vm.data BETWEEN :ini AND :fim "
        "LEFT JOIN meta_anuncios_insights ai "
        "  ON ai.ads_account_id = mv.ads_account_id AND ai.ad_id = mv.ad_id "
        " AND ai.data BETWEEN :ini AND :fim "
        "WHERE mv.ads_account_id = ANY(:ids) "
        f"{filters} "
        "GROUP BY mv.video_id, mv.creative_id, mv.ad_id, mv.campaign_id, mv.adset_id "
        "ORDER BY COALESCE(SUM(vm.thruplay),0) DESC, COALESCE(SUM(vm.video_views),0) DESC"
    ), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/ia")
def insights_ia(
    workspace_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    from app.services.ia_insights import (
        gerar_e_salvar_insights,
        buscar_todos_insights_vigentes,
    )

    account_uuids = _conta_ids_da_query(workspace_id, [], db, usuario)
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


@router.get("/publicos")
def publicos(
    workspace_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    conta_ids: str | None = Query(None),
    campaign_id: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    ids_filtro = [c.strip() for c in conta_ids.split(",")] if conta_ids else []
    account_uuids = _conta_ids_da_query(workspace_id, ids_filtro, db, usuario)

    if not account_uuids:
        return {"demograficos": [], "placements": [], "alcance_total": 0, "frequencia_media": 0.0}

    cid = campaign_id if campaign_id and campaign_id != 'todas' else 'ALL'

    demo_rows = db.execute(
        text(
            "SELECT breakdown_value, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(spend),0) AS spend, "
            "  COALESCE(SUM(impressions),0) AS impressions, "
            "  COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_publicos_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "  AND breakdown_type = 'demographic' "
            "  AND campaign_id = :cid "
            "GROUP BY breakdown_value "
            "ORDER BY leads DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "cid": cid},
    ).fetchall()

    demograficos = []
    for r in demo_rows:
        parts = (r[0] or "").split("|")
        faixa = parts[0] if parts else ""
        genero = parts[1] if len(parts) >= 2 else ""
        if faixa.lower() == "unknown" or genero.lower() == "unknown":
            continue
        leads = int(r[1]); spend = float(r[2]); impressions = int(r[3])
        clicks = int(r[4])
        demograficos.append({
            "faixa": faixa,
            "genero": genero,
            "leads": leads,
            "spend": spend,
            "cpl": _safe_div(spend, leads),
            "ctr": _safe_div(clicks, impressions) * 100,
            "alcance": 0,
            "impressoes": impressions,
        })

    plac_rows = db.execute(
        text(
            "SELECT breakdown_value, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(spend),0) AS spend, "
            "  COALESCE(SUM(impressions),0) AS impressions "
            "FROM meta_publicos_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "  AND breakdown_type = 'placement' "
            "  AND LOWER(breakdown_value) NOT LIKE 'unknown%' "
            "  AND campaign_id = :cid "
            "GROUP BY breakdown_value "
            "HAVING SUM(leads) > 0 "
            "ORDER BY leads DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "cid": cid},
    ).fetchall()

    PLACEMENT_MAP = {
        "instagram|instagram_reels":   "Instagram Reels",
        "instagram|instagram_stories": "Instagram Stories",
        "instagram|feed":              "Instagram Feed",
        "facebook|feed":               "Facebook Feed",
        "facebook|facebook_reels":     "Facebook Reels",
        "facebook|facebook_stories":   "Facebook Stories",
        "facebook|marketplace":        "Facebook Marketplace",
        "messenger|messenger_inbox":   "Messenger Inbox",
    }

    total_leads_plac = sum(int(r[1]) for r in plac_rows) or 1
    placements = []
    for r in plac_rows:
        bv = r[0] or ""
        leads = int(r[1]); spend = float(r[2])
        plataforma = bv.split("|")[0] if "|" in bv else bv
        placements.append({
            "nome": PLACEMENT_MAP.get(bv, bv),
            "plataforma": plataforma,
            "leads": leads,
            "spend": spend,
            "cpl": _safe_div(spend, leads),
            "percentual": round(leads / total_leads_plac * 100, 1),
        })

    geral_row = db.execute(
        text(
            "SELECT COALESCE(SUM(reach),0), COALESCE(SUM(impressions),0) "
            "FROM meta_insights_diarios "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim},
    ).fetchone()

    alcance_total = int(geral_row[0])
    impressions_total = int(geral_row[1])

    device_rows = db.execute(
        text(
            "SELECT breakdown_value, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(spend),0) AS spend, "
            "  COALESCE(SUM(impressions),0) AS impressions, "
            "  COALESCE(SUM(clicks),0) AS clicks "
            "FROM meta_publicos_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "  AND breakdown_type = 'device' "
            "  AND breakdown_value != 'unknown' "
            "  AND campaign_id = :cid "
            "GROUP BY breakdown_value "
            "ORDER BY leads DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "cid": cid},
    ).fetchall()

    DEVICE_MAP: dict[str, tuple[str, str]] = {
        "mobile_app": ("mobile",  "Mobile"),
        "mobile_web": ("mobile",  "Mobile"),
        "desktop":    ("desktop", "Desktop"),
        "tablet":     ("tablet",  "Tablet"),
    }

    device_agg: dict[str, dict] = {}
    for r in device_rows:
        bv = r[0] or ""
        ld = int(r[1]); sp = float(r[2])
        tipo, nome = DEVICE_MAP.get(bv, ("mobile", bv.replace("_", " ").title()))
        if tipo not in device_agg:
            device_agg[tipo] = {"tipo": tipo, "nome": nome, "leads": 0, "spend": 0.0}
        device_agg[tipo]["leads"] += ld
        device_agg[tipo]["spend"] += sp

    total_leads_device = sum(v["leads"] for v in device_agg.values()) or 1
    dispositivos = [
        {
            "tipo": v["tipo"],
            "nome": v["nome"],
            "leads": v["leads"],
            "spend": round(v["spend"], 2),
            "cpl": _safe_div(v["spend"], v["leads"]),
            "percentual": round(v["leads"] / total_leads_device * 100, 1),
        }
        for v in sorted(device_agg.values(), key=lambda x: x["leads"], reverse=True)
    ]

    so_agg: dict[str, dict] = {}
    for r in device_rows:
        bv = (r[0] or "").lower()
        ld = int(r[1]); sp = float(r[2])
        if any(x in bv for x in ("iphone", "ipad", "ios", "safari")):
            so = "iOS"
        elif "android" in bv:
            so = "Android"
        elif any(x in bv for x in ("desktop", "windows")):
            so = "Windows"
        else:
            so = bv.replace("_", " ").title() if bv else "Outro"
        if so not in so_agg:
            so_agg[so] = {"nome": so, "leads": 0, "spend": 0.0}
        so_agg[so]["leads"] += ld
        so_agg[so]["spend"] += sp

    total_leads_so = sum(v["leads"] for v in so_agg.values()) or 1
    sistema_operacional = [
        {
            "nome": v["nome"],
            "leads": v["leads"],
            "spend": round(v["spend"], 2),
            "cpl": _safe_div(v["spend"], v["leads"]),
            "percentual": round(v["leads"] / total_leads_so * 100, 1),
        }
        for v in sorted(so_agg.values(), key=lambda x: x["leads"], reverse=True)
    ]

    hourly_rows = db.execute(
        text(
            "SELECT breakdown_value, COALESCE(SUM(leads),0) AS leads "
            "FROM meta_publicos_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "  AND breakdown_type = 'hourly' "
            "  AND campaign_id = :cid "
            "GROUP BY breakdown_value "
            "ORDER BY leads DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "cid": cid},
    ).fetchall()

    # Agrega leads por (dia, hora) somando todos os dias do período
    heatmap_agg: dict[tuple[int, int], int] = {}
    for r in hourly_rows:
        parts = (r[0] or "").split("|")
        if len(parts) != 2:
            continue
        try:
            dia = int(parts[0]); hora = int(parts[1])
        except ValueError:
            continue
        heatmap_agg[(dia, hora)] = heatmap_agg.get((dia, hora), 0) + int(r[1])

    max_leads_h = max(heatmap_agg.values(), default=1) or 1
    heatmap = [
        {
            "dia": dia,
            "hora": hora,
            "leads": leads_h,
            "intensidade": round(leads_h / max_leads_h, 4),
        }
        for (dia, hora), leads_h in sorted(heatmap_agg.items())
        if leads_h > 0
    ]

    cidade_rows = db.execute(
        text(
            "SELECT breakdown_value, "
            "  COALESCE(SUM(leads),0) AS leads, "
            "  COALESCE(SUM(spend),0) AS spend "
            "FROM meta_publicos_insights "
            "WHERE ads_account_id = ANY(:ids) "
            "  AND data BETWEEN :ini AND :fim "
            "  AND breakdown_type = 'region' "
            "  AND breakdown_value IS NOT NULL "
            "  AND campaign_id = :cid "
            "GROUP BY breakdown_value "
            "HAVING SUM(leads) > 0 "
            "ORDER BY leads DESC "
            "LIMIT 10"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "cid": cid},
    ).fetchall()

    total_leads_cidade = sum(int(r[1]) for r in cidade_rows) or 1
    cidades = [
        {
            "nome": r[0].replace(" (state)", "").replace(" (district)", "").strip(),
            "leads": int(r[1]),
            "spend": float(r[2]),
            "cpl": _safe_div(float(r[2]), int(r[1])),
            "percentual": round(int(r[1]) / total_leads_cidade * 100, 1),
        }
        for r in cidade_rows
    ]

    return {
        "demograficos": demograficos,
        "placements": placements,
        "dispositivos": dispositivos,
        "sistema_operacional": sistema_operacional,
        "heatmap": heatmap,
        "cidades": cidades,
        "alcance_total": alcance_total,
        "frequencia_media": round(_safe_div(impressions_total, alcance_total), 2),
    }


@router.patch("/{insight_id}/resolver")
def resolver_insight(
    insight_id: str,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    db.execute(
        text("UPDATE ai_insights SET resolvido = true WHERE id = CAST(:id AS uuid)"),
        {"id": insight_id},
    )
    db.commit()
    return {"ok": True}


@router.get("/campanhas-por-criativo")
def campanhas_por_criativo(
    workspace_id: str = Query(...),
    creative_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    conta_ids: list[str] = Query(default=[]),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    account_uuids = _conta_ids_da_query(workspace_id, conta_ids, db, usuario)
    if not account_uuids:
        return {"campanhas": []}

    creative_key_sql = _creative_key_sql()

    rows = db.execute(
        text(
            "SELECT "
            "  a.campaign_id, "
            "  MAX(c.nome) AS nome, "
            "  COALESCE(SUM(a.leads),0) AS leads, "
            "  COALESCE(SUM(a.spend),0) AS spend, "
            "  COALESCE(SUM(a.impressions),0) AS impressions, "
            "  COALESCE(SUM(a.clicks),0) AS clicks, "
            "  COALESCE(SUM(a.link_click),0) AS link_click, "
            "  COALESCE(AVG(a.cpm),0) AS cpm, "
            "  COALESCE(AVG(a.frequencia),0) AS frequencia "
            "FROM meta_anuncios_insights a "
            "LEFT JOIN meta_creatives_catalog cr "
            "  ON cr.ads_account_id = a.ads_account_id "
            " AND (cr.ad_id = a.ad_id OR cr.creative_id = NULLIF(a.creative_id, '')) "
            "LEFT JOIN meta_campanhas c ON c.campaign_id = a.campaign_id AND c.ads_account_id = a.ads_account_id "
            "WHERE a.ads_account_id = ANY(:ids) "
            "  AND a.data BETWEEN :ini AND :fim "
            f"  AND {creative_key_sql} = :creative_id "
            "GROUP BY a.campaign_id "
            "ORDER BY leads DESC"
        ),
        {"ids": account_uuids, "ini": data_inicio, "fim": data_fim, "creative_id": creative_id},
    ).fetchall()

    campanhas = []
    for r in rows:
        ld = int(r[2]); sp = float(r[3]); imp = int(r[4]); cl = int(r[5])
        campanhas.append({
            "id": r[0],
            "nome": r[1] or f"Campanha {r[0]}",
            "leads": ld,
            "spend": sp,
            "cpl": _safe_div(sp, ld),
            "ctr": _safe_div(cl, imp) * 100,
            "link_click": int(r[6] or 0),
            "cpm": float(r[7] or 0),
            "frequencia": float(r[8] or 0),
        })

    return {"campanhas": campanhas}

"""Meta Ads sync engine.

Sincroniza dados de uma conta de anúncios Meta nas tabelas:
  - meta_insights_diarios
  - meta_campanhas_insights
  - meta_anuncios_insights
  - meta_publicos_insights
"""
import json
import logging
import mimetypes
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.ads_account import AdsAccount
from app.models.meta_sync_state import MetaSyncState
from app.core.config import settings
from app.services.meta_graph import (
    MetaGraphClient,
    MetaRateLimitError,
    MetaRequestContext,
    is_rate_limit_response,
    meta_error_payload,
)
from app.services.object_storage import put_bytes, public_url
from app.services.meta_tracking import extrair_tracking_info

log = logging.getLogger(__name__)

META_API_VERSION = "v21.0"
META_BASE = f"https://graph.facebook.com/{META_API_VERSION}"
INSIGHTS_SYNC_WINDOW_DAYS = 3

LEAD_ACTION_TYPES = {
    # Conversa iniciada (janela 7d) usada como lead principal em campanhas de mensagem
    "onsite_conversion.messaging_conversation_started_7d",
}

RESULTADO_MENSAGEM_PREFIXOS = (
    "onsite_conversion.messaging_conversation_started",
    "messaging_conversation_started",
    "onsite_conversion.conversation_started",
)

RESULTADO_LEAD_ACTIONS = {
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
}

RESULTADO_VIDEO_ACTIONS = {
    "video_view",
    "thruplay",
}

RESULTADO_TRAFFIC_ACTIONS = {
    "link_click",
    "landing_page_view",
    "outbound_click",
    "inline_link_click",
}

SYNC_JOB_INTERRUPTED_ERROR = "Job interrompido por reinicialização do serviço"
SYNC_LOCK_NOT_ACQUIRED = "sync já em execução para esta conta"


class MetaContaInacessivelError(RuntimeError):
    """Erro terminal quando a conta Meta deixou de responder ao sync."""

    def __init__(
        self,
        message: str,
        *,
        http_status: int | None = None,
        error_code: int | None = None,
        error_subcode: int | None = None,
        stage: str | None = None,
    ) -> None:
        super().__init__(message)
        self.http_status = http_status
        self.error_code = error_code
        self.error_subcode = error_subcode
        self.stage = stage


def _meta_sync_state_id(ads_account_id: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(ads_account_id))
    except (TypeError, ValueError, AttributeError):
        return None


def _get_meta_sync_state(db: Session, ads_account_id: str) -> MetaSyncState | None:
    ads_account_uuid = _meta_sync_state_id(ads_account_id)
    if ads_account_uuid is None:
        return None
    return db.query(MetaSyncState).filter(
        MetaSyncState.ads_account_id == ads_account_uuid
    ).first()


def _upsert_meta_sync_state(
    db: Session,
    ads_account_id: str,
    **updates: Any,
) -> MetaSyncState | None:
    ads_account_uuid = _meta_sync_state_id(ads_account_id)
    if ads_account_uuid is None:
        return None
    state = _get_meta_sync_state(db, ads_account_id)
    if state is None:
        state = MetaSyncState(ads_account_id=ads_account_uuid)
        db.add(state)
    for key, value in updates.items():
        if key in {"last_totals", "watermarks", "last_error_meta"} and value is None:
            value = {}
        setattr(state, key, value)
    db.commit()
    db.refresh(state)
    return state


def _state_payload_for_error(
    *,
    stage: str | None,
    message: str,
    code: int | None = None,
    http_status: int | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "last_run_status": "error",
        "last_error_at": datetime.now(timezone.utc),
        "last_error_stage": stage,
        "last_error_message": message,
        "last_error_code": code,
        "last_error_http_status": http_status,
        "last_error_meta": meta or {},
    }
    return payload


def _state_payload_for_success(totais: dict[str, Any], watermarks: dict[str, Any]) -> dict[str, Any]:
    return {
        "last_run_status": "success",
        "last_success_at": datetime.now(timezone.utc),
        "last_totals": totais or {},
        "watermarks": watermarks or {},
    }


def _merge_meta_sync_config(conta: AdsAccount, updates: dict[str, Any]) -> None:
    config = dict(conta.config or {})
    meta_sync = dict(config.get("meta_sync") or {})
    meta_sync.update(updates)
    config["meta_sync"] = meta_sync
    conta.config = config


def registrar_rate_limit_cooldown(db: Session, conta: AdsAccount, exc: MetaRateLimitError) -> datetime:
    now = datetime.now(timezone.utc)
    seconds = max(
        float(exc.cooldown_seconds or 0),
        float(settings.META_SYNC_RATE_LIMIT_BASE_DELAY_SECONDS),
    )
    seconds = min(seconds, float(settings.META_SYNC_RATE_LIMIT_MAX_DELAY_SECONDS))
    cooldown_until = now + timedelta(seconds=seconds)
    _merge_meta_sync_config(
        conta,
        {
            "cooldown_until": cooldown_until.isoformat(),
            "cooldown_reason": "rate_limited",
            "last_rate_limit_at": now.isoformat(),
            "last_rate_limit_endpoint": exc.endpoint,
            "last_rate_limit_error_code": exc.error_code,
            "last_rate_limit_usage_percent": exc.usage_percent,
        },
    )
    conta_id = getattr(conta, "id", None)
    if conta_id:
        _upsert_meta_sync_state(
            db,
            str(conta_id),
            last_run_at=now,
            last_run_status="cooldown",
            cooldown_until=cooldown_until,
            last_error_at=now,
            last_error_stage="rate_limit",
            last_error_message=str(exc),
            last_error_code=exc.error_code,
            last_error_http_status=None,
            last_rate_limit_usage_percent=exc.usage_percent,
            last_error_meta={
                "endpoint": exc.endpoint,
                "cooldown_seconds": exc.cooldown_seconds,
                "usage_percent": exc.usage_percent,
            },
        )
    db.commit()
    return cooldown_until


def _cooldown_until(conta: AdsAccount) -> datetime | None:
    meta_state: MetaSyncState | None = None
    if conta.id:
        with SessionLocal() as db:
            meta_state = _get_meta_sync_state(db, str(conta.id))
    if meta_state and meta_state.cooldown_until:
        return meta_state.cooldown_until

    meta_sync = (conta.config or {}).get("meta_sync") or {}
    raw = meta_sync.get("cooldown_until")
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(str(raw))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return None


def _try_sync_lock(db: Session, ads_account_id: str) -> bool:
    return bool(db.execute(
        text("SELECT pg_try_advisory_lock(hashtext(:key))"),
        {"key": f"meta_sync:{ads_account_id}"},
    ).scalar())


def _release_sync_lock(db: Session, ads_account_id: str) -> None:
    try:
        db.execute(
            text("SELECT pg_advisory_unlock(hashtext(:key))"),
            {"key": f"meta_sync:{ads_account_id}"},
        )
    except Exception:
        pass


def _parse_meta_updated_time(raw: Any) -> datetime | None:
    parsed = _parse_meta_datetime(raw)
    return parsed


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


def _action_types(rows: list[dict]) -> dict[str, int]:
    totais: dict[str, int] = {}
    for row in rows or []:
        action_type = str(row.get("action_type") or "").strip()
        if not action_type:
            continue
        totais[action_type] = totais.get(action_type, 0) + _safe_int(row.get("value"))
    return totais


def _extrair_action_prioritaria(
    rows: list[dict],
    *,
    action_types: set[str] | None = None,
    prefixes: tuple[str, ...] = (),
) -> tuple[int, str | None]:
    totais = _action_types(rows)
    if not totais:
        return 0, None

    candidatos: list[tuple[str, int]] = []
    for action_type, value in totais.items():
        if action_types is not None and action_type not in action_types and not any(action_type.startswith(prefix) for prefix in prefixes):
            continue
        candidatos.append((action_type, value))

    if not candidatos:
        return 0, None

    action_type, value = max(candidatos, key=lambda item: (item[1], item[0]))
    return value, action_type


def _extrair_resultado_anuncio(
    actions: list[dict],
    objective: str | None,
) -> tuple[int, str | None]:
    fontes = [actions or []]

    for fonte in fontes:
        count, action_type = _extrair_action_prioritaria(
            fonte,
            prefixes=RESULTADO_MENSAGEM_PREFIXOS,
        )
        if count > 0 and action_type:
            return count, f"actions:{action_type}"

    for fonte in fontes:
        count, action_type = _extrair_action_prioritaria(fonte, action_types=RESULTADO_LEAD_ACTIONS)
        if count > 0 and action_type:
            return count, f"actions:{action_type}"

    for fonte in fontes:
        count, action_type = _extrair_action_prioritaria(fonte, action_types=RESULTADO_VIDEO_ACTIONS)
        if count > 0 and action_type:
            return count, f"actions:{action_type}"

    for fonte in fontes:
        count, action_type = _extrair_action_prioritaria(fonte, action_types=RESULTADO_TRAFFIC_ACTIONS)
        if count > 0 and action_type:
            return count, f"actions:{action_type}"

    return 0, None


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


def _paginar(client: httpx.Client, url: str, params: dict, raise_on_terminal: bool = True) -> list[dict]:
    """Busca todas as páginas de um endpoint Meta."""
    if hasattr(client, "paginate"):
        return client.paginate(url, params, raise_on_terminal=raise_on_terminal)

    resultados: list[dict] = []
    current_url: str | None = url
    current_params: dict | None = params
    page = 0

    while current_url:
        page += 1
        if current_params is not None:
            resp = client.get(current_url, params=current_params)
        else:
            resp = client.get(current_url)

        if resp.status_code != 200:
            err, _ = _meta_erro_payload(resp)
            mensagem = err.get("message", resp.text)
            if raise_on_terminal:
                _levantar_se_meta_terminal(resp, f"Meta API em {url}")
                log.error("Meta API erro %s em %s: %s", resp.status_code, url, mensagem)
            else:
                log.warning("Meta API erro %s em %s: %s", resp.status_code, url, mensagem)
            break

        data = resp.json()
        resultados.extend(data.get("data", []))
        log.info("_paginar %s página %d -> %d registros acumulados", url, page, len(resultados))
        next_url = data.get("paging", {}).get("next")
        current_url = next_url
        current_params = None  # próximas páginas já têm tudo na URL

    log.info("_paginar %s → %d registros", url, len(resultados))
    return resultados


def _construir_link_facebook(story_id: str | None) -> str | None:
    if story_id:
        return f"https://www.facebook.com/{story_id}"
    return None


def _extrair_imagem_criativo(creative: dict) -> str | None:
    """Resolve imagem principal do criativo com fallback robusto."""
    story_spec = creative.get("object_story_spec") or {}
    link_data = story_spec.get("link_data") or {}
    photo_data = story_spec.get("photo_data") or {}
    video_data = story_spec.get("video_data") or {}
    child_attachments = link_data.get("child_attachments") or []

    # Link/image simples
    image_obj = link_data.get("image") or {}
    if image_obj.get("url"):
        return image_obj.get("url")

    # Carrossel
    if child_attachments:
        for child in child_attachments:
            if child.get("picture"):
                return child.get("picture")

    # Photo ad (escolhe maior resolução disponível)
    images = photo_data.get("images") or {}
    if isinstance(images, dict) and images:
        def _area(k: str) -> int:
            try:
                w, h = k.lower().split("x", 1)
                return int(w) * int(h)
            except Exception:
                return 0

        best_key = sorted(images.keys(), key=_area, reverse=True)[0]
        best = images.get(best_key) or {}
        if isinstance(best, dict) and best.get("url"):
            return best.get("url")

    # Vídeo
    if video_data.get("image_url"):
        return video_data.get("image_url")

    # Fallback final
    return creative.get("thumbnail_url")


def _resolver_tipo_criativo(creative: dict) -> str:
    story_spec = creative.get("object_story_spec") or {}
    link_data = story_spec.get("link_data") or {}
    child_attachments = link_data.get("child_attachments") or []
    obj_type = str(creative.get("object_type") or "").upper()
    if len(child_attachments) > 1:
        return "CAROUSEL"
    if "VIDEO" in obj_type or _extrair_video_id_criativo(creative):
        return "VIDEO"
    return "IMAGE"


def _extract_creative_image_hashes(creative: dict) -> list[str]:
    hashes: list[str] = []

    def _push(val: Any) -> None:
        if not val:
            return
        s = str(val).strip()
        if s and s not in hashes:
            hashes.append(s)

    _push(creative.get("image_hash"))
    story_spec = creative.get("object_story_spec") or {}

    link_data = story_spec.get("link_data") or {}
    _push(link_data.get("image_hash"))

    photo_data = story_spec.get("photo_data") or {}
    _push(photo_data.get("image_hash"))

    video_data = story_spec.get("video_data") or {}
    _push(video_data.get("image_hash"))

    for child in link_data.get("child_attachments") or []:
        _push(child.get("image_hash"))

    return hashes


def _safe_str(val: Any) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _extrair_video_id_criativo(creative: dict) -> str | None:
    story_spec = creative.get("object_story_spec") or {}
    video_data = story_spec.get("video_data") or {}
    return _safe_str(creative.get("video_id") or video_data.get("video_id"))


def _normalizar_video_thumbnails(raw_thumbnails: Any) -> list[dict]:
    if not raw_thumbnails:
        return []

    if isinstance(raw_thumbnails, dict):
        if isinstance(raw_thumbnails.get("data"), list):
            raw_items = raw_thumbnails.get("data") or []
        else:
            raw_items = [raw_thumbnails]
    elif isinstance(raw_thumbnails, list):
        raw_items = raw_thumbnails
    else:
        raw_items = [raw_thumbnails]

    thumbnails: list[dict] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        uri = _safe_str(item.get("uri") or item.get("url"))
        if not uri:
            continue
        thumbnails.append({
            "uri": uri,
            "width": _safe_int(item.get("width")),
            "height": _safe_int(item.get("height")),
            "is_preferred": bool(item.get("is_preferred")),
        })
    return thumbnails


def _selecionar_melhor_thumbnail_video(raw_thumbnails: Any) -> dict | None:
    thumbnails = _normalizar_video_thumbnails(raw_thumbnails)
    if not thumbnails:
        return None

    preferred = [thumb for thumb in thumbnails if thumb.get("is_preferred")]
    candidates = preferred or thumbnails

    def _score(item: dict) -> tuple[int, int, int]:
        width = _safe_int(item.get("width"))
        height = _safe_int(item.get("height"))
        area = width * height
        return area, width, height

    return max(candidates, key=_score)


def _persist_video_thumbnail_to_minio(
    client: httpx.Client,
    thumb_url: str | None,
    video_id: str | None,
    ads_account_uuid: str,
) -> str | None:
    if not thumb_url or not video_id:
        return None

    bucket = settings.MINIO_BUCKET_CRIATIVOS
    if not settings.MINIO_ACCESS_KEY or not settings.MINIO_SECRET_KEY:
        return None

    try:
        resp = None
        for attempt in range(3):
            try:
                resp = client.get(
                    thumb_url,
                    follow_redirects=True,
                    timeout=15,
                    headers={
                        "Referer": "https://www.facebook.com/",
                        "User-Agent": "Mozilla/5.0",
                    },
                )
            except httpx.HTTPError as exc:
                log.warning("Falha ao buscar thumbnail de vídeo %s tentativa %d/3: %s", video_id, attempt + 1, exc)
                if attempt < 2:
                    time.sleep(2 ** attempt)
                continue

            if resp.status_code < 400 and resp.content:
                break
            if resp.status_code not in {429, 500, 502, 503, 504} or attempt == 2:
                break
            time.sleep(2 ** attempt)

        if resp is None or resp.status_code >= 400 or not resp.content:
            return None

        content_type = resp.headers.get("content-type", "image/jpeg")
        ext = _guess_extension(content_type, thumb_url)
        object_name = f"ads-accounts/{ads_account_uuid}/videos/{video_id}{ext}"
        put_bytes(bucket, object_name, resp.content, content_type)
        return public_url(bucket, object_name)
    except Exception as exc:
        log.warning("Falha ao persistir thumbnail de vídeo %s no MinIO: %s", video_id, exc)
        return None


def _extract_carousel_cards(creative: dict, adimage_map: dict[str, dict]) -> list[dict]:
    story_spec = creative.get("object_story_spec") or {}
    link_data = story_spec.get("link_data") or {}
    children = link_data.get("child_attachments") or []
    cards: list[dict] = []
    for idx, child in enumerate(children):
        image_hash = _safe_str(child.get("image_hash"))
        video_id = _safe_str(child.get("video_id"))
        adimg = adimage_map.get(image_hash) if image_hash else None
        image_url_hq = (
            (adimg or {}).get("url")
            or child.get("picture")
            or child.get("image_url")
            or creative.get("thumbnail_url")
        )
        if adimg and adimg.get("url"):
            source_type = "adimage"
        elif video_id:
            source_type = "video_thumb"
        elif child.get("picture") or child.get("image_url"):
            source_type = "picture"
        else:
            source_type = "thumbnail_fallback"
        cards.append({
            "creative_id": _safe_str(creative.get("id")),
            "card_index": idx,
            "image_hash": image_hash,
            "video_id": video_id,
            "image_url_hq": image_url_hq,
            "source_type": source_type,
            "link": _safe_str(child.get("link")),
            "name": _safe_str(child.get("name")),
            "description": _safe_str(child.get("description")),
            "picture": child.get("picture") or child.get("image_url"),
        })
    return cards


def _valor_action_any(actions: list[dict], action_types: set[str]) -> int:
    total = 0
    for a in actions:
        if a.get("action_type") in action_types:
            total += _safe_int(a.get("value"))
    return total


def _valor_video_action(rows: list[dict]) -> int:
    total = 0
    for a in rows or []:
        total += _safe_int(a.get("value"))
    return total


def _fetch_adimages_by_hashes(
    client: httpx.Client,
    account_id: str,
    token: str,
    hashes: list[str],
    on_progress=None,
) -> dict[str, dict]:
    if not hashes:
        return {}

    out: dict[str, dict] = {}
    total_batches = max((len(hashes) + 49) // 50, 1)
    for batch_index, i in enumerate(range(0, len(hashes), 50), start=1):
        batch = hashes[i:i + 50]
        if on_progress:
            try:
                on_progress(f"anuncios:midia:adimages ({batch_index}/{total_batches})", 70)
            except Exception:
                pass
        resp = None
        for attempt in range(3):
            try:
                resp = client.get(
                    f"{META_BASE}/{account_id}/adimages",
                    params={
                        "access_token": token,
                        "hashes": json.dumps(batch),
                        "fields": "hash,url,permalink_url,original_width,original_height",
                        "limit": 50,
                    },
                )
            except httpx.HTTPError as exc:
                log.warning("Erro adimages batch tentativa %d/3: %s", attempt + 1, exc)
                if attempt < 2:
                    time.sleep(2 ** attempt)
                continue

            if resp.status_code == 200:
                break
            if resp.status_code not in {429, 500, 502, 503, 504} or attempt == 2:
                break
            try:
                err, _ = _meta_erro_payload(resp)
                log.warning(
                    "Erro adimages batch tentativa %d/3: %s",
                    attempt + 1,
                    err.get("message", resp.text[:200]),
                )
            except Exception:
                log.warning("Erro adimages batch tentativa %d/3: %s", attempt + 1, resp.text[:200])
            time.sleep(2 ** attempt)

        if resp is None:
            continue
        if resp.status_code != 200:
            _levantar_se_meta_terminal(resp, f"adimages batch em {account_id}")
            err, _ = _meta_erro_payload(resp)
            log.warning("Erro adimages batch: %s", err.get("message", resp.text[:200]))
            continue
        for row in resp.json().get("data", []):
            h = row.get("hash")
            if h:
                if row.get("url") and not row.get("image_url_hq"):
                    row["image_url_hq"] = row.get("url")
                if row.get("url") and not row.get("meta_image_url_tmp"):
                    row["meta_image_url_tmp"] = row.get("url")
                row.setdefault("hq_source", "adimage")
                out[str(h)] = row
    return out


def _e_throttle_meta(resp: httpx.Response) -> bool:
    """Detecta rate-limit da Graph API (por ad-account/usuário)."""
    return is_rate_limit_response(resp)


def _fetch_creative_thumbnails_hq_by_ids(
    client: httpx.Client,
    creative_ids: list[str],
    token: str,
    on_progress=None,
) -> dict[str, str]:
    """Resolve thumbnail HQ por creative_id.

    A Graph API ignora `thumbnail_width/height` quando `thumbnail_url` vem
    aninhado em `creative{...}` no batch por ad_id (retorna p64x64). Pedindo
    direto no nível do creative com box grande, retorna a versão HQ (ex.: 1080px).
    Usado para criativos SHARE (sem image_hash) e capas de vídeo.
    Box quadrado 1200 — fontes não-quadradas sofrem center-crop (ver plano).
    """
    uniq = [c for c in dict.fromkeys(creative_ids) if c]
    if not uniq:
        return {}

    out: dict[str, str] = {}
    total_batches = max((len(uniq) + 49) // 50, 1)
    for batch_index, i in enumerate(range(0, len(uniq), 50), start=1):
        batch = uniq[i:i + 50]
        if on_progress:
            try:
                on_progress(f"anuncios:midia:thumb_hq ({batch_index}/{total_batches})", 70)
            except Exception:
                pass
        resp = None
        max_attempts = 5
        for attempt in range(max_attempts):
            try:
                resp = client.get(
                    f"{META_BASE}/",
                    params={
                        "access_token": token,
                        "ids": ",".join(batch),
                        "fields": "thumbnail_url",
                        "thumbnail_width": 1200,
                        "thumbnail_height": 1200,
                    },
                )
            except httpx.HTTPError as exc:
                log.warning("Erro thumb_hq batch tentativa %d/%d: %s", attempt + 1, max_attempts, exc)
                if attempt < max_attempts - 1:
                    time.sleep(2 ** attempt)
                continue

            if resp.status_code == 200:
                break
            if attempt == max_attempts - 1:
                break
            # Throttle do Graph (rate-limit por ad-account) vem como 400 com
            # code 17/80004 ou mensagem "too many calls"/"reduce the amount".
            # Backoff mais longo nesses casos; senão só 429/5xx valem retry.
            if _e_throttle_meta(resp):
                time.sleep(15 * (attempt + 1))
                continue
            if resp.status_code in {429, 500, 502, 503, 504}:
                time.sleep(2 ** attempt)
                continue
            break

        if resp is None or resp.status_code != 200:
            if resp is not None:
                try:
                    _levantar_se_meta_terminal(resp, "thumbnail HQ batch")
                    err, _ = _meta_erro_payload(resp)
                    log.warning("Erro thumb_hq batch: %s", err.get("message", resp.text[:200]))
                except Exception:
                    log.warning("Erro thumb_hq batch: %s", resp.text[:200])
            continue

        for cid, payload in resp.json().items():
            if isinstance(payload, dict):
                url = _safe_str(payload.get("thumbnail_url"))
                if url:
                    out[str(cid)] = url
    return out


def _fetch_videos_by_ids(
    client: httpx.Client,
    token: str,
    video_ids: list[str],
    totais: dict | None = None,
    on_progress=None,
) -> dict[str, dict]:
    def _permission_error(payload: dict | None) -> bool:
        if not isinstance(payload, dict):
            return False
        err = payload.get("error") if isinstance(payload.get("error"), dict) else payload
        try:
            code = int(err.get("code") or 0)
        except (TypeError, ValueError):
            code = 0
        message = str(err.get("message") or "").lower()
        return code == 10 and "application does not have permission for this action" in message

    def _mark_permission_skipped(count: int) -> None:
        if count <= 0 or totais is None:
            return
        totais["catalog_videos_ignorados_permissao"] = (
            totais.get("catalog_videos_ignorados_permissao", 0) + count
        )
        totais["videos_permission_skipped"] = True
        totais["videos_permission_error_count"] = (
            totais.get("videos_permission_error_count", 0) + count
        )
        totais["videos_permission_error_code"] = 10

    def _fetch_batch(batch_ids: list[str], fields: str, *, label: str) -> httpx.Response | None:
        try:
            return client.get(
                f"{META_BASE}/",
                params={
                    "access_token": token,
                    "ids": ",".join(batch_ids),
                    "fields": fields,
                },
            )
        except httpx.HTTPError as exc:
            log.warning("Erro batch vídeos %s: %s", label, exc)
            return None

    def _merge_payload(payload: dict, *, count_permission_errors: bool) -> list[str]:
        permission_failed_ids: list[str] = []
        for vid, item in payload.items():
            if not isinstance(item, dict):
                continue
            if _permission_error(item):
                permission_failed_ids.append(str(vid))
                continue
            if item.get("error"):
                err = item.get("error") or {}
                log.warning(
                    "Erro batch vídeos por ID video_id=%s error_code=%s message=%s",
                    vid,
                    err.get("code"),
                    err.get("message"),
                )
                continue
            item["thumbnails"] = _normalizar_video_thumbnails(item.get("thumbnails"))
            best_thumb = _selecionar_melhor_thumbnail_video(item.get("thumbnails"))
            item["thumbnail_url"] = (
                _safe_str(best_thumb.get("uri"))
                if best_thumb
                else _safe_str(item.get("picture"))
            )
            out[str(vid)] = item
        if count_permission_errors:
            _mark_permission_skipped(len(permission_failed_ids))
        return permission_failed_ids

    out: dict[str, dict] = {}
    uniq = [v for v in dict.fromkeys(video_ids) if v]
    fields_with_source = "id,picture,source,permalink_url,thumbnails{uri,width,height,is_preferred}"
    fields_without_source = "id,picture,permalink_url,thumbnails{uri,width,height,is_preferred}"
    total_batches = max((len(uniq) + 49) // 50, 1)
    for batch_index, i in enumerate(range(0, len(uniq), 50), start=1):
        batch = uniq[i:i + 50]
        if on_progress:
            try:
                on_progress(f"anuncios:midia:videos ({batch_index}/{total_batches})", 70)
            except Exception:
                pass
        resp = _fetch_batch(
            batch,
            fields_with_source,
            label=f"tentativa {batch_index}/{total_batches}",
        )
        if resp is None:
            continue
        if resp.status_code != 200:
            err, _ = _meta_erro_payload(resp)
            mensagem = err.get("message", resp.text[:200])
            if _permission_error({"error": err}):
                fallback = _fetch_batch(
                    batch,
                    fields_without_source,
                    label=f"fallback sem source {batch_index}/{total_batches}",
                )
                if fallback is not None and fallback.status_code == 200:
                    permission_failed = _merge_payload(fallback.json(), count_permission_errors=True)
                    if permission_failed:
                        log.warning(
                            "batch vídeos ignorado por permissão no fallback (%d ids): %s",
                            len(permission_failed),
                            mensagem,
                        )
                    continue
                if fallback is not None:
                    fallback_err, _ = _meta_erro_payload(fallback)
                    if not _permission_error({"error": fallback_err}):
                        log.warning("Erro batch vídeos fallback sem source: %s", fallback_err.get("message", fallback.text[:200]))
                        continue
                _mark_permission_skipped(len(batch))
                log.warning("batch vídeos ignorado por permissão (%d ids): %s", len(batch), mensagem)
                continue
            log.warning("Erro batch vídeos: %s", mensagem)
            continue
        permission_failed = _merge_payload(resp.json(), count_permission_errors=False)
        if permission_failed:
            fallback = _fetch_batch(
                permission_failed,
                fields_without_source,
                label=f"fallback sem source por ID {batch_index}/{total_batches}",
            )
            if fallback is not None and fallback.status_code == 200:
                still_failed = _merge_payload(fallback.json(), count_permission_errors=True)
                if still_failed:
                    log.warning(
                        "batch vídeos ignorado por permissão por ID (%d ids)",
                        len(still_failed),
                    )
                continue
            if fallback is not None:
                fallback_err, _ = _meta_erro_payload(fallback)
                if not _permission_error({"error": fallback_err}):
                    log.warning("Erro batch vídeos fallback por ID sem source: %s", fallback_err.get("message", fallback.text[:200]))
                    continue
            _mark_permission_skipped(len(permission_failed))
            log.warning("batch vídeos ignorado por permissão por ID (%d ids)", len(permission_failed))
    return out


def _merge_hq_image_data(creative_data: dict, adimage_map: dict[str, dict]) -> None:
    # Para VÍDEO o adimage do hash devolve uma capa 64px (lixo). Pulamos o
    # adimage e deixamos cair em thumbnail_fallback, onde _aplicar_thumbnail_hq
    # resolve a capa HQ via thumbnail do creative @1200.
    if creative_data.get("tipo") == "VIDEO":
        creative_data["hq_source"] = creative_data.get("hq_source") or "thumbnail_fallback"
        return

    hashes = creative_data.get("image_hashes") or []
    if not hashes:
        creative_data["hq_source"] = creative_data.get("hq_source") or "thumbnail_fallback"
        return

    match = None
    for h in hashes:
        match = adimage_map.get(h)
        if match:
            break

    if not match:
        creative_data["hq_source"] = creative_data.get("hq_source") or "thumbnail_fallback"
        return

    creative_data["image_hash"] = creative_data.get("image_hash") or str(match.get("hash"))
    source = _safe_str(match.get("hq_source") or match.get("source")) or "adimage"
    meta_tmp = _safe_str(match.get("meta_image_url_tmp"))
    if not meta_tmp and source == "adimage":
        meta_tmp = _safe_str(match.get("url"))
    if meta_tmp:
        creative_data["meta_image_url_tmp"] = meta_tmp
    creative_data["meta_permalink_url"] = match.get("permalink_url")
    creative_data["original_width"] = _safe_int(match.get("original_width")) if match.get("original_width") else None
    creative_data["original_height"] = _safe_int(match.get("original_height")) if match.get("original_height") else None
    if match.get("url"):
        creative_data["image_url_hq"] = match.get("url")
    creative_data["hq_source"] = source


def _hq_source_priority(source: str | None) -> int:
    if source == "adimage_minio":
        return 3
    if source == "adimage":
        return 2
    if source == "thumbnail_fallback":
        return 0
    return 1


def _hq_area(width: Any, height: Any) -> int:
    w = _safe_int(width)
    h = _safe_int(height)
    return max(w, 0) * max(h, 0)


def _eh_url_publica_minio(url: str | None) -> bool:
    if not url:
        return False
    base = settings.SERVER_URL.rstrip("/")
    return url.startswith(f"{base}/meta/storage/")


def _registrar_hq_cache(
    cache: dict[str, dict],
    *,
    image_hash: Any,
    image_url: Any,
    hq_source: Any = None,
    meta_image_url_tmp: Any = None,
    permalink_url: Any = None,
    original_width: Any = None,
    original_height: Any = None,
) -> None:
    hash_norm = _safe_str(image_hash)
    url_norm = _safe_str(image_url)
    if not hash_norm or not url_norm:
        return
    if "/meta/storage-assinado" in url_norm:
        return

    source_norm = _safe_str(hq_source) or "adimage"
    if _eh_url_publica_minio(url_norm):
        source_norm = "adimage_minio"

    meta_tmp_norm = _safe_str(meta_image_url_tmp)
    if not meta_tmp_norm and source_norm == "adimage":
        meta_tmp_norm = url_norm

    candidate = {
        "hash": hash_norm,
        "url": url_norm,
        "image_url_hq": url_norm,
        "hq_source": source_norm,
        "meta_image_url_tmp": meta_tmp_norm,
        "permalink_url": _safe_str(permalink_url),
        "original_width": _safe_int(original_width) if original_width else None,
        "original_height": _safe_int(original_height) if original_height else None,
    }

    current = cache.get(hash_norm)
    if current is None:
        cache[hash_norm] = candidate
        return

    current_priority = _hq_source_priority(current.get("hq_source"))
    candidate_priority = _hq_source_priority(candidate.get("hq_source"))
    if candidate_priority > current_priority:
        cache[hash_norm] = candidate
        return

    if candidate_priority == current_priority and _hq_area(candidate.get("original_width"), candidate.get("original_height")) >= _hq_area(current.get("original_width"), current.get("original_height")):
        cache[hash_norm] = candidate


def _carregar_hq_cache_imagens(db: Session, ads_account_uuid: str) -> dict[str, dict]:
    cache: dict[str, dict] = {}

    creative_rows = db.execute(text("""
        SELECT image_hash, image_url_hq, meta_image_url_tmp, meta_permalink_url,
               original_width, original_height, hq_source
        FROM meta_creatives_catalog
        WHERE ads_account_id = CAST(:ads_account_id AS uuid)
          AND image_hash IS NOT NULL
          AND image_url_hq IS NOT NULL
          AND COALESCE(hq_source, '') <> 'thumbnail_fallback'
          AND COALESCE(image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
    """), {"ads_account_id": str(ads_account_uuid)}).mappings().all()
    for row in creative_rows:
        _registrar_hq_cache(
            cache,
            image_hash=row.get("image_hash"),
            image_url=row.get("image_url_hq"),
            hq_source=row.get("hq_source"),
            meta_image_url_tmp=row.get("meta_image_url_tmp"),
            permalink_url=row.get("meta_permalink_url"),
            original_width=row.get("original_width"),
            original_height=row.get("original_height"),
        )

    card_rows = db.execute(text("""
        SELECT image_hash, image_url_hq, source_type
        FROM meta_creative_cards_catalog
        WHERE ads_account_id = CAST(:ads_account_id AS uuid)
          AND image_hash IS NOT NULL
          AND image_url_hq IS NOT NULL
          AND source_type = 'adimage'
          AND COALESCE(image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
    """), {"ads_account_id": str(ads_account_uuid)}).mappings().all()
    for row in card_rows:
        _registrar_hq_cache(
            cache,
            image_hash=row.get("image_hash"),
            image_url=row.get("image_url_hq"),
            hq_source="adimage",
            meta_image_url_tmp=row.get("image_url_hq"),
        )

    return cache


def _resolver_mapa_adimages_hq(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    hashes: list[str],
    ads_account_uuid: str,
    on_progress=None,
) -> dict[str, dict]:
    cache_map = _carregar_hq_cache_imagens(db, ads_account_uuid)
    missing_hashes = [h for h in hashes if h and h not in cache_map]

    if cache_map:
        cache_minio = sum(1 for row in cache_map.values() if row.get("hq_source") == "adimage_minio")
        cache_adimage = sum(1 for row in cache_map.values() if row.get("hq_source") == "adimage")
        log.info(
            "HQ cache reaproveitado: %d hashes (minio=%d, adimage=%d), faltantes=%d",
            len(cache_map),
            cache_minio,
            cache_adimage,
            len(missing_hashes),
        )
        if on_progress:
            try:
                on_progress(f"anuncios:midia:cache ({len(cache_map)})", 70)
            except Exception:
                pass

    live_map = _fetch_adimages_by_hashes(client, account_id, token, missing_hashes, on_progress=on_progress) if missing_hashes else {}
    if missing_hashes:
        log.info("HQ adimages consultados na Meta: %d hashes faltantes", len(missing_hashes))
    return {**cache_map, **live_map}


def _guess_extension(content_type: str | None, url: str | None) -> str:
    if content_type:
        ext = mimetypes.guess_extension(content_type.split(";", 1)[0].strip().lower())
        if ext:
            return ext
    if url:
        path = urlparse(url).path
        if "." in path:
            raw_ext = "." + path.rsplit(".", 1)[1].lower()
            if 1 < len(raw_ext) <= 6:
                return raw_ext
    return ".jpg"


def _persist_hq_images_to_minio(
    client: httpx.Client,
    creative_map: dict[str, dict],
    ads_account_uuid: str,
    on_progress=None,
) -> None:
    bucket = settings.MINIO_BUCKET_CRIATIVOS
    if not settings.MINIO_ACCESS_KEY or not settings.MINIO_SECRET_KEY:
        log.warning("MinIO não configurado; mantendo URL temporária da Meta para HQ.")
        return

    # source HQ pendente -> source final após gravar no MinIO
    persist_targets = {
        "adimage": "adimage_minio",
        "creative_thumbnail_hq": "creative_thumbnail_hq_minio",
    }
    total = sum(1 for creative in creative_map.values() if creative.get("hq_source") in persist_targets)
    done = 0
    for creative in creative_map.values():
        src = creative.get("hq_source")
        if src not in persist_targets:
            continue
        src_url = creative.get("meta_image_url_tmp")
        creative_id = creative.get("id")
        if not src_url or not creative_id:
            continue
        try:
            resp = client.get(
                src_url,
                follow_redirects=True,
                timeout=15,
                headers={
                    "Referer": "https://www.facebook.com/",
                    "User-Agent": "Mozilla/5.0",
                },
            )
            if resp.status_code >= 400:
                continue
            content_type = resp.headers.get("content-type", "image/jpeg")
            ext = _guess_extension(content_type, src_url)
            object_name = f"ads-accounts/{ads_account_uuid}/criativos/{creative_id}{ext}"
            put_bytes(bucket, object_name, resp.content, content_type)
            creative["image_url_hq"] = public_url(bucket, object_name)
            creative["hq_source"] = persist_targets[src]
            done += 1
            if on_progress and (done % 10 == 0 or done == total):
                try:
                    on_progress(f"anuncios:midia:minio ({done}/{total})", 70)
                except Exception:
                    pass
        except Exception as exc:
            log.warning("Falha ao persistir criativo %s no MinIO: %s", creative_id, exc)


def _persist_carousel_cards_to_minio(
    client: httpx.Client,
    creative_id: str,
    ads_account_uuid: str,
    cards: list[dict],
) -> int:
    """Persists each carousel card image to MinIO in-place, updating card dicts.

    Uses fixed .jpg extension for idempotency across syncs (fbcdn path segments
    vary per request, so content-type-derived extension would cause stat misses).
    Returns count of cards successfully persisted.
    """
    from minio.error import S3Error

    bucket = settings.MINIO_BUCKET_CRIATIVOS
    if not settings.MINIO_ACCESS_KEY or not settings.MINIO_SECRET_KEY:
        return 0

    from app.services.object_storage import stat_object

    persisted = 0
    for card in cards:
        card_index = card.get("card_index")
        if card_index is None:
            continue

        # Build ordered candidate list: image_url_hq first, picture as fallback.
        candidates: list[str] = []
        for u in (card.get("image_url_hq"), card.get("picture")):
            if u and u not in candidates:
                candidates.append(u)
        if not candidates:
            log.warning(
                "Card %s_card_%s sem candidatos de mídia; carrossel pode cair em fallback vazio",
                creative_id,
                card_index,
            )
            continue

        object_name = f"ads-accounts/{ads_account_uuid}/criativos/{creative_id}_card_{card_index}.jpg"
        minio_url = public_url(bucket, object_name)

        # Idempotency: if already in MinIO just update the URL and move on.
        if _eh_url_publica_minio(candidates[0]):
            card["image_url_hq"] = candidates[0]
            card["picture"] = candidates[0]
            card["source_type"] = "adimage_minio"
            persisted += 1
            continue

        try:
            stat_object(bucket, object_name)
            # Object exists — reuse URL, no download needed.
            card["image_url_hq"] = minio_url
            card["picture"] = minio_url
            card["source_type"] = "adimage_minio"
            persisted += 1
            continue
        except S3Error as exc:
            if exc.code != "NoSuchKey":
                log.warning("MinIO stat falhou card %s_card_%s: %s", creative_id, card_index, exc)
                continue
            # NoSuchKey → proceed to download and upload.

        success = False
        for src_url in candidates:
            try:
                resp = client.get(
                    src_url,
                    follow_redirects=True,
                    timeout=15,
                    headers={"Referer": "https://www.facebook.com/", "User-Agent": "Mozilla/5.0"},
                )
                if resp.status_code >= 400:
                    log.warning("Falha download card %s_card_%s via %s: HTTP %s", creative_id, card_index, src_url[:60], resp.status_code)
                    continue
                content_type = resp.headers.get("content-type", "image/jpeg")
                put_bytes(bucket, object_name, resp.content, content_type)
                card["image_url_hq"] = minio_url
                card["picture"] = minio_url
                card["source_type"] = "adimage_minio"
                persisted += 1
                success = True
                break
            except Exception as exc:
                log.warning("Falha ao persistir card %s_card_%s no MinIO: %s", creative_id, card_index, exc)
        if not success and len(candidates) > 1:
            log.warning("Todos os %d candidatos falharam para card %s_card_%s", len(candidates), creative_id, card_index)

    return persisted


def _fetch_criativos_batch(client: httpx.Client, ad_ids: list[str], token: str, on_progress=None) -> dict[str, dict]:
    """Busca criativo HQ, tipo e link para ad_ids em batches de 50."""
    criativos: dict[str, dict] = {}
    fields = (
        "creative{id,name,object_type,thumbnail_url,video_id,image_hash,"
        "instagram_permalink_url,effective_object_story_id,url_tags,"
        "object_story_spec{link_data{image_hash,child_attachments{image_hash,picture,video_id}},"
        "photo_data{image_hash},video_data{image_hash,video_id}}}"
    )
    total_batches = max((len(ad_ids) + 49) // 50, 1)
    for batch_index, i in enumerate(range(0, len(ad_ids), 50), start=1):
        batch = ad_ids[i:i + 50]
        if on_progress:
            try:
                on_progress(f"anuncios:criativos ({batch_index}/{total_batches})", 69)
            except Exception:
                pass
        try:
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
        except httpx.HTTPError as exc:
            log.warning("Erro criativos batch tentativa %d/%d: %s", batch_index, total_batches, exc)
            continue
        if resp.status_code != 200:
            err, _ = _meta_erro_payload(resp)
            log.warning("Erro criativos batch: %s", err.get("message", resp.text[:200]))
            continue

        for ad_id, ad_data in resp.json().items():
            creative = ad_data.get("creative") or {}
            story_spec = creative.get("object_story_spec") or {}
            link_data = story_spec.get("link_data") or {}
            child_attachments = link_data.get("child_attachments") or []
            video_id = _extrair_video_id_criativo(creative)

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
            elif video_id:
                tipo = "VIDEO"
                carousel_items = []
            else:
                tipo = "IMAGE"
                carousel_items = []

            image_url_hq = _extrair_imagem_criativo(creative)

            link_anuncio = (
                creative.get("instagram_permalink_url")
                or _construir_link_facebook(creative.get("effective_object_story_id"))
            )

            criativos[ad_id] = {
                "id": creative.get("id"),
                "thumbnail_url": creative.get("thumbnail_url"),
                "tipo": tipo,
                "video_id": video_id,
                "image_url_hq": image_url_hq,
                "link_anuncio": link_anuncio,
                "carousel_items": carousel_items,
                "image_hashes": _extract_creative_image_hashes(creative),
                "image_hash": None,
                "meta_image_url_tmp": None,
                "meta_permalink_url": None,
                "original_width": None,
                "original_height": None,
                "hq_source": "thumbnail_fallback",
                "raw_creative": creative,
            }
    return criativos


def _fetch_criativos_batch_minimo(client: httpx.Client, ad_ids: list[str], token: str, on_progress=None) -> dict[str, dict]:
    """Fallback por IDs com campos mínimos para máxima compatibilidade."""
    criativos: dict[str, dict] = {}
    fields = (
        "creative{id,object_type,thumbnail_url,video_id,image_hash,instagram_permalink_url,"
        "effective_object_story_id,url_tags,object_story_spec{link_data{image_hash,child_attachments{image_hash,video_id}},"
        "video_data{image_hash,video_id}}}"
    )
    total_batches = max((len(ad_ids) + 49) // 50, 1)
    for batch_index, i in enumerate(range(0, len(ad_ids), 50), start=1):
        batch = ad_ids[i:i + 50]
        if on_progress:
            try:
                on_progress(f"anuncios:criativos:minimo ({batch_index}/{total_batches})", 69)
            except Exception:
                pass
        try:
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
        except httpx.HTTPError as exc:
            log.warning("Erro criativos batch mínimo tentativa %d/%d: %s", batch_index, total_batches, exc)
            continue
        if resp.status_code != 200:
            err, _ = _meta_erro_payload(resp)
            log.warning("Erro criativos batch mínimo: %s", err.get("message", resp.text[:200]))
            continue
        for ad_id, ad_data in resp.json().items():
            creative = ad_data.get("creative") or {}
            obj_type = (creative.get("object_type") or "").upper()
            video_id = _extrair_video_id_criativo(creative)
            if "VIDEO" in obj_type or video_id:
                tipo = "VIDEO"
            else:
                tipo = "IMAGE"
            criativos[ad_id] = {
                "id": creative.get("id"),
                "thumbnail_url": creative.get("thumbnail_url"),
                "tipo": tipo,
                "video_id": video_id,
                "image_url_hq": _extrair_imagem_criativo(creative),
                "link_anuncio": (
                    creative.get("instagram_permalink_url")
                    or _construir_link_facebook(creative.get("effective_object_story_id"))
                ),
                "carousel_items": [],
                "image_hashes": _extract_creative_image_hashes(creative),
                "image_hash": None,
                "meta_image_url_tmp": None,
                "meta_permalink_url": None,
                "original_width": None,
                "original_height": None,
                "hq_source": "thumbnail_fallback",
                "raw_creative": creative,
            }
    return criativos


def _fetch_criativos_por_conta(
    client: httpx.Client,
    account_id: str,
    token: str,
    ad_ids_alvo: set[str],
    on_progress=None,
) -> dict[str, dict]:
    """Fallback: busca criativos via endpoint /{account_id}/ads.

    Em algumas contas o endpoint batch por `ids` não retorna `creative`.
    """
    criativos: dict[str, dict] = {}
    fields = (
        "id,creative{id,name,object_type,thumbnail_url,video_id,image_hash,"
        "instagram_permalink_url,effective_object_story_id,url_tags,"
        "object_story_spec{link_data{image_hash,child_attachments{image_hash,picture,video_id}},"
        "photo_data{image_hash},video_data{image_hash,video_id}}}"
    )
    try:
        rows = _paginar(
            client,
            f"{META_BASE}/{account_id}/ads",
            {
                "access_token": token,
                "fields": fields,
                "limit": 100,
            },
            raise_on_terminal=False,
        )
    except httpx.HTTPError as exc:
        log.warning("Erro fallback criativos por conta %s: %s", account_id, exc)
        return criativos
    total_rows = max(len(rows), 1)
    for index, ad_data in enumerate(rows, start=1):
        ad_id = ad_data.get("id")
        if not ad_id or ad_id not in ad_ids_alvo:
            if on_progress and (index % 50 == 0 or index == total_rows):
                try:
                    on_progress(f"anuncios:criativos:fallback ({index}/{total_rows})", 69)
                except Exception:
                    pass
            continue
        creative = ad_data.get("creative") or {}
        story_spec = creative.get("object_story_spec") or {}
        link_data = story_spec.get("link_data") or {}
        child_attachments = link_data.get("child_attachments") or []
        video_id = _extrair_video_id_criativo(creative)

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
        elif video_id:
            tipo = "VIDEO"
            carousel_items = []
        else:
            tipo = "IMAGE"
            carousel_items = []

        image_url_hq = _extrair_imagem_criativo(creative)
        link_anuncio = (
            creative.get("instagram_permalink_url")
            or _construir_link_facebook(creative.get("effective_object_story_id"))
        )
        criativos[ad_id] = {
            "id": creative.get("id"),
            "thumbnail_url": creative.get("thumbnail_url"),
            "tipo": tipo,
            "video_id": video_id,
            "image_url_hq": image_url_hq,
            "link_anuncio": link_anuncio,
            "carousel_items": carousel_items,
            "image_hashes": _extract_creative_image_hashes(creative),
            "image_hash": None,
            "meta_image_url_tmp": None,
            "meta_permalink_url": None,
            "original_width": None,
            "original_height": None,
            "hq_source": "thumbnail_fallback",
            "raw_creative": creative,
        }
        if on_progress and (index % 50 == 0 or index == total_rows):
            try:
                on_progress(f"anuncios:criativos:fallback ({index}/{total_rows})", 69)
            except Exception:
                pass
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


def _normalizar_status_meta(raw: Any, default: str = "ACTIVE") -> str:
    s = str(raw or "").strip().upper()
    if not s:
        return default
    if s in {"ACTIVE", "PAUSED", "ARCHIVED", "DELETED"}:
        return s
    if s in {"IN_PROCESS", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED"}:
        return "PAUSED"
    return s


def _meta_erro_payload(resp: httpx.Response) -> tuple[dict[str, Any], str]:
    return meta_error_payload(resp)


def _meta_erro_terminal(resp: httpx.Response) -> tuple[bool, str]:
    err, mensagem = _meta_erro_payload(resp)
    status_code = resp.status_code
    code = int(err.get("code") or 0)
    subcode = int(err.get("error_subcode") or err.get("subcode") or 0)
    mensagem_norm = mensagem.lower()

    if code in {17, 4, 80000, 80004}:
        return False, mensagem

    if status_code in {401, 403, 404}:
        return True, mensagem or f"HTTP {status_code}"

    if code in {10, 190, 200, 368}:
        return True, mensagem

    if code == 803:
        return True, mensagem or "Objeto Meta não encontrado"

    if code == 100 and (
        "act_" in mensagem_norm
        or "ad account" in mensagem_norm
        or "adaccount" in mensagem_norm
        or "business manager" in mensagem_norm
    ) and (
        "unsupported get request" in mensagem_norm
        or "does not exist" in mensagem_norm
        or "missing permissions" in mensagem_norm
        or "cannot be loaded" in mensagem_norm
        or "not authorized" in mensagem_norm
        or "api access blocked" in mensagem_norm
    ):
        return True, mensagem

    if subcode in {2108006, 2108007, 2108009}:
        return True, mensagem

    if any(
        trecho in mensagem_norm
        for trecho in (
            "invalid oauth",
            "permissions error",
            "api access blocked",
        )
    ) and (
        "act_" in mensagem_norm
        or "ad account" in mensagem_norm
        or "adaccount" in mensagem_norm
        or "business manager" in mensagem_norm
        or "account" in mensagem_norm
    ):
        return True, mensagem

    return False, mensagem


def _levantar_se_meta_terminal(resp: httpx.Response, contexto: str) -> None:
    terminal, mensagem = _meta_erro_terminal(resp)
    if terminal:
        err, _ = _meta_erro_payload(resp)
        raise MetaContaInacessivelError(
            f"{contexto}: {mensagem or 'acesso à conta Meta indisponível'}",
            http_status=resp.status_code,
            error_code=int(err.get("code") or 0) or None,
            error_subcode=int(err.get("error_subcode") or err.get("subcode") or 0) or None,
            stage=contexto,
        )


def _janela_insights_para_conta(conta: AdsAccount, modo_sync: str) -> str:
    hoje = date.today()
    if modo_sync == "backfill":
        since = conta.periodo_sync_inicio or hoje.replace(day=1)
    else:
        since = hoje - timedelta(days=INSIGHTS_SYNC_WINDOW_DAYS - 1)
    return json.dumps({"since": since.isoformat(), "until": hoje.isoformat()})


def _campanhas_publicos_relevantes(db: Session, ads_account_uuid: Any, *, limit: int) -> list[str]:
    rows = db.execute(text("""
        WITH recent AS (
            SELECT campaign_id,
                   COALESCE(SUM(spend), 0) AS spend,
                   COALESCE(SUM(leads), 0) AS leads
            FROM meta_campanhas_insights
            WHERE ads_account_id = CAST(:ads_account_id AS uuid)
              AND data >= CURRENT_DATE - INTERVAL '2 days'
            GROUP BY campaign_id
        )
        SELECT c.campaign_id
        FROM meta_campaigns_catalog c
        LEFT JOIN recent r ON r.campaign_id = c.campaign_id
        WHERE c.ads_account_id = CAST(:ads_account_id AS uuid)
          AND c.campaign_id IS NOT NULL
          AND (
            c.effective_status = 'ACTIVE'
            OR COALESCE(r.spend, 0) > 0
            OR COALESCE(r.leads, 0) > 0
          )
        ORDER BY
          CASE WHEN c.effective_status = 'ACTIVE' THEN 0 ELSE 1 END,
          COALESCE(r.spend, 0) DESC,
          COALESCE(r.leads, 0) DESC,
          c.campaign_id
        LIMIT :limit
    """), {
        "ads_account_id": str(ads_account_uuid),
        "limit": max(int(limit), 0),
    }).fetchall()
    return [cid for (cid,) in rows if cid]


def _parse_meta_datetime(raw: Any) -> datetime | None:
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(s)
        except ValueError:
            parsed = None
        if parsed is None:
            for fmt in (
                "%Y-%m-%dT%H:%M:%S.%f%z",
                "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%d %H:%M:%S%z",
            ):
                try:
                    parsed = datetime.strptime(s, fmt)
                    break
                except ValueError:
                    continue
        if parsed is None:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return None


def marcar_sync_jobs_ativos_como_interrompidos(motivo: str = SYNC_JOB_INTERRUPTED_ERROR) -> int:
    """Marca jobs ativos antigos como interrompidos após restart do serviço."""
    with SessionLocal() as db:
        contas = db.execute(
            text("""
                SELECT DISTINCT ads_account_id
                FROM sync_jobs
                WHERE status IN ('pending', 'running')
            """)
        ).scalars().all()
        result = db.execute(
            text("""
                UPDATE sync_jobs
                SET status = 'error',
                    etapa_atual = 'interrompido',
                    erro = :motivo,
                    updated_at = NOW()
                WHERE status IN ('pending', 'running')
            """),
            {"motivo": motivo},
        )
        if contas:
            db.execute(
                text("""
                    UPDATE meta_sync_states
                    SET last_run_at = NOW(),
                        last_run_status = 'error',
                        last_error_at = NOW(),
                        last_error_stage = 'interrompido',
                        last_error_message = :motivo,
                        last_error_meta = CAST(:meta AS JSONB)
                    WHERE ads_account_id = ANY(:ads_account_ids)
                """),
                {
                    "motivo": motivo,
                    "meta": json.dumps({"reason": "service_restart", "source": "sync_jobs"}),
                    "ads_account_ids": [uuid.UUID(str(item)) for item in contas if item],
                },
            )
        db.commit()
        return int(getattr(result, "rowcount", 0) or 0)


def _sync_publicos_region(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    time_range: str,
    ads_account_uuid: Any,
    totais: dict,
    campaign_id: str = 'ALL',
) -> None:
    url_id = campaign_id if campaign_id != 'ALL' else account_id
    rows = _paginar(
        client,
        f"{META_BASE}/{url_id}/insights",
        {
            "access_token": token,
            "fields": "spend,impressions,clicks,actions,ctr",
            "breakdowns": "region",
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
        breakdown_value = r.get("region", "unknown")
        if not breakdown_value or breakdown_value.lower() == "unknown":
            continue
        db.execute(text("""
            INSERT INTO meta_publicos_insights
                (ads_account_id, data, breakdown_type, breakdown_value, campaign_id,
                 leads, spend, impressions, clicks, ctr, cpl)
            VALUES
                (:ads_account_id, :data, 'region', :breakdown_value, :campaign_id,
                 :leads, :spend, :impressions, :clicks, :ctr, :cpl)
            ON CONFLICT (ads_account_id, data, breakdown_type, breakdown_value, campaign_id) DO UPDATE SET
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
            "campaign_id": campaign_id,
            "leads": leads,
            "spend": spend,
            "impressions": _safe_int(r.get("impressions")),
            "clicks": _safe_int(r.get("clicks")),
            "ctr": _safe_float(r.get("ctr")),
            "cpl": cpl,
        })
        totais["publicos"] += 1
    db.commit()


def _sync_catalogo(
    client: httpx.Client,
    db: Session,
    conta: AdsAccount,
    account_id: str,
    token: str,
    totais: dict,
) -> dict[str, Any]:
    watermarks = {
        "campaigns_updated_time": None,
        "adsets_updated_time": None,
        "ads_updated_time": None,
    }
    watermarks["campaigns_updated_time"] = _sync_catalog_campanhas(client, db, conta, account_id, token, totais)
    watermarks["adsets_updated_time"] = _sync_catalog_conjuntos(client, db, conta, account_id, token, totais)
    watermarks["ads_updated_time"] = _sync_catalog_anuncios_criativos_videos(client, db, conta, account_id, token, totais)
    return watermarks


def _sync_catalog_campanhas(
    client: httpx.Client,
    db: Session,
    conta: AdsAccount,
    account_id: str,
    token: str,
    totais: dict,
) -> datetime | None:
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/campaigns",
        {
            "access_token": token,
            "fields": "id,name,effective_status,status,objective,start_time,stop_time,daily_budget,lifetime_budget,updated_time",
            "limit": 500,
        },
    )
    max_updated_time: datetime | None = None
    for r in rows:
        updated_time = _parse_meta_updated_time(r.get("updated_time"))
        if updated_time and (max_updated_time is None or updated_time > max_updated_time):
            max_updated_time = updated_time
        db.execute(text("""
            INSERT INTO meta_campaigns_catalog
                (workspace_id, ads_account_id, campaign_id, nome, objetivo,
                 effective_status, configured_status, start_time, stop_time,
                 daily_budget, lifetime_budget, updated_time, raw_payload, last_seen_at)
            VALUES
                (:workspace_id, :ads_account_id, :campaign_id, :nome, :objetivo,
                 :effective_status, :configured_status, :start_time, :stop_time,
                 :daily_budget, :lifetime_budget, :updated_time, CAST(:raw_payload AS JSONB), NOW())
            ON CONFLICT (ads_account_id, campaign_id) DO UPDATE SET
                workspace_id = EXCLUDED.workspace_id,
                nome = EXCLUDED.nome,
                objetivo = EXCLUDED.objetivo,
                effective_status = EXCLUDED.effective_status,
                configured_status = EXCLUDED.configured_status,
                start_time = EXCLUDED.start_time,
                stop_time = EXCLUDED.stop_time,
                daily_budget = EXCLUDED.daily_budget,
                lifetime_budget = EXCLUDED.lifetime_budget,
                updated_time = EXCLUDED.updated_time,
                raw_payload = EXCLUDED.raw_payload,
                last_seen_at = NOW()
        """), {
            "workspace_id": str(conta.workspace_id),
            "ads_account_id": str(conta.id),
            "campaign_id": r.get("id"),
            "nome": r.get("name"),
            "objetivo": r.get("objective"),
            "effective_status": _normalizar_status_meta(r.get("effective_status") or r.get("status")),
            "configured_status": str(r.get("status") or "").upper() or None,
            "start_time": _parse_meta_datetime(r.get("start_time")),
            "stop_time": _parse_meta_datetime(r.get("stop_time")),
            "daily_budget": _safe_float(r.get("daily_budget")) / 100 if r.get("daily_budget") else None,
            "lifetime_budget": _safe_float(r.get("lifetime_budget")) / 100 if r.get("lifetime_budget") else None,
            "updated_time": updated_time,
            "raw_payload": json.dumps(r),
        })
        totais["catalog_campanhas"] += 1
    db.commit()
    return max_updated_time


def _sync_catalog_conjuntos(
    client: httpx.Client,
    db: Session,
    conta: AdsAccount,
    account_id: str,
    token: str,
    totais: dict,
) -> datetime | None:
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/adsets",
        {
            "access_token": token,
            "fields": "id,name,campaign_id,effective_status,status,start_time,end_time,daily_budget,lifetime_budget,bid_strategy,optimization_goal,billing_event,destination_type,updated_time",
            "limit": 500,
        },
    )
    max_updated_time: datetime | None = None
    for r in rows:
        updated_time = _parse_meta_updated_time(r.get("updated_time"))
        if updated_time and (max_updated_time is None or updated_time > max_updated_time):
            max_updated_time = updated_time
        db.execute(text("""
            INSERT INTO meta_adsets_catalog
                (workspace_id, ads_account_id, adset_id, campaign_id, nome,
                 effective_status, configured_status, start_time, end_time,
                 daily_budget, lifetime_budget, bid_strategy, updated_time, raw_payload, last_seen_at)
            VALUES
                (:workspace_id, :ads_account_id, :adset_id, :campaign_id, :nome,
                 :effective_status, :configured_status, :start_time, :end_time,
                 :daily_budget, :lifetime_budget, :bid_strategy, :updated_time, CAST(:raw_payload AS JSONB), NOW())
            ON CONFLICT (ads_account_id, adset_id) DO UPDATE SET
                workspace_id = EXCLUDED.workspace_id,
                campaign_id = EXCLUDED.campaign_id,
                nome = EXCLUDED.nome,
                effective_status = EXCLUDED.effective_status,
                configured_status = EXCLUDED.configured_status,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                daily_budget = EXCLUDED.daily_budget,
                lifetime_budget = EXCLUDED.lifetime_budget,
                bid_strategy = EXCLUDED.bid_strategy,
                updated_time = EXCLUDED.updated_time,
                raw_payload = EXCLUDED.raw_payload,
                last_seen_at = NOW()
        """), {
            "workspace_id": str(conta.workspace_id),
            "ads_account_id": str(conta.id),
            "adset_id": r.get("id"),
            "campaign_id": r.get("campaign_id"),
            "nome": r.get("name"),
            "effective_status": _normalizar_status_meta(r.get("effective_status") or r.get("status")),
            "configured_status": str(r.get("status") or "").upper() or None,
            "start_time": _parse_meta_datetime(r.get("start_time")),
            "end_time": _parse_meta_datetime(r.get("end_time")),
            "daily_budget": _safe_float(r.get("daily_budget")) / 100 if r.get("daily_budget") else None,
            "lifetime_budget": _safe_float(r.get("lifetime_budget")) / 100 if r.get("lifetime_budget") else None,
            "bid_strategy": r.get("bid_strategy"),
            "updated_time": updated_time,
            "raw_payload": json.dumps(r),
        })
        totais["catalog_conjuntos"] += 1
    db.commit()
    return max_updated_time


def _serializar_datetime(valor: datetime | None) -> str | None:
    if valor is None:
        return None
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.isoformat()


def _carregar_catalogo_ads_estado(
    db: Session,
    ads_account_uuid: str,
    ad_ids: list[str],
) -> dict[str, dict[str, Any]]:
    ids = [ad_id for ad_id in dict.fromkeys(ad_ids) if ad_id]
    if not ids:
        return {}
    result = db.execute(text("""
        SELECT ad_id, updated_time, creative_id
        FROM meta_ads_catalog
        WHERE ads_account_id = CAST(:ads_account_id AS uuid)
          AND ad_id = ANY(:ad_ids)
    """), {
        "ads_account_id": str(ads_account_uuid),
        "ad_ids": ids,
    })
    if result is None or not hasattr(result, "mappings"):
        return {}
    rows = result.mappings().all()
    return {
        str(row["ad_id"]): {
            "updated_time": row.get("updated_time"),
            "creative_id": row.get("creative_id"),
        }
        for row in rows
        if row.get("ad_id")
    }


def _carregar_catalogo_criativos_estado(
    db: Session,
    ads_account_uuid: str,
    ad_ids: list[str],
) -> dict[str, dict[str, Any]]:
    ids = [ad_id for ad_id in dict.fromkeys(ad_ids) if ad_id]
    if not ids:
        return {}
    result = db.execute(text("""
        SELECT DISTINCT ON (ad_id)
            ad_id,
            creative_id,
            image_hash,
            image_url_hq,
            hq_source,
            video_id
        FROM meta_creatives_catalog
        WHERE ads_account_id = CAST(:ads_account_id AS uuid)
          AND ad_id = ANY(:ad_ids)
        ORDER BY ad_id, last_seen_at DESC, criado_em DESC
    """), {
        "ads_account_id": str(ads_account_uuid),
        "ad_ids": ids,
    })
    if result is None or not hasattr(result, "mappings"):
        return {}
    rows = result.mappings().all()
    return {
        str(row["ad_id"]): {
            "creative_id": row.get("creative_id"),
            "image_hash": row.get("image_hash"),
            "image_url_hq": row.get("image_url_hq"),
            "hq_source": row.get("hq_source"),
            "video_id": row.get("video_id"),
        }
        for row in rows
        if row.get("ad_id")
    }


def _carregar_catalogo_videos_estado(
    db: Session,
    ads_account_uuid: str,
    ad_ids: list[str],
) -> set[str]:
    ids = [ad_id for ad_id in dict.fromkeys(ad_ids) if ad_id]
    if not ids:
        return set()
    result = db.execute(text("""
        SELECT DISTINCT ON (ad_id) ad_id
        FROM meta_videos_catalog
        WHERE ads_account_id = CAST(:ads_account_id AS uuid)
          AND ad_id = ANY(:ad_ids)
          AND ad_id IS NOT NULL
        ORDER BY ad_id, last_seen_at DESC, criado_em DESC
    """), {
        "ads_account_id": str(ads_account_uuid),
        "ad_ids": ids,
    })
    if result is None or not hasattr(result, "fetchall"):
        return set()
    rows = result.fetchall()
    return {str(row[0]) for row in rows if row and row[0]}


def _creative_catalog_needs_refresh(
    creative_row: dict[str, Any] | None,
    *,
    has_video_row: bool,
) -> bool:
    if not creative_row:
        return True

    image_url_hq = _safe_str(creative_row.get("image_url_hq"))
    image_hash = _safe_str(creative_row.get("image_hash"))
    hq_source = _safe_str(creative_row.get("hq_source"))
    video_id = _safe_str(creative_row.get("video_id"))

    if not image_url_hq:
        return True

    if image_hash and hq_source in {"", "thumbnail_fallback"}:
        return True

    if video_id and (hq_source in {"", "thumbnail_fallback"} or not has_video_row):
        return True

    return False


def _catalogo_ads_para_enriquecimento(
    rows: list[dict[str, Any]],
    ads_estado: dict[str, dict[str, Any]],
    criativos_estado: dict[str, dict[str, Any]],
    videos_estado: set[str],
) -> tuple[list[str], datetime | None]:
    ad_ids_para_enriquecer: list[str] = []
    maior_updated_time: datetime | None = None

    for row in rows:
        ad_id = _safe_str(row.get("id"))
        if not ad_id:
            continue

        updated_time = _parse_meta_updated_time(row.get("updated_time"))
        if updated_time and (maior_updated_time is None or updated_time > maior_updated_time):
            maior_updated_time = updated_time

        estado = ads_estado.get(ad_id) or {}
        atualizou = estado.get("updated_time")
        mudou = atualizou is None or updated_time != atualizou
        precisa_refazer = _creative_catalog_needs_refresh(
            criativos_estado.get(ad_id),
            has_video_row=ad_id in videos_estado,
        )
        if mudou or precisa_refazer:
            ad_ids_para_enriquecer.append(ad_id)

    return ad_ids_para_enriquecer, maior_updated_time


def _aplicar_thumbnail_hq(
    client: httpx.Client,
    criativos_map: dict[str, dict],
    token: str,
    on_progress=None,
) -> None:
    """Resolve thumbnail HQ no nível do creative para os casos que o adimages
    não cobre: criativos SHARE (sem image_hash, hq_source=thumbnail_fallback) e
    capas de vídeo (que vêm 64px mesmo via adimage). Marca-os com
    hq_source=creative_thumbnail_hq para o persist baixar ao MinIO.
    """
    def _precisa(c: dict) -> bool:
        return (
            c.get("hq_source") in (None, "", "thumbnail_fallback")
            or c.get("tipo") == "VIDEO"
        )

    creative_ids = [
        _safe_str(c.get("id"))
        for c in criativos_map.values()
        if c.get("id") and _precisa(c)
    ]
    if not creative_ids:
        return

    thumb_map = _fetch_creative_thumbnails_hq_by_ids(client, creative_ids, token, on_progress=on_progress)
    if not thumb_map:
        return

    for c in criativos_map.values():
        cid = _safe_str(c.get("id"))
        url = thumb_map.get(cid)
        if url and _precisa(c):
            c["meta_image_url_tmp"] = url
            c["hq_source"] = "creative_thumbnail_hq"


def _sync_catalog_anuncios_criativos_videos(
    client: httpx.Client,
    db: Session,
    conta: AdsAccount,
    account_id: str,
    token: str,
    totais: dict,
) -> datetime | None:
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/ads",
        {
            "access_token": token,
            "fields": "id,name,campaign_id,adset_id,effective_status,status,updated_time",
            "limit": 100,
        },
    )

    ad_ids = [r.get("id") for r in rows if r.get("id")]
    ads_estado = _carregar_catalogo_ads_estado(db, str(conta.id), ad_ids)
    criativos_estado = _carregar_catalogo_criativos_estado(db, str(conta.id), ad_ids)
    videos_estado = _carregar_catalogo_videos_estado(db, str(conta.id), ad_ids)
    ad_ids_para_enriquecer, max_updated_time = _catalogo_ads_para_enriquecimento(
        rows,
        ads_estado,
        criativos_estado,
        videos_estado,
    )

    criativos_map: dict[str, dict] = {}
    if ad_ids_para_enriquecer:
        criativos_map = _fetch_criativos_batch(client, ad_ids_para_enriquecer, token)
        if len(criativos_map) < len(ad_ids_para_enriquecer):
            faltantes = set(ad_ids_para_enriquecer) - set(criativos_map.keys())
            if faltantes:
                criativos_map.update(_fetch_criativos_batch_minimo(client, list(faltantes), token))
                faltantes = set(ad_ids_para_enriquecer) - set(criativos_map.keys())
            if faltantes:
                criativos_map.update(_fetch_criativos_por_conta(client, account_id, token, faltantes))

    hashes = list({
        h
        for c in criativos_map.values()
        for h in (c.get("image_hashes") or [])
        if h
    })
    adimage_map = _resolver_mapa_adimages_hq(
        client,
        db,
        account_id,
        token,
        hashes,
        str(conta.id),
        on_progress=None,
    ) if hashes else {}
    for c in criativos_map.values():
        _merge_hq_image_data(c, adimage_map)
    if criativos_map:
        _aplicar_thumbnail_hq(client, criativos_map, token)
        _persist_hq_images_to_minio(client, criativos_map, str(conta.id))

    video_ids = [str(c.get("video_id")) for c in criativos_map.values() if c.get("video_id")]
    try:
        video_map = _fetch_videos_by_ids(client, token, video_ids, totais=totais) if video_ids else {}
    except MetaRateLimitError:
        raise
    except Exception as exc:
        log.warning("Falha opcional ao enriquecer vídeos do catálogo: %s", exc)
        video_map = {}

    for r in rows:
        ad_id = _safe_str(r.get("id"))
        if not ad_id:
            continue

        incoming_updated_time = _parse_meta_updated_time(r.get("updated_time"))
        creative = r.get("creative") or {}
        creative_enriquecido = criativos_map.get(ad_id) or {}
        existing_estado = ads_estado.get(ad_id) or {}
        creative_id = _safe_str(creative_enriquecido.get("id") or existing_estado.get("creative_id") or creative.get("id"))
        tipo = (
            creative_enriquecido.get("tipo")
            or (_resolver_tipo_criativo(creative) if creative else "IMAGE")
        )
        image_url_hq = (
            creative_enriquecido.get("image_url_hq")
            or (_extrair_imagem_criativo(creative) if creative else None)
        )
        link_anuncio = (
            creative_enriquecido.get("link_anuncio")
            or
            creative.get("instagram_permalink_url")
            or _construir_link_facebook(creative.get("effective_object_story_id"))
            if creative else None
        )
        carousel_items = _extract_carousel_cards(creative_enriquecido.get("raw_creative") or creative, adimage_map)
        if not carousel_items:
            carousel_items = creative_enriquecido.get("carousel_items") or []
        if creative_id and carousel_items:
            n = _persist_carousel_cards_to_minio(client, creative_id, str(conta.id), carousel_items)
            if n < len(carousel_items):
                log.warning(
                    "Carrossel %s persistiu apenas %d/%d cards no MinIO",
                    creative_id,
                    n,
                    len(carousel_items),
                )
            if n:
                log.debug("MinIO cards: %d/%d para criativo %s", n, len(carousel_items), creative_id)
        video_id = creative_enriquecido.get("video_id") or creative.get("video_id")
        video_payload = video_map.get(str(video_id)) if video_id else {}
        video_thumbnail_url = None
        video_thumbnail_hq_url = None
        if video_id:
            best_video_thumb = _selecionar_melhor_thumbnail_video((video_payload or {}).get("thumbnails"))
            video_thumbnail_url = _safe_str(
                best_video_thumb.get("uri") if best_video_thumb else (
                    (video_payload or {}).get("thumbnail_url")
                    or (video_payload or {}).get("picture")
                    or creative_enriquecido.get("thumbnail_url")
                    or creative.get("thumbnail_url")
                )
            )
            video_thumbnail_hq_url = _persist_video_thumbnail_to_minio(
                client,
                video_thumbnail_url,
                str(video_id),
                str(conta.id),
            )
        # Se o creative já tem HQ resolvido e persistido no MinIO (inclui a capa
        # de vídeo @1200 via _aplicar_thumbnail_hq), ela tem prioridade sobre o
        # caminho legado de thumbnail de vídeo, que devolve 64px nesta conta.
        creative_hq = creative_enriquecido.get("image_url_hq")
        if creative_hq and str(creative_enriquecido.get("hq_source") or "").endswith("_minio"):
            image_url_hq = creative_hq
        else:
            image_url_hq = (
                video_thumbnail_hq_url
                or video_thumbnail_url
                or creative_hq
                or image_url_hq
            )

        db.execute(text("""
            INSERT INTO meta_ads_catalog
                (workspace_id, ads_account_id, ad_id, campaign_id, adset_id, creative_id, nome,
                 effective_status, configured_status, updated_time, raw_payload, last_seen_at)
            VALUES
                (:workspace_id, :ads_account_id, :ad_id, :campaign_id, :adset_id, :creative_id, :nome,
                 :effective_status, :configured_status, :updated_time, CAST(:raw_payload AS JSONB), NOW())
            ON CONFLICT (ads_account_id, ad_id) DO UPDATE SET
                workspace_id = EXCLUDED.workspace_id,
                campaign_id = EXCLUDED.campaign_id,
                adset_id = EXCLUDED.adset_id,
                creative_id = COALESCE(EXCLUDED.creative_id, meta_ads_catalog.creative_id),
                nome = EXCLUDED.nome,
                effective_status = EXCLUDED.effective_status,
                configured_status = EXCLUDED.configured_status,
                updated_time = EXCLUDED.updated_time,
                raw_payload = EXCLUDED.raw_payload,
                last_seen_at = NOW()
        """), {
            "workspace_id": str(conta.workspace_id),
            "ads_account_id": str(conta.id),
            "ad_id": ad_id,
            "campaign_id": r.get("campaign_id"),
            "adset_id": r.get("adset_id"),
            "creative_id": creative_id,
            "nome": r.get("name"),
            "effective_status": _normalizar_status_meta(r.get("effective_status") or r.get("status")),
            "configured_status": str(r.get("status") or "").upper() or None,
            "updated_time": incoming_updated_time,
            "raw_payload": json.dumps(r),
        })
        totais["catalog_anuncios"] += 1

        if ad_id not in ad_ids_para_enriquecer or not creative_id or not creative_enriquecido:
            continue

        if creative_id:
            _raw_for_tracking = creative_enriquecido.get("raw_creative") or creative or {}
            _tracking = extrair_tracking_info(_raw_for_tracking, headline_fallback=creative.get("name"))
            db.execute(text("""
                INSERT INTO meta_creatives_catalog
                    (workspace_id, ads_account_id, creative_id, ad_id, campaign_id, adset_id,
                     nome, object_type, tipo_criativo, effective_object_story_id, video_id,
                     thumbnail_url, image_url_hq, link_anuncio, carousel_items, raw_payload,
                     image_hash, meta_image_url_tmp, meta_permalink_url, original_width, original_height,
                     hq_source, hq_last_resolved_at,
                     headline, destination_url, url_tags, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                     last_seen_at)
                VALUES
                    (:workspace_id, :ads_account_id, :creative_id, :ad_id, :campaign_id, :adset_id,
                     :nome, :object_type, :tipo_criativo, :effective_object_story_id, :video_id,
                     :thumbnail_url, :image_url_hq, :link_anuncio, CAST(:carousel_items AS JSONB), CAST(:raw_payload AS JSONB),
                     :image_hash, :meta_image_url_tmp, :meta_permalink_url, :original_width, :original_height,
                     :hq_source, :hq_last_resolved_at,
                     :headline, :destination_url, :url_tags, :utm_source, :utm_medium, :utm_campaign, :utm_content, :utm_term,
                     NOW())
                ON CONFLICT (ads_account_id, creative_id) DO UPDATE SET
                    workspace_id = EXCLUDED.workspace_id,
                    ad_id = COALESCE(EXCLUDED.ad_id, meta_creatives_catalog.ad_id),
                    campaign_id = COALESCE(EXCLUDED.campaign_id, meta_creatives_catalog.campaign_id),
                    adset_id = COALESCE(EXCLUDED.adset_id, meta_creatives_catalog.adset_id),
                    nome = COALESCE(EXCLUDED.nome, meta_creatives_catalog.nome),
                    object_type = COALESCE(EXCLUDED.object_type, meta_creatives_catalog.object_type),
                    tipo_criativo = COALESCE(EXCLUDED.tipo_criativo, meta_creatives_catalog.tipo_criativo),
                    effective_object_story_id = COALESCE(EXCLUDED.effective_object_story_id, meta_creatives_catalog.effective_object_story_id),
                    video_id = COALESCE(EXCLUDED.video_id, meta_creatives_catalog.video_id),
                    thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, meta_creatives_catalog.thumbnail_url),
                    -- Guarda anti-regressão: nunca sobrescrever um HQ já bom com
                    -- thumbnail_fallback (sync com rate-limit pode falhar a resolução).
                    image_url_hq = CASE
                        WHEN EXCLUDED.image_url_hq IS NOT NULL
                             AND COALESCE(EXCLUDED.hq_source, '') <> 'thumbnail_fallback'
                             AND COALESCE(EXCLUDED.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                            THEN EXCLUDED.image_url_hq
                        WHEN COALESCE(meta_creatives_catalog.hq_source, '') NOT IN ('', 'thumbnail_fallback')
                             AND COALESCE(meta_creatives_catalog.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                            THEN meta_creatives_catalog.image_url_hq
                        WHEN EXCLUDED.image_url_hq IS NULL
                            THEN meta_creatives_catalog.image_url_hq
                        WHEN COALESCE(EXCLUDED.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                            THEN COALESCE(EXCLUDED.image_url_hq, meta_creatives_catalog.image_url_hq)
                        ELSE meta_creatives_catalog.image_url_hq
                    END,
                    link_anuncio = COALESCE(EXCLUDED.link_anuncio, meta_creatives_catalog.link_anuncio),
                    carousel_items = COALESCE(EXCLUDED.carousel_items, meta_creatives_catalog.carousel_items),
                    raw_payload = COALESCE(EXCLUDED.raw_payload, meta_creatives_catalog.raw_payload),
                    image_hash = COALESCE(EXCLUDED.image_hash, meta_creatives_catalog.image_hash),
                    meta_image_url_tmp = COALESCE(EXCLUDED.meta_image_url_tmp, meta_creatives_catalog.meta_image_url_tmp),
                    meta_permalink_url = COALESCE(EXCLUDED.meta_permalink_url, meta_creatives_catalog.meta_permalink_url),
                    original_width = COALESCE(EXCLUDED.original_width, meta_creatives_catalog.original_width),
                    original_height = COALESCE(EXCLUDED.original_height, meta_creatives_catalog.original_height),
                    hq_source = CASE
                        WHEN EXCLUDED.image_url_hq IS NOT NULL
                             AND COALESCE(EXCLUDED.hq_source, '') <> 'thumbnail_fallback'
                             AND COALESCE(EXCLUDED.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                            THEN EXCLUDED.hq_source
                        WHEN COALESCE(meta_creatives_catalog.hq_source, '') NOT IN ('', 'thumbnail_fallback')
                             AND COALESCE(meta_creatives_catalog.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                            THEN meta_creatives_catalog.hq_source
                        WHEN EXCLUDED.image_url_hq IS NULL
                            THEN meta_creatives_catalog.hq_source
                        WHEN COALESCE(EXCLUDED.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                            THEN COALESCE(EXCLUDED.hq_source, meta_creatives_catalog.hq_source)
                        ELSE COALESCE(meta_creatives_catalog.hq_source, 'thumbnail_fallback')
                    END,
                    hq_last_resolved_at = COALESCE(EXCLUDED.hq_last_resolved_at, meta_creatives_catalog.hq_last_resolved_at),
                    headline = COALESCE(EXCLUDED.headline, meta_creatives_catalog.headline),
                    destination_url = COALESCE(EXCLUDED.destination_url, meta_creatives_catalog.destination_url),
                    url_tags = COALESCE(EXCLUDED.url_tags, meta_creatives_catalog.url_tags),
                    utm_source = COALESCE(EXCLUDED.utm_source, meta_creatives_catalog.utm_source),
                    utm_medium = COALESCE(EXCLUDED.utm_medium, meta_creatives_catalog.utm_medium),
                    utm_campaign = COALESCE(EXCLUDED.utm_campaign, meta_creatives_catalog.utm_campaign),
                    utm_content = COALESCE(EXCLUDED.utm_content, meta_creatives_catalog.utm_content),
                    utm_term = COALESCE(EXCLUDED.utm_term, meta_creatives_catalog.utm_term),
                    last_seen_at = NOW()
            """), {
                "workspace_id": str(conta.workspace_id),
                "ads_account_id": str(conta.id),
                "creative_id": creative_id,
                "ad_id": ad_id,
                "campaign_id": r.get("campaign_id"),
                "adset_id": r.get("adset_id"),
                "nome": creative.get("name"),
                "object_type": creative.get("object_type"),
                "tipo_criativo": tipo,
                "effective_object_story_id": creative.get("effective_object_story_id"),
                "video_id": video_id,
                "thumbnail_url": video_thumbnail_url or creative_enriquecido.get("thumbnail_url") or creative.get("thumbnail_url"),
                "image_url_hq": image_url_hq,
                "link_anuncio": link_anuncio,
                "carousel_items": json.dumps(carousel_items) if carousel_items else None,
                "raw_payload": json.dumps({
                    "ad": r.get("id"),
                    "creative": _raw_for_tracking,
                    "video": video_payload,
                    "selected_thumbnail_url": video_thumbnail_url,
                    "selected_thumbnail_hq_url": video_thumbnail_hq_url,
                }),
                "image_hash": creative_enriquecido.get("image_hash"),
                "meta_image_url_tmp": creative_enriquecido.get("meta_image_url_tmp"),
                "meta_permalink_url": creative_enriquecido.get("meta_permalink_url"),
                "original_width": creative_enriquecido.get("original_width"),
                "original_height": creative_enriquecido.get("original_height"),
                "hq_source": creative_enriquecido.get("hq_source") or "thumbnail_fallback",
                "hq_last_resolved_at": datetime.now(timezone.utc),
                "headline": _tracking.get("headline"),
                "destination_url": _tracking.get("destination_url"),
                "url_tags": _tracking.get("url_tags"),
                "utm_source": _tracking.get("utm_source"),
                "utm_medium": _tracking.get("utm_medium"),
                "utm_campaign": _tracking.get("utm_campaign"),
                "utm_content": _tracking.get("utm_content"),
                "utm_term": _tracking.get("utm_term"),
            })
            totais["catalog_criativos"] += 1
            for card in carousel_items:
                db.execute(text("""
                    INSERT INTO meta_creative_cards_catalog
                        (workspace_id, ads_account_id, creative_id, ad_id, campaign_id, adset_id,
                         card_index, image_hash, video_id, image_url_hq, source_type, link, name,
                         description, raw_payload, last_seen_at)
                    VALUES
                        (:workspace_id, :ads_account_id, :creative_id, :ad_id, :campaign_id, :adset_id,
                         :card_index, :image_hash, :video_id, :image_url_hq, :source_type, :link, :name,
                         :description, CAST(:raw_payload AS JSONB), NOW())
                    ON CONFLICT (ads_account_id, creative_id, card_index) DO UPDATE SET
                        ad_id = EXCLUDED.ad_id,
                        campaign_id = EXCLUDED.campaign_id,
                        adset_id = EXCLUDED.adset_id,
                        image_hash = COALESCE(EXCLUDED.image_hash, meta_creative_cards_catalog.image_hash),
                        video_id = COALESCE(EXCLUDED.video_id, meta_creative_cards_catalog.video_id),
                        image_url_hq = CASE
                            WHEN EXCLUDED.image_url_hq IS NOT NULL
                                 AND COALESCE(EXCLUDED.image_url_hq, '') LIKE '%/meta/storage/%'
                                 AND COALESCE(EXCLUDED.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                                THEN EXCLUDED.image_url_hq
                            WHEN COALESCE(meta_creative_cards_catalog.image_url_hq, '') LIKE '%/meta/storage/%'
                                 AND COALESCE(meta_creative_cards_catalog.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                                THEN meta_creative_cards_catalog.image_url_hq
                            WHEN EXCLUDED.image_url_hq IS NULL
                                THEN meta_creative_cards_catalog.image_url_hq
                            WHEN COALESCE(EXCLUDED.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                                THEN COALESCE(EXCLUDED.image_url_hq, meta_creative_cards_catalog.image_url_hq)
                            ELSE meta_creative_cards_catalog.image_url_hq
                        END,
                        source_type = CASE
                            WHEN EXCLUDED.image_url_hq IS NOT NULL
                                 AND COALESCE(EXCLUDED.image_url_hq, '') LIKE '%/meta/storage/%'
                                 AND COALESCE(EXCLUDED.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                                THEN COALESCE(EXCLUDED.source_type, meta_creative_cards_catalog.source_type)
                            WHEN COALESCE(meta_creative_cards_catalog.image_url_hq, '') LIKE '%/meta/storage/%'
                                 AND COALESCE(meta_creative_cards_catalog.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                                THEN meta_creative_cards_catalog.source_type
                            WHEN EXCLUDED.image_url_hq IS NULL
                                THEN meta_creative_cards_catalog.source_type
                            WHEN COALESCE(EXCLUDED.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                                THEN COALESCE(EXCLUDED.source_type, meta_creative_cards_catalog.source_type)
                            ELSE COALESCE(meta_creative_cards_catalog.source_type, 'thumbnail_fallback')
                        END,
                        link = COALESCE(EXCLUDED.link, meta_creative_cards_catalog.link),
                        name = COALESCE(EXCLUDED.name, meta_creative_cards_catalog.name),
                        description = COALESCE(EXCLUDED.description, meta_creative_cards_catalog.description),
                        raw_payload = COALESCE(EXCLUDED.raw_payload, meta_creative_cards_catalog.raw_payload),
                        last_seen_at = NOW()
                """), {
                    "workspace_id": str(conta.workspace_id),
                    "ads_account_id": str(conta.id),
                    "creative_id": creative_id,
                    "ad_id": ad_id,
                    "campaign_id": r.get("campaign_id"),
                    "adset_id": r.get("adset_id"),
                    "card_index": card.get("card_index"),
                    "image_hash": card.get("image_hash"),
                    "video_id": card.get("video_id"),
                    "image_url_hq": card.get("image_url_hq"),
                    "source_type": card.get("source_type"),
                    "link": card.get("link"),
                    "name": card.get("name"),
                    "description": card.get("description"),
                    "raw_payload": json.dumps(card),
                })

            if video_id:
                db.execute(text("""
                    INSERT INTO meta_videos_catalog
                        (workspace_id, ads_account_id, video_id, creative_id, ad_id,
                         campaign_id, adset_id, thumbnail_url, image_url_hq, source_url, raw_payload, last_seen_at)
                    VALUES
                        (:workspace_id, :ads_account_id, :video_id, :creative_id, :ad_id,
                         :campaign_id, :adset_id, :thumbnail_url, :image_url_hq, :source_url, CAST(:raw_payload AS JSONB), NOW())
                    ON CONFLICT (ads_account_id, video_id) DO UPDATE SET
                        workspace_id = EXCLUDED.workspace_id,
                        creative_id = COALESCE(EXCLUDED.creative_id, meta_videos_catalog.creative_id),
                        ad_id = COALESCE(EXCLUDED.ad_id, meta_videos_catalog.ad_id),
                        campaign_id = COALESCE(EXCLUDED.campaign_id, meta_videos_catalog.campaign_id),
                        adset_id = COALESCE(EXCLUDED.adset_id, meta_videos_catalog.adset_id),
                        thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, meta_videos_catalog.thumbnail_url),
                        image_url_hq = CASE
                            WHEN EXCLUDED.image_url_hq IS NOT NULL
                                 AND COALESCE(EXCLUDED.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                                THEN EXCLUDED.image_url_hq
                            WHEN COALESCE(meta_videos_catalog.image_url_hq, '') NOT LIKE '%/meta/storage-assinado%'
                                THEN meta_videos_catalog.image_url_hq
                            WHEN EXCLUDED.image_url_hq IS NULL
                                THEN meta_videos_catalog.image_url_hq
                            ELSE meta_videos_catalog.image_url_hq
                        END,
                        source_url = COALESCE(EXCLUDED.source_url, meta_videos_catalog.source_url),
                        raw_payload = COALESCE(EXCLUDED.raw_payload, meta_videos_catalog.raw_payload),
                        last_seen_at = NOW()
                """), {
                    "workspace_id": str(conta.workspace_id),
                    "ads_account_id": str(conta.id),
                    "video_id": video_id,
                    "creative_id": creative_id,
                    "ad_id": ad_id,
                    "campaign_id": r.get("campaign_id"),
                    "adset_id": r.get("adset_id"),
                    "thumbnail_url": (
                        video_thumbnail_url
                        or (video_payload or {}).get("picture")
                        or creative_enriquecido.get("thumbnail_url")
                        or creative.get("thumbnail_url")
                    ),
                    "image_url_hq": image_url_hq,
                    "source_url": (video_payload or {}).get("source"),
                    "raw_payload": json.dumps({
                        "ad": r.get("id"),
                        "creative": creative,
                        "video": video_payload,
                        "selected_thumbnail_url": video_thumbnail_url,
                        "selected_thumbnail_hq_url": video_thumbnail_hq_url,
                    }),
                })
                totais["catalog_videos"] += 1

    db.commit()
    return max_updated_time


def _sync_video_metrics(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    time_range: str,
    ads_account_uuid: Any,
) -> None:
    try:
        result = db.execute(text("""
            SELECT DISTINCT ON (a.ad_id)
                a.ad_id,
                COALESCE(c.video_id, v.video_id) AS video_id
            FROM meta_ads_catalog a
            LEFT JOIN meta_creatives_catalog c
                ON c.ads_account_id = a.ads_account_id
               AND c.creative_id = a.creative_id
            LEFT JOIN meta_videos_catalog v
                ON v.ads_account_id = a.ads_account_id
               AND v.ad_id = a.ad_id
            WHERE a.ads_account_id = CAST(:ads_account_id AS uuid)
              AND a.ad_id IS NOT NULL
              AND COALESCE(c.video_id, v.video_id) IS NOT NULL
            ORDER BY a.ad_id, c.last_seen_at DESC NULLS LAST, v.last_seen_at DESC NULLS LAST, a.last_seen_at DESC
        """), {"ads_account_id": str(ads_account_uuid)})
        if result is None or not hasattr(result, "mappings"):
            return
        ad_rows = result.mappings().all()
        ad_to_video = {
            str(row.get("ad_id")): row.get("video_id")
            for row in ad_rows
            if row.get("ad_id") and row.get("video_id")
        }
        if not ad_to_video:
            return
        rows = _paginar(
            client,
            f"{META_BASE}/{account_id}/insights",
            {
                "access_token": token,
                "fields": (
                    "ad_id,date_start,video_play_actions,video_avg_time_watched_actions,"
                    "video_30_sec_watched_actions,video_p25_watched_actions,video_p50_watched_actions,"
                    "video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions,"
                    "video_thruplay_watched_actions,video_3_sec_watched_actions,cost_per_thruplay,actions"
                ),
                "level": "ad",
                "time_range": time_range,
                "time_increment": 1,
                "limit": 500,
            },
        )
        for r in rows:
            ad_id = r.get("ad_id")
            video_id = ad_to_video.get(ad_id)
            if not ad_id or not video_id:
                continue
            actions = r.get("actions") or []
            db.execute(text("""
                INSERT INTO meta_video_metrics_daily
                    (ads_account_id, ad_id, video_id, data, video_views, video_play_actions,
                    video_avg_pct_watched_actions, video_complete_watched_actions, video_p25, video_p50,
                    video_p75, video_p95, video_p100, thruplay, video_3_sec, cost_per_thruplay, atualizado_em)
                VALUES
                    (:ads_account_id, :ad_id, :video_id, :data, :video_views, :video_play_actions,
                    :video_avg_pct_watched_actions, :video_complete_watched_actions, :video_p25, :video_p50,
                    :video_p75, :video_p95, :video_p100, :thruplay, :video_3_sec, :cost_per_thruplay, NOW())
                ON CONFLICT (ads_account_id, video_id, ad_id, data) DO UPDATE SET
                    video_views = EXCLUDED.video_views,
                    video_play_actions = EXCLUDED.video_play_actions,
                    video_avg_pct_watched_actions = EXCLUDED.video_avg_pct_watched_actions,
                    video_complete_watched_actions = EXCLUDED.video_complete_watched_actions,
                    video_p25 = EXCLUDED.video_p25,
                    video_p50 = EXCLUDED.video_p50,
                    video_p75 = EXCLUDED.video_p75,
                    video_p95 = EXCLUDED.video_p95,
                    video_p100 = EXCLUDED.video_p100,
                    thruplay = EXCLUDED.thruplay,
                    video_3_sec = EXCLUDED.video_3_sec,
                    cost_per_thruplay = EXCLUDED.cost_per_thruplay,
                    atualizado_em = NOW()
            """), {
                "ads_account_id": str(ads_account_uuid),
                "ad_id": ad_id,
                "video_id": str(video_id),
                "data": r.get("date_start"),
                "video_views": _valor_action_any(actions, {"video_view"}),
                "video_play_actions": _valor_video_action(r.get("video_play_actions") or []),
                "video_avg_pct_watched_actions": _valor_video_action(r.get("video_avg_time_watched_actions") or []),
                "video_complete_watched_actions": _valor_video_action(r.get("video_30_sec_watched_actions") or []),
                "video_p25": _valor_video_action(r.get("video_p25_watched_actions") or []),
                "video_p50": _valor_video_action(r.get("video_p50_watched_actions") or []),
                "video_p75": _valor_video_action(r.get("video_p75_watched_actions") or []),
                "video_p95": _valor_video_action(r.get("video_p95_watched_actions") or []),
                "video_p100": _valor_video_action(r.get("video_p100_watched_actions") or []),
                "thruplay": _valor_video_action(r.get("video_thruplay_watched_actions") or []),
                "video_3_sec": _valor_video_action(r.get("video_3_sec_watched_actions") or []),
                "cost_per_thruplay": _safe_float((r.get("cost_per_thruplay") or [{}])[0].get("value") if r.get("cost_per_thruplay") else 0.0),
            })
        db.commit()
    except (MetaContaInacessivelError, httpx.HTTPError) as exc:
        log.warning("Métricas de vídeo ignoradas sem bloquear o sync da conta %s: %s", account_id, exc)


def _carregar_objetivos_catalogo(db: Session, ads_account_uuid: Any) -> list[dict]:
    return db.execute(text("""
        SELECT campaign_id, MAX(objetivo) AS objetivo
        FROM meta_campaigns_catalog
        WHERE ads_account_id = CAST(:ads_account_id AS uuid)
        GROUP BY campaign_id
    """), {"ads_account_id": str(ads_account_uuid)}).mappings().all()


def reprocessar_imagens_hq_conta(db: Session, conta: AdsAccount) -> dict:
    """Backfill: re-resolve HQ (thumbnail @1200 no nível do creative) para
    criativos já gravados em baixa qualidade — SHARE (hq_source thumbnail_fallback)
    e capas de vídeo (64px). Idempotente. Atualiza meta_creatives_catalog e
    meta_anuncios_insights. Retorna contagem.
    """
    token = conta.bm_token
    if not token:
        return {"processados": 0, "recuperados": 0, "falhas": 0, "erro": "conta sem bm_token"}

    rows = db.execute(text("""
        SELECT creative_id, tipo_criativo, hq_source
        FROM meta_creatives_catalog
        WHERE ads_account_id = CAST(:acct AS uuid)
          AND creative_id IS NOT NULL
          AND (COALESCE(hq_source, '') IN ('', 'thumbnail_fallback') OR tipo_criativo = 'VIDEO')
    """), {"acct": str(conta.id)}).mappings().all()

    criativos_map: dict[str, dict] = {}
    for r in rows:
        cid = _safe_str(r.get("creative_id"))
        if not cid:
            continue
        criativos_map[cid] = {
            "id": cid,
            "tipo": _safe_str(r.get("tipo_criativo")) or "IMAGE",
            "hq_source": _safe_str(r.get("hq_source")) or "thumbnail_fallback",
            "meta_image_url_tmp": None,
        }

    processados = len(criativos_map)
    if not processados:
        return {"processados": 0, "recuperados": 0, "falhas": 0}

    with httpx.Client(timeout=60.0) as client:
        _aplicar_thumbnail_hq(client, criativos_map, token)
        _persist_hq_images_to_minio(client, criativos_map, str(conta.id))

    recuperados = 0
    falhas = 0
    for c in criativos_map.values():
        if c.get("hq_source") == "creative_thumbnail_hq_minio" and c.get("image_url_hq"):
            cid = c["id"]
            url = c["image_url_hq"]
            db.execute(text("""
                UPDATE meta_creatives_catalog
                SET image_url_hq = :url, hq_source = 'creative_thumbnail_hq_minio',
                    hq_last_resolved_at = now()
                WHERE ads_account_id = CAST(:acct AS uuid) AND creative_id = :cid
            """), {"url": url, "acct": str(conta.id), "cid": cid})
            db.execute(text("""
                UPDATE meta_anuncios_insights
                SET image_url_hq = :url
                WHERE ads_account_id = CAST(:acct AS uuid) AND creative_id = :cid
            """), {"url": url, "acct": str(conta.id), "cid": cid})
            recuperados += 1
        else:
            falhas += 1
    db.commit()

    return {"processados": processados, "recuperados": recuperados, "falhas": falhas}


# ── sync principal ─────────────────────────────────────────────────────────────

def sincronizar_conta(
    ads_account_id: str,
    db: Session,
    on_progress=None,  # callable(etapa: str, progresso: int) | None
    modo_sync: str = "recorrente",
) -> dict:
    conta: AdsAccount | None = db.get(AdsAccount, ads_account_id)
    if not conta:
        raise ValueError(f"AdsAccount {ads_account_id} não encontrada")

    if not _try_sync_lock(db, ads_account_id):
        return {"skipped": True, "reason": SYNC_LOCK_NOT_ACQUIRED}

    try:
        cooldown_until = _cooldown_until(conta)
        now = datetime.now(timezone.utc)
        if cooldown_until and cooldown_until > now:
            return {
                "skipped": True,
                "reason": "rate limit em cooldown",
                "cooldown_until": cooldown_until.isoformat(),
            }
        _upsert_meta_sync_state(
            db,
            ads_account_id,
            last_run_at=now,
            last_run_mode=modo_sync,
            last_run_status="running",
        )
        result = _sincronizar_conta_impl(ads_account_id, db, on_progress=on_progress, modo_sync=modo_sync)
        if result.get("skipped"):
            _upsert_meta_sync_state(
                db,
                ads_account_id,
                last_run_at=now,
                last_run_mode=modo_sync,
                last_run_status="skipped",
                last_error_meta={"reason": result.get("reason")},
            )
        else:
            _upsert_meta_sync_state(
                db,
                ads_account_id,
                last_run_at=now,
                last_run_mode=modo_sync,
                **_state_payload_for_success(result.get("totais") or {}, result.get("watermarks") or {}),
            )
        return result
    except MetaRateLimitError as exc:
        try:
            db.rollback()
        except Exception:
            pass
        conta = db.get(AdsAccount, ads_account_id) or conta
        if conta:
            registrar_rate_limit_cooldown(db, conta, exc)
        raise
    except MetaContaInacessivelError as exc:
        try:
            db.rollback()
        except Exception:
            pass
        _upsert_meta_sync_state(
            db,
            ads_account_id,
            **_state_payload_for_error(
                stage=exc.stage or "terminal",
                message=str(exc),
                code=exc.error_code,
                http_status=exc.http_status,
                meta={
                    "error_subcode": exc.error_subcode,
                    "exception_type": type(exc).__name__,
                },
            ),
        )
        raise
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        _upsert_meta_sync_state(
            db,
            ads_account_id,
            **_state_payload_for_error(
                stage="sync",
                message=str(exc),
                meta={"exception_type": type(exc).__name__},
            ),
        )
        raise
    finally:
        _release_sync_lock(db, ads_account_id)


def _sincronizar_conta_impl(
    ads_account_id: str,
    db: Session,
    on_progress=None,
    modo_sync: str = "recorrente",
) -> dict:
    conta: AdsAccount | None = db.get(AdsAccount, ads_account_id)
    if not conta:
        raise ValueError(f"AdsAccount {ads_account_id} não encontrada")

    if conta.sync_paused:
        return {"skipped": True, "reason": "sync pausado"}

    if conta.status != "ativo":
        return {"skipped": True, "reason": "conta inativa"}

    if not conta.bm_token:
        return {"skipped": True, "reason": "sem token"}

    if conta.token_expira_em and conta.token_expira_em < datetime.now(tz=timezone.utc):
        return {"skipped": True, "reason": "token expirado"}

    def _progress(etapa: str, pct: int) -> None:
        if on_progress:
            try:
                on_progress(etapa, pct)
            except Exception:
                pass

    token = conta.bm_token
    meta_account_id = conta.account_id  # e.g. "act_123456789"
    time_range = _janela_insights_para_conta(conta, modo_sync)

    totais: dict[str, int] = {
        "catalog_campanhas": 0,
        "catalog_conjuntos": 0,
        "catalog_anuncios": 0,
        "catalog_criativos": 0,
        "catalog_videos": 0,
        "catalog_videos_ignorados_permissao": 0,
        "diarios": 0,
        "campanhas": 0,
        "anuncios": 0,
        "publicos": 0,
        "publicos_campanhas_processadas": 0,
        "publicos_campanhas_puladas": 0,
    }

    with httpx.Client(timeout=60.0) as raw_client:
        client = MetaGraphClient(
            raw_client,
            context=MetaRequestContext(
                workspace_id=str(conta.workspace_id),
                ad_account_id=meta_account_id,
            ),
        )
        _progress("balance", 5)
        resp_saldo = client.get(
            f"{META_BASE}/{meta_account_id}",
            params={"access_token": token, "fields": "balance,amount_spent,spend_cap,currency,name"},
        )
        saldo_data: dict = {}
        if resp_saldo.status_code == 200:
            saldo_data = resp_saldo.json()
            conta.balance = float(saldo_data.get("balance", 0)) / 100
            conta.amount_spent = float(saldo_data.get("amount_spent", 0)) / 100
            conta.spend_cap = float(saldo_data.get("spend_cap", 0)) / 100
            nome_meta_atual = saldo_data.get("name")
            if nome_meta_atual:
                nome_meta_anterior = conta.meta_account_name or conta.account_name
                conta.meta_account_name = nome_meta_atual
                if not conta.account_name or (
                    nome_meta_anterior and conta.account_name == nome_meta_anterior
                ):
                    conta.account_name = nome_meta_atual
            conta.config = {
                **(conta.config or {}),
                "currency": saldo_data.get("currency"),
            }
        else:
            _levantar_se_meta_terminal(resp_saldo, f"saldo da conta {meta_account_id}")
            log.warning("Erro ao buscar saldo %s: %s", meta_account_id, resp_saldo.text[:200])

        try:
            resp_financeiro = client.get(
                f"{META_BASE}/{meta_account_id}",
                params={
                    "access_token": token,
                    "fields": "is_prepay_account,funding_source_details,business,account_status",
                },
            )
            if resp_financeiro.status_code == 200:
                financeiro_data = resp_financeiro.json()
                funding_details = financeiro_data.get("funding_source_details") or {}
                business = financeiro_data.get("business") or {}
                if not isinstance(funding_details, dict):
                    funding_details = {}
                if not isinstance(business, dict):
                    business = {}
                account_status = financeiro_data.get("account_status")
                if account_status is not None:
                    try:
                        conta.account_status = int(account_status)
                    except (TypeError, ValueError):
                        log.warning(
                            "Valor inválido de account_status recebido para %s: %r",
                            meta_account_id,
                            account_status,
                        )
                conta.config = {
                    **(conta.config or {}),
                    "is_prepay_account": financeiro_data.get("is_prepay_account"),
                    "funding_source_details": funding_details,
                    "funding_source_display": funding_details.get("display_string"),
                    "funding_source_type": funding_details.get("type"),
                    "funding_source_id": funding_details.get("id"),
                    "funding_source_brand": funding_details.get("brand"),
                    "bm_id": business.get("id"),
                    "bm_name": business.get("name"),
                }
            else:
                _levantar_se_meta_terminal(resp_financeiro, f"dados financeiros da conta {meta_account_id}")
                log.warning(
                    "Dados financeiros opcionais não atualizados %s: %s",
                    meta_account_id,
                    resp_financeiro.text[:200],
                )
        except Exception as exc:
            log.warning("Falha ao buscar dados financeiros opcionais %s: %s", meta_account_id, exc)

        db.commit()
        _progress("balance", 10)

        _progress("catalogo", 12)
        catalog_watermarks = _sync_catalogo(client, db, conta, meta_account_id, token, totais)
        _progress("catalogo", 25)

        _progress("diarios", 27)
        _sync_diarios(client, db, meta_account_id, token, time_range, totais)
        _progress("diarios", 35)

        _progress("campanhas", 37)
        _sync_campanhas(client, db, meta_account_id, token, time_range, conta.id, totais)
        _progress("campanhas", 55)

        _progress("anuncios", 57)
        _sync_anuncios(client, db, meta_account_id, token, time_range, conta.id, totais, on_progress=_progress)
        _progress("anuncios", 72)

        _progress("videos", 73)
        _sync_video_metrics(client, db, meta_account_id, token, time_range, conta.id)
        _progress("videos", 74)

        _progress("publicos", 74)
        _sync_publicos_demograficos(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_publicos_placement(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_publicos_device(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_publicos_hourly(client, db, meta_account_id, token, time_range, conta.id, totais)
        _sync_publicos_region(client, db, meta_account_id, token, time_range, conta.id, totais)
        _progress("publicos", 80)

        total_camp_rows = db.execute(text("""
            SELECT COUNT(DISTINCT campaign_id)
            FROM meta_campaigns_catalog
            WHERE ads_account_id = CAST(:uuid AS uuid)
              AND campaign_id IS NOT NULL
        """), {"uuid": str(conta.id)}).scalar() or 0
        if modo_sync == "backfill" and not settings.META_SYNC_PUBLICOS_CAMPANHA_BACKFILL:
            valid_camps = []
        else:
            valid_camps = _campanhas_publicos_relevantes(
                db,
                conta.id,
                limit=settings.META_SYNC_PUBLICOS_CAMPANHA_LIMIT,
            )
        totais["publicos_campanhas_processadas"] = len(valid_camps)
        totais["publicos_campanhas_puladas"] = max(int(total_camp_rows) - len(valid_camps), 0)
        for i, cid in enumerate(valid_camps):
            _sync_publicos_demograficos(client, db, meta_account_id, token, time_range, conta.id, totais, campaign_id=cid)
            _sync_publicos_placement(client, db, meta_account_id, token, time_range, conta.id, totais, campaign_id=cid)
            _sync_publicos_device(client, db, meta_account_id, token, time_range, conta.id, totais, campaign_id=cid)
            _sync_publicos_hourly(client, db, meta_account_id, token, time_range, conta.id, totais, campaign_id=cid)
            _sync_publicos_region(client, db, meta_account_id, token, time_range, conta.id, totais, campaign_id=cid)
            pct = 80 + int(15 * (i + 1) / max(len(valid_camps), 1))
            _progress("publicos_campanha", pct)

        log.info(
            "Sync públicos por campanha concluído: processadas=%d puladas=%d modo=%s",
            totais["publicos_campanhas_processadas"],
            totais["publicos_campanhas_puladas"],
            modo_sync,
        )
        _progress("finalizando", 98)

    conta.sincronizado_em = datetime.now(tz=timezone.utc)
    db.commit()
    log.info("Sync conta %s concluído: %s", meta_account_id, totais)
    return {
        "ok": True,
        "conta": meta_account_id,
        "totais": totais,
        "watermarks": {
            "catalog": {
                "campaigns_updated_time": _serializar_datetime(catalog_watermarks.get("campaigns_updated_time")),
                "adsets_updated_time": _serializar_datetime(catalog_watermarks.get("adsets_updated_time")),
                "ads_updated_time": _serializar_datetime(catalog_watermarks.get("ads_updated_time")),
            },
            "insights": json.loads(time_range),
        },
    }


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
    camp_statuses: dict[str, str] = {}
    camp_stop_times: dict[str, datetime | None] = {}
    try:
        camp_budget_rows = _paginar(
            client,
            f"{META_BASE}/{account_id}/campaigns",
            {
                "access_token": token,
                "fields": "id,daily_budget,lifetime_budget,effective_status,status,stop_time",
                "limit": 500,
            },
        )
        for cb in camp_budget_rows:
            raw = cb.get("daily_budget") or cb.get("lifetime_budget") or 0
            camp_orcamentos[cb["id"]] = int(raw) / 100
            camp_statuses[cb["id"]] = _normalizar_status_meta(
                cb.get("effective_status") or cb.get("status")
            )
            camp_stop_times[cb["id"]] = _parse_meta_datetime(cb.get("stop_time"))
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
        camp_status = camp_statuses.get(camp_id, "ACTIVE")
        stop_time = camp_stop_times.get(camp_id)
        if stop_time and stop_time < datetime.now(timezone.utc):
            camp_status = "PAUSED"

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
            "status": camp_status,
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
    db.execute(text("""
        UPDATE meta_campaigns_catalog c
        SET spend_total = s.spend_total
        FROM (
            SELECT ads_account_id, campaign_id, COALESCE(SUM(spend),0) AS spend_total
            FROM meta_campanhas_insights
            WHERE ads_account_id = CAST(:ads_account_id AS uuid)
            GROUP BY ads_account_id, campaign_id
        ) s
        WHERE c.ads_account_id = s.ads_account_id
          AND c.campaign_id = s.campaign_id
    """), {"ads_account_id": str(ads_account_uuid)})
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
    on_progress=None,
) -> None:
    def _progress(etapa: str, pct: int) -> None:
        if on_progress:
            try:
                on_progress(etapa, pct)
            except Exception:
                pass

    def _rollback_e_log(stage: str, exc: Exception) -> None:
        try:
            db.rollback()
        except Exception:
            pass
        log.warning("Falha em %s: %s", stage, exc)

    _progress("anuncios:insights", 57)
    rows = _paginar(
        client,
        f"{META_BASE}/{account_id}/insights",
        {
            "access_token": token,
            "fields": (
                "spend,impressions,reach,clicks,actions,cpm,cpc,ctr,frequency,"
                "ad_id,ad_name,adset_id,adset_name,campaign_id"
            ),
            "breakdowns": "publisher_platform",
            "level": "ad",
            "time_range": time_range,
            "time_increment": 1,
            "limit": 500,
        },
    )
    _progress(f"anuncios:insights ({len(rows)})", 58)

    ad_statuses: dict[str, str] = {}
    try:
        _progress("anuncios:status", 59)
        ads_status_rows = _paginar(
            client,
            f"{META_BASE}/{account_id}/ads",
            {
                "access_token": token,
                "fields": "id,effective_status,status",
                "limit": 500,
            },
        )
        for ar in ads_status_rows:
            aid = ar.get("id")
            if aid:
                ad_statuses[aid] = _normalizar_status_meta(
                    ar.get("effective_status") or ar.get("status")
                )
        _progress(f"anuncios:status ({len(ad_statuses)})", 60)
    except Exception as exc:
        _rollback_e_log("anuncios:status", exc)

    camp_statuses: dict[str, str] = {}
    camp_stop_times: dict[str, datetime | None] = {}
    try:
        _progress("anuncios:campaign_status", 61)
        camp_rows = _paginar(
            client,
            f"{META_BASE}/{account_id}/campaigns",
            {
                "access_token": token,
                "fields": "id,effective_status,status,stop_time",
                "limit": 500,
            },
        )
        for c in camp_rows:
            cid = c.get("id")
            if not cid:
                continue
            camp_statuses[cid] = _normalizar_status_meta(
                c.get("effective_status") or c.get("status")
            )
            camp_stop_times[cid] = _parse_meta_datetime(c.get("stop_time"))
        _progress(f"anuncios:campaign_status ({len(camp_statuses)})", 62)
    except Exception as exc:
        _rollback_e_log("anuncios:campaign_status", exc)

    adset_statuses: dict[str, str] = {}
    adset_end_times: dict[str, datetime | None] = {}
    try:
        _progress("anuncios:adset_status", 63)
        adset_rows = _paginar(
            client,
            f"{META_BASE}/{account_id}/adsets",
            {
                "access_token": token,
                "fields": "id,effective_status,status,end_time,campaign_id",
                "limit": 500,
            },
        )
        for a in adset_rows:
            aid = a.get("id")
            if not aid:
                continue
            adset_statuses[aid] = _normalizar_status_meta(
                a.get("effective_status") or a.get("status")
            )
            adset_end_times[aid] = _parse_meta_datetime(a.get("end_time"))
        _progress(f"anuncios:adset_status ({len(adset_statuses)})", 64)
    except Exception as exc:
        _rollback_e_log("anuncios:adset_status", exc)

    campaign_objectives: dict[str, str] = {}
    try:
        _progress("anuncios:objetivos_insights", 65)
        objetivo_rows = db.execute(text("""
            SELECT campaign_id, MAX(objetivo) AS objetivo
            FROM meta_campanhas_insights
            WHERE ads_account_id = CAST(:ads_account_id AS uuid)
            GROUP BY campaign_id
        """), {"ads_account_id": str(ads_account_uuid)}).mappings().all()
        for row in objetivo_rows:
            campaign_id = str(row.get("campaign_id") or "")
            objetivo = str(row.get("objetivo") or "").strip()
            if campaign_id and objetivo:
                campaign_objectives[campaign_id] = objetivo
        _progress(f"anuncios:objetivos_insights ({len(campaign_objectives)})", 66)
    except Exception as exc:
        _rollback_e_log("anuncios:objetivos_insights", exc)

    try:
        _progress("anuncios:objetivos_catalogo", 67)
        objetivo_rows = _carregar_objetivos_catalogo(db, ads_account_uuid)
        for row in objetivo_rows:
            campaign_id = str(row.get("campaign_id") or "")
            objetivo = str(row.get("objetivo") or "").strip()
            if campaign_id and objetivo and campaign_id not in campaign_objectives:
                campaign_objectives[campaign_id] = objetivo
        _progress(f"anuncios:objetivos_catalogo ({len(campaign_objectives)})", 68)
    except Exception as exc:
        _rollback_e_log("anuncios:objetivos_catalogo", exc)

    ad_ids = list({r["ad_id"] for r in rows if r.get("ad_id")})
    criativos = {}
    if ad_ids:
        result = db.execute(text("""
            SELECT DISTINCT ON (a.ad_id)
                a.ad_id,
                a.creative_id,
                c.thumbnail_url,
                c.tipo_criativo,
                c.image_url_hq,
                c.link_anuncio,
                c.carousel_items,
                c.video_id
            FROM meta_ads_catalog a
            LEFT JOIN meta_creatives_catalog c
                ON c.ads_account_id = a.ads_account_id
               AND c.creative_id = a.creative_id
            WHERE a.ads_account_id = CAST(:ads_account_id AS uuid)
              AND a.ad_id = ANY(:ad_ids)
            ORDER BY a.ad_id, c.last_seen_at DESC NULLS LAST, a.last_seen_at DESC
        """), {
            "ads_account_id": str(ads_account_uuid),
            "ad_ids": ad_ids,
        })
        if result is not None and hasattr(result, "mappings"):
            criativos_rows = result.mappings().all()
            criativos = {
                str(row.get("ad_id")): {
                    "id": row.get("creative_id"),
                    "thumbnail_url": row.get("thumbnail_url"),
                    "tipo": row.get("tipo_criativo") or "IMAGE",
                    "video_id": row.get("video_id"),
                    "image_url_hq": row.get("image_url_hq"),
                    "link_anuncio": row.get("link_anuncio"),
                    "carousel_items": row.get("carousel_items") or [],
                    "raw_creative": {},
                    "image_hashes": [],
                }
                for row in criativos_rows
                if row.get("ad_id")
            }
    _progress(f"anuncios:catalogo ({len(criativos)})", 69)

    # O sync por anúncio agora quebra publisher_platform em múltiplas linhas.
    # Limpamos o intervalo atual antes de persistir para evitar duplicar os dados
    # agregados de execuções anteriores com a nova granularidade.
    range_data = json.loads(time_range)
    since = str(range_data.get("since") or "")
    until = str(range_data.get("until") or "")
    if since and until:
        db.execute(text("""
            DELETE FROM meta_anuncios_insights
            WHERE ads_account_id = CAST(:ads_account_id AS uuid)
              AND data BETWEEN CAST(:since AS date) AND CAST(:until AS date)
        """), {
            "ads_account_id": str(ads_account_uuid),
            "since": since,
            "until": until,
        })

    total_rows = max(len(rows), 1)
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
        if creative_id and carousel_raw:
            n = _persist_carousel_cards_to_minio(client, creative_id, str(ads_account_uuid), carousel_raw)
            if n < len(carousel_raw):
                log.warning(
                    "Carrossel %s persistiu apenas %d/%d cards no MinIO",
                    creative_id,
                    n,
                    len(carousel_raw),
                )
        carousel_json = json.dumps(carousel_raw) if carousel_raw else None
        ad_status = ad_statuses.get(ad_id, "ACTIVE")
        campaign_id = r.get("campaign_id")
        adset_id = r.get("adset_id")
        camp_status = camp_statuses.get(campaign_id, "ACTIVE") if campaign_id else "ACTIVE"
        camp_stop = camp_stop_times.get(campaign_id) if campaign_id else None
        camp_objective = campaign_objectives.get(str(campaign_id or ""), "")
        adset_status = adset_statuses.get(adset_id, "ACTIVE") if adset_id else "ACTIVE"
        adset_end = adset_end_times.get(adset_id) if adset_id else None

        camp_not_delivering = (
            camp_status != "ACTIVE"
            or (camp_stop is not None and camp_stop < datetime.now(timezone.utc))
        )
        adset_not_delivering = (
            adset_status != "ACTIVE"
            or (adset_end is not None and adset_end < datetime.now(timezone.utc))
        )
        if ad_status == "ACTIVE":
            if camp_not_delivering:
                ad_status = "CAMPAIGN_PAUSED"
            elif adset_not_delivering:
                ad_status = "ADSET_PAUSED"
        spend = _safe_float(r.get("spend"))
        result_count, result_indicator = _extrair_resultado_anuncio(
            actions,
            camp_objective,
        )
        publisher_platform = str(r.get("publisher_platform") or "unknown").strip().lower() or "unknown"
        db.execute(text("""
            INSERT INTO meta_anuncios_insights
                (ads_account_id, ad_id, adset_id, adset_name, campaign_id, nome,
                 status, creative_id, thumbnail_url, tipo_criativo, image_url_hq,
                 link_anuncio, carousel_items, publisher_platform, data,
                 spend, leads, impressions, reach, clicks, link_click, result_count, result_indicator, ctr, cpc, cpm, frequencia)
            VALUES
                (:ads_account_id, :ad_id, :adset_id, :adset_name, :campaign_id, :nome,
                 :status, :creative_id, :thumbnail_url, :tipo_criativo, :image_url_hq,
                 :link_anuncio, CAST(:carousel_items AS JSONB), :publisher_platform, :data,
                 :spend, :leads, :impressions, :reach, :clicks, :link_click, :result_count, :result_indicator, :ctr, :cpc, :cpm, :frequencia)
            ON CONFLICT (ads_account_id, ad_id, data, publisher_platform) DO UPDATE SET
                adset_id      = EXCLUDED.adset_id,
                adset_name    = EXCLUDED.adset_name,
                campaign_id   = EXCLUDED.campaign_id,
                nome          = EXCLUDED.nome,
                status        = EXCLUDED.status,
                creative_id   = EXCLUDED.creative_id,
                thumbnail_url = EXCLUDED.thumbnail_url,
                tipo_criativo = EXCLUDED.tipo_criativo,
                -- Guarda anti-regressão: HQ sempre é URL do MinIO (/meta/storage/).
                -- Não trocar um HQ persistido por uma URL fbcdn crua (baixa qualidade).
                image_url_hq  = CASE
                    WHEN EXCLUDED.image_url_hq LIKE '%/meta/storage/%'
                         AND EXCLUDED.image_url_hq NOT LIKE '%/meta/storage-assinado%'
                        THEN EXCLUDED.image_url_hq
                    WHEN meta_anuncios_insights.image_url_hq LIKE '%/meta/storage/%'
                         AND meta_anuncios_insights.image_url_hq NOT LIKE '%/meta/storage-assinado%'
                        THEN meta_anuncios_insights.image_url_hq
                    WHEN EXCLUDED.image_url_hq NOT LIKE '%/meta/storage-assinado%'
                        THEN EXCLUDED.image_url_hq
                    ELSE NULL
                END,
                link_anuncio  = EXCLUDED.link_anuncio,
                carousel_items = EXCLUDED.carousel_items,
                publisher_platform = EXCLUDED.publisher_platform,
                spend         = EXCLUDED.spend,
                leads         = EXCLUDED.leads,
                impressions   = EXCLUDED.impressions,
                reach         = EXCLUDED.reach,
                clicks        = EXCLUDED.clicks,
                link_click    = EXCLUDED.link_click,
                result_count  = EXCLUDED.result_count,
                result_indicator = EXCLUDED.result_indicator,
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
            "publisher_platform": publisher_platform,
            "data": r.get("date_start"),
            "spend": spend,
            "leads": leads,
            "impressions": _safe_int(r.get("impressions")),
            "reach": _safe_int(r.get("reach")),
            "clicks": _safe_int(r.get("clicks")),
            "link_click": _extrair_link_click(actions),
            "result_count": result_count,
            "result_indicator": result_indicator,
            "ctr": _safe_float(r.get("ctr")),
            "cpc": _safe_float(r.get("cpc")),
            "cpm": _safe_float(r.get("cpm")),
            "frequencia": _safe_float(r.get("frequency")),
        })
        totais["anuncios"] += 1
        if totais["anuncios"] % 100 == 0 or totais["anuncios"] == total_rows:
            pct = 70 + int(2 * totais["anuncios"] / total_rows)
            _progress(f"anuncios:persistindo ({totais['anuncios']}/{len(rows)})", min(pct, 72))
    db.execute(text("""
        UPDATE meta_adsets_catalog a
        SET spend_total = s.spend_total
        FROM (
            SELECT ads_account_id, adset_id, COALESCE(SUM(spend),0) AS spend_total
            FROM meta_anuncios_insights
            WHERE ads_account_id = CAST(:ads_account_id AS uuid)
              AND adset_id IS NOT NULL
            GROUP BY ads_account_id, adset_id
        ) s
        WHERE a.ads_account_id = s.ads_account_id
          AND a.adset_id = s.adset_id
    """), {"ads_account_id": str(ads_account_uuid)})
    db.commit()
    _progress("anuncios:concluido", 72)


# ── sync públicos ──────────────────────────────────────────────────────────────

def _sync_publicos_demograficos(
    client: httpx.Client,
    db: Session,
    account_id: str,
    token: str,
    time_range: str,
    ads_account_uuid: Any,
    totais: dict,
    campaign_id: str = 'ALL',
) -> None:
    url_id = campaign_id if campaign_id != 'ALL' else account_id
    rows = _paginar(
        client,
        f"{META_BASE}/{url_id}/insights",
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
                (ads_account_id, data, breakdown_type, breakdown_value, campaign_id,
                 leads, spend, impressions, clicks, ctr, cpl)
            VALUES
                (:ads_account_id, :data, 'demographic', :breakdown_value, :campaign_id,
                 :leads, :spend, :impressions, :clicks, :ctr, :cpl)
            ON CONFLICT (ads_account_id, data, breakdown_type, breakdown_value, campaign_id) DO UPDATE SET
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
            "campaign_id": campaign_id,
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
    campaign_id: str = 'ALL',
) -> None:
    url_id = campaign_id if campaign_id != 'ALL' else account_id
    rows = _paginar(
        client,
        f"{META_BASE}/{url_id}/insights",
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
                (ads_account_id, data, breakdown_type, breakdown_value, campaign_id,
                 leads, spend, impressions, clicks, ctr, cpl)
            VALUES
                (:ads_account_id, :data, 'placement', :breakdown_value, :campaign_id,
                 :leads, :spend, :impressions, :clicks, :ctr, :cpl)
            ON CONFLICT (ads_account_id, data, breakdown_type, breakdown_value, campaign_id) DO UPDATE SET
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
            "campaign_id": campaign_id,
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
    campaign_id: str = 'ALL',
) -> None:
    url_id = campaign_id if campaign_id != 'ALL' else account_id
    rows = _paginar(
        client,
        f"{META_BASE}/{url_id}/insights",
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
                (ads_account_id, data, breakdown_type, breakdown_value, campaign_id,
                 leads, spend, impressions, clicks, ctr, cpl)
            VALUES
                (:ads_account_id, :data, 'device', :breakdown_value, :campaign_id,
                 :leads, :spend, :impressions, :clicks, :ctr, :cpl)
            ON CONFLICT (ads_account_id, data, breakdown_type, breakdown_value, campaign_id) DO UPDATE SET
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
            "campaign_id": campaign_id,
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
    campaign_id: str = 'ALL',
) -> None:
    from datetime import date as _date
    url_id = campaign_id if campaign_id != 'ALL' else account_id
    rows = _paginar(
        client,
        f"{META_BASE}/{url_id}/insights",
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
                (ads_account_id, data, breakdown_type, breakdown_value, campaign_id,
                 leads, spend, impressions, clicks, ctr, cpl)
            VALUES
                (:ads_account_id, :data, 'hourly', :breakdown_value, :campaign_id,
                 :leads, :spend, :impressions, :clicks, 0, :cpl)
            ON CONFLICT (ads_account_id, data, breakdown_type, breakdown_value, campaign_id) DO UPDATE SET
                leads       = EXCLUDED.leads,
                spend       = EXCLUDED.spend,
                impressions = EXCLUDED.impressions,
                clicks      = EXCLUDED.clicks,
                cpl         = EXCLUDED.cpl
        """), {
            "ads_account_id": str(ads_account_uuid),
            "data": date_str,
            "breakdown_value": breakdown_value,
            "campaign_id": campaign_id,
            "leads": leads,
            "spend": spend,
            "impressions": _safe_int(r.get("impressions")),
            "clicks": _safe_int(r.get("clicks")),
            "cpl": cpl,
        })
        totais["publicos"] += 1
    db.commit()

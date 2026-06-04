from __future__ import annotations

import base64
import hashlib
import mimetypes
import os
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services import evolution as evo_service
from app.services.object_storage import put_bytes, public_url
from app.services.redis_pub import publish_whatsapp_event

MEDIA_BUCKET = "whatsapp-media"
MAX_MEDIA_BYTES = 25 * 1024 * 1024
ALLOWED_MIME_PREFIXES = ("image/", "audio/", "video/")
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
}


@dataclass(frozen=True)
class StoredMedia:
    bucket: str
    object_key: str
    url: str
    mimetype: str
    size: int
    sha256: str
    filename: str
    media_type: str


def enqueue_inbound_media_download(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    raw_event_id: str | None,
    mensagem_id: str,
    conversa_id: str,
    instance_name: str,
    evolution_msg_id: str,
    message_type_raw: str,
    media_base64: str | None = None,
    media_url: str | None = None,
    media_mime_type: str | None = None,
    media_filename: str | None = None,
    media_caption: str | None = None,
    media_error: str | None = None,
    waha_session: str | None = None,
    waha_chat_id: str | None = None,
    waha_api_base_url: str | None = None,
    waha_api_key_ref: str | None = None,
) -> bool:
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_mensagens
            SET media_status = CASE
                    WHEN media_status = 'ready' THEN media_status
                    ELSE 'pending'
                END,
                media_error = CASE
                    WHEN media_status = 'ready' THEN media_error
                    ELSE NULL
                END,
                updated_at = NOW()
            WHERE id = CAST(:mensagem_id AS uuid)
        """),
        {"mensagem_id": mensagem_id},
    )
    row = db.execute(
        text("""
            INSERT INTO public.crm_message_jobs (
                workspace_id, canal_id, raw_event_id, related_message_id,
                job_type, status, priority, payload, created_at, updated_at
            )
            VALUES (
                CAST(:workspace_id AS uuid), CAST(:canal_id AS uuid), CAST(:raw_event_id AS uuid), CAST(:mensagem_id AS uuid),
                'media_download', 'pending', 5, CAST(:payload AS jsonb), NOW(), NOW()
            )
            ON CONFLICT (related_message_id) WHERE related_message_id IS NOT NULL AND job_type = 'media_download'
            DO UPDATE SET
                status = CASE WHEN public.crm_message_jobs.status = 'done' THEN public.crm_message_jobs.status ELSE 'pending' END,
                payload = EXCLUDED.payload,
                error_message = NULL,
                updated_at = NOW()
            RETURNING id
        """),
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "raw_event_id": raw_event_id,
            "mensagem_id": mensagem_id,
            "payload": _json_dumps(
                {
                    "instance_name": instance_name,
                    "evolution_msg_id": evolution_msg_id,
                    "mensagem_db_id": mensagem_id,
                    "conversa_db_id": conversa_id,
                    "message_type_raw": message_type_raw,
                    "media_base64": media_base64,
                    "media_url": media_url,
                    "media_mime_type": media_mime_type,
                    "media_filename": media_filename,
                    "caption": media_caption,
                    "media_error": media_error,
                    "waha_session": waha_session,
                    "waha_chat_id": waha_chat_id,
                    "waha_api_base_url": waha_api_base_url,
                    "waha_api_key_ref": waha_api_key_ref,
                }
            ),
        },
    ).fetchone()
    return row is not None


def process_media_download_job(db: Session, job: dict[str, Any]) -> None:
    payload = job.get("payload") if isinstance(job.get("payload"), dict) else {}
    workspace_id = str(job["workspace_id"])
    canal_id = str(job["canal_id"]) if job.get("canal_id") else None
    mensagem_id = str(job["related_message_id"] or payload.get("mensagem_db_id") or "")
    conversa_id = str(payload.get("conversa_db_id") or "")
    try:
        content, mimetype, filename = _load_inbound_media(payload)
        stored = store_media_bytes(
            workspace_id=workspace_id,
            conversa_id=conversa_id,
            mensagem_id=mensagem_id,
            content=content,
            mimetype=mimetype,
            filename=filename,
            message_type_raw=str(payload.get("message_type_raw") or ""),
        )
        register_media_record(
            db,
            workspace_id=workspace_id,
            canal_id=canal_id,
            conversa_id=conversa_id,
            mensagem_id=mensagem_id,
            stored=stored,
            caption=payload.get("caption"),
            storage_status="ready",
        )
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_mensagens
                SET media_status = 'ready',
                    media_error = NULL,
                    updated_at = NOW()
                WHERE id = CAST(:mensagem_id AS uuid)
            """),
            {"mensagem_id": mensagem_id},
        )
        db.commit()
        publish_whatsapp_event(
            {
                "type": "message.media.ready",
                "workspaceId": workspace_id,
                "conversaId": conversa_id,
                "mensagemId": mensagem_id,
                "url": stored.url,
                "mediaType": stored.media_type,
            }
        )
    except Exception as exc:
        attempts = int(job.get("attempts") or 0)
        max_attempts = int(job.get("max_attempts") or 5)
        final_attempt = attempts >= max_attempts
        next_status = "error" if final_attempt else "pending"
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_mensagens
                SET media_status = :media_status,
                    media_error = :error,
                    updated_at = NOW()
                WHERE id = CAST(:mensagem_id AS uuid)
            """),
            {
                "mensagem_id": mensagem_id,
                "media_status": next_status,
                "error": str(exc)[:4000],
            },
        )
        db.commit()
        if final_attempt:
            publish_whatsapp_event(
                {
                    "type": "message.media.error",
                    "workspaceId": workspace_id,
                    "conversaId": conversa_id,
                    "mensagemId": mensagem_id,
                    "error": str(exc)[:500],
                }
            )
        raise


def store_media_bytes(
    *,
    workspace_id: str,
    conversa_id: str,
    mensagem_id: str,
    content: bytes,
    mimetype: str,
    filename: str | None,
    message_type_raw: str = "",
) -> StoredMedia:
    validate_media(content, mimetype)
    media_type = infer_media_type(mimetype, message_type_raw, filename or "")
    ext = os.path.splitext(filename or "")[1] or mimetypes.guess_extension(mimetype) or ".bin"
    safe_filename = _safe_filename(filename or f"{mensagem_id}{ext}")
    object_key = f"whatsapp/{workspace_id}/{conversa_id}/{mensagem_id}{ext}"
    put_bytes(MEDIA_BUCKET, object_key, content, mimetype)
    digest = hashlib.sha256(content).hexdigest()
    return StoredMedia(
        bucket=MEDIA_BUCKET,
        object_key=object_key,
        url=public_url(MEDIA_BUCKET, object_key),
        mimetype=mimetype,
        size=len(content),
        sha256=digest,
        filename=safe_filename,
        media_type=media_type,
    )


def register_media_record(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str | None,
    conversa_id: str,
    mensagem_id: str,
    stored: StoredMedia,
    caption: str | None = None,
    storage_status: str = "ready",
) -> None:
    db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_midia (
                workspace_id, canal_id, conversa_id, mensagem_id, tipo,
                minio_path, url_publica, mimetype, tamanho, filename, caption,
                storage_status, sha256, created_at, updated_at
            )
            VALUES (
                CAST(:workspace_id AS uuid), CAST(:canal_id AS uuid), CAST(:conversa_id AS uuid), CAST(:mensagem_id AS uuid), :tipo,
                :path, :url, :mime, :size, :filename, :caption,
                :storage_status, :sha256, NOW(), NOW()
            )
            ON CONFLICT DO NOTHING
        """),
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "conversa_id": conversa_id,
            "mensagem_id": mensagem_id,
            "tipo": stored.media_type,
            "path": stored.object_key,
            "url": stored.url,
            "mime": stored.mimetype,
            "size": stored.size,
            "filename": stored.filename,
            "caption": caption,
            "storage_status": storage_status,
            "sha256": stored.sha256,
        },
    )


def validate_media(content: bytes, mimetype: str) -> None:
    if not content:
        raise ValueError("Arquivo vazio")
    if len(content) > MAX_MEDIA_BYTES:
        raise ValueError("Arquivo excede o limite de 25 MB")
    if not (
        mimetype in ALLOWED_MIME_TYPES
        or any(str(mimetype or "").startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES)
    ):
        raise ValueError(f"Tipo de arquivo não permitido: {mimetype}")


def infer_media_type(mimetype: str, message_type_raw: str = "", filename: str = "") -> str:
    raw = str(message_type_raw or "").lower()

    # Sticker explícito vence mimetype (image/webp via stickerMessage → sticker)
    if "sticker" in raw:
        return "sticker"

    mt = str(mimetype or "").lower()
    if mt.startswith("image/"):
        return "image"   # image/webp aqui é image (sticker checado acima)
    if mt.startswith("audio/"):
        return "audio"
    if mt.startswith("video/"):
        return "video"
    if mt == "application/pdf":
        return "document"

    # Fallback por message_type
    if "image" in raw:
        return "image"
    if "video" in raw or "ptv" in raw:
        return "video"
    if "audio" in raw or "ptt" in raw:
        return "audio"

    # Fallback por extensão
    if filename:
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        _EXT: dict[str, str] = {
            "jpg": "image", "jpeg": "image", "png": "image",
            "webp": "image", "gif": "image",
            "mp3": "audio", "ogg": "audio", "opus": "audio",
            "wav": "audio", "m4a": "audio",
            "mp4": "video", "mov": "video",
            "pdf": "document", "doc": "document", "docx": "document",
            "xls": "document", "xlsx": "document", "csv": "document", "txt": "document",
        }
        if ext in _EXT:
            return _EXT[ext]

    return "document"


def _load_inbound_media(payload: dict[str, Any]) -> tuple[bytes, str, str]:
    mimetype = str(payload.get("media_mime_type") or "application/octet-stream")
    filename = str(payload.get("media_filename") or payload.get("evolution_msg_id") or "media")
    media_base64 = payload.get("media_base64")
    media_url = payload.get("media_url")
    if media_base64:
        raw_b64 = media_base64.split(",", 1)[1] if isinstance(media_base64, str) and media_base64.startswith("data:") and "," in media_base64 else media_base64
        return base64.b64decode(raw_b64), mimetype, filename
    waha_api_key_ref = payload.get("waha_api_key_ref")
    if media_url and waha_api_key_ref:
        from app.services import waha_service
        waha_cfg = {
            "api_base_url": payload.get("waha_api_base_url") or "http://waha:3000",
            "api_key_ref":  waha_api_key_ref,
        }
        content, content_type = waha_service.baixar_midia(
            _normalize_waha_download_url(str(media_url), waha_cfg["api_base_url"]),
            waha_cfg,
        )
        return content, _prefer_specific_mimetype(content_type, mimetype), filename
    if media_url:
        with httpx.Client(timeout=60, follow_redirects=True) as client:
            resp = client.get(str(media_url))
            resp.raise_for_status()
            response_ct = (resp.headers.get("content-type") or "").split(";", 1)[0].strip()
            return resp.content, _prefer_specific_mimetype(response_ct, mimetype), filename

    waha_api_key_ref = payload.get("waha_api_key_ref")
    waha_session = str(payload.get("waha_session") or "")
    if waha_api_key_ref and waha_session:
        from app.services import waha_service

        waha_cfg = {
            "api_base_url": payload.get("waha_api_base_url") or "http://waha:3000",
            "api_key_ref": waha_api_key_ref,
        }
        refreshed = _fetch_waha_message_with_media(
            waha_service=waha_service,
            session=waha_session,
            cfg=waha_cfg,
            chat_id=str(payload.get("waha_chat_id") or "all"),
            message_id=str(payload.get("evolution_msg_id") or ""),
        )
        refreshed_media = _extract_waha_media_info(refreshed)
        refreshed_url = str(refreshed_media.get("url") or "")
        if refreshed_media.get("mimetype"):
            mimetype = str(refreshed_media["mimetype"])
        if refreshed_media.get("filename"):
            filename = str(refreshed_media["filename"])
        if refreshed_url:
            content, content_type = waha_service.baixar_midia(
                _normalize_waha_download_url(refreshed_url, waha_cfg["api_base_url"]),
                waha_cfg,
            )
            return content, _prefer_specific_mimetype(content_type, mimetype), filename
        provider_error = refreshed_media.get("error") or payload.get("media_error")
        if provider_error:
            raise ValueError(f"Mídia WAHA sem URL após retry: {provider_error}")
        raise ValueError("Mídia WAHA sem URL após retry por ID")

    instance_name = str(payload.get("instance_name") or "")
    evolution_msg_id = str(payload.get("evolution_msg_id") or "")
    info = evo_service.baixar_midia(instance_name, evolution_msg_id)
    if not info.get("found"):
        raise ValueError("Mídia não encontrada na Evolution")
    b64_data = info.get("base64")
    if not b64_data:
        raise ValueError("Base64 de mídia vazio")
    raw_b64 = b64_data.split(",", 1)[1] if isinstance(b64_data, str) and b64_data.startswith("data:") and "," in b64_data else b64_data
    return base64.b64decode(raw_b64), info.get("mimetype") or mimetype, filename


def _fetch_waha_message_with_media(
    *,
    waha_service: Any,
    session: str,
    cfg: dict[str, Any],
    chat_id: str,
    message_id: str,
) -> dict[str, Any]:
    if not message_id:
        raise ValueError("Mensagem WAHA sem ID para retry de mídia")
    try:
        return waha_service.buscar_mensagem(
            session,
            cfg,
            chat_id=chat_id or "all",
            message_id=message_id,
            download_media=True,
        )
    except Exception:
        if chat_id and chat_id != "all":
            return waha_service.buscar_mensagem(
                session,
                cfg,
                chat_id="all",
                message_id=message_id,
                download_media=True,
            )
        raise


def _extract_waha_media_info(message: dict[str, Any]) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []

    def add(value: Any) -> None:
        if isinstance(value, dict):
            candidates.append(value)

    add(message.get("media"))
    payload = message.get("payload")
    if isinstance(payload, dict):
        add(payload.get("media"))
    data = message.get("_data")
    if isinstance(data, dict):
        add(data.get("media"))
        raw_message = data.get("message")
        if isinstance(raw_message, dict):
            for node in raw_message.values():
                add(node)
    raw_message = message.get("message")
    if isinstance(raw_message, dict):
        for node in raw_message.values():
            add(node)

    for candidate in candidates:
        if any(candidate.get(key) for key in ("url", "mimetype", "mimeType", "filename", "fileName", "error")):
            return {
                "url": candidate.get("url") or candidate.get("mediaUrl") or candidate.get("downloadUrl"),
                "mimetype": candidate.get("mimetype") or candidate.get("mimeType") or candidate.get("contentType"),
                "filename": candidate.get("filename") or candidate.get("fileName") or candidate.get("name"),
                "error": candidate.get("error") or candidate.get("mediaError"),
            }
    return {}


def _normalize_waha_download_url(url: str, base_url: str) -> str:
    from urllib.parse import urlparse, urlunparse

    parsed = urlparse(url)
    if parsed.hostname not in {"localhost", "127.0.0.1"}:
        return url
    base = urlparse(base_url)
    return urlunparse(parsed._replace(scheme=base.scheme, netloc=base.netloc))


_GENERIC_CONTENT_TYPES = {"application/octet-stream", "binary/octet-stream"}


def _prefer_specific_mimetype(response_ct: str | None, payload_mime: str | None) -> str:
    """Return payload_mime when response Content-Type is generic or absent."""
    ct = (response_ct or "").split(";", 1)[0].strip()
    if ct and ct.lower() not in _GENERIC_CONTENT_TYPES:
        return ct
    return payload_mime or "application/octet-stream"


def _safe_filename(filename: str) -> str:
    return os.path.basename(filename).replace("\x00", "")[:255] or "media.bin"


def _json_dumps(payload: dict[str, Any]) -> str:
    import json

    return json.dumps(payload, default=str)

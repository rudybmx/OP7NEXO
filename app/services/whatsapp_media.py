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
    waha_session: str | None = None,
    waha_api_base_url: str | None = None,
    waha_api_key_ref: str | None = None,
) -> bool:
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_mensagens
            SET media_status = 'pending',
                media_error = NULL,
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
                    "waha_session": waha_session,
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
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_mensagens
                SET media_status = 'error',
                    media_error = :error,
                    updated_at = NOW()
                WHERE id = CAST(:mensagem_id AS uuid)
            """),
            {"mensagem_id": mensagem_id, "error": str(exc)[:4000]},
        )
        db.commit()
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
    media_type = infer_media_type(mimetype, message_type_raw)
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


def infer_media_type(mimetype: str, message_type_raw: str = "") -> str:
    raw = str(message_type_raw or "").lower()
    if "image" in raw or mimetype.startswith("image/"):
        return "image"
    if "video" in raw or "ptv" in raw or mimetype.startswith("video/"):
        return "video"
    if "audio" in raw or mimetype.startswith("audio/"):
        return "audio"
    if "sticker" in raw:
        return "sticker"
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
        content, content_type = waha_service.baixar_midia(str(media_url), waha_cfg)
        return content, _prefer_specific_mimetype(content_type, mimetype), filename
    if media_url:
        with httpx.Client(timeout=60, follow_redirects=True) as client:
            resp = client.get(str(media_url))
            resp.raise_for_status()
            response_ct = (resp.headers.get("content-type") or "").split(";", 1)[0].strip()
            return resp.content, _prefer_specific_mimetype(response_ct, mimetype), filename

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

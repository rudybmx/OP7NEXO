"""Jobs de enriquecimento de avatar de contatos e grupos via WAHA."""

from __future__ import annotations

import base64
import json
import logging
import mimetypes
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services import waha_service
from app.services.object_storage import download_and_put, public_url, put_bytes
from app.services.waha_service import WahaError

logger = logging.getLogger(__name__)

CONTACT_AVATAR_JOB_TYPE = "contact_avatar_enrichment"
GROUP_ENRICHMENT_JOB_TYPE = "group_enrichment"
LID_PHONE_ENRICHMENT_JOB_TYPE = "lid_phone_enrichment"
AVATAR_TTL_DAYS = 7
# Quando o fetch NÃO achou foto (sem foto pública, privacidade, store ainda não
# populado), usamos um TTL curto para re-tentar em horas em vez de travar 7 dias.
# Evita que um backfill envenene o contato por uma semana — ver causa-raiz #2.
AVATAR_NULL_TTL_HOURS = 24
WAHA_STORE_DISABLED_MSG = "Enable NOWEB store"


def _avatar_ttl_blocks(fetched_at: datetime | None, *, has_photo: bool) -> bool:
    """True se ainda estamos dentro do TTL — não se deve re-buscar agora.

    has_photo=True  → TTL longo (AVATAR_TTL_DAYS): já temos a foto.
    has_photo=False → TTL curto (AVATAR_NULL_TTL_HOURS): re-tentar em horas.
    """
    if fetched_at is None:
        return False
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    window = timedelta(days=AVATAR_TTL_DAYS) if has_photo else timedelta(hours=AVATAR_NULL_TTL_HOURS)
    return (datetime.now(timezone.utc) - fetched_at) < window


def _store_sessions() -> frozenset[str]:
    """Sessões com NOWEB Store ativo (allowlist via env WAHA_STORE_SESSIONS)."""
    raw = os.environ.get("WAHA_STORE_SESSIONS", "")
    return frozenset(s.strip() for s in raw.split(",") if s.strip())


AVATAR_BUCKET = "whatsapp-avatars"


def rehost_avatar(jid: str, foto_info: Any, *, key_prefix: str = "contacts", default_mime: str = "image/jpeg") -> str | None:
    """Baixa os bytes do avatar e re-hospeda no MinIO (bucket whatsapp-avatars),
    devolvendo uma URL persistente (`/meta/storage/...`).

    Os provedores (Evolution/WAHA) devolvem URLs cruas do CDN do WhatsApp
    (`pps.whatsapp.net`) que **expiram** (HTTP 403) — gravar a URL crua faz a
    imagem sumir no front. Re-hospedar resolve isso.

    Aceita `foto_info` como dict ({url|base64|mime_type}) ou str (url|base64).
    - Retorna `None` quando NÃO há dado de imagem utilizável (ex.: sem foto).
    - **Levanta exceção** quando há dado mas o download/upload falha (transitório),
      para o job poder re-tentar com uma URL fresca em vez de envenenar o TTL.
    """
    if not foto_info:
        return None

    safe_jid = str(jid).replace("@", "_").replace(".", "_")

    avatar_url: str | None = None
    avatar_b64: str | None = None
    avatar_mime = default_mime

    if isinstance(foto_info, dict):
        avatar_url = foto_info.get("url") or None
        avatar_b64 = foto_info.get("base64") or None
        avatar_mime = foto_info.get("mime_type") or foto_info.get("mimetype") or default_mime
    elif isinstance(foto_info, str):
        if foto_info.startswith("http"):
            avatar_url = foto_info
        else:
            avatar_b64 = foto_info

    if not (avatar_url or avatar_b64):
        return None  # sem foto utilizável — definitivo, não é falha

    if avatar_b64:
        raw_b64 = (
            avatar_b64.split(",", 1)[1]
            if avatar_b64.startswith("data:") and "," in avatar_b64
            else avatar_b64
        )
        avatar_bytes = base64.b64decode(raw_b64)
        ext = mimetypes.guess_extension(avatar_mime) or ".jpg"
        object_key = f"{key_prefix}/{safe_jid}{ext}"
        put_bytes(AVATAR_BUCKET, object_key, avatar_bytes, avatar_mime)
        return public_url(AVATAR_BUCKET, object_key)

    # avatar_url presente: baixa do CDN e re-hospeda
    rehosted = download_and_put(AVATAR_BUCKET, f"{key_prefix}/{safe_jid}.jpg", avatar_url, avatar_mime)
    if rehosted is None:
        # tínhamos URL mas o download/upload falhou → transitório, re-tentar
        raise RuntimeError(f"rehost_avatar: download_and_put falhou jid={jid}")
    return rehosted


# ---------------------------------------------------------------------------
# Enqueue helpers
# ---------------------------------------------------------------------------


def enqueue_contact_avatar_enrichment(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    contact_id: str,
    jid: str,
    instance: str,
) -> bool:
    """Enfileira busca de avatar para um contato, com dedup e verificação de TTL.

    Não insere job se:
    - avatar_fetched_at já está dentro do TTL (7 dias), OU
    - já existe job pending/running para este contato.
    """
    # instance é apenas fallback legado no payload — o job deriva session/instance do
    # canal_id. Não exigir instance permite o backfill (que passa instance="").
    if not (workspace_id and canal_id and contact_id and jid):
        return False

    try:
        # Verificar TTL no contato antes de criar job
        row = db.execute(
            text("""
                SELECT avatar_fetched_at, avatar_url
                FROM public.crm_whatsapp_contatos
                WHERE id = CAST(:cid AS uuid)
                  AND workspace_id = CAST(:ws AS uuid)
            """),
            {"cid": contact_id, "ws": workspace_id},
        ).mappings().first()

        if row and _avatar_ttl_blocks(row["avatar_fetched_at"], has_photo=bool(row["avatar_url"])):
            return False  # Avatar recente (ou sem foto re-tentado há pouco)

        # Dedup: job pending/running recente para este contato
        existing = db.execute(
            text("""
                SELECT 1 FROM public.crm_message_jobs
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND job_type = :job_type
                  AND status IN ('pending', 'running')
                  AND payload->>'contact_id' = :contact_id
                  AND created_at >= NOW() - INTERVAL '7 days'
                LIMIT 1
            """),
            {"ws": workspace_id, "job_type": CONTACT_AVATAR_JOB_TYPE, "contact_id": contact_id},
        ).fetchone()
        if existing:
            return False

        payload_json = json.dumps(
            {"contact_id": contact_id, "jid": jid, "instance": instance, "canal_id": canal_id},
            separators=(",", ":"),
        )
        db.execute(
            text("""
                INSERT INTO public.crm_message_jobs (
                    workspace_id, canal_id, raw_event_id, related_message_id,
                    job_type, status, priority, payload, created_at, updated_at, next_run_at
                ) VALUES (
                    CAST(:ws AS uuid), CAST(:canal AS uuid), NULL, NULL,
                    :job_type, 'pending', 1, CAST(:payload AS jsonb), NOW(), NOW(), NOW()
                )
            """),
            {
                "ws": workspace_id,
                "canal": canal_id,
                "job_type": CONTACT_AVATAR_JOB_TYPE,
                "payload": payload_json,
            },
        )
        return True
    except Exception:
        logger.exception(
            "[avatar-enqueue] falha ao enfileirar workspace=%s", str(workspace_id)[:8]
        )
        return False


def backfill_contact_avatar_enrichment(
    db: Session,
    *,
    workspace_id: str,
    limit: int = 200,
) -> int:
    """Enfileira jobs de avatar para contatos sem avatar_fetched_at (backfill).

    Retorna o número de jobs enfileirados.
    """
    rows = db.execute(
        text("""
            SELECT c.id, c.jid, cv.canal_id
            FROM public.crm_whatsapp_contatos c
            JOIN public.crm_whatsapp_conversas cv
              ON cv.workspace_id = c.workspace_id
             AND cv.remote_jid = c.jid
             AND cv.ativo = true
            WHERE c.workspace_id = CAST(:ws AS uuid)
              AND c.ativo = true
              AND c.avatar_fetched_at IS NULL
              AND c.jid NOT LIKE '%@newsletter'
              AND c.jid NOT LIKE '%@broadcast'
            GROUP BY c.id, c.jid, cv.canal_id
            LIMIT :limit
        """),
        {"ws": workspace_id, "limit": limit},
    ).fetchall()

    enqueued = 0
    for row in rows:
        contact_id = str(row[0])
        jid = str(row[1])
        canal_id = str(row[2])
        try:
            ok = enqueue_contact_avatar_enrichment(
                db,
                workspace_id=workspace_id,
                canal_id=canal_id,
                contact_id=contact_id,
                jid=jid,
                instance="",
            )
            if ok:
                enqueued += 1
        except Exception:
            logger.exception("[avatar-backfill] erro ao enfileirar contact_id=%s", contact_id)
    return enqueued


def backfill_group_enrichment(
    db: Session,
    *,
    workspace_id: str,
    limit: int = 200,
) -> int:
    """Enfileira jobs de enriquecimento (nome+avatar) para grupos sem
    group_avatar_fetched_at (backfill). Retorna o número de jobs enfileirados."""
    rows = db.execute(
        text("""
            SELECT id, remote_jid, canal_id
            FROM public.crm_whatsapp_conversas
            WHERE workspace_id = CAST(:ws AS uuid)
              AND ativo = true
              AND is_group = true
              AND group_avatar_fetched_at IS NULL
            LIMIT :limit
        """),
        {"ws": workspace_id, "limit": limit},
    ).fetchall()

    enqueued = 0
    for row in rows:
        conversa_id = str(row[0])
        group_jid = str(row[1])
        canal_id = str(row[2])
        try:
            ok = enqueue_group_enrichment(
                db,
                workspace_id=workspace_id,
                canal_id=canal_id,
                conversa_id=conversa_id,
                group_jid=group_jid,
                instance="",
            )
            if ok:
                enqueued += 1
        except Exception:
            logger.exception("[group-backfill] erro ao enfileirar conversa_id=%s", conversa_id)
    return enqueued


def enqueue_group_enrichment(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    conversa_id: str,
    group_jid: str,
    instance: str,
) -> bool:
    """Enfileira busca de nome e avatar de grupo, com dedup e verificação de TTL.

    Usa TTL (group_avatar_fetched_at) em vez de presença de URL: quando o provider
    devolve o nome do grupo mas NÃO a foto (pictureUrl=None), o guard antigo
    (group_name AND group_avatar_url) nunca era satisfeito → re-enfileirava a cada
    mensagem para sempre (busy-loop). Com TTL, re-tenta no máximo a cada 7 dias e
    permite re-hospedar URLs pps cruas que expiram.
    """
    # instance é só fallback legado — o job deriva session/instance do canal_id.
    if not (workspace_id and canal_id and conversa_id and group_jid):
        return False

    try:
        # Não inserir job se o avatar do grupo foi buscado dentro do TTL (7 dias)
        row = db.execute(
            text("""
                SELECT group_avatar_fetched_at, group_avatar_url
                FROM public.crm_whatsapp_conversas
                WHERE id = CAST(:conv_id AS uuid)
                  AND workspace_id = CAST(:ws AS uuid)
            """),
            {"conv_id": conversa_id, "ws": workspace_id},
        ).mappings().first()

        if row and _avatar_ttl_blocks(row["group_avatar_fetched_at"], has_photo=bool(row["group_avatar_url"])):
            return False  # Buscado recentemente (ou sem foto re-tentado há pouco)

        # Dedup: job pending/running recente para esta conversa
        existing = db.execute(
            text("""
                SELECT 1 FROM public.crm_message_jobs
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND job_type = :job_type
                  AND status IN ('pending', 'running')
                  AND payload->>'conversa_id' = :conversa_id
                  AND created_at >= NOW() - INTERVAL '7 days'
                LIMIT 1
            """),
            {"ws": workspace_id, "job_type": GROUP_ENRICHMENT_JOB_TYPE, "conversa_id": conversa_id},
        ).fetchone()
        if existing:
            return False

        payload_json = json.dumps(
            {
                "conversa_id": conversa_id,
                "group_jid": group_jid,
                "instance": instance,
                "canal_id": canal_id,
            },
            separators=(",", ":"),
        )
        db.execute(
            text("""
                INSERT INTO public.crm_message_jobs (
                    workspace_id, canal_id, raw_event_id, related_message_id,
                    job_type, status, priority, payload, created_at, updated_at, next_run_at
                ) VALUES (
                    CAST(:ws AS uuid), CAST(:canal AS uuid), NULL, NULL,
                    :job_type, 'pending', 1, CAST(:payload AS jsonb), NOW(), NOW(), NOW()
                )
            """),
            {
                "ws": workspace_id,
                "canal": canal_id,
                "job_type": GROUP_ENRICHMENT_JOB_TYPE,
                "payload": payload_json,
            },
        )
        return True
    except Exception:
        logger.exception(
            "[group-enqueue] falha ao enfileirar workspace=%s", str(workspace_id)[:8]
        )
        return False


# ---------------------------------------------------------------------------
# Process helpers
# ---------------------------------------------------------------------------


def _jid_type(jid: str) -> str:
    if "@lid" in jid:
        return "lid"
    if "@g.us" in jid:
        return "group"
    if "@newsletter" in jid:
        return "newsletter"
    if "@broadcast" in jid:
        return "broadcast"
    return "individual"


def _load_canal_cfg(db: Session, *, workspace_id: str, canal_id: str) -> dict[str, Any] | None:
    """Retorna o sub-dict 'waha' do config do canal, que é o esperado por _headers() em waha_service.

    Para canais Evolution (sem config WAHA), injeta 'evolution_instance' no dict retornado
    para permitir fallback via Evolution API em process_contact_avatar_enrichment_job.
    """
    row = db.execute(
        text("""
            SELECT config, tipo, evolution_instance_id FROM public.canais_entrada
            WHERE id = CAST(:canal_id AS uuid)
              AND workspace_id = CAST(:ws AS uuid)
        """),
        {"canal_id": canal_id, "ws": workspace_id},
    ).mappings().first()
    if not row:
        return None
    full_cfg = row["config"] or {}
    waha_cfg = dict(full_cfg.get("waha", {}))
    # Injeta metadados do canal para uso por fallbacks não-WAHA
    waha_cfg["_canal_tipo"] = str(row["tipo"] or "")
    waha_cfg["_evolution_instance"] = str(row["evolution_instance_id"] or "")
    evo_cfg = full_cfg.get("evolution") or {}
    waha_cfg["_evolution_instance_token"] = str(evo_cfg.get("instance_token") or "")
    return waha_cfg


def process_contact_avatar_enrichment_job(db: Session, job: dict[str, Any]) -> dict[str, Any]:
    payload = job.get("job_payload") or job.get("payload") or {}
    workspace_id = str(job.get("workspace_id") or "")
    contact_id = str(payload.get("contact_id") or "")
    jid = str(payload.get("jid") or "")
    canal_id = str(payload.get("canal_id") or "")

    if not (workspace_id and contact_id and jid and canal_id):
        raise RuntimeError("Job contact_avatar_enrichment incompleto")

    jt = _jid_type(jid)

    # Newsletter/broadcast não têm foto de perfil de usuário — buscar trava o
    # evolution-go (15s) e monopoliza o worker. Pular cedo (marca fetched p/ não repetir).
    if jt in ("newsletter", "broadcast"):
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_contatos
                SET avatar_fetched_at = NOW(), updated_at = NOW()
                WHERE id = CAST(:cid AS uuid) AND workspace_id = CAST(:ws AS uuid)
            """),
            {"cid": contact_id, "ws": workspace_id},
        )
        db.commit()
        return {"status": "skipped"}

    # Verificar TTL: se já buscou recentemente, skip
    row = db.execute(
        text("""
            SELECT avatar_fetched_at, avatar_url FROM public.crm_whatsapp_contatos
            WHERE id = CAST(:cid AS uuid) AND workspace_id = CAST(:ws AS uuid)
        """),
        {"cid": contact_id, "ws": workspace_id},
    ).mappings().first()

    if row and _avatar_ttl_blocks(row["avatar_fetched_at"], has_photo=bool(row["avatar_url"])):
        return {"status": "skipped"}

    cfg = _load_canal_cfg(db, workspace_id=workspace_id, canal_id=canal_id)
    if cfg is None:
        raise RuntimeError(f"Canal não encontrado workspace={str(workspace_id)[:8]}")

    canal_tipo = cfg.get("_canal_tipo", "")
    evolution_instance = cfg.get("_evolution_instance", "") or str(payload.get("instance") or "")
    is_waha_canal = bool(cfg.get("api_base_url"))

    url: str | None = None

    if is_waha_canal:
        # Sessão WAHA vem do config do canal; payload['instance'] é fallback legado
        session = cfg.get("session") or str(payload.get("instance") or "")
        if not session:
            raise RuntimeError(f"Sessão WAHA não encontrada workspace={str(workspace_id)[:8]}")

        try:
            waha_url = waha_service.buscar_avatar_chat(session, jid, cfg, timeout=5.0)
            # WAHA devolve a URL crua do pps.whatsapp.net (expira) — re-hospeda.
            url = rehost_avatar(jid, waha_url)
        except WahaError as exc:
            err_str = str(exc)
            if WAHA_STORE_DISABLED_MSG in err_str:
                # Falha permanente para @lid sem store — marcar fetched_at e não tentar mais
                logger.warning(
                    "[avatar-enrich] store_disabled jid_type=%s session=%s workspace=%s",
                    jt, session, str(workspace_id)[:8],
                )
                db.execute(
                    text("""
                        UPDATE public.crm_whatsapp_contatos
                        SET avatar_fetched_at = NOW(), updated_at = NOW()
                        WHERE id = CAST(:cid AS uuid) AND workspace_id = CAST(:ws AS uuid)
                    """),
                    {"cid": contact_id, "ws": workspace_id},
                )
                db.commit()
                return {"status": "skipped"}

            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            logger.warning(
                "[avatar-enrich] falha jid_type=%s session=%s workspace=%s status=%s",
                jt, session, str(workspace_id)[:8],
                status_code or type(exc).__name__,
            )
            raise

    elif canal_tipo == "whatsapp_evolution" and jt == "individual" and evolution_instance:
        # Fallback para canais Evolution API (sem WAHA): usa evo_service.
        # raise_on_transient=True faz timeout/401/5xx levantarem exceção → o job
        # re-tenta (attempts/max_attempts) sem gravar avatar_fetched_at, em vez de
        # envenenar o contato por 7 dias. 404 ("sem foto") continua retornando None.
        evolution_instance_token = cfg.get("_evolution_instance_token", "")
        from app.services import evolution as evo_service
        foto_info = evo_service.buscar_foto_perfil(
            evolution_instance, jid, token=evolution_instance_token or None, raise_on_transient=True
        )
        # Re-hospeda no MinIO (trata url E base64); URL crua do pps.whatsapp.net expira.
        url = rehost_avatar(jid, foto_info)
        logger.info(
            "[avatar-enrich] evolution_fallback jid=%s instance=%s workspace=%s has_url=%s",
            jid, evolution_instance, str(workspace_id)[:8], url is not None,
        )

    else:
        # Canal sem suporte WAHA nem Evolution para este JID — skip silencioso
        logger.info(
            "[avatar-enrich] skip (sem suporte) jid_type=%s canal_tipo=%s workspace=%s",
            jt, canal_tipo, str(workspace_id)[:8],
        )
        return {"status": "skipped"}

    # `url` já é a URL re-hospedada (/meta/storage/...) ou None (sem foto).
    # Quando None, NÃO preservar uma URL crua/efêmera (pps/fbcdn/fbsbx) legada —
    # ela expira -> 403 no browser. Limpa para NULL (front mostra iniciais);
    # um avatar same-origin anterior é mantido.
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_contatos
            SET avatar_url = CASE
                    WHEN :url IS NOT NULL THEN :url
                    WHEN avatar_url LIKE '%whatsapp.net%'
                      OR avatar_url LIKE '%fbcdn%'
                      OR avatar_url LIKE '%fbsbx%' THEN NULL
                    ELSE avatar_url
                END,
                avatar_fetched_at = NOW(),
                updated_at = NOW()
            WHERE id = CAST(:cid AS uuid) AND workspace_id = CAST(:ws AS uuid)
        """),
        {"url": url, "cid": contact_id, "ws": workspace_id},
    )
    db.commit()
    return {"status": "done", "has_avatar": url is not None}


def process_group_enrichment_job(db: Session, job: dict[str, Any]) -> dict[str, Any]:
    payload = job.get("job_payload") or job.get("payload") or {}
    workspace_id = str(job.get("workspace_id") or "")
    conversa_id = str(payload.get("conversa_id") or "")
    group_jid = str(payload.get("group_jid") or "")
    canal_id = str(payload.get("canal_id") or "")

    if not (workspace_id and conversa_id and group_jid and canal_id):
        raise RuntimeError("Job group_enrichment incompleto")

    # Verificar TTL: se o avatar do grupo foi buscado recentemente, skip.
    # (Antes era por presença de group_avatar_url, o que causava busy-loop quando
    # o provider devolvia nome mas não a foto — ver enqueue_group_enrichment.)
    row = db.execute(
        text("""
            SELECT group_avatar_fetched_at, group_avatar_url FROM public.crm_whatsapp_conversas
            WHERE id = CAST(:conv_id AS uuid) AND workspace_id = CAST(:ws AS uuid)
        """),
        {"conv_id": conversa_id, "ws": workspace_id},
    ).mappings().first()

    if row and _avatar_ttl_blocks(row["group_avatar_fetched_at"], has_photo=bool(row["group_avatar_url"])):
        return {"status": "skipped"}

    cfg = _load_canal_cfg(db, workspace_id=workspace_id, canal_id=canal_id)
    if cfg is None:
        raise RuntimeError(f"Canal não encontrado workspace={str(workspace_id)[:8]}")

    canal_tipo = cfg.get("_canal_tipo", "")
    evolution_instance = cfg.get("_evolution_instance", "") or str(payload.get("instance") or "")
    is_waha_canal = bool(cfg.get("api_base_url"))

    nome: str | None = None
    avatar_url: str | None = None

    if is_waha_canal:
        session = cfg.get("session") or str(payload.get("instance") or "")
        if not session:
            raise RuntimeError(f"Sessão WAHA não encontrada workspace={str(workspace_id)[:8]}")
        try:
            nome = waha_service.buscar_nome_grupo(session, group_jid, cfg, timeout=5.0)
            avatar_url = waha_service.buscar_avatar_chat(session, group_jid, cfg, timeout=5.0)
        except WahaError as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            logger.warning(
                "[group-enrich] falha session=%s workspace=%s status=%s",
                session, str(workspace_id)[:8],
                status_code or type(exc).__name__,
            )
            raise

    elif canal_tipo == "whatsapp_evolution" and evolution_instance:
        # Canais Evolution API: usa evo_service.buscar_grupo()
        evolution_instance_token = cfg.get("_evolution_instance_token", "")
        try:
            from app.services import evolution as evo_service  # noqa: PLC0415
            info = evo_service.buscar_grupo(evolution_instance, group_jid, token=evolution_instance_token or None)
            if isinstance(info, dict):
                nome = info.get("subject") or info.get("name") or None
                avatar_url = info.get("pictureUrl") or None
                # O /group/info do evolution-go 0.7.x não devolve pictureUrl, mas a foto do
                # grupo É recuperável por JID via /user/avatar (buscar_foto_perfil aceita
                # @g.us). Fallback quando pictureUrl vier vazio. raise_on_transient → retry
                # sem envenenar; 404 (sem foto) → None.
                if not avatar_url:
                    foto_info = evo_service.buscar_foto_perfil(
                        evolution_instance, group_jid,
                        token=evolution_instance_token or None, raise_on_transient=True,
                    )
                    avatar_url = foto_info or None  # dict {"url":...} ou str; rehost trata ambos
                # Aproveitar participantes para resolver @lid → telefone
                participants = info.get("participants") or []
                if participants:
                    resolved = _resolve_evolution_participant_phones(
                        db,
                        workspace_id=workspace_id,
                        canal_id=canal_id,
                        participants=participants,
                    )
                    if resolved:
                        logger.info(
                            "[group-enrich] evolution lid_resolvidos=%d jid=%s workspace=%s",
                            resolved, group_jid, str(workspace_id)[:8],
                        )
            logger.info(
                "[group-enrich] evolution jid=%s instance=%s workspace=%s nome=%s has_avatar=%s",
                group_jid, evolution_instance, str(workspace_id)[:8], nome, avatar_url is not None,
            )
        except Exception as exc:
            logger.warning(
                "[group-enrich] evolution falhou jid=%s workspace=%s err=%s",
                group_jid, str(workspace_id)[:8], exc,
            )
            raise

    else:
        logger.info(
            "[group-enrich] skip (sem suporte) canal_tipo=%s workspace=%s",
            canal_tipo, str(workspace_id)[:8],
        )
        return {"status": "skipped"}

    # Re-hospeda o avatar do grupo no MinIO — pictureUrl/WAHA também são URLs
    # cruas do pps.whatsapp.net que expiram.
    if avatar_url:
        avatar_url = rehost_avatar(group_jid, avatar_url, key_prefix="groups")

    # Marca group_avatar_fetched_at (TTL) para não re-buscar a cada mensagem — vale
    # tanto quando achou foto quanto quando o provider não devolve pictureUrl.
    # Falha transitória já levantou exceção acima (não chega aqui), então o job
    # re-tenta sem envenenar o TTL.
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_conversas
            SET group_name = COALESCE(:nome, group_name),
                group_avatar_url = CASE
                    WHEN :avatar IS NOT NULL THEN :avatar
                    WHEN group_avatar_url LIKE '%whatsapp.net%'
                      OR group_avatar_url LIKE '%fbcdn%'
                      OR group_avatar_url LIKE '%fbsbx%' THEN NULL
                    ELSE group_avatar_url
                END,
                group_avatar_fetched_at = NOW(),
                updated_at = NOW()
            WHERE id = CAST(:conv_id AS uuid) AND workspace_id = CAST(:ws AS uuid)
        """),
        {"nome": nome, "avatar": avatar_url, "conv_id": conversa_id, "ws": workspace_id},
    )
    db.commit()

    return {"status": "done", "group_name": nome, "has_avatar": avatar_url is not None}


# ---------------------------------------------------------------------------
# Evolution: resolução de @lid via participantes de grupo
# ---------------------------------------------------------------------------


def _resolve_evolution_participant_phones(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    participants: list[dict[str, Any]],
) -> int:
    """Usa a lista de participantes (Evolution Go /group/info) para resolver
    @lid → @s.whatsapp.net e popular telefone nos contatos.

    Equivalente ao process_lid_phone_enrichment_job do WAHA, mas sem chamada
    de API extra — o Evolution Go já entrega PhoneNumber em cada participante.
    Retorna o número de contatos atualizados.
    """
    from app.services.whatsapp_crm_persistence import _merge_duplicate_conversations  # noqa: PLC0415

    resolved = 0
    for p in participants:
        lid_jid = str(p.get("jid") or p.get("id") or "")
        phone_raw = str(p.get("phone_jid") or "")

        if "@lid" not in lid_jid or not phone_raw:
            continue

        phone_digits = re.sub(r"\D", "", phone_raw.split("@")[0])
        if not (phone_digits.startswith("55") and len(phone_digits) in (12, 13)):
            continue

        resolved_jid = f"{phone_digits}@s.whatsapp.net"

        # Verificar se já existe contato com o @lid
        existing = db.execute(
            text("""
                SELECT id FROM public.crm_whatsapp_contatos
                WHERE workspace_id = CAST(:ws AS uuid) AND jid = :lid_jid
            """),
            {"ws": workspace_id, "lid_jid": lid_jid},
        ).fetchone()
        if not existing:
            continue

        contact_id = str(existing[0])

        # Verificar se resolved_jid já pertence a outro contato (colisão)
        collision = db.execute(
            text("""
                SELECT id FROM public.crm_whatsapp_contatos
                WHERE workspace_id = CAST(:ws AS uuid) AND jid = :resolved_jid
            """),
            {"ws": workspace_id, "resolved_jid": resolved_jid},
        ).fetchone()
        if collision:
            # Contato @s.whatsapp.net já existe — mesclar @lid no canônico e remover @lid
            canonical_contact_id = str(collision[0])

            # Reassociar conversas do @lid → contato canônico + atualizar remote_jid
            db.execute(
                text("""
                    UPDATE public.crm_whatsapp_conversas
                    SET contato_id = CAST(:canonical_id AS uuid),
                        remote_jid = :resolved_jid,
                        updated_at = NOW()
                    WHERE workspace_id = CAST(:ws AS uuid)
                      AND canal_id = CAST(:canal AS uuid)
                      AND contato_id = CAST(:lid_contact_id AS uuid)
                """),
                {
                    "canonical_id": canonical_contact_id,
                    "resolved_jid": resolved_jid,
                    "ws": workspace_id,
                    "canal": canal_id,
                    "lid_contact_id": contact_id,
                },
            )

            # Remover contato @lid órfão
            db.execute(
                text("""
                    DELETE FROM public.crm_whatsapp_contatos
                    WHERE id = CAST(:lid_id AS uuid)
                      AND workspace_id = CAST(:ws AS uuid)
                """),
                {"lid_id": contact_id, "ws": workspace_id},
            )

            # Mesclar conversas duplicadas para o mesmo remote_jid canônico
            _merge_duplicate_conversations(
                db,
                workspace_id=workspace_id,
                canal_id=canal_id,
                canonical_jid=resolved_jid,
            )

            logger.info(
                "[group-enrich] lid_merged lid=%s → canonical=%s workspace=%s",
                lid_jid, resolved_jid, str(workspace_id)[:8],
            )
            resolved += 1
            continue

        # Atualizar contato: jid + telefone
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_contatos
                SET jid = :resolved_jid,
                    numero_evo = :resolved_jid,
                    telefone = :phone,
                    updated_at = NOW()
                WHERE workspace_id = CAST(:ws AS uuid) AND jid = :lid_jid
            """),
            {"ws": workspace_id, "resolved_jid": resolved_jid, "phone": phone_digits, "lid_jid": lid_jid},
        )

        # Atualizar remote_jid das conversas
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_conversas
                SET remote_jid = :resolved_jid, updated_at = NOW()
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND canal_id = CAST(:canal AS uuid)
                  AND remote_jid = :lid_jid
            """),
            {"ws": workspace_id, "canal": canal_id, "resolved_jid": resolved_jid, "lid_jid": lid_jid},
        )

        # Consolidar conversas duplicadas (mesmo contato com JIDs diferentes)
        _merge_duplicate_conversations(
            db,
            workspace_id=workspace_id,
            canal_id=canal_id,
            canonical_jid=resolved_jid,
        )

        # Enfileirar avatar para o JID resolvido (antes era @lid, não buscava)
        enqueue_contact_avatar_enrichment(
            db,
            workspace_id=workspace_id,
            canal_id=canal_id,
            contact_id=contact_id,
            jid=resolved_jid,
            instance="",
        )

        resolved += 1

    if resolved:
        db.commit()

    return resolved


# ---------------------------------------------------------------------------
# LID phone enrichment — enqueue + process
# ---------------------------------------------------------------------------


def enqueue_lid_phone_enrichment(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    contact_id: str,
    jid: str,
    instance: str,
) -> bool:
    """Enfileira busca de telefone BR real para contato @lid via WAHA Store.
    Só enfileira se: jid @lid + session na allowlist + contato sem telefone BR real.
    """
    if "@lid" not in jid:
        return False
    if instance not in _store_sessions():
        return False
    if not (workspace_id and canal_id and contact_id):
        return False
    try:
        row = db.execute(
            text("""
                SELECT telefone FROM public.crm_whatsapp_contatos
                WHERE id = CAST(:cid AS uuid) AND workspace_id = CAST(:ws AS uuid)
            """),
            {"cid": contact_id, "ws": workspace_id},
        ).mappings().first()
        if row:
            digits = re.sub(r"\D", "", row["telefone"] or "")
            if digits.startswith("55") and len(digits) in (12, 13):
                return False  # já tem telefone BR real
        existing = db.execute(
            text("""
                SELECT 1 FROM public.crm_message_jobs
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND job_type = :jt
                  AND status IN ('pending', 'running')
                  AND payload->>'contact_id' = :cid
                  AND created_at >= NOW() - INTERVAL '7 days'
                LIMIT 1
            """),
            {"ws": workspace_id, "jt": LID_PHONE_ENRICHMENT_JOB_TYPE, "cid": contact_id},
        ).fetchone()
        if existing:
            return False
        payload_json = json.dumps(
            {"contact_id": contact_id, "jid": jid, "instance": instance, "canal_id": canal_id},
            separators=(",", ":"),
        )
        db.execute(
            text("""
                INSERT INTO public.crm_message_jobs (
                    workspace_id, canal_id, raw_event_id, related_message_id,
                    job_type, status, priority, payload, created_at, updated_at, next_run_at
                ) VALUES (
                    CAST(:ws AS uuid), CAST(:canal AS uuid), NULL, NULL,
                    :jt, 'pending', 1, CAST(:payload AS jsonb), NOW(), NOW(), NOW()
                )
            """),
            {"ws": workspace_id, "canal": canal_id, "jt": LID_PHONE_ENRICHMENT_JOB_TYPE, "payload": payload_json},
        )
        return True
    except Exception:
        logger.exception("[lid-enqueue] falha workspace=%s", str(workspace_id)[:8])
        return False


def process_lid_phone_enrichment_job(db: Session, job: dict[str, Any]) -> dict[str, Any]:
    payload = job.get("job_payload") or job.get("payload") or {}
    workspace_id = str(job.get("workspace_id") or "")
    contact_id = str(payload.get("contact_id") or "")
    jid = str(payload.get("jid") or "")
    canal_id = str(payload.get("canal_id") or "")
    instance = str(payload.get("instance") or "")

    if not (workspace_id and contact_id and jid and canal_id):
        raise RuntimeError("Job lid_phone_enrichment incompleto")
    if "@lid" not in jid:
        return {"status": "skipped"}
    if instance not in _store_sessions():
        logger.info("[lid-enrich] skipped store_disabled session=%s", instance)
        return {"status": "skipped"}

    cfg = _load_canal_cfg(db, workspace_id=workspace_id, canal_id=canal_id)
    if cfg is None:
        raise RuntimeError(f"Canal não encontrado workspace={str(workspace_id)[:8]}")
    session = cfg.get("session") or instance
    if not session:
        raise RuntimeError(f"Sessão WAHA não encontrada workspace={str(workspace_id)[:8]}")

    lid_number = jid.split("@")[0]
    try:
        pn_digits = waha_service.buscar_lid_phone(session, lid_number, cfg, timeout=8.0)
    except WahaError as exc:
        logger.warning(
            "[lid-enrich] falha session=%s workspace=%s err=%s",
            session, str(workspace_id)[:8], type(exc).__name__,
        )
        raise

    if not pn_digits:
        return {"status": "skipped"}  # store não mapeou ainda — retry via worker

    digits = re.sub(r"\D", "", pn_digits)
    if not (digits.startswith("55") and len(digits) in (12, 13)):
        logger.warning("[lid-enrich] pn_invalido session=%s len=%d", session, len(digits))
        return {"status": "skipped"}

    result = db.execute(
        text("""
            UPDATE public.crm_whatsapp_contatos
            SET telefone = :tel, updated_at = NOW()
            WHERE id = CAST(:cid AS uuid)
              AND workspace_id = CAST(:ws AS uuid)
              AND (telefone IS NULL OR NOT (telefone ~ '^55[0-9]{10,11}$'))
        """),
        {"tel": digits, "cid": contact_id, "ws": workspace_id},
    )
    updated_phone = (result.rowcount or 0) > 0

    resolved_jid = f"{digits}@s.whatsapp.net"

    # B1 — Atualizar JID do contato
    existing = db.execute(
        text("""
            SELECT id FROM public.crm_whatsapp_contatos
            WHERE workspace_id = CAST(:ws AS uuid) AND jid = :resolved_jid
        """),
        {"ws": workspace_id, "resolved_jid": resolved_jid},
    ).scalar()

    updated_jid = False
    if existing is None:
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_contatos
                SET jid = :resolved_jid, numero_evo = :resolved_jid, updated_at = NOW()
                WHERE id = CAST(:cid AS uuid) AND workspace_id = CAST(:ws AS uuid)
            """),
            {"resolved_jid": resolved_jid, "cid": contact_id, "ws": workspace_id},
        )
        updated_jid = True

    # B2 — Atualizar remote_jid das conversas do contato @lid
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_conversas
            SET remote_jid = :resolved_jid, updated_at = NOW()
            WHERE canal_id = CAST(:canal AS uuid)
              AND workspace_id = CAST(:ws AS uuid)
              AND remote_jid = :lid_jid
        """),
        {"resolved_jid": resolved_jid, "canal": canal_id, "ws": workspace_id, "lid_jid": jid},
    )

    # B3 — Consolidar conversas duplicadas
    from app.services.whatsapp_crm_persistence import _merge_duplicate_conversations  # noqa: PLC0415
    merged = _merge_duplicate_conversations(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        canonical_jid=resolved_jid,
    )
    if merged:
        logger.info("[lid-enrich] merged %d conversas duplicadas para %s", merged, resolved_jid)

    # B4 — Commit único
    db.commit()

    logger.info(
        "[lid-enrich] done session=%s workspace=%s updated_phone=%s updated_jid=%s merged=%d",
        session, str(workspace_id)[:8], updated_phone, updated_jid, merged,
    )
    return {"status": "done", "updated_phone": updated_phone, "updated_jid": updated_jid, "merged_conversations": merged}

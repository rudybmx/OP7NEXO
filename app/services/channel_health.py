"""Health-check periódico dos canais WhatsApp (roda no worker/scheduler).

Reconcilia o estado real das sessões WAHA contra o banco e ALERTA (via WhatsApp, por
um canal remetente configurado) quando um canal cai — fechando a lacuna que deixou 3
canais WAHA mudos por ~9 dias (o DB sabia que estavam `failed`, mas ninguém era avisado).

Decisões (diagnóstico 2026-06-25):
- **Sem auto-restart**: sessão NOWEB deslogada só recupera com re-pareamento (QR); a
  transitória se cura sozinha (Baileys reconnect). Restart cego só churna + arrisca rate-limit.
- **Anti-spam via Redis** (TTL 12h) — sem migration; sobrevive restart do worker.
- **Remetente EXPLÍCITO e verificado `connected`** (`HEALTH_ALERT_FROM_CANAL`): nunca auto-pick
  (evita vazar entre tenants e o alerta morrer por um canal também caído). Se o remetente não
  estiver disponível → ERROR no log (não tenta outro WhatsApp).
- **Graceful**: sem `HEALTH_ALERT_TO`/`FROM_CANAL` configurados, só reconcilia + loga (deploy
  desabilitado; liga-se setando as envs).
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import evolution as evo_service
from app.services import waha_service
from app.services.redis_pub import _get_redis

logger = logging.getLogger(__name__)

_ALERT_TTL_S = 12 * 3600  # re-alerta no máx. a cada 12h enquanto o canal segue caído
_REDIS_KEY = "canal:health_alerted:{cid}"
_CONNECTING_STUCK_S = 3600  # 'connecting' por >1h = travado


def _digits(v: str) -> str:
    return re.sub(r"\D", "", v or "")


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _is_down(c: dict) -> bool:
    cs = c.get("connection_status")
    if cs in ("failed", "disconnected"):
        return True
    if cs == "connecting":
        upd = _aware(c.get("atualizado_em"))
        if upd and (datetime.now(timezone.utc) - upd).total_seconds() > _CONNECTING_STUCK_S:
            return True
    return False


def _reconciliar_waha(db: Session, canais: list[dict]) -> None:
    """Reflete o status real das sessões WAHA no banco. Cópia enxuta de
    `_reconciliar_waha_status` (canais.py) — evita importar o módulo de API no worker.
    Usa só `waha_service.listar_sessoes` + `STATUS_MAP`. 1 chamada batch por instância."""
    waha = [c for c in canais if c.get("tipo") == "whatsapp_waha"]
    if not waha:
        return
    grupos: dict[tuple[str, str], tuple[dict, list[tuple[dict, str]]]] = {}
    for c in waha:
        cfg = ((c.get("config") or {}).get("waha")) or {}
        session = cfg.get("session")
        if not session:
            continue
        chave = (str(cfg.get("api_base_url", "")), str(cfg.get("api_key_ref", "")))
        grupos.setdefault(chave, (cfg, []))[1].append((c, session))

    for cfg, items in grupos.values():
        try:
            sessoes = waha_service.listar_sessoes(cfg, timeout=4.0)
        except waha_service.WahaError as exc:
            logger.warning("[health] reconciliar WAHA falhou (mantém status do DB): %s", exc)
            continue
        for c, session in items:
            real = (sessoes.get(session) or {}).get("status")
            if real is None:
                novo = "disconnected"
            elif real == "FAILED":
                novo = "failed"
            else:
                novo = waha_service.STATUS_MAP.get(real)
            if novo and novo != c.get("connection_status"):
                db.execute(
                    text("UPDATE public.canais_entrada SET connection_status = :s, atualizado_em = NOW() WHERE id = :i"),
                    {"s": novo, "i": c["id"]},
                )
                c["connection_status"] = novo
    db.commit()


def _send_text(sender: dict, to_digits: str, texto: str) -> None:
    """Envia um texto pelo canal remetente (WAHA ou Evolution)."""
    cfg = sender.get("config") or {}
    if sender.get("tipo") == "whatsapp_waha":
        waha = cfg.get("waha") or {}
        waha_service.enviar_mensagem_texto(waha.get("session"), waha, f"{to_digits}@c.us", texto)
    else:  # whatsapp_evolution
        ev = cfg.get("evolution") or {}
        evo_service.enviar_mensagem_texto(
            sender.get("evolution_instance_id"),
            f"{to_digits}@s.whatsapp.net",
            texto,
            instance_id=ev.get("instance_id"),
            instance_token=ev.get("instance_token"),
        )


def _enviar_alerta(db: Session, due: list[dict]) -> bool:
    """Envia 1 alerta consolidado. Retorna True só se realmente enviou (p/ marcar o Redis)."""
    to = _digits(getattr(settings, "HEALTH_ALERT_TO", "") or "")
    from_canal = (getattr(settings, "HEALTH_ALERT_FROM_CANAL", "") or "").strip()
    nomes = ", ".join(c.get("nome") or str(c["id"])[:8] for c in due)
    if not to or not from_canal:
        logger.info("[health] %d canal(is) caído(s) [%s] — HEALTH_ALERT_TO/FROM_CANAL não configurado, só log", len(due), nomes)
        return False
    sender = db.execute(
        text("""SELECT id, tipo, connection_status, config, evolution_instance_id
                FROM public.canais_entrada WHERE id = CAST(:i AS uuid)"""),
        {"i": from_canal},
    ).mappings().first()
    if not sender or sender["connection_status"] != "connected":
        logger.error(
            "[health] ALERTA NÃO ENVIADO — canal remetente %s indisponível (status=%s). Caídos: %s",
            from_canal, (sender or {}).get("connection_status", "inexistente"), nomes,
        )
        return False
    linhas = "\n".join(f"• {c.get('nome') or c['id']} ({c.get('connection_status')})" for c in due)
    texto = f"⚠️ OP7NEXO — {len(due)} canal(is) WhatsApp caído(s):\n{linhas}\n\nReconecte/repareie em Canais."
    try:
        _send_text(dict(sender), to, texto)
        logger.info("[health] alerta enviado p/ %s sobre %d canal(is): %s", to, len(due), nomes)
        return True
    except Exception as exc:  # noqa: BLE001 — falha de envio não derruba o job
        logger.error("[health] falha ao enviar alerta WhatsApp: %s", exc)
        return False


def run_channel_health_check(db: Session) -> dict[str, int]:
    """Reconcilia + detecta canais caídos + alerta (anti-spam Redis). Idempotente por ciclo."""
    canais = [dict(c) for c in db.execute(text(
        """SELECT id, nome, tipo, connection_status, config, workspace_id, atualizado_em
           FROM public.canais_entrada
           WHERE tipo LIKE 'whatsapp%' AND status = 'ativo'"""
    )).mappings().all()]

    _reconciliar_waha(db, canais)

    try:
        r = _get_redis()
    except Exception as exc:  # noqa: BLE001 — sem Redis, degrada p/ log (não marca anti-spam)
        logger.warning("[health] Redis indisponível, anti-spam desligado: %s", exc)
        r = None

    down = [c for c in canais if _is_down(c)]

    # Recuperados (connected) limpam a marca → próxima queda re-alerta na hora
    if r is not None:
        for c in canais:
            if c.get("connection_status") == "connected":
                try:
                    r.delete(_REDIS_KEY.format(cid=c["id"]))
                except Exception:  # noqa: BLE001
                    pass

    # "Due" = caído sem marca ativa no Redis (novo ou já passou 12h). Sem Redis: trata tudo como due.
    def _due(c: dict) -> bool:
        if r is None:
            return True
        try:
            return not r.get(_REDIS_KEY.format(cid=c["id"]))
        except Exception:  # noqa: BLE001
            return True

    due = [c for c in down if _due(c)]

    sent = bool(due) and _enviar_alerta(db, due)
    if sent and r is not None:
        for c in due:
            try:
                r.setex(_REDIS_KEY.format(cid=c["id"]), _ALERT_TTL_S, "1")
            except Exception:  # noqa: BLE001
                pass

    logger.info("[health] canais=%d down=%d due=%d enviado=%s", len(canais), len(down), len(due), bool(sent))
    return {"total": len(canais), "down": len(down), "due": len(due), "sent": int(bool(sent))}

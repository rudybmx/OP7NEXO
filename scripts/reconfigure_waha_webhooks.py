"""Reconfigura webhooks OP7NEXO nas sessões WAHA ativas.

Uso:
    python scripts/reconfigure_waha_webhooks.py
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from app.core.database import SessionLocal
from app.models.canal_entrada import CanalEntrada
from app.services import waha_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("reconfigure_waha_webhooks")


@dataclass(frozen=True)
class ReconfigureResult:
    canal_id: str
    canal_nome: str
    session: str
    session_status: str
    ok: bool
    message: str


def _webhook_base_url() -> str:
    return os.getenv("WAHA_INTERNAL_WEBHOOK_BASE_URL", "http://op7nexo-api:8000").rstrip("/")


def _waha_cfg(canal: CanalEntrada) -> tuple[str, dict]:
    cfg = (canal.config or {}).get("waha", {})
    session = cfg.get("session") or canal.nome or "default"
    return str(session), dict(cfg)


def reconfigure_active_waha_webhooks() -> list[ReconfigureResult]:
    results: list[ReconfigureResult] = []
    with SessionLocal() as db:
        canais = (
            db.query(CanalEntrada)
            .filter(
                CanalEntrada.tipo == "whatsapp_waha",
                CanalEntrada.status == "ativo",
            )
            .order_by(CanalEntrada.criado_em.asc())
            .all()
        )

        for canal in canais:
            session, cfg = _waha_cfg(canal)
            if not canal.webhook_token:
                results.append(
                    ReconfigureResult(
                        canal_id=str(canal.id),
                        canal_nome=canal.nome,
                        session=session,
                        session_status="unknown",
                        ok=False,
                        message="missing webhook_token",
                    )
                )
                continue

            status = "unknown"
            try:
                state = waha_service.estado_sessao(session, cfg)
                status = str(state.get("status") or "unknown")
                webhook_url = f"{_webhook_base_url()}/webhook/waha/{canal.webhook_token}"
                waha_service.configurar_webhook(session, webhook_url, cfg)
                results.append(
                    ReconfigureResult(
                        canal_id=str(canal.id),
                        canal_nome=canal.nome,
                        session=session,
                        session_status=status,
                        ok=True,
                        message="events=message,message.any,message.ack,session.status",
                    )
                )
            except Exception as exc:
                results.append(
                    ReconfigureResult(
                        canal_id=str(canal.id),
                        canal_nome=canal.nome,
                        session=session,
                        session_status=status,
                        ok=False,
                        message=f"{type(exc).__name__}: {str(exc)[:180]}",
                    )
                )
    return results


def main() -> int:
    results = reconfigure_active_waha_webhooks()
    ok_count = 0
    for result in results:
        ok_count += 1 if result.ok else 0
        level = log.info if result.ok else log.warning
        level(
            "canal=%s canal_id=%s session=%s status=%s ok=%s %s",
            result.canal_nome,
            result.canal_id,
            result.session,
            result.session_status,
            result.ok,
            result.message,
        )
    log.info("summary ok=%d total=%d", ok_count, len(results))
    return 0 if ok_count == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Serviço de Notificações in-app.

Modelo: notificação por workspace + audiência por papel (snapshot) + leitura POR
usuário (tabela `notificacao_leituras`). Sem fan-out de linhas por destinatário.

Criação tolerante a falha: roda em SAVEPOINT e nunca propaga exceção ao chamador
(gatilhos em caminho quente). Dedupe lógico por `dedupe_key` (notificação "viva" =
ainda sem nenhuma leitura) + anti-spam opcional via Redis (reuso do padrão TTL).
"""
from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.redis_pub import _get_redis, publish_notificacao_event

logger = logging.getLogger(__name__)

# Audiência padrão por tipo (papéis de `RoleUsuario`). [] = todos do workspace.
# Sobrescrevível por workspace via tabela `notificacao_config`.
DEFAULT_AUDIENCIA: dict[str, list[str]] = {
    "canal_offline": ["platform_admin", "company_admin"],
    "mensagem_nova": ["company_agent"],
}

# Tipos conhecidos (para a tela de configuração de audiência).
TIPOS_CONHECIDOS: list[str] = ["canal_offline", "mensagem_nova"]


# ─────────────────────────────── escrita ────────────────────────────────────
def marca_unica_redis(key: str, ttl_s: int) -> bool:
    """True se marcou agora (1ª vez na janela); False se já estava marcado.

    Anti-spam best-effort: se o Redis falhar, retorna True (melhor notificar do
    que silenciar). Usado pelo gatilho de canal caído (TTL 12h por canal)."""
    try:
        return bool(_get_redis().set(key, "1", nx=True, ex=ttl_s))
    except Exception as exc:  # pragma: no cover - degradação graciosa
        logger.warning("[notificacoes] anti-spam Redis indisponível (%s): %s", key, exc)
        return True


def resolver_audiencia(db: Session, workspace_id, tipo: str) -> tuple[bool, list[str]]:
    """(ativo, audiencia_papeis) — config do workspace se existir; senão default."""
    row = db.execute(
        text("SELECT ativo, audiencia_papeis FROM notificacao_config WHERE workspace_id = :ws AND tipo = :t"),
        {"ws": str(workspace_id), "t": tipo},
    ).first()
    if row is not None:
        return bool(row[0]), list(row[1] or [])
    return True, list(DEFAULT_AUDIENCIA.get(tipo, []))


def criar_notificacao(
    db: Session,
    workspace_id,
    tipo: str,
    titulo: str,
    mensagem: str | None = None,
    *,
    severidade: str = "info",
    link: str | None = None,
    entidade: tuple[str, object] | None = None,
    dedupe_key: str | None = None,
    payload: dict | None = None,
) -> uuid.UUID | None:
    """Cria uma notificação. Retorna o id, o id existente (se deduplicada) ou None
    (tipo desativado / falha). Nunca lança — isola em SAVEPOINT."""
    try:
        ativo, audiencia = resolver_audiencia(db, workspace_id, tipo)
        if not ativo:
            return None

        entidade_tipo, entidade_id = (entidade or (None, None))
        with db.begin_nested():
            # Dedupe: já existe notificação com esta dedupe_key ainda "viva"
            # (sem nenhuma leitura)? Então agrega — não cria outra.
            if dedupe_key:
                existente = db.execute(
                    text(
                        """
                        SELECT n.id FROM notificacoes n
                        WHERE n.workspace_id = :ws AND n.dedupe_key = :dk
                          AND NOT EXISTS (
                              SELECT 1 FROM notificacao_leituras l WHERE l.notificacao_id = n.id
                          )
                        ORDER BY n.criado_em DESC LIMIT 1
                        """
                    ),
                    {"ws": str(workspace_id), "dk": dedupe_key},
                ).first()
                if existente is not None:
                    return existente[0]

            novo_id = db.execute(
                text(
                    """
                    INSERT INTO notificacoes
                        (workspace_id, tipo, severidade, titulo, mensagem, link,
                         audiencia_papeis, entidade_tipo, entidade_id, dedupe_key, payload)
                    VALUES
                        (:ws, :tipo, :sev, :titulo, :msg, :link,
                         CAST(:aud AS jsonb), :et, :eid, :dk, CAST(:payload AS jsonb))
                    RETURNING id
                    """
                ),
                {
                    "ws": str(workspace_id),
                    "tipo": tipo,
                    "sev": severidade,
                    "titulo": titulo[:160],
                    "msg": mensagem,
                    "link": link,
                    "aud": json.dumps(audiencia),
                    "et": entidade_tipo,
                    "eid": str(entidade_id) if entidade_id else None,
                    "dk": dedupe_key,
                    "payload": json.dumps(payload or {}),
                },
            ).scalar()

        # publica fora do savepoint (best-effort; não afeta a transação)
        publish_notificacao_event(
            {"type": "notificacao.nova", "workspaceId": str(workspace_id), "tipo": tipo, "id": str(novo_id)}
        )
        return novo_id
    except Exception as exc:  # nunca quebrar o fluxo do chamador
        logger.warning("[notificacoes] criar_notificacao(%s) falhou: %s", tipo, exc)
        return None


# ─────────────────────────────── leitura ────────────────────────────────────
def _filtro_audiencia_sql() -> str:
    """Predicado SQL: notificação visível ao papel do usuário ([] = todos)."""
    return "(n.audiencia_papeis = '[]'::jsonb OR n.audiencia_papeis @> CAST(:role AS jsonb))"


def contar_nao_lidas(db: Session, user, workspace_id) -> int:
    role_json = json.dumps([getattr(user.role, "value", str(user.role))])
    total = db.execute(
        text(
            f"""
            SELECT COUNT(*) FROM notificacoes n
            WHERE n.workspace_id = :ws AND {_filtro_audiencia_sql()}
              AND NOT EXISTS (
                  SELECT 1 FROM notificacao_leituras l
                  WHERE l.notificacao_id = n.id AND l.user_id = :uid
              )
            """
        ),
        {"ws": str(workspace_id), "role": role_json, "uid": str(user.id)},
    ).scalar()
    return int(total or 0)


def listar(
    db: Session,
    user,
    workspace_id,
    *,
    tipo: str | None = None,
    apenas_nao_lidas: bool = False,
    limit: int = 30,
    offset: int = 0,
) -> list[dict]:
    role_json = json.dumps([getattr(user.role, "value", str(user.role))])
    cond = [f"n.workspace_id = :ws", _filtro_audiencia_sql()]
    params: dict = {"ws": str(workspace_id), "role": role_json, "uid": str(user.id),
                    "limit": max(1, min(limit, 100)), "offset": max(0, offset)}
    if tipo:
        cond.append("n.tipo = :tipo")
        params["tipo"] = tipo
    if apenas_nao_lidas:
        cond.append("l.notificacao_id IS NULL")
    where = " AND ".join(cond)
    rows = db.execute(
        text(
            f"""
            SELECT n.id, n.tipo, n.severidade, n.titulo, n.mensagem, n.link,
                   n.entidade_tipo, n.entidade_id, n.payload, n.criado_em,
                   (l.notificacao_id IS NOT NULL) AS lida
            FROM notificacoes n
            LEFT JOIN notificacao_leituras l
                   ON l.notificacao_id = n.id AND l.user_id = :uid
            WHERE {where}
            ORDER BY n.criado_em DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    ).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "tipo": r["tipo"],
            "severidade": r["severidade"],
            "titulo": r["titulo"],
            "mensagem": r["mensagem"],
            "link": r["link"],
            "entidade_tipo": r["entidade_tipo"],
            "entidade_id": str(r["entidade_id"]) if r["entidade_id"] else None,
            "payload": r["payload"],
            "criado_em": r["criado_em"].isoformat() if r["criado_em"] else None,
            "lida": bool(r["lida"]),
        }
        for r in rows
    ]


def _marcar(db: Session, user, workspace_id, extra_cond: str, extra_params: dict) -> int:
    """INSERT idempotente em leituras só do que é visível ao usuário. Retorna nº marcado."""
    role_json = json.dumps([getattr(user.role, "value", str(user.role))])
    res = db.execute(
        text(
            f"""
            INSERT INTO notificacao_leituras (notificacao_id, user_id)
            SELECT n.id, :uid FROM notificacoes n
            WHERE n.workspace_id = :ws AND {_filtro_audiencia_sql()} AND {extra_cond}
              AND NOT EXISTS (
                  SELECT 1 FROM notificacao_leituras l
                  WHERE l.notificacao_id = n.id AND l.user_id = :uid
              )
            ON CONFLICT DO NOTHING
            """
        ),
        {"ws": str(workspace_id), "role": role_json, "uid": str(user.id), **extra_params},
    )
    return res.rowcount or 0


def marcar_lida(db: Session, user, workspace_id, notificacao_id) -> int:
    n = _marcar(db, user, workspace_id, "n.id = :nid", {"nid": str(notificacao_id)})
    db.commit()
    return n


def marcar_todas(db: Session, user, workspace_id) -> int:
    n = _marcar(db, user, workspace_id, "TRUE", {})
    db.commit()
    return n


def marcar_lida_por_entidade(db: Session, user, workspace_id, entidade_tipo: str, entidade_id) -> int:
    """Marca lida toda notificação ligada a uma entidade (ex.: abrir a conversa)."""
    n = _marcar(
        db, user, workspace_id,
        "n.entidade_tipo = :et AND n.entidade_id = :eid",
        {"et": entidade_tipo, "eid": str(entidade_id)},
    )
    db.commit()
    return n

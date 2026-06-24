"""Embeddings (OpenAI text-embedding-3-small, 1536d) + indexação RAG.

Chave da OpenAI: token do provider **OpenAI** em `llm_provider_tokens` (decifrado com
Fernet), com fallback no `.env` (`OPENAI_API_KEY`). Cache em Redis best-effort.
Inserção/retrieval usam SQL cru com `CAST(:vec AS vector)` (sem pgvector-python).
"""
from __future__ import annotations

import hashlib
import json
import logging

from openai import OpenAI
from sqlalchemy import inspect as sa_inspect, text
from sqlalchemy.orm import Session

from app.core import llm_crypto
from app.core.config import settings

log = logging.getLogger(__name__)

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536


class EmbeddingError(RuntimeError):
    """Falha ao gerar embedding (sem chave OpenAI, erro de API)."""


def _resolve_openai(db: Session) -> tuple[str, str]:
    """(api_key, base_url) do provider OpenAI no banco; fallback no .env."""
    from app.models.agente import LlmProvider, LlmProviderToken

    prov = db.query(LlmProvider).filter(LlmProvider.nome == "OpenAI").first()
    base_url = (prov.base_url if prov else None) or settings.openai_base_url or "https://api.openai.com/v1"
    api_key = None
    if prov:
        tok = (
            db.query(LlmProviderToken)
            .filter(LlmProviderToken.provider_id == prov.id, LlmProviderToken.ativo.is_(True))
            .first()
        )
        if tok and tok.token_encrypted:
            api_key = llm_crypto.decrypt(tok.token_encrypted)
    api_key = api_key or settings.openai_api_key
    if not api_key:
        raise EmbeddingError("Sem chave OpenAI (cadastre token no provider OpenAI ou OPENAI_API_KEY no .env)")
    return api_key, base_url


def _cache_key(texto: str) -> str:
    return f"emb:{EMBED_MODEL}:{hashlib.sha256(texto.encode()).hexdigest()}"


def _cache_get(texto: str) -> list[float] | None:
    try:
        from app.services.redis_pub import _get_redis

        raw = _get_redis().get(_cache_key(texto))
        return json.loads(raw) if raw else None
    except Exception:  # noqa: BLE001 — cache é best-effort
        return None


def _cache_set(texto: str, vec: list[float]) -> None:
    try:
        from app.services.redis_pub import _get_redis

        _get_redis().set(_cache_key(texto), json.dumps(vec), ex=60 * 60 * 24 * 30)
    except Exception:  # noqa: BLE001
        pass


def embed(db: Session, texto: str) -> list[float]:
    """Gera o embedding de `texto` (com cache). Levanta EmbeddingError em falha."""
    texto = (texto or "").strip()
    if not texto:
        raise EmbeddingError("texto vazio")
    cached = _cache_get(texto)
    if cached is not None:
        return cached
    api_key, base_url = _resolve_openai(db)
    client = OpenAI(api_key=api_key, base_url=base_url)
    resp = client.embeddings.create(model=EMBED_MODEL, input=texto)
    vec = list(resp.data[0].embedding)
    _cache_set(texto, vec)
    return vec


def _vec_literal(vec: list[float]) -> str:
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def chunk_text(texto: str, size: int = 800, overlap: int = 120) -> list[str]:
    texto = (texto or "").strip()
    if not texto:
        return []
    if len(texto) <= size:
        return [texto]
    chunks: list[str] = []
    start = 0
    while start < len(texto):
        chunks.append(texto[start : start + size])
        start += size - overlap
    return chunks


def indexar(db: Session, agente_id, tipo: str, titulo: str | None, conteudo: str) -> int:
    """Chunka `conteudo`, gera embedding de cada chunk e grava em agente_base_conhecimento.
    Retorna o nº de chunks indexados."""
    chunks = chunk_text(conteudo)
    n = 0
    for ch in chunks:
        vec = embed(db, ch)
        db.execute(
            text("""
                INSERT INTO agente_base_conhecimento (agente_id, tipo, titulo, conteudo, embedding)
                VALUES (CAST(:a AS uuid), :tipo, :titulo, :conteudo, CAST(:emb AS vector))
            """),
            {"a": str(agente_id), "tipo": tipo, "titulo": titulo, "conteudo": ch, "emb": _vec_literal(vec)},
        )
        n += 1
    db.commit()
    return n


_KB_TABLE_PRESENTE: bool | None = None


def _kb_table_existe(db: Session) -> bool:
    """Existe a tabela `agente_base_conhecimento`? (cacheado por processo).

    CRÍTICO: enquanto a Fase 3 (tabela + pgvector) não estiver deployada, a tabela não
    existe em produção. Sem este guard, a query de `retrieve` lança `UndefinedTable`, o
    `except` engole o erro mas a **transação Postgres fica abortada** — e a chamada
    seguinte (resolver provider/token em `llm_client_service`) estoura
    `InFailedSqlTransaction`, derrubando TODA geração (sandbox 500 / worker em handoff).
    A checagem no catálogo é limpa (não envenena a sessão); o cache reseta a cada restart
    de container, então quando a Fase 3 subir o novo boot redetecta a tabela."""
    global _KB_TABLE_PRESENTE
    if _KB_TABLE_PRESENTE is None:
        try:
            _KB_TABLE_PRESENTE = sa_inspect(db.get_bind()).has_table("agente_base_conhecimento")
        except Exception:  # noqa: BLE001 — na dúvida, trata como ausente (degrada p/ [])
            _KB_TABLE_PRESENTE = False
    return _KB_TABLE_PRESENTE


def retrieve(db: Session, agente_id, consulta: str, k: int = 3) -> list[str]:
    """Top-K chunks por similaridade cosseno. Degrada para [] em qualquer falha
    (sem pgvector, sem chave, sem KB) — e NUNCA deixa a transação abortada (ver
    `_kb_table_existe`: o RAG não pode derrubar a geração nem envenenar a sessão)."""
    if not _kb_table_existe(db):
        return []  # Fase 3/pgvector ainda não deployada — RAG é no-op, sem tocar no banco
    try:
        # guard: não embeddar se o agente não tem KB (evita custo por mensagem)
        tem_kb = db.execute(
            text("SELECT 1 FROM agente_base_conhecimento WHERE agente_id = CAST(:a AS uuid) LIMIT 1"),
            {"a": str(agente_id)},
        ).first()
        if not tem_kb:
            return []
        qvec = embed(db, consulta)
        rows = db.execute(
            text("""
                SELECT conteudo
                FROM agente_base_conhecimento
                WHERE agente_id = CAST(:a AS uuid) AND embedding IS NOT NULL
                ORDER BY embedding <=> CAST(:q AS vector) ASC
                LIMIT :k
            """),
            {"a": str(agente_id), "q": _vec_literal(qvec), "k": k},
        ).fetchall()
        return [r[0] for r in rows]
    except Exception as exc:  # noqa: BLE001 — RAG nunca derruba a geração
        log.info("[rag] retrieve falhou agente=%s: %s", agente_id, exc)
        try:
            db.rollback()  # libera a transação caso a query a tenha deixado abortada
        except Exception:  # noqa: BLE001
            pass
        return []

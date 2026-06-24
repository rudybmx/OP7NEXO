"""Cifra/decifra de tokens de provider de LLM (Fernet, em repouso).

Os tokens de LLM (OpenAI/OpenRouter/DeepSeek) são de alto valor e ficam cifrados
na coluna `llm_provider_tokens.token_encrypted`. A chave Fernet vem de
`settings.LLM_TOKEN_ENC_KEY` (base64 url-safe de 32 bytes). A API NUNCA devolve o
token decifrado — só a máscara de `mask()` (gravada em `token_mask` no momento do
upsert). O `LLMClientService` (Fase 2) decifra em memória no momento da chamada.
"""
from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class LLMTokenCryptoError(RuntimeError):
    """Falha de configuração/uso da cifra de token (chave ausente/inválida)."""


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    key = (settings.LLM_TOKEN_ENC_KEY or "").strip()
    if not key:
        raise LLMTokenCryptoError(
            "LLM_TOKEN_ENC_KEY não configurada — gere com "
            '`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`'
        )
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError) as exc:  # chave malformada
        raise LLMTokenCryptoError(
            "LLM_TOKEN_ENC_KEY inválida (esperado Fernet base64 url-safe de 32 bytes)"
        ) from exc


def encrypt(token: str) -> str:
    """Cifra um token claro → string base64 (para gravar em token_encrypted)."""
    if not token:
        raise LLMTokenCryptoError("token vazio não pode ser cifrado")
    return _fernet().encrypt(token.encode()).decode()


def decrypt(cipher: str) -> str:
    """Decifra token_encrypted → token claro (uso só em memória, nunca persistir)."""
    try:
        return _fernet().decrypt(cipher.encode()).decode()
    except InvalidToken as exc:
        raise LLMTokenCryptoError("token cifrado inválido ou chave trocada") from exc


def mask(token: str | None) -> str:
    """Máscara segura: 6 primeiros + 4 últimos (mesma regra de ai_settings._mask)."""
    if not token:
        return ""
    if len(token) <= 12:
        return "•" * len(token)
    return f"{token[:6]}…{token[-4:]}"

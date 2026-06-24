"""Rate-limit simples (janela fixa) sobre o Redis já existente.

Reusa o cliente de `redis_pub`. A política de falha é escolhida pelo chamador:
- ações caras (iniciar/parear, que disparam trabalho na Evolution/WAHA) → fail_open=False
  (Redis indisponível levanta RateLimitError → o router responde 503);
- leitura barata (status/info) → fail_open=True (degrada sem bloquear).
"""
from __future__ import annotations

import logging

from app.services.redis_pub import _get_redis

logger = logging.getLogger(__name__)


class RateLimitError(Exception):
    """Redis indisponível enquanto a política exigida é fail-closed."""


def dentro_do_limite(chave: str, limite: int, janela_s: int, *, fail_open: bool = True) -> bool:
    """True se a requisição está DENTRO do limite; False se estourou.

    Janela fixa: INCR na chave e, na primeira ocorrência, EXPIRE para a janela.
    """
    try:
        r = _get_redis()
        atual = r.incr(chave)
        if atual == 1:
            r.expire(chave, janela_s)
        return int(atual) <= limite
    except Exception as exc:  # Redis fora do ar
        logger.warning("[rate_limit] Redis indisponível para %s: %s", chave, exc)
        if fail_open:
            return True
        raise RateLimitError(str(exc)) from exc

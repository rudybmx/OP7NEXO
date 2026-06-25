"""Canonização de telefone BR para vínculo do agendamento ao contato.

Espelha a regra do 9º dígito de `whatsapp_crm_persistence._canonical_br_jid`: o mesmo
celular escrito com/sem o 9, com/sem DDI 55, colapsa numa ÚNICA forma canônica (13 dígitos
`55 + DDD + 9 + 8díg`). Assim variantes do mesmo número casam o mesmo contato e não fragmentam.

Função pura (sem DB) — testável isoladamente.
"""
from __future__ import annotations

import re


def _digits(value: str | None) -> str:
    return re.sub(r"\D", "", str(value or ""))


def canonical_phone_digits(telefone: str | None) -> str | None:
    """Retorna os dígitos canônicos do telefone (celular BR → 13 díg) ou None se vazio.

    Casos cobertos (todos colapsam no mesmo canônico para o mesmo número):
    - `5547999998888` (13, já canônico) → mantém
    - `554799998888`  (12, falta o 9)   → insere o 9
    - `47999998888`   (11, sem DDI)     → prefixa 55
    - `4799998888`    (10, sem DDI/9)   → prefixa 55 + insere 9
    Não-celular-BR (fixo, estrangeiro, irreconhecível) → retorna os dígitos como vieram.
    """
    digits = _digits(telefone)
    if not digits:
        return None

    # 13 díg: 55 + DDD + 9 + 8díg → canônico
    if len(digits) == 13 and digits.startswith("55") and digits[4] == "9":
        return digits
    # 12 díg: 55 + DDD + 8díg (celular sem o 9) → insere o 9
    if len(digits) == 12 and digits.startswith("55") and digits[4] in "6789":
        return f"{digits[:4]}9{digits[4:]}"
    # 11 díg: DDD + 9 + 8díg (celular sem DDI) → prefixa 55
    if len(digits) == 11 and digits[2] == "9":
        return f"55{digits}"
    # 10 díg: DDD + 8díg (celular antigo sem DDI/9) → prefixa 55 e insere o 9
    if len(digits) == 10 and digits[2] in "6789":
        return f"55{digits[:2]}9{digits[2:]}"

    # Fixo BR, número estrangeiro ou formato não reconhecido: match exato pelos dígitos
    return digits

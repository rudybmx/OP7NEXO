"""Canonização de telefone BR (vínculo do agendamento ao contato)."""
from app.services.agenda.telefone import canonical_phone_digits

CANON = "5547999998888"


def test_variantes_9digito_colapsam_no_mesmo_canonico():
    # Todas as variantes do MESMO celular casam o mesmo contato.
    assert canonical_phone_digits("5547999998888") == CANON  # 13 díg (canônico)
    assert canonical_phone_digits("554799998888") == CANON   # 12 díg (sem o 9)
    assert canonical_phone_digits("47999998888") == CANON    # 11 díg (sem DDI)
    assert canonical_phone_digits("4799998888") == CANON     # 10 díg (sem DDI e sem 9)
    assert canonical_phone_digits("+55 (47) 99999-8888") == CANON
    assert canonical_phone_digits("55 47 9 9999 8888") == CANON


def test_vazio_e_nulo():
    assert canonical_phone_digits(None) is None
    assert canonical_phone_digits("") is None
    assert canonical_phone_digits("   ") is None
    assert canonical_phone_digits("abc") is None


def test_fixo_e_estrangeiro_mantem_digitos():
    # Fixo BR (10 díg, 3º dígito não é celular) → match exato pelos dígitos
    assert canonical_phone_digits("4733334444") == "4733334444"
    # Número fora do padrão BR → dígitos como vieram
    assert canonical_phone_digits("12025550123") == "12025550123"


def test_idempotente():
    assert canonical_phone_digits(canonical_phone_digits("4799998888")) == CANON

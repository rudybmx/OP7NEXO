"""Motor de disponibilidade (função pura gerar_slots): horário, almoço, passado,
bloqueio, capacidade e timezone."""
import datetime as dt
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.services.agenda.disponibilidade import Faixa, gerar_slots

BRT = ZoneInfo("America/Sao_Paulo")
FUSO = "America/Sao_Paulo"
DIA = dt.date(2099, 6, 1)  # futuro p/ não cair na regra de "passado"


def _utc(h, mi=0, *, dia=DIA):
    return datetime(dia.year, dia.month, dia.day, h, mi, tzinfo=BRT).astimezone(timezone.utc)


def _meia_noite():
    return _utc(0)


def test_slots_basicos_sem_ocupacao():
    faixas = [Faixa("09:00", "12:00", 60)]
    slots = gerar_slots(data=DIA, fuso=FUSO, faixas=faixas, bloqueios=[], ocupacoes=[], capacidade=1, agora=_meia_noite())
    assert [s["inicio"] for s in slots] == [_utc(9), _utc(10), _utc(11)]
    assert all(s["vagas_restantes"] == 1 for s in slots)


def test_almoco_removido():
    faixas = [Faixa("09:00", "14:00", 60, tem_almoco=True, almoco_inicio="12:00", almoco_fim="13:00")]
    slots = gerar_slots(data=DIA, fuso=FUSO, faixas=faixas, bloqueios=[], ocupacoes=[], capacidade=1, agora=_meia_noite())
    inicios = [s["inicio"] for s in slots]
    assert _utc(12) not in inicios  # almoço
    assert inicios == [_utc(9), _utc(10), _utc(11), _utc(13)]


def test_passado_removido():
    faixas = [Faixa("09:00", "12:00", 60)]
    slots = gerar_slots(data=DIA, fuso=FUSO, faixas=faixas, bloqueios=[], ocupacoes=[], capacidade=1, agora=_utc(10))
    inicios = [s["inicio"] for s in slots]
    assert _utc(9) not in inicios
    assert inicios == [_utc(10), _utc(11)]


def test_bloqueio_remove_slot():
    faixas = [Faixa("09:00", "12:00", 60)]
    bloqueios = [(_utc(10), _utc(11))]
    slots = gerar_slots(data=DIA, fuso=FUSO, faixas=faixas, bloqueios=bloqueios, ocupacoes=[], capacidade=1, agora=_meia_noite())
    assert [s["inicio"] for s in slots] == [_utc(9), _utc(11)]


def test_capacidade_conta_ocupacao():
    faixas = [Faixa("09:00", "11:00", 60)]
    ocup = [(_utc(9), _utc(10))]  # 1 ocupação 9-10
    slots2 = gerar_slots(data=DIA, fuso=FUSO, faixas=faixas, bloqueios=[], ocupacoes=ocup, capacidade=2, agora=_meia_noite())
    vagas = {s["inicio"]: s["vagas_restantes"] for s in slots2}
    assert vagas[_utc(9)] == 1   # capacidade 2 - 1 ocupada
    assert vagas[_utc(10)] == 2  # livre
    # capacidade 1 → 9h some
    slots1 = gerar_slots(data=DIA, fuso=FUSO, faixas=faixas, bloqueios=[], ocupacoes=ocup, capacidade=1, agora=_meia_noite())
    assert [s["inicio"] for s in slots1] == [_utc(10)]


def test_back_to_back_nao_colide():
    # ocupação [9,10) não bloqueia slot [10,11) — ranges semiabertos
    faixas = [Faixa("09:00", "11:00", 60)]
    ocup = [(_utc(9), _utc(10))]
    slots = gerar_slots(data=DIA, fuso=FUSO, faixas=faixas, bloqueios=[], ocupacoes=ocup, capacidade=1, agora=_meia_noite())
    assert _utc(10) in [s["inicio"] for s in slots]


def test_duracao_override():
    faixas = [Faixa("09:00", "10:00", 60)]
    slots = gerar_slots(data=DIA, fuso=FUSO, faixas=faixas, bloqueios=[], ocupacoes=[], capacidade=1, agora=_meia_noite(), duracao_min=30)
    assert [s["inicio"] for s in slots] == [_utc(9), _utc(9, 30)]


def test_multiplas_faixas_mesmo_dia():
    # turno manhã + tarde (sem almoço, duas faixas)
    faixas = [Faixa("09:00", "11:00", 60), Faixa("14:00", "16:00", 60)]
    slots = gerar_slots(data=DIA, fuso=FUSO, faixas=faixas, bloqueios=[], ocupacoes=[], capacidade=1, agora=_meia_noite())
    assert [s["inicio"] for s in slots] == [_utc(9), _utc(10), _utc(14), _utc(15)]

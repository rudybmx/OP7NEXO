"""Serviços de domínio da Agenda nativa (Fase 1)."""
from app.services.agenda.telefone import canonical_phone_digits
from app.services.agenda.disponibilidade import Faixa, calcular_disponibilidade, gerar_slots
from app.services.agenda.agendamento import (
    AgendaNaoEncontrada,
    ConflitoAgendamento,
    DadosInvalidos,
    atualizar_status,
    cancelar,
    criar_agendamento,
    reagendar,
    resolver_contato_por_telefone,
)

__all__ = [
    "canonical_phone_digits",
    "Faixa",
    "gerar_slots",
    "calcular_disponibilidade",
    "criar_agendamento",
    "atualizar_status",
    "cancelar",
    "reagendar",
    "resolver_contato_por_telefone",
    "AgendaNaoEncontrada",
    "ConflitoAgendamento",
    "DadosInvalidos",
]

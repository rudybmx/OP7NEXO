"""Teto de visibilidade de conversas por papel (Fase 1 — port QOZT).

Regra de produto: `company_agent` é o ÚNICO papel restrito — vê/atende/transfere
só as conversas onde é `responsavel_id`. Todos os outros papéis
(company_admin, network_viewer, network_admin, platform_admin) veem TODAS.

O teto é aplicado ANTES dos filtros de UI (o usuário estreita a visão dentro do
teto, nunca amplia além dele). Acesso fora do teto = 404 (não vazar existência).
"""
from app.models.crm.conversa import Conversa
from app.models.user import User


def _role_value(usuario: User) -> str:
    """Robusto a role como Enum (.value) ou string crua."""
    role = getattr(usuario, "role", None)
    return getattr(role, "value", role) or ""


def eh_supervisor(usuario: User) -> bool:
    """True para quem vê todas as conversas (todos menos company_agent)."""
    return _role_value(usuario) != "company_agent"


def aplicar_teto_conversas(query, usuario: User):
    """Restringe a query de conversas ao teto do usuário. company_agent só vê as
    suas (responsavel_id == eu); supervisores não sofrem filtro."""
    if eh_supervisor(usuario):
        return query
    return query.filter(Conversa.responsavel_id == usuario.id)


def pode_ver_conversa(usuario: User, conversa: Conversa) -> bool:
    return eh_supervisor(usuario) or conversa.responsavel_id == usuario.id


def pode_transferir(usuario: User, conversa: Conversa) -> bool:
    """Atendente transfere só as dele; supervisor transfere qualquer uma."""
    return eh_supervisor(usuario) or conversa.responsavel_id == usuario.id

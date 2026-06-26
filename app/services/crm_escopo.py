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


# ─── Contatos (mesma regra de teto, por responsável / "teve conversa") ───────────
def aplicar_teto_contatos(query, usuario: User):
    """Restringe a query de contatos ao teto do usuário. company_agent só vê os DELE:
    onde é o responsável do contato OU teve alguma conversa atribuída a ele com esse
    contato ('no qual ele teve conversa'). Supervisores não sofrem filtro."""
    if eh_supervisor(usuario):
        return query
    from sqlalchemy import or_, select
    from app.models.crm.contato import Contato
    suas_conversas = select(Conversa.contato_id).where(Conversa.responsavel_id == usuario.id)
    return query.filter(
        or_(Contato.responsavel_id == usuario.id, Contato.id.in_(suas_conversas))
    )


def pode_ver_contato(usuario: User, contato, db=None) -> bool:
    """company_agent vê um contato se é o responsável dele OU teve conversa com ele."""
    if eh_supervisor(usuario):
        return True
    if getattr(contato, "responsavel_id", None) == usuario.id:
        return True
    if db is not None:
        existe = (
            db.query(Conversa.id)
            .filter(Conversa.contato_id == contato.id, Conversa.responsavel_id == usuario.id)
            .first()
        )
        return existe is not None
    return False


def pode_acessar_tela_contatos(usuario: User) -> bool:
    """Gate da tela de contatos: supervisores/admins sempre; company_agent só com a
    flag `pode_acessar_crm` ligada."""
    return eh_supervisor(usuario) or bool(getattr(usuario, "pode_acessar_crm", False))

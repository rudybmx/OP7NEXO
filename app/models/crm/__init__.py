from app.models.crm.assignment import ConversationAssignment
from app.models.crm.contato import Contato
from app.models.crm.conversa import Conversa
from app.models.crm.equipe import Equipe, EquipeMembro, Permissao
from app.models.crm.etiqueta import CrmEtiqueta, crm_conversa_etiquetas
from app.models.crm.evento import Evento
from app.models.crm.followup import FollowUp
from app.models.crm.lead_origin_event import LeadOriginEvent
from app.models.crm.mensagem import Mensagem
from app.models.crm.message_job import MessageJob
from app.models.crm.memoria_ia import MemoriaIA
from app.models.crm.midia import Midia

__all__ = [
    "Contato",
    "ConversationAssignment",
    "Conversa",
    "CrmEtiqueta",
    "crm_conversa_etiquetas",
    "Mensagem",
    "Equipe",
    "EquipeMembro",
    "Permissao",
    "Midia",
    "Evento",
    "FollowUp",
    "LeadOriginEvent",
    "MessageJob",
    "MemoriaIA",
]

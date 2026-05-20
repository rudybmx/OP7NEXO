from app.models.crm.contato import Contato
from app.models.crm.conversa import Conversa
from app.models.crm.equipe import Equipe, EquipeMembro, Permissao
from app.models.crm.evento import Evento
from app.models.crm.mensagem import Mensagem
from app.models.crm.memoria_ia import MemoriaIA
from app.models.crm.midia import Midia

__all__ = [
    "Contato",
    "Conversa",
    "Mensagem",
    "Equipe",
    "EquipeMembro",
    "Permissao",
    "Midia",
    "Evento",
    "MemoriaIA",
]

"""Labels canônicos de provider de canal.

Derivação read-only a partir de ``tipo`` + ``config`` do canal. Não altera
ingestão nem envio — apenas expõe um ``provider``/``provider_label`` estável
para a listagem e a inbox do front (fonte única de verdade no backend).
"""

from __future__ import annotations

from app.services.webhook_api_ingestion import (
    CRM_EXTERNO_ZAPI_PROVIDER,
    webhook_provider_from_config,
)
from app.services.webhook_helena import HELENA_PROVIDER

# provider "macro" para tipos que não são webhook
_TIPO_PROVIDER = {
    "whatsapp_evolution": "evolution",
    "whatsapp_oficial": "meta_whatsapp",
    "instagram": "instagram_graph",
    "facebook": "facebook",
}

_TIPO_LABEL = {
    "whatsapp_evolution": "WhatsApp Evolution",
    "whatsapp_oficial": "WhatsApp Oficial",
    "instagram": "Instagram",
    "facebook": "Facebook",
}

# label por provider de webhook (segue o provider efetivo, nunca o nome do canal)
_WEBHOOK_PROVIDER_LABEL = {
    HELENA_PROVIDER: "Webhook Helena",
    CRM_EXTERNO_ZAPI_PROVIDER: "Webhook Qozt/Helena (Z-API)",
    "generic": "Webhook Genérico",
}


def canal_provider(tipo: str | None, config: dict | None) -> str:
    """Provider efetivo do canal (ex.: evolution, meta_whatsapp, helena, generic)."""
    if tipo == "webhook":
        return webhook_provider_from_config(config)
    return _TIPO_PROVIDER.get(tipo or "", tipo or "")


def canal_provider_label(tipo: str | None, config: dict | None) -> str:
    """Label humano do provider para listagem/inbox."""
    if tipo == "webhook":
        provider = webhook_provider_from_config(config)
        return _WEBHOOK_PROVIDER_LABEL.get(provider, "Webhook Genérico")
    return _TIPO_LABEL.get(tipo or "", tipo or "Canal")

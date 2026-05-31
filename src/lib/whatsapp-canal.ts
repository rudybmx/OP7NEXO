export type CanalAtendimentoTipo = 'whatsapp_evolution' | 'whatsapp_oficial' | 'webhook' | string | null | undefined

export function getCanalBadgeLabel(tipo?: CanalAtendimentoTipo) {
  return tipo === 'webhook' ? 'Webhook/API' : 'WhatsApp'
}

// Label específico de provider. Fonte de verdade = `provider_label` do backend
// (CanalOut). O fallback deriva de tipo/config caso o campo ainda não venha.
const WEBHOOK_PROVIDER_LABEL_FALLBACK: Record<string, string> = {
  helena: 'Webhook Helena',
  crm_externo_zapi: 'Webhook Qozt/Helena (Z-API)',
  generic: 'Webhook Genérico',
}

const TIPO_LABEL_FALLBACK: Record<string, string> = {
  whatsapp_evolution: 'WhatsApp Evolution',
  whatsapp_oficial: 'WhatsApp Oficial',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

export function getCanalProviderLabel(canal?: {
  provider_label?: string | null
  tipo?: CanalAtendimentoTipo
  config?: { webhook?: { provider?: string | null } | null } | null
}): string {
  if (canal?.provider_label) return canal.provider_label
  const tipo = canal?.tipo
  if (tipo === 'webhook') {
    const provider = canal?.config?.webhook?.provider || 'generic'
    return WEBHOOK_PROVIDER_LABEL_FALLBACK[provider] ?? 'Webhook Genérico'
  }
  return TIPO_LABEL_FALLBACK[tipo as string] ?? getCanalBadgeLabel(tipo)
}

export function getCanalTags(tipo?: CanalAtendimentoTipo) {
  switch (tipo) {
    case 'webhook':
      return ['Webhook/API']
    case 'whatsapp_oficial':
      return ['WhatsApp', 'Oficial']
    case 'whatsapp_evolution':
      return ['WhatsApp', 'Evolution']
    default:
      return []
  }
}

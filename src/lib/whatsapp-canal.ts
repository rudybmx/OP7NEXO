export type CanalAtendimentoTipo = 'whatsapp_evolution' | 'whatsapp_oficial' | 'webhook' | string | null | undefined

export function getCanalBadgeLabel(tipo?: CanalAtendimentoTipo) {
  return tipo === 'webhook' ? 'Webhook/API' : 'WhatsApp'
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

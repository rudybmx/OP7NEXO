import React from 'react'
import { wsSheetCreamInputStyle } from '@/components/ui/ws-sheet'

export type TipoCanal =
  | 'whatsapp_evolution'
  | 'whatsapp_oficial'
  | 'instagram'
  | 'facebook'
  | 'webhook'
  | 'todos'

export interface Workspace {
  id: string
  nome: string
}

export interface Canal {
  id: string
  workspace_id: string
  tipo: TipoCanal
  nome: string
  provider?: string
  provider_label?: string
  config: Record<string, string>
  mensagem_boas_vindas: string | null
  webhook_token: string | null
  status: string
  numero_telefone: string | null
  conectado_em: string | null
  evolution_instance_id: string | null
  connection_status: string | null
}

export interface NovoCanalForm {
  workspace_id: string
  tipo: Exclude<TipoCanal, 'todos'>
  nome: string
  mensagem_boas_vindas: string
  config: Record<string, string>
}

export const TIPOS: {
  id: Exclude<TipoCanal, 'todos'>
  label: string
  emoji: string
  cor: string
  corBg: string
}[] = [
  { id: 'whatsapp_evolution', label: 'WhatsApp Evolution', emoji: '📱', cor: '#25D366', corBg: 'rgba(37,211,102,0.15)' },
  { id: 'whatsapp_oficial',   label: 'WhatsApp Oficial',   emoji: '💬', cor: '#075E54', corBg: 'rgba(7,94,84,0.18)' },
  { id: 'instagram',          label: 'Instagram',          emoji: '📷', cor: '#E1306C', corBg: 'rgba(225,48,108,0.15)' },
  { id: 'facebook',           label: 'Facebook',           emoji: '👤', cor: '#1877F2', corBg: 'rgba(24,119,242,0.15)' },
  { id: 'webhook',            label: 'Webhook/API',        emoji: '🔗', cor: '#F59E0B', corBg: 'rgba(245,158,11,0.15)' },
]

export const WEBHOOK_BASE = 'https://api.op7franquia.com.br/webhook'

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  ...wsSheetCreamInputStyle,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

export const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ws-text-2)',
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

export function emptyForm(): NovoCanalForm {
  return {
    workspace_id: '',
    tipo: 'whatsapp_evolution',
    nome: '',
    mensagem_boas_vindas: '',
    config: {},
  }
}

export function tipoInfo(id: string) {
  return TIPOS.find(t => t.id === id)
}

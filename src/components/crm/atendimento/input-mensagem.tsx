'use client'

import { Send, Smile, Paperclip, Mic } from 'lucide-react'
import type { ConversaApi } from '@/hooks/use-conversas'

interface InputMensagemProps {
  valor: string
  onChange: (v: string) => void
  onEnviar: () => void
  isEnviando: boolean
  conversa: ConversaApi
  onAssumir: () => void
  erro?: string | null
}

export function InputMensagem({ valor, onChange, onEnviar, isEnviando, conversa, onAssumir, erro }: InputMensagemProps) {
  const isBloqueado = !conversa.responsavelId && conversa.status === 'nova'

  return (
    <div style={{
      padding: '12px 20px',
      borderTop: '1px solid var(--ws-divider)',
      background: 'rgba(255,255,255,0.01)',
      width: '100%',
      minWidth: 0,
      boxSizing: 'border-box',
    }}>
      {/* Toggle IA / Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--ws-text-2)', fontWeight: 500 }}>
            {conversa.responsavelId ? 'IA Agente (pausada)' : 'IA Agente (ativa)'}
          </span>
        </div>
        {conversa.campanha && (
          <span style={{ fontSize: 10, color: 'var(--ws-text-3)', fontStyle: 'italic' }}>
            Campanha: {conversa.campanha}
          </span>
        )}
      </div>

      {erro && (
        <div style={{
          marginBottom: 12,
          padding: '8px 12px',
          borderRadius: 10,
          border: '1px solid rgba(239,68,68,0.25)',
          background: 'rgba(239,68,68,0.08)',
          color: '#ef4444',
          fontSize: 12,
          lineHeight: 1.4,
        }}>
          {erro}
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 12,
          padding: '8px 12px',
        }}>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 6 }}>
            <button style={iconBtnStyle} disabled={isBloqueado}><Smile size={18} /></button>
            <button style={iconBtnStyle} disabled={isBloqueado}><Paperclip size={18} /></button>
            <button style={iconBtnStyle} disabled={isBloqueado}><Mic size={18} /></button>
          </div>

          {isBloqueado ? (
            <button
              onClick={onAssumir}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                color: 'var(--ws-blue)',
                fontSize: 13,
                textAlign: 'left',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              Conversa com IA. Clique para assumir...
            </button>
          ) : (
            <textarea
              value={valor}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onEnviar()
                }
              }}
              placeholder="Digite uma mensagem..."
              disabled={isEnviando}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                color: 'var(--ws-text-1)',
                fontSize: 13,
                outline: 'none',
                resize: 'none',
                minWidth: 0,
                padding: '4px 0',
                minHeight: 20,
                maxHeight: 100,
              }}
              rows={1}
            />
          )}
        </div>

        <button
          onClick={onEnviar}
          disabled={isEnviando || !valor.trim() || isBloqueado}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: isEnviando || !valor.trim() || isBloqueado
              ? 'rgba(62,91,255,0.45)'
              : 'linear-gradient(135deg, var(--ws-blue) 0%, var(--ws-purple) 100%)',
            border: 'none',
            color: 'white',
            cursor: isEnviando ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(62, 91, 255, 0.2)',
            opacity: isEnviando ? 0.8 : 1,
          }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--ws-text-3)',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.2s',
}

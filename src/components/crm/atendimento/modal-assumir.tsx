'use client'

import type { ConversaApi } from '@/hooks/use-conversas'

interface ModalAssumirProps {
  conversa: ConversaApi
  onConfirmar: () => void
  onCancelar: () => void
  isAssumindo: boolean
  erro?: string | null
}

export function ModalAssumir({ conversa, onConfirmar, onCancelar, isAssumindo, erro }: ModalAssumirProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 16,
        padding: 24,
        maxWidth: 400,
        width: '90%',
        boxSizing: 'border-box',
        boxShadow: 'var(--ws-glass-shadow)',
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)', marginBottom: 8 }}>
          Assumir conversa
        </h3>
        <p style={{ fontSize: 13, color: 'var(--ws-text-2)', lineHeight: 1.5, marginBottom: 20 }}>
          A conversa com <strong>{conversa.contato.nome}</strong> está sendo atendida pela IA.
          Deseja assumir esta conversa?
        </p>
        {erro && (
          <div style={{
            marginBottom: 16,
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
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancelar}
            disabled={isAssumindo}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--ws-glass-border)',
              background: 'transparent',
              color: 'var(--ws-text-2)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={isAssumindo}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, var(--ws-blue) 0%, var(--ws-purple) 100%)',
              color: 'white',
              cursor: isAssumindo ? 'wait' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {isAssumindo ? 'Assumindo...' : 'Assumir conversa'}
          </button>
        </div>
      </div>
    </div>
  )
}

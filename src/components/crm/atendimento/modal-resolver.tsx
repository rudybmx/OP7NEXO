'use client'

import { useState } from 'react'
import type { ConversaApi } from '@/hooks/use-conversas'

interface ModalResolverProps {
  conversa: ConversaApi
  onConfirmar: (resolucao: string, observacao?: string) => void
  onCancelar: () => void
  isResolvendo: boolean
  erro?: string | null
}

export function ModalResolver({ conversa, onConfirmar, onCancelar, isResolvendo, erro }: ModalResolverProps) {
  const [resolucao, setResolucao] = useState<string>('')
  const [observacao, setObservacao] = useState('')

  const podeConfirmar = resolucao && !isResolvendo

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
        maxWidth: 420,
        width: '90%',
        boxSizing: 'border-box',
        boxShadow: 'var(--ws-glass-shadow)',
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)', marginBottom: 8 }}>
          Resolver conversa
        </h3>
        <p style={{ fontSize: 13, color: 'var(--ws-text-2)', lineHeight: 1.5, marginBottom: 20 }}>
          Marcar a conversa com <strong>{conversa.contato.nome}</strong> como resolvida.
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

        {/* Tipo de resolução */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ws-text-2)', marginBottom: 6 }}>
            Resultado *
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setResolucao('ganho')}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: resolucao === 'ganho' ? '1.5px solid #1D9E75' : '1px solid var(--ws-glass-border)',
                background: resolucao === 'ganho' ? 'rgba(29,158,117,0.12)' : 'var(--ws-glass-bg)',
                color: resolucao === 'ganho' ? '#1D9E75' : 'var(--ws-text-2)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: resolucao === 'ganho' ? 600 : 400,
              }}
            >
              ✅ Ganho
            </button>
            <button
              onClick={() => setResolucao('perdido')}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: resolucao === 'perdido' ? '1.5px solid #a32d2d' : '1px solid var(--ws-glass-border)',
                background: resolucao === 'perdido' ? 'rgba(163,45,45,0.12)' : 'var(--ws-glass-bg)',
                color: resolucao === 'perdido' ? '#a32d2d' : 'var(--ws-text-2)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: resolucao === 'perdido' ? 600 : 400,
              }}
            >
              ❌ Perdido
            </button>
          </div>
        </div>

        {/* Observação */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ws-text-2)', marginBottom: 6 }}>
            Observação (opcional)
          </label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={3}
            placeholder="Motivo ou detalhes da resolução..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--ws-glass-border)',
              background: 'var(--ws-glass-bg)',
              color: 'var(--ws-text-1)',
              fontSize: 13,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancelar}
            disabled={isResolvendo}
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
            onClick={() => onConfirmar(resolucao, observacao || undefined)}
            disabled={!podeConfirmar}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #1D9E75 0%, #0fa856 100%)',
              color: 'white',
              cursor: !podeConfirmar ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              opacity: !podeConfirmar ? 0.6 : 1,
            }}
          >
            {isResolvendo ? 'Resolvendo...' : 'Resolver'}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { MessageCircle } from 'lucide-react'
import { useState, useCallback } from 'react'

interface ModalIniciarConversaProps {
  aberto: boolean
  onFechar: () => void
  onCriar: (numero: string) => void
  isCriando: boolean
  erro?: string | null
}

function normalizarInput(valor: string): string {
  return valor.replace(/\D/g, '')
}

export function ModalIniciarConversa({ aberto, onFechar, onCriar, isCriando, erro }: ModalIniciarConversaProps) {
  const [numero, setNumero] = useState('')
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const erroExibido = erroLocal ?? erro ?? null

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = normalizarInput(e.target.value)
    setNumero(raw)
    setErroLocal(null)
  }, [])

  const handleSubmit = useCallback(() => {
    if (numero.length < 10) {
      setErroLocal('Digite o DDD + número (mínimo 10 dígitos)')
      return
    }
    onCriar(numero)
  }, [numero, onCriar])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') onFechar()
  }, [handleSubmit, onFechar])

  if (!aberto) return null

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <MessageCircle size={16} color="white" />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)', margin: 0 }}>
            Iniciar conversa
          </h3>
        </div>

        <p style={{ fontSize: 13, color: 'var(--ws-text-2)', lineHeight: 1.5, marginBottom: 16 }}>
          Digite o número de telefone com DDD para iniciar uma nova conversa.
        </p>

        <div style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--ws-text-3)',
              fontSize: 14,
              fontWeight: 600,
              userSelect: 'none',
            }}>+</span>
            <input
              autoFocus
              type="tel"
              value={numero}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="55 11 99999 9999"
              disabled={isCriando}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 14px 10px 30px',
                borderRadius: 10,
                background: 'var(--ws-glass-bg)',
                border: erroExibido ? '1px solid #ef4444' : '1px solid var(--ws-glass-border)',
                color: 'var(--ws-text-1)',
                fontSize: 15,
                fontVariantNumeric: 'tabular-nums',
                outline: 'none',
                letterSpacing: '0.02em',
              }}
            />
          </div>
          {erroExibido && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10 }}>⚠</span> {erroExibido}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onFechar}
            disabled={isCriando}
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
            onClick={handleSubmit}
            disabled={isCriando || numero.length < 10}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, var(--ws-blue) 0%, var(--ws-purple) 100%)',
              color: 'white',
              cursor: isCriando ? 'wait' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              opacity: numero.length < 10 ? 0.5 : 1,
            }}
          >
            {isCriando ? 'Criando...' : 'Criar conversa'}
          </button>
        </div>
      </div>
    </div>
  )
}

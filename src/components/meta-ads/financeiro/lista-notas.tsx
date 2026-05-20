'use client'

import { NotebookText, Wallet } from 'lucide-react'
import type { FinanceiroMetaAds } from '@/types/meta-ads-financeiro'
import { FinanceiroEmptyState } from './empty-state'
import { formatDateTime } from './utils'

interface ListaNotasFinanceirasProps {
  financeiro: FinanceiroMetaAds | null
}

export function ListaNotasFinanceiras({ financeiro }: ListaNotasFinanceirasProps) {
  if (!financeiro) return null

  if (financeiro.selectionRequired && !financeiro.selectedAccount) {
    return (
      <FinanceiroEmptyState
        icon={Wallet}
        title="Notas e observações"
        description="Selecione uma conta para acessar notas financeiras vinculadas a este bloco."
      />
    )
  }

  if (financeiro.notesState !== 'ready' || financeiro.notes.length === 0) {
    return (
      <FinanceiroEmptyState
        icon={NotebookText}
        title="Sem notas sincronizadas"
        description="Nesta primeira versão, a lista de notas fica vazia até que a camada de faturamento seja integrada."
      />
    )
  }

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow-sm)',
      overflow: 'hidden',
      position: 'relative',
      padding: 16,
    }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }} />

      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ws-text-3)', marginBottom: 6 }}>
        Notas
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 12 }}>
        Observações e referências
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {financeiro.notes.map((item) => (
          <div
            key={item.id}
            style={{
              border: '1px solid var(--ws-divider)',
              background: 'rgba(255,255,255,0.30)',
              borderRadius: 'var(--ws-radius-md)',
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                  {item.titulo}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 4 }}>
                  {item.categoria || 'Sem categoria'}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>
                {formatDateTime(item.data)}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ws-text-2)', marginTop: 10, lineHeight: 1.55 }}>
              {item.corpo}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

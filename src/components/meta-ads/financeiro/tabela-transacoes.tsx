'use client'

import { ArrowLeftRight, Wallet } from 'lucide-react'
import type { FinanceiroMetaAds } from '@/types/meta-ads-financeiro'
import { FinanceiroEmptyState } from './empty-state'
import { formatCurrency, formatDateTime } from './utils'

interface TabelaTransacoesFinanceirasProps {
  financeiro: FinanceiroMetaAds | null
}

export function TabelaTransacoesFinanceiras({ financeiro }: TabelaTransacoesFinanceirasProps) {
  if (!financeiro) return null

  if (financeiro.selectionRequired && !financeiro.selectedAccount) {
    return (
      <FinanceiroEmptyState
        icon={Wallet}
        title="Transações por conta"
        description="Escolha uma conta para liberar o histórico financeiro desta área."
      />
    )
  }

  if (financeiro.transactionsState !== 'ready' || financeiro.transactions.length === 0) {
    return (
      <FinanceiroEmptyState
        icon={ArrowLeftRight}
        title="Nenhuma transação sincronizada"
        description="Esta versão do financeiro ainda não carrega o extrato detalhado. Quando houver dados, eles aparecerão aqui."
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
    }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }} />

      <div style={{ padding: '14px 16px 12px' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ws-text-3)', marginBottom: 6 }}>
          Transações
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
          Extrato recente
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(62,91,255,0.04)' }}>
              {['Data', 'Descrição', 'Tipo', 'Valor', 'Status'].map((col) => (
                <th
                  key={col}
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--ws-text-3)',
                    borderBottom: '1px solid var(--ws-divider)',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {financeiro.transactions.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--ws-divider)' }}>
                <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ws-text-2)' }}>
                  {formatDateTime(item.data)}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ws-text-1)', fontWeight: 500 }}>
                  {item.descricao}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ws-text-2)' }}>
                  {item.tipo}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ws-text-1)', fontWeight: 600 }}>
                  {formatCurrency(item.valor, financeiro.summary.currency)}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ws-text-2)' }}>
                  {item.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

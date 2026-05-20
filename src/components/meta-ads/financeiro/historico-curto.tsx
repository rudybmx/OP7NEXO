'use client'

import { Clock3, Wallet } from 'lucide-react'
import { MiniGauge } from '@/components/ui/mini-gauge'
import type { FinanceiroMetaAds } from '@/types/meta-ads-financeiro'
import { FinanceiroEmptyState } from './empty-state'
import { formatCurrency, formatDateTime } from './utils'
import { getSaldoDisplay } from './saldo-display'

interface HistoricoCurtoFinanceiroProps {
  financeiro: FinanceiroMetaAds | null
}

function stateColor(state: FinanceiroMetaAds['summary']['alertState']) {
  if (state === 'critical') return 'var(--ws-coral)'
  if (state === 'warning') return 'var(--ws-gold)'
  if (state === 'ok') return 'var(--ws-green)'
  return 'var(--ws-text-3)'
}

export function HistoricoCurtoFinanceiro({ financeiro }: HistoricoCurtoFinanceiroProps) {
  if (!financeiro) return null

  if (financeiro.selectionRequired && !financeiro.selectedAccount) {
    return (
      <FinanceiroEmptyState
        icon={Wallet}
        title="Escolha uma conta para ver o histórico curto"
        description={financeiro.selectionMessage}
      />
    )
  }

  const resumo = financeiro.summary
  const presentation = getSaldoDisplay(financeiro.selectedAccount ?? financeiro.accounts[0] ?? null)
  const gaugeValue = resumo.alertRatio == null ? 0 : Math.max(0, Math.min(100, resumo.alertRatio * 100))
  const tone = stateColor(resumo.alertState)

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow-sm)',
      position: 'relative',
      overflow: 'hidden',
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

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--ws-text-3)',
            marginBottom: 6,
          }}>
            Histórico curto
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            {financeiro.selectedAccount?.accountName || financeiro.selectedAccount?.label || 'Conta Meta'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-2)', marginTop: 4 }}>
            {financeiro.selectedAccount?.fundingTypeLabel || resumo.fundingTypeLabel || 'Financiamento não informado'}
          </div>
        </div>

        <MiniGauge
          value={gaugeValue}
          size={52}
          strokeWidth={4}
          color={tone}
          label={undefined}
          showValue={true}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 10,
        marginTop: 14,
      }}>
        {[
          {
            label: presentation.label,
            value: formatCurrency(presentation.amount, resumo.currency),
          },
          {
            label: resumo.referenceLabel,
            value: resumo.referenceAmount ? formatCurrency(resumo.referenceAmount, resumo.currency) : 'Sem referência',
          },
          {
            label: 'Gasto acumulado',
            value: formatCurrency(resumo.amountSpent, resumo.currency),
          },
          {
            label: 'Atualizado em',
            value: formatDateTime(financeiro.updatedAt || resumo.updatedAt),
          },
        ].map((item) => (
          <div key={item.label} style={{
            border: '1px solid var(--ws-divider)',
            background: 'rgba(255,255,255,0.30)',
            borderRadius: 'var(--ws-radius-md)',
            padding: 12,
            minWidth: 0,
          }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)' }}>
              {item.label}
            </div>
            <div style={{
              marginTop: 6,
              fontSize: 13,
              fontWeight: 600,
              color: item.label === 'Atualizado em' ? 'var(--ws-text-2)' : 'var(--ws-text-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 12,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: '9999px',
          border: `1px solid ${resumo.alertState === 'critical' ? 'rgba(255,92,141,0.25)' : resumo.alertState === 'warning' ? 'var(--ws-gold-border)' : 'rgba(15,168,86,0.22)'}`,
          background:
            resumo.alertState === 'critical'
              ? 'rgba(255,92,141,0.08)'
              : resumo.alertState === 'warning'
                ? 'rgba(242,101,34,0.08)'
                : 'rgba(15,168,86,0.08)',
          color: tone,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          <Clock3 size={11} />
          {resumo.alertState === 'critical'
            ? 'Saldo crítico'
            : resumo.alertState === 'warning'
              ? 'Saldo em atenção'
              : resumo.alertState === 'ok'
                ? 'Saldo saudável'
                : 'Sem cálculo'}
        </span>
        <span style={{
          fontSize: 12,
          color: 'var(--ws-text-2)',
          lineHeight: 1.45,
        }}>
          {resumo.alertMessage}
        </span>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { FinanceiroMetaAds } from '@/types/meta-ads-financeiro'
import { SaldoFinanceiroCard } from './saldo-card'
import { HistoricoCurtoFinanceiro } from './historico-curto'
import { TabelaTransacoesFinanceiras } from './tabela-transacoes'
import { ListaNotasFinanceiras } from './lista-notas'

interface Props {
  financeiro: FinanceiroMetaAds | null
  onSelecionarConta: (contaId: string) => void
  onVoltarVisaoGeral: () => void
}

export function AbaFinanceiro({ financeiro, onSelecionarConta, onVoltarVisaoGeral }: Props) {
  const [mostrarResumo, setMostrarResumo] = useState(true)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--ws-text-3)',
            marginBottom: 6,
          }}>
            Financeiro
          </div>
          <h2 style={{ fontSize: 20, lineHeight: 1.2, fontWeight: 700, color: 'var(--ws-text-1)', margin: 0 }}>
            Conta Meta selecionada
          </h2>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 6, marginBottom: 0 }}>
            O financeiro é individual por conta ativa. Se houver mais de uma disponível, escolha a conta certa para ver saldo, limite e histórico.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMostrarResumo((prev) => !prev)}
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 'var(--ws-radius-md)',
            border: '1px solid var(--ws-glass-border)',
            background: 'var(--ws-glass-bg)',
            color: 'var(--ws-text-1)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {mostrarResumo ? 'Ocultar resumo' : 'Mostrar resumo'}
        </button>
      </div>

      <SaldoFinanceiroCard
        financeiro={financeiro}
        compact={false}
        ctaLabel="Voltar à Visão Geral"
        onCtaClick={onVoltarVisaoGeral}
        onSelecionarConta={onSelecionarConta}
      />

      {mostrarResumo && <HistoricoCurtoFinanceiro financeiro={financeiro} />}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 16,
        alignItems: 'start',
      }}>
        <TabelaTransacoesFinanceiras financeiro={financeiro} />
        <ListaNotasFinanceiras financeiro={financeiro} />
      </div>
    </div>
  )
}

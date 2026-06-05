'use client'

import { useState } from 'react'
import type { ContaAnuncio } from '@/types/meta-ads'
import type { FinanceiroMetaAds } from '@/types/meta-ads-financeiro'
import { formatarMoeda, formatarNumeroCompacto, formatarPorcentagem } from '@/lib/formatar'

type ChaveOrdenacao = 'nome' | 'investimento' | 'leads' | 'cpl' | 'cpc' | 'cpm' | 'ctr' | 'impressoes' | 'frequencia' | 'saldo'
type DirecaoOrdenacao = 'asc' | 'desc'

function IconeOrdenacao({ coluna, chaveOrdenacao, direcao }: { coluna: ChaveOrdenacao; chaveOrdenacao: ChaveOrdenacao; direcao: DirecaoOrdenacao }) {
  if (chaveOrdenacao !== coluna) {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.3 }}>
        <polyline points="18 15 12 9 6 15" />
      </svg>
    )
  }
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#3E5BFF' }}>
      {direcao === 'asc' ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
    </svg>
  )
}

interface TabelaContasProps {
  contas: ContaAnuncio[]
  financeiro?: FinanceiroMetaAds | null
}

const COLUNAS: { chave: ChaveOrdenacao; label: string }[] = [
  { chave: 'nome', label: 'Conta' },
  { chave: 'investimento', label: 'Investimento' },
  { chave: 'leads', label: 'Leads' },
  { chave: 'cpl', label: 'CPL' },
  { chave: 'cpc', label: 'CPC' },
  { chave: 'cpm', label: 'CPM' },
  { chave: 'ctr', label: 'CTR' },
  { chave: 'impressoes', label: 'Impressões' },
  { chave: 'frequencia', label: 'Freq.' },
  { chave: 'saldo', label: 'Saldo' },
]

export function TabelaContas({ contas, financeiro }: TabelaContasProps) {
  const [chaveOrdenacao, setChaveOrdenacao] = useState<ChaveOrdenacao>('investimento')
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState<DirecaoOrdenacao>('desc')

  const ordenar = (chave: ChaveOrdenacao) => {
    if (chaveOrdenacao === chave) {
      setDirecaoOrdenacao((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setChaveOrdenacao(chave)
      setDirecaoOrdenacao('desc')
    }
  }

  const contasOrdenadas = [...contas].sort((a, b) => {
    const aVal = a[chaveOrdenacao as keyof ContaAnuncio]
    const bVal = b[chaveOrdenacao as keyof ContaAnuncio]
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return direcaoOrdenacao === 'asc' ? aVal.localeCompare(bVal, 'pt-BR') : bVal.localeCompare(aVal, 'pt-BR')
    }
    return direcaoOrdenacao === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
  })

  const contasAtivas = contas.filter((c) => c.status === 'ACTIVE' || c.investimento > 0)

  const totais = {
    investimento: contasAtivas.reduce((s, c) => s + c.investimento, 0),
    leads: contasAtivas.reduce((s, c) => s + c.leads, 0),
    cpl: contasAtivas.reduce((s, c) => s + c.investimento, 0) / contasAtivas.reduce((s, c) => s + c.leads, 0) || 0,
    cpc: 0,
    cpm: 0,
    ctr: 0,
    impressoes: contasAtivas.reduce((s, c) => s + c.impressoes, 0),
    frequencia: contasAtivas.reduce((s, c) => s + c.alcance, 0) > 0
      ? contasAtivas.reduce((s, c) => s + c.impressoes, 0) / contasAtivas.reduce((s, c) => s + c.alcance, 0)
      : 0,
    saldo: financeiro?.accounts?.length
      ? financeiro.accounts.reduce((s, f) => s + (f.displayBalanceAmount ?? f.availableBalance ?? 0), 0)
      : contas.reduce((s, c) => s + c.saldo, 0),
  }

  const totalCliques = contasAtivas.reduce((s, c) => s + (c.investimento / Math.max(c.cpc, 0.01)), 0)
  totais.cpc = totalCliques > 0 ? totais.investimento / totalCliques : 0
  totais.cpm = totais.impressoes > 0 ? (totais.investimento / totais.impressoes) * 1000 : 0
  totais.ctr = contasAtivas.reduce((s, c) => s + c.alcance, 0) > 0
    ? (contasAtivas.reduce((s, c) => s + c.ctr * c.alcance, 0) / contasAtivas.reduce((s, c) => s + c.alcance, 0))
    : 0

  function getSaldoFinanceiro(conta: ContaAnuncio) {
    if (!financeiro?.accounts?.length) return null
    return financeiro.accounts.find(f => f.accountId === conta.metaAccountId) ?? null
  }

  const formatarCelula = (conta: ContaAnuncio, chave: ChaveOrdenacao) => {
    switch (chave) {
      case 'nome':
        return (
          <div>
            <div style={{ fontWeight: 500, fontSize: '13px', color: '#0E142A' }}>{conta.nome}</div>
            <div style={{ fontSize: '10px', color: '#8892b0', fontFamily: 'monospace' }}>
              {conta.metaAccountId ?? conta.id}
            </div>
          </div>
        )
      case 'investimento':
        return <span>{formatarMoeda(conta.investimento)}</span>
      case 'leads':
        return <span>{conta.leads.toLocaleString('pt-BR')}</span>
      case 'cpl':
        return <span style={{ color: conta.cpl <= 5 ? '#0fa856' : '#FF5C8D', fontWeight: 500 }}>{formatarMoeda(conta.cpl)}</span>
      case 'cpc':
        return <span>{formatarMoeda(conta.cpc)}</span>
      case 'cpm':
        return <span>{formatarMoeda(conta.cpm)}</span>
      case 'ctr':
        return <span>{formatarPorcentagem(conta.ctr)}</span>
      case 'impressoes':
        return <span>{formatarNumeroCompacto(conta.impressoes)}</span>
      case 'frequencia':
        return <span>{conta.frequencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
      case 'saldo': {
        const finConta = getSaldoFinanceiro(conta)
        if (finConta) {
          const saldoVal = finConta.displayBalanceAmount ?? finConta.availableBalance ?? 0
          const alertState = finConta.alertState
          const cor = alertState === 'critical' ? '#FF5C8D'
                     : alertState === 'warning' ? 'var(--ws-gold)'
                     : '#0E142A'
          const bold = alertState === 'critical' || alertState === 'warning'
          return <span style={{ color: cor, fontWeight: bold ? 600 : 400 }}>{formatarMoeda(saldoVal)}</span>
        }
        const pctSaldo = conta.saldoInicial > 0 ? (conta.saldo / conta.saldoInicial) * 100 : 0
        const cor = pctSaldo <= 15 && conta.saldoInicial > 0 ? '#FF5C8D' : '#0E142A'
        return <span style={{ color: cor, fontWeight: pctSaldo <= 15 && conta.saldoInicial > 0 ? 600 : 400 }}>{formatarMoeda(conta.saldo)}</span>
      }
      default:
        return null
    }
  }

  return (
    <div
      style={{
        background: 'var(--ws-glass-bg, rgba(255,255,255,0.72))',
        border: '1px solid var(--ws-glass-border, rgba(255,255,255,0.35))',
        borderRadius: '14px',
        padding: '0px',
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow, 0 8px 32px rgba(14,20,42,0.12), 0 2px 8px rgba(14,20,42,0.08))',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(14,20,42,0.06)' }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ws-text-1, #0E142A)' }}>Pilar de contas</div>
        <div style={{ fontSize: '11px', color: 'var(--ws-text-3, #8892b0)', marginTop: '2px' }}>Detalhamento de performance por conta de anúncio</div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(14,20,42,0.04)', borderBottom: '1px solid rgba(14,20,42,0.08)' }}>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8892b0', fontWeight: 500 }}>
                Status
              </th>
              {COLUNAS.map((col) => (
                <th
                  key={col.chave}
                  onClick={() => ordenar(col.chave)}
                  style={{ 
                    textAlign: 'left', 
                    padding: '10px 16px', 
                    fontSize: '10px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.06em', 
                    color: '#8892b0', 
                    fontWeight: 500, 
                    cursor: 'pointer', 
                    userSelect: 'none', 
                    whiteSpace: 'nowrap' 
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    <IconeOrdenacao coluna={col.chave} chaveOrdenacao={chaveOrdenacao} direcao={direcaoOrdenacao} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contasOrdenadas.map((conta) => (
              <tr
                key={conta.id}
                className="group transition-colors"
                style={{ borderBottom: '1px solid rgba(14,20,42,0.05)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(62,91,255,0.03)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
              >
                <td style={{ padding: '10px 16px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: conta.status === 'ACTIVE' ? 'rgba(15,168,86,0.10)' : 'rgba(14,20,42,0.06)',
                      color: conta.status === 'ACTIVE' ? '#007a40' : '#8892b0',
                      border: conta.status === 'ACTIVE' ? '1px solid rgba(15,168,86,0.25)' : '1px solid rgba(14,20,42,0.10)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {conta.status === 'ACTIVE' ? 'ATIVA' : 'DESATIVADA'}
                  </span>
                </td>
                {COLUNAS.map((col) => (
                  <td key={col.chave} style={{ padding: '10px 16px', fontSize: '13px', color: '#0E142A' }}>
                    {formatarCelula(conta, col.chave)}
                  </td>
                ))}
              </tr>
            ))}
            {/* Total row */}
            <tr style={{ background: 'rgba(14,20,42,0.02)', fontWeight: 700, borderTop: '1px solid rgba(14,20,42,0.12)' }}>
              <td style={{ padding: '12px 16px' }} />
              <td style={{ padding: '12px 16px', fontSize: '13px' }}>TOTAL</td>
              <td style={{ padding: '12px 16px', fontSize: '13px' }}>{formatarMoeda(totais.investimento)}</td>
              <td style={{ padding: '12px 16px', fontSize: '13px' }}>{totais.leads.toLocaleString('pt-BR')}</td>
              <td style={{ padding: '12px 16px', fontSize: '13px' }}>{formatarMoeda(totais.cpl)}</td>
              <td style={{ padding: '12px 16px', fontSize: '13px' }}>{formatarMoeda(totais.cpc)}</td>
              <td style={{ padding: '12px 16px', fontSize: '13px' }}>{formatarMoeda(totais.cpm)}</td>
              <td style={{ padding: '12px 16px', fontSize: '13px' }}>{formatarPorcentagem(totais.ctr)}</td>
              <td style={{ padding: '12px 16px', fontSize: '13px' }}>{formatarNumeroCompacto(totais.impressoes)}</td>
              <td style={{ padding: '12px 16px', fontSize: '13px' }}>{totais.frequencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td style={{ padding: '12px 16px', fontSize: '13px' }}>{formatarMoeda(totais.saldo)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
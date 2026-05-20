'use client'

import type { ResumoAnunciosPerformance } from '@/types/meta-ads-anuncios'
import { formatarMoeda } from '@/lib/formatar'

interface Props {
  resumo: ResumoAnunciosPerformance
  totalAnuncios: number
}

export function KpiBarAnuncios({ resumo, totalAnuncios }: Props) {
  const totalLeads = resumo.leads_total
  const totalInvest = resumo.investimento_total
  const cplMedio = totalLeads > 0 ? totalInvest / totalLeads : 0
  const ctrMedio = resumo.ctr_medio
  const freqMedia = resumo.frequencia_media
  const totalLabel = totalAnuncios === 1 ? '1 anúncio filtrado' : `${totalAnuncios.toLocaleString('pt-BR')} anúncios filtrados`

  const items = [
    {
      label: 'Investimento total',
      valor: formatarMoeda(totalInvest),
      sub: totalLabel,
      cor: 'var(--ws-blue)',
      bg: 'var(--ws-blue-soft)',
    },
    {
      label: 'Leads gerados',
      valor: totalLeads.toLocaleString('pt-BR'),
      sub: `CPL médio ${formatarMoeda(cplMedio)}`,
      cor: 'var(--ws-green)',
      bg: 'var(--ws-green-soft)',
    },
    {
      label: 'CTR médio',
      valor: `${ctrMedio.toFixed(1).replace('.', ',')}%`,
      sub: ctrMedio >= 3 ? 'Acima da média' : ctrMedio >= 1.5 ? 'Na média' : 'Abaixo da média',
      cor: ctrMedio >= 3 ? 'var(--ws-green)' : ctrMedio >= 1.5 ? 'var(--ws-gold)' : 'var(--ws-coral)',
      bg: ctrMedio >= 3 ? 'var(--ws-green-soft)' : ctrMedio >= 1.5 ? 'var(--ws-gold-soft)' : 'var(--ws-coral-soft)',
    },
    {
      label: 'Frequência média',
      valor: freqMedia.toFixed(1).replace('.', ','),
      sub: freqMedia >= 3.5 ? 'Sinal de fadiga elevado' : freqMedia >= 2.5 ? 'Fadiga moderada' : 'Sem fadiga relevante',
      cor: freqMedia >= 3.5 ? 'var(--ws-coral)' : freqMedia >= 2.5 ? 'var(--ws-gold)' : 'var(--ws-green)',
      bg: freqMedia >= 3.5 ? 'var(--ws-coral-soft)' : freqMedia >= 2.5 ? 'var(--ws-gold-soft)' : 'var(--ws-green-soft)',
    },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      marginBottom: 20,
    }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow-sm)',
          padding: '14px 16px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: item.cor, opacity: 0.6,
          }} />
          <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
            {item.label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: item.cor, letterSpacing: '-0.02em', lineHeight: 1 }}>
            {item.valor}
          </div>
          <div style={{
            fontSize: 10, color: item.cor, background: item.bg,
            borderRadius: 9999, padding: '3px 8px', marginTop: 8,
            display: 'inline-block', fontWeight: 500,
          }}>
            {item.sub}
          </div>
        </div>
      ))}
    </div>
  )
}

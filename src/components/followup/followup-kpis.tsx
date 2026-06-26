"use client"

import React from 'react'
import {
  Zap,
  MessageCircle,
  TrendingUp,
  BarChart2,
  Clock
} from 'lucide-react'

interface FollowupKpisProps {
  metricas: {
    ativos: number
    vencidos: number
    esgotados: number
    ganhos: number
    percas: number
    total: number
    taxa_conversao: number
    responderam: number
    tempo_medio_ms: number
  }
}

// "1d 6h" / "3h 20m" / "—". Humaniza ms de espera.
function humanizarDuracao(ms: number): string {
  if (!ms || ms < 60000) return '—'
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function FollowupKpis({ metricas }: FollowupKpisProps) {
  const getTaxaColor = (tx: number) => {
    if (tx >= 30) return 'var(--ws-green)'
    if (tx >= 15) return 'var(--ws-gold)'
    return 'var(--ws-coral)'
  }
  const getTempoColor = (ms: number) => {
    const dias = ms / 86400000
    if (dias >= 3) return 'var(--ws-coral)'
    if (dias >= 1) return 'var(--ws-gold)'
    return 'var(--ws-green)'
  }

  type Kpi = { label: string; value: number | string; icon: any; color: string; sub: string; total: number; isPercentage?: boolean; progressOverride?: number }
  const kpis: Kpi[] = [
    { label: 'EM FOLLOW-UP', value: metricas.ativos, icon: Zap, color: 'var(--ws-green)', sub: 'aguardando retorno', total: metricas.total },
    { label: 'RESPONDERAM', value: metricas.responderam, icon: MessageCircle, color: 'var(--ws-blue)', sub: 'voltaram a responder', total: metricas.total },
    { label: 'GANHOS', value: metricas.ganhos, icon: TrendingUp, color: 'var(--ws-green)', sub: 'convertidos', total: metricas.total },
    { label: 'TAXA CONV.', value: `${metricas.taxa_conversao.toFixed(1)}%`, icon: BarChart2, color: getTaxaColor(metricas.taxa_conversao), sub: 'ganhos / total leads', total: 100, isPercentage: true },
    { label: 'TEMPO MÉDIO', value: humanizarDuracao(metricas.tempo_medio_ms), icon: Clock, color: getTempoColor(metricas.tempo_medio_ms), sub: 'sem responder', total: 100, progressOverride: Math.min(100, (metricas.tempo_medio_ms / 604800000) * 100) },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 12,
      marginBottom: 24,
    }}>
      {kpis.map((kpi, i) => {
        const progress = kpi.progressOverride !== undefined
          ? kpi.progressOverride
          : kpi.isPercentage
          ? parseFloat(String(kpi.value))
          : (Number(kpi.value) / (kpi.total || 1)) * 100

        return (
          <div 
            key={i}
            style={{
              background: 'var(--ws-glass-bg)',
              border: '1px solid var(--ws-glass-border)',
              borderRadius: 'var(--ws-radius-lg)',
              backdropFilter: 'blur(16px)',
              boxShadow: 'var(--ws-glass-shadow)',
              padding: '18px 20px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Linha de brilho no topo — OBRIGATÓRIA */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 1,
              background: 'linear-gradient(90deg,transparent,var(--ws-glass-border),transparent)',
              pointerEvents: 'none',
            }} />

            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 12 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: 'var(--ws-text-3)',
              }}>
                {kpi.label}
              </span>
              <kpi.icon size={18} style={{ color: kpi.color }} />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: kpi.color, lineHeight: 1, marginBottom: 6 }}>
                {kpi.value}
              </div>
            </div>
            
            <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 12 }}>
              {kpi.sub}
            </div>
            
            {/* Barra de progresso na base */}
            <div style={{ height: 3, borderRadius: 99, background: `${kpi.color}15` }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: kpi.color,
                width: `${Math.min(progress, 100)}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

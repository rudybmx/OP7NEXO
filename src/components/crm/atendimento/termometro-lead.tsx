'use client'

import React from 'react'

// Medidor de temperatura do lead: gauge semicircular com agulha.
// frio (azul) → morno (âmbar) → quente (vermelho), por score 0-100.
const FRIO = '#3E5BFF'
const MORNO = '#F5A623'
const QUENTE = '#FF4D6D'

function corPorScore(score: number): string {
  if (score >= 70) return QUENTE
  if (score >= 40) return MORNO
  return FRIO
}

function rotulo(temperatura?: string | null, score?: number | null): string {
  if (temperatura === 'quente' || temperatura === 'morno' || temperatura === 'frio') return temperatura
  const s = typeof score === 'number' ? score : -1
  return s >= 70 ? 'quente' : s >= 40 ? 'morno' : s >= 0 ? 'frio' : '—'
}

export function TermometroLead({
  score,
  temperatura,
  size = 92,
}: {
  score?: number | null
  temperatura?: string | null
  size?: number
}) {
  const tem = typeof score === 'number' && score >= 0
  const v = tem ? Math.max(0, Math.min(100, score as number)) : 0

  const w = size
  const h = size * 0.6
  const cx = w / 2
  const cy = h - 6
  const r = w / 2 - 8

  // ângulo: score 0 → 180° (esquerda); score 100 → 0° (direita)
  const ponto = (s: number) => {
    const a = Math.PI * (1 - s / 100)
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const
  }
  // sweep-flag = 0 → arco POR CIMA (CCW em tela y-down)
  const arco = (de: number, ate: number) => {
    const [x0, y0] = ponto(de)
    const [x1, y1] = ponto(ate)
    return `M ${x0} ${y0} A ${r} ${r} 0 0 0 ${x1} ${y1}`
  }
  const [nx, ny] = ponto(v)
  const label = rotulo(temperatura, score)

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={`Temperatura do lead: ${label}`}>
        <path d={arco(0, 40)} stroke={FRIO} strokeWidth={6} fill="none" strokeLinecap="round" opacity={tem ? 1 : 0.25} />
        <path d={arco(40, 70)} stroke={MORNO} strokeWidth={6} fill="none" opacity={tem ? 1 : 0.25} />
        <path d={arco(70, 100)} stroke={QUENTE} strokeWidth={6} fill="none" strokeLinecap="round" opacity={tem ? 1 : 0.25} />
        {tem && (
          <>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--ws-text-1)" strokeWidth={2} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={3.5} fill="var(--ws-text-1)" />
          </>
        )}
      </svg>
      <span style={{ fontSize: 11, fontWeight: 600, color: tem ? corPorScore(v) : 'var(--ws-text-3)', textTransform: 'capitalize' }}>
        {tem ? `${label} · ${v}` : 'sem análise'}
      </span>
    </div>
  )
}

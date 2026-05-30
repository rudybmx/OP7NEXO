'use client'

import type { DadosCidade } from '@/types/meta-ads-publicos'

interface Props {
  cidades: DadosCidade[]
}

function corCpl(cpl: number): string {
  if (cpl <= 0.50) return '#3b6d11'
  if (cpl <= 0.80) return 'var(--ws-gold)'
  return '#a32d2d'
}

function LinhasCidade({ cidades, ordenarPor }: { cidades: DadosCidade[]; ordenarPor: 'leads' | 'cpl' }) {
  const ordenadas = [...cidades].sort((a, b) =>
    ordenarPor === 'leads' ? b.leads - a.leads : a.cpl - b.cpl
  ).slice(0, 7)
  const maxLeads = Math.max(...ordenadas.map(c => c.leads), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ordenadas.map((c, i) => (
        <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--ws-text-2)', minWidth: 14 }}>#{i + 1}</div>
          <div style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ws-text-1)' }}>{c.nome}</div>
          <div style={{ width: 80, background: 'var(--ws-glass-bg-hover)', borderRadius: 3, height: 5, flexShrink: 0 }}>
            <div style={{
              width: `${(c.leads / maxLeads) * 100}%`,
              height: 5,
              background: ordenarPor === 'leads' ? '#0f2744' : corCpl(c.cpl),
              borderRadius: 3,
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ws-gold)', fontWeight: 500, minWidth: 35, textAlign: 'right' }}>
            {c.leads}
          </div>
          <div style={{ fontSize: 10, color: corCpl(c.cpl), minWidth: 48, textAlign: 'right' }}>
            R${c.cpl.toFixed(2).replace('.', ',')}
          </div>
        </div>
      ))}
    </div>
  )
}

export function GeoPerformance({ cidades }: Props) {
  if (!cidades.length) {
    return (
      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        padding: '16px 20px',
        minHeight: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ws-text-2)',
        fontSize: 13,
        textAlign: 'center',
      }}>
        Dados geográficos não disponíveis para o período selecionado.
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '16px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }} />
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)' }}>Performance geográfica</div>
        <div style={{ fontSize: 11, color: 'var(--ws-text-2)', marginTop: 2 }}>Cidades com maior volume de leads e CPL médio</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Coluna 1 — Top por leads */}
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-2)', marginBottom: 10 }}>
            Top cidades por leads
          </div>
          <LinhasCidade cidades={cidades} ordenarPor="leads" />
        </div>

        {/* Coluna 2 — Top por CPL */}
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-2)', marginBottom: 10 }}>
            Top cidades por CPL
          </div>
          <LinhasCidade cidades={cidades} ordenarPor="cpl" />
        </div>
      </div>
    </div>
  )
}

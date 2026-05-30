'use client'

import type { KpiPublicos } from '@/types/meta-ads-publicos'

interface Props {
  kpi: KpiPublicos
}

function formatarGrande(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toString()
}

function Card({ label, valor, delta, deltaCor }: { label: string; valor: string; delta: string; deltaCor?: string }) {
  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '12px 14px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }} />
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.2, color: 'var(--ws-text-1)' }}>{valor}</div>
      <div style={{ fontSize: 10, marginTop: 2, color: deltaCor ?? 'var(--ws-text-2)' }}>{delta}</div>
    </div>
  )
}

export function KpiPublicos({ kpi }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
      <Card label="Alcance total" valor={formatarGrande(kpi.alcanceTotal)} delta="+18% vs ant." deltaCor="#3b6d11" />
      <Card label="Frequência média" valor={kpi.frequenciaMedia.toFixed(1)} delta="Saudável" />
      <Card label="Melhor faixa (CPL)" valor={kpi.melhorFaixaCpl} delta={`CPL R$${kpi.melhorFaixaValor.toFixed(2).replace('.', ',')}`} deltaCor="#3b6d11" />
      <Card label="Melhor posicionamento" valor={kpi.melhorPlacement} delta={`CPL R$${kpi.melhorPlacementCpl.toFixed(2).replace('.', ',')}`} deltaCor="#3b6d11" />
      <Card label="Melhor horário" valor={kpi.melhorHorario} delta={kpi.melhorDia} />
      <Card label="Melhor cidade" valor={kpi.melhorCidade} delta={`${kpi.melhorCidadeLeads.toLocaleString('pt-BR')} leads`} deltaCor="var(--ws-gold)" />
    </div>
  )
}

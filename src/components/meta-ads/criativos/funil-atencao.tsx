'use client'

import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Criativo } from '@/types/meta-ads-criativos'

interface Props {
  criativos: Criativo[]
}

const FUNIL_DIAGRAM = `
    <div style="font-size:10px;color:#666;display:flex;flex-direction:column;gap:3px">
      <div style="display:flex;align-items:center;gap:4px">
        <div style="width:60px;height:14px;background:#0f2744;border-radius:2px;display:flex;align-items:center;justify-content:center;color:white;font-size:9px">100%</div>
        <span>Impressões</span>
      </div>
    <div style="display:flex;align-items:center;gap:4px;padding-left:8px">
      <div style="width:24px;height:2px;background:#666;opacity:0.4"></div>
    </div>
      <div style="display:flex;align-items:center;gap:4px">
        <div style="width:40px;height:14px;background:#3b6d11;border-radius:2px;display:flex;align-items:center;justify-content:center;color:white;font-size:9px">28%</div>
        <span>Taxa de abertura (3s)</span>
      </div>
    <div style="display:flex;align-items:center;gap:4px;padding-left:8px">
      <div style="width:24px;height:2px;background:#666;opacity:0.4"></div>
    </div>
      <div style="display:flex;align-items:center;gap:4px">
        <div style="width:22px;height:14px;background:#854f0b;border-radius:2px;display:flex;align-items:center;justify-content:center;color:white;font-size:9px">43%</div>
        <span>Taxa de retenção (15s)</span>
      </div>
  </div>
`

function corHook(v: number) {
  if (v >= 25) return '#3b6d11'
  if (v >= 15) return '#854f0b'
  return '#a32d2d'
}

function corHold(v: number) {
  if (v >= 40) return '#3b6d11'
  if (v >= 25) return '#854f0b'
  return '#a32d2d'
}

function fmt(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

export function FunilAtencao({ criativos: todos }: Props) {
  const videos = todos.filter(c => c.tipo === 'VIDEO' && c.hookRate !== null)

  if (videos.length === 0) return null

  const totalImpressoes = todos.reduce((s, c) => s + c.impressoes, 0)
  const totalViews3s = videos.reduce((s, c) => s + (c.videoViews3s ?? 0), 0)
  const totalViews15s = videos.reduce((s, c) => s + (c.videoViews15s ?? 0), 0)
  const totalCliques = todos.reduce((s, c) => s + Math.round(c.impressoes * c.ctr / 100), 0)
  const totalLeads = todos.reduce((s, c) => s + c.leads, 0)

  const hookRate = totalImpressoes > 0 ? (totalViews3s / totalImpressoes) * 100 : 0
  const holdRate = totalViews3s > 0 ? (totalViews15s / totalViews3s) * 100 : 0
  const ctrMedio = totalImpressoes > 0 ? (totalCliques / totalImpressoes) * 100 : 0

  const etapas = [
    { label: 'Impressões', valor: fmt(totalImpressoes), sub: '100%', barra: { cor: 'var(--foreground)', pct: 100 } },
    { label: 'Taxa de abertura', valor: hookRate.toFixed(1) + '%', sub: fmt(totalViews3s), barra: { cor: corHook(hookRate), pct: hookRate } },
    { label: 'Taxa de retenção', valor: holdRate.toFixed(1) + '%', sub: fmt(totalViews15s), barra: { cor: corHold(holdRate), pct: holdRate } },
    { label: 'Cliques', valor: ctrMedio.toFixed(1) + '%', sub: fmt(totalCliques), barra: { cor: '#854f0b', pct: ctrMedio * 10 } },
    { label: 'Leads', valor: totalLeads.toLocaleString('pt-BR'), sub: totalImpressoes > 0 ? ((totalLeads / totalImpressoes) * 100).toFixed(2) + '%' : '—', barra: { cor: '#3b6d11', pct: Math.min((totalLeads / (totalImpressoes / 100)) * 100, 100) } },
  ]

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '16px 20px',
      marginBottom: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Funil de atenção</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>Onde a audiência está sendo perdida nos criativos em vídeo</div>
        </div>
        <InfoTooltip
          title="Funil de atenção"
          description="Mostra onde a audiência abandona o vídeo. Taxa de abertura = quem parou nos 3s. Taxa de retenção = quem continuou até 15s."
          diagram={FUNIL_DIAGRAM}
        />
      </div>

      <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
        {etapas.map((et, i) => (
          <div key={et.label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '10px', color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{et.label}</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ws-text-1)', lineHeight: 1.2 }}>{et.valor}</div>
              <div style={{ fontSize: '10px', color: 'var(--ws-text-3)', marginTop: '2px', marginBottom: '6px' }}>{et.sub}</div>
              <div style={{ height: '4px', background: 'rgba(14,20,42,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(et.barra.pct, 100)}%`, background: et.barra.cor, borderRadius: '2px' }} />
              </div>
            </div>
            {i < etapas.length - 1 && (
              <div style={{ fontSize: '16px', color: 'var(--ws-text-3)', padding: '0 8px', flexShrink: 0, marginBottom: '10px' }}>→</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
        {[
          { cor: '#3b6d11', texto: 'Taxa de abertura >25% = bom · >35% = excelente' },
          { cor: '#854f0b', texto: 'Taxa de retenção >40% = bom · >60% = excelente' },
          { cor: '#a32d2d', texto: 'Abaixo da meta = revisar criativo' },
        ].map(l => (
          <div key={l.texto} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: 'var(--ws-text-3)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: l.cor, flexShrink: 0 }} />
            {l.texto}
          </div>
        ))}
      </div>
    </div>
  )
}

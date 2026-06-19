'use client'

const SCALE = [
  { label: 'Page Title', size: '24px', weight: 600, sample: 'Visão Geral de Campanhas' },
  { label: 'Section',    size: '18px', weight: 600, sample: 'Meta Ads — Leads Gerados' },
  { label: 'KPI Value',  size: '20px', weight: 500, sample: '1.247 leads gerados' },
  { label: 'Body+',      size: '14px', weight: 500, sample: 'Texto enfatizado — cabeçalho de tabela, botão, label.' },
  { label: 'Body',       size: '14px', weight: 400, sample: 'Texto padrão da interface — corpo, células de tabela, inputs.' },
  { label: 'Small',      size: '12px', weight: 400, sample: 'Labels secundários, helper text, badges.' },
  { label: 'KPI Label',  size: '12px', weight: 500, sample: 'LABEL UPPERCASE — KPI', uppercase: true },
  { label: 'Micro',      size: '11px', weight: 400, sample: 'Timestamps, utm, código, metadado denso.' },
]

export function DSTipografia() {
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 6 }}>Tipografia</h2>
        <p style={{ fontSize: 14, color: 'var(--ws-text-2)', lineHeight: 1.6 }}>
          Fonte: <strong>Inter</strong>. Base <strong>14px</strong> — o tamanho majoritário do conteúdo.
          Pesos: <strong>400</strong> corpo · <strong>500</strong> cabeçalho de tabela/botão/label · <strong>600</strong> título · <strong>700</strong> restrito.
          Classes utilitárias: <code style={{ fontFamily: 'monospace' }}>.ds-table-th / .ds-table-td / .ds-label / .ds-kpi-label / .ds-kpi-value / .ds-page-title</code> (globals.css).
        </p>
      </div>

      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }} />
        {SCALE.map((item, i) => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'baseline', gap: 24,
            padding: '14px 20px',
            borderBottom: i < SCALE.length - 1 ? '1px solid var(--ws-divider)' : 'none',
          }}>
            <div style={{ width: 90, flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-blue)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-3)', fontFamily: 'monospace' }}>{item.size} / {item.weight}</div>
            </div>
            <div style={{
              fontSize: item.size,
              fontWeight: item.weight,
              color: 'var(--ws-text-1)',
              textTransform: item.uppercase ? 'uppercase' : undefined,
              letterSpacing: item.uppercase ? '0.06em' : undefined,
              lineHeight: 1.4,
              flex: 1,
            }}>
              {item.sample}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{
          background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)', backdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow)', padding: 20,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
          <div style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)', marginBottom: 12 }}>Números & Métricas</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--ws-text-1)', letterSpacing: '-0.01em' }}>1.247</div>
          <div style={{ fontSize: 13, color: 'var(--ws-green)', fontWeight: 500, marginTop: 4 }}>↑ +18,4% vs. período anterior</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Leads gerados</div>
        </div>
        <div style={{
          background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)', backdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow)', padding: 20,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
          <div style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)', marginBottom: 12 }}>Valores Monetários</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--ws-text-1)', letterSpacing: '-0.01em' }}>R$ 48.720</div>
          <div style={{ fontSize: 13, color: 'var(--ws-coral)', fontWeight: 500, marginTop: 4 }}>↓ −3,2% vs. período anterior</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Investimento total</div>
        </div>
      </div>
    </div>
  )
}

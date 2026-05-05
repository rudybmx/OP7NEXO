'use client'

const SCALE = [
  { label: 'Heading XL', size: '32px', weight: 700, sample: "Odontocompany by Op7 Plataforma" },
  { label: 'Heading L',  size: '24px', weight: 700, sample: 'Dashboard de Marketing' },
  { label: 'Heading M',  size: '20px', weight: 600, sample: 'Visão Geral de Campanhas' },
  { label: 'Heading S',  size: '16px', weight: 600, sample: 'Meta Ads — Leads Gerados' },
  { label: 'Body L',     size: '15px', weight: 400, sample: 'Texto de parágrafo com informações detalhadas sobre campanhas.' },
  { label: 'Body M',     size: '14px', weight: 400, sample: 'Descrição de componentes e uso do design system.' },
  { label: 'Body S',     size: '13px', weight: 400, sample: 'Texto padrão de interface — tabelas, cards, listas.' },
  { label: 'Body XS',    size: '12px', weight: 400, sample: 'Labels secundários, metadados, timestamps.' },
  { label: 'Caption',    size: '11px', weight: 400, sample: 'Texto auxiliar, tooltips, anotações.' },
  { label: 'Label',      size: '10px', weight: 600, sample: 'LABEL UPPERCASE — SEÇÃO DE DADOS', uppercase: true },
  { label: 'Micro',      size: '9px',  weight: 600, sample: 'MICRO LABEL — ADMIN — v2.0', uppercase: true },
]

export function DSTipografia() {
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', marginBottom: 6 }}>Tipografia</h2>
        <p style={{ fontSize: 14, color: 'var(--ws-text-2)', lineHeight: 1.6 }}>
          Fonte: <strong>Plus Jakarta Sans</strong>. Escala tipográfica da plataforma.
          Nunca use font-weight acima de 600 exceto em headings e valores numéricos grandes.
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
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ws-blue)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</div>
              <div style={{ fontSize: 10, color: 'var(--ws-text-3)', fontFamily: 'monospace' }}>{item.size} / {item.weight}</div>
            </div>
            <div style={{
              fontSize: item.size,
              fontWeight: item.weight,
              color: 'var(--ws-text-1)',
              textTransform: item.uppercase ? 'uppercase' : undefined,
              letterSpacing: item.uppercase ? '0.08em' : undefined,
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
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ws-text-3)', marginBottom: 12 }}>Números & Métricas</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>1.247</div>
          <div style={{ fontSize: 13, color: 'var(--ws-green)', fontWeight: 500, marginTop: 4 }}>↑ +18,4% vs. período anterior</div>
          <div style={{ fontSize: 10, color: 'var(--ws-text-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Leads gerados</div>
        </div>
        <div style={{
          background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)', backdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow)', padding: 20,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ws-text-3)', marginBottom: 12 }}>Valores Monetários</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>R$ 48.720</div>
          <div style={{ fontSize: 13, color: 'var(--ws-coral)', fontWeight: 500, marginTop: 4 }}>↓ −3,2% vs. período anterior</div>
          <div style={{ fontSize: 10, color: 'var(--ws-text-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Investimento total</div>
        </div>
      </div>
    </div>
  )
}

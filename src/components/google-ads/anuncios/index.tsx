'use client'

import { useGoogleAnuncios } from '@/hooks/use-google-anuncios'

export function AbaAnunciosGoogle({ dateRange, adsAccountId }: { dateRange: { start: Date; end: Date }; adsAccountId?: string }) {
  const { anuncios } = useGoogleAnuncios(dateRange, adsAccountId)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16 }}>
      {anuncios.map(a => (
        <div key={a.id} style={{
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow)',
          padding: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ 
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ws-blue)',
              background: 'rgba(62,91,255,0.1)', padding: '2px 8px', borderRadius: 4
            }}>Google Ads</span>
            <span style={{ 
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', 
              color: a.adStrength === 'EXCELLENT' ? 'var(--ws-green)' : 'var(--ws-gold)'
            }}>EFICÁCIA: {a.adStrength}</span>
          </div>
          
          <div style={{ marginBottom: 16, border: '1px solid var(--ws-glass-border)', borderRadius: 8, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1a73e8', marginBottom: 4 }}>{a.titulo}</div>
            <div style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.4 }}>{a.desc}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase' }}>Cliques</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ws-text-1)' }}>{a.cliques}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase' }}>Conv.</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ws-text-1)' }}>{a.conversoes}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase' }}>CPL</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ws-green)' }}>R$ {a.custoConversao.toFixed(2)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

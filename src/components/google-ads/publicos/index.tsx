'use client'

import { useGooglePublicos } from '@/hooks/use-google-publicos'

export function AbaPublicosGoogle() {
  const { publicos } = useGooglePublicos()

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: 20,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 20 }}>Audiências de maior performance</div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {publicos.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)' }}>{p.nome}</span>
                <span style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>{p.leads} leads</span>
              </div>
              <div style={{ height: 8, background: 'rgba(14,20,42,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', width: `${p.percentual}%`, 
                  background: 'var(--ws-blue)', borderRadius: 99 
                }} />
              </div>
            </div>
            <div style={{ width: 100, textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase' }}>CPL</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-green)' }}>R$ {p.cpl.toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

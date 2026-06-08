'use client'

import { useGooglePalavras } from '@/hooks/use-google-palavras'

export function AbaPalavrasChaveGoogle({ adsAccountId }: { adsAccountId?: string }) {
  const { palavras } = useGooglePalavras(undefined, adsAccountId)

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'rgba(14,20,42,0.04)', borderBottom: '1px solid var(--ws-glass-border)' }}>
            <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: 'var(--ws-text-2)' }}>PALAVRA-CHAVE</th>
            <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: 'var(--ws-text-2)' }}>MATCH TYPE</th>
            <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, color: 'var(--ws-text-2)' }}>QS</th>
            <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600, color: 'var(--ws-text-2)' }}>INVESTIMENTO</th>
            <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600, color: 'var(--ws-text-2)' }}>CLIQUES</th>
            <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600, color: 'var(--ws-text-2)' }}>CONV.</th>
            <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600, color: 'var(--ws-text-2)' }}>CPL</th>
          </tr>
        </thead>
        <tbody>
          {palavras.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--ws-glass-border)', transition: 'var(--ws-transition)' }}>
              <td style={{ padding: '12px 16px', color: 'var(--ws-text-1)', fontWeight: 500 }}>{p.texto}</td>
              <td style={{ padding: '12px 16px', color: 'var(--ws-text-2)' }}>
                <span style={{ 
                  fontSize: 10, padding: '2px 6px', borderRadius: 4, 
                  background: 'rgba(14,20,42,0.05)', border: '1px solid var(--ws-glass-border)'
                }}>{p.matchType}</span>
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                <span style={{ 
                  color: p.qualityScore >= 7 ? 'var(--ws-green)' : p.qualityScore >= 5 ? 'var(--ws-gold)' : 'var(--ws-coral)',
                  fontWeight: 600 
                }}>{p.qualityScore}/10</span>
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--ws-text-1)' }}>
                R$ {p.investimento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--ws-text-1)' }}>{p.cliques}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--ws-text-1)' }}>{p.conversoes}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--ws-green)', fontWeight: 600 }}>
                R$ {p.custoConversao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

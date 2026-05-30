'use client'

import { InfoTooltip } from '@/components/ui/info-tooltip'
import type { DadosPlacement } from '@/types/meta-ads-publicos'

interface Props {
  placements: DadosPlacement[]
}

const PLACEMENTS_DIAGRAM = `
  <div style="font-size:10px;color:#666;display:flex;flex-direction:column;gap:4px">
    <div style="display:flex;align-items:center;gap:6px">
      <div style="width:8px;height:8px;border-radius:50%;background:#e1306c"></div>
      <span>Instagram Stories/Reels</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <div style="width:8px;height:8px;border-radius:50%;background:#1877f2"></div>
      <span>Facebook Feed/Reels</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <div style="width:8px;height:8px;border-radius:50%;background:#0084ff"></div>
      <span>Messenger / Audience Network</span>
    </div>
    <div style="margin-top:4px;padding-top:4px;border-top:0.5px solid #eee;font-size:9px;color:#999">
      Barra = volume de leads. Valor direito = CPL.
    </div>
  </div>
`

function corCpl(cpl: number): string {
  if (cpl <= 0.50) return '#3b6d11'
  if (cpl <= 1.00) return '#854f0b'
  return '#a32d2d'
}

function IconePlataforma({ plataforma, cor }: { plataforma: DadosPlacement['plataforma']; cor: string }) {
  const bg = plataforma === 'instagram' ? '#fbeaf0' : plataforma === 'facebook' ? '#e6f1fb' : 'hsl(var(--muted))'
  const stroke = plataforma === 'audience_network' ? 'var(--muted-foreground)' : cor

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ borderRadius: 3, background: bg, flexShrink: 0 }}>
      {plataforma === 'instagram' && (
        <>
          <rect x="4" y="4" width="10" height="10" rx="3" stroke={stroke} strokeWidth="1.5" />
          <circle cx="9" cy="9" r="2.5" stroke={stroke} strokeWidth="1.5" />
          <circle cx="13" cy="5" r="0.8" fill={stroke} />
        </>
      )}
      {(plataforma === 'facebook' || plataforma === 'whatsapp') && (
        <text x="9" y="13" textAnchor="middle" fontSize="11" fontWeight="bold" fill={stroke}>f</text>
      )}
      {plataforma === 'audience_network' && (
        <>
          <rect x="3" y="6" width="12" height="8" rx="1.5" stroke={stroke} strokeWidth="1.5" />
          <path d="M6 6V5a3 3 0 016 0v1" stroke={stroke} strokeWidth="1.5" />
        </>
      )}
    </svg>
  )
}

export function BreakdownPlacements({ placements }: Props) {
  if (!placements.length) {
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
        Dados de posicionamentos não disponíveis para o período selecionado.
      </div>
    )
  }

  const maxLeads = Math.max(...placements.map(p => p.leads), 1)

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)' }}>Performance por posicionamento</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>Distribuição de leads e CPL por canal</div>
        </div>
        <InfoTooltip
          title="Performance por posicionamento"
          description="Compara leads e CPL entre os posicionamentos onde seus anúncios veiculam. Use para realocar orçamento para o mais eficiente."
          diagram={PLACEMENTS_DIAGRAM}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {placements.map(p => (
          <div key={p.nome} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconePlataforma plataforma={p.plataforma} cor={p.cor} />
            <div style={{ width: 130, fontSize: 11, color: 'var(--ws-text-1)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.nome}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ background: 'var(--ws-glass-bg-hover)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                <div style={{ width: `${(p.leads / maxLeads) * 100}%`, height: 6, background: p.cor, borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ws-gold)', fontWeight: 500, minWidth: 40, textAlign: 'right' }}>{p.leads.toLocaleString('pt-BR')}</div>
            <div style={{ fontSize: 11, color: corCpl(p.cpl), minWidth: 54, textAlign: 'right' }}>R${p.cpl.toFixed(2).replace('.', ',')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

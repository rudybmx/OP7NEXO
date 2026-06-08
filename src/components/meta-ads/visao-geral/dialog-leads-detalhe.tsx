'use client'

import type { ContaAnuncio, LeadsByPlatform } from '@/types/meta-ads'
import { formatarMoeda, formatarNumero } from '@/lib/formatar'

interface PainelLeadsDetalheProps {
  contas: ContaAnuncio[]
  leadsPorCanal: LeadsByPlatform[]
}

function formatarCanal(canal: string): { label: string; cor: string } {
  const [platform, position] = canal.split('|')
  const plat: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    messenger: 'Messenger',
    whatsapp: 'WhatsApp',
    audience_network: 'Aud. Network',
  }
  const pos: Record<string, string> = {
    feed: 'Feed',
    story: 'Stories',
    facebook_stories: 'Stories',
    instagram_stories: 'Stories',
    reels: 'Reels',
    facebook_reels: 'Reels',
    instagram_reels: 'Reels',
    facebook_reels_overlay: 'Reels Overlay',
    search: 'Search',
    marketplace: 'Marketplace',
    instream_video: 'Instream',
    messenger_inbox: 'Inbox',
    profile_feed: 'Profile',
    explore: 'Explore',
    biz_disco_feed: 'Shop',
    right_hand_column: 'Sidebar',
    video_feeds: 'Video Feed',
    an_classic: 'AN Classic',
  }
  const cores: Record<string, string> = {
    facebook: '#1877f2',
    instagram: '#e1306c',
    messenger: '#0084ff',
    whatsapp: '#25d366',
    audience_network: '#888',
  }
  const pLabel = plat[platform] ?? platform
  const posLabel = pos[position] ?? (position?.replace(/_/g, ' ') ?? '')
  return {
    label: posLabel ? `${pLabel} · ${posLabel}` : pLabel,
    cor: cores[platform] ?? '#aaa',
  }
}

export function PainelLeadsDetalhe({ contas, leadsPorCanal }: PainelLeadsDetalheProps) {
  const totalLeads = contas.reduce((s, c) => s + c.leads, 0)
  const totalMensagens = contas.reduce((s, c) => s + (c.leadsConversa7d ?? 0), 0)
  const totalLinkClick = contas.reduce((s, c) => s + (c.linkClick ?? 0), 0)
  const totalFormulario = contas.reduce((s, c) => s + (c.leadsFormulario ?? 0), 0)
  const totalInvestimento = contas.reduce((s, c) => s + c.investimento, 0)
  const totalImpressoes = contas.reduce((s, c) => s + c.impressoes, 0)
  const cplMedio = totalLeads > 0 ? totalInvestimento / totalLeads : 0

  const canaisOrdenados = [...leadsPorCanal].sort((a, b) => b.count - a.count)
  const totalLeadsCanal = canaisOrdenados.reduce((s, c) => s + c.count, 0) || 1

  const metricasResumo = [
    { label: 'Mensagens', value: formatarNumero(totalMensagens), desc: 'Conversas iniciadas (7d)' },
    { label: 'Link Click', value: formatarNumero(totalLinkClick), desc: 'Cliques no link do anúncio' },
    { label: 'Formulário', value: formatarNumero(totalFormulario), desc: 'Leads via formulário/pixel' },
    { label: 'CPL', value: formatarMoeda(cplMedio), desc: 'Custo por lead médio' },
    { label: 'Investimento', value: formatarMoeda(totalInvestimento), desc: 'Total investido no período' },
    { label: 'Impressões', value: formatarNumero(totalImpressoes), desc: 'Total de impressões' },
  ]

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid var(--ws-glass-border, rgba(14,20,42,0.1))',
      borderRadius: '14px',
      boxShadow: 'var(--ws-glass-shadow-lg, 0 16px 48px rgba(14,20,42,0.18), 0 4px 16px rgba(14,20,42,0.10))',
      minWidth: '360px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ws-text-1, #0E142A)' }}>
          Leads Gerados — Detalhes
        </div>
        <div style={{ fontSize: '10px', color: 'var(--ws-text-3, #8892b0)', marginTop: '1px' }}>
          Total: {formatarNumero(totalLeads)} leads no período
        </div>
      </div>

      <div style={{ padding: '10px 16px 14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Resumo de métricas */}
        <div>
          <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3, #8892b0)', marginBottom: '8px' }}>
            Resumo
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {metricasResumo.map((m) => (
              <div
                key={m.label}
                title={m.desc}
                style={{
                  background: 'rgba(14,20,42,0.03)',
                  border: '1px solid rgba(14,20,42,0.06)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  cursor: 'help',
                }}
              >
                <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-3, #8892b0)', marginBottom: '3px' }}>
                  {m.label}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ws-text-1, #0E142A)' }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Origem dos leads */}
        {canaisOrdenados.length > 0 && (
          <div>
            <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3, #8892b0)', marginBottom: '8px' }}>
              Origem dos leads
            </div>
            <div style={{
              border: '1px solid rgba(14,20,42,0.08)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 64px 52px',
                padding: '6px 10px',
                background: 'rgba(14,20,42,0.03)',
                borderBottom: '1px solid rgba(14,20,42,0.06)',
              }}>
                {[{ h: 'Plataforma', left: true }, { h: 'Leads', left: false }, { h: '%', left: false }].map(({ h, left }) => (
                  <div key={h} style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-3, #8892b0)', textAlign: left ? 'left' : 'right' }}>
                    {h}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {canaisOrdenados.map((canal, i) => {
                const { label, cor } = formatarCanal(canal.label || canal.platform)
                const pct = ((canal.count / totalLeadsCanal) * 100).toFixed(1)
                const isLast = i === canaisOrdenados.length - 1
                return (
                  <div
                    key={canal.platform + i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 64px 52px',
                      padding: '7px 10px',
                      alignItems: 'center',
                      borderBottom: isLast ? 'none' : '1px solid rgba(14,20,42,0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cor, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontSize: '11px', color: 'var(--ws-text-1, #0E142A)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ws-text-1, #0E142A)', textAlign: 'right' }}>
                      {formatarNumero(canal.count)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ws-text-3, #8892b0)', textAlign: 'right' }}>
                      {pct}%
                    </div>
                  </div>
                )
              })}

              {/* Total */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 64px 52px',
                padding: '7px 10px',
                background: 'rgba(14,20,42,0.03)',
                borderTop: '1px solid rgba(14,20,42,0.06)',
              }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ws-text-2, #3a3f5c)' }}>Total</div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ws-text-2, #3a3f5c)', textAlign: 'right' }}>{formatarNumero(totalLeadsCanal)}</div>
                <div style={{ fontSize: '10px', color: 'var(--ws-text-3, #8892b0)', textAlign: 'right' }}>100%</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

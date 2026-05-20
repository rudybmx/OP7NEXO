'use client'

import { Info } from 'lucide-react'
import type { ContaAnuncio, LeadsByPlatform } from '@/types/meta-ads'
import { formatarNumero } from '@/lib/formatar'
import { MiniGauge } from '@/components/ui/mini-gauge'

interface CardLeadsProps {
  contas: ContaAnuncio[]
  leadsPorCanal?: LeadsByPlatform[]
  leadsAnterior?: number
}

export function CardLeads({ contas, leadsPorCanal = [], leadsAnterior }: CardLeadsProps) {
  const totalLeads = contas.reduce((s, c) => s + c.leads, 0)
  const totalWhatsapp = contas.reduce((s, c) => s + c.leadsWhatsapp, 0)
  const totalInstagram = contas.reduce((s, c) => s + c.leadsInstagram, 0)
  const totalFormulario = contas.reduce((s, c) => s + c.leadsFormulario, 0)
  const totalConversa7d = contas.reduce((s, c) => s + (c.leadsConversa7d ?? 0), 0)
  const totalLinkClick = contas.reduce((s, c) => s + (c.linkClick ?? 0), 0)

  const plataformasAgregadas = (leadsPorCanal.length > 0 ? leadsPorCanal : contas.flatMap((c) => c.leadsPorPlataforma))
    .reduce((acc, p) => {
      const existente = acc.find((a) => a.platform === p.platform)
      if (existente) {
        existente.count += p.count
      } else {
        acc.push({ ...p })
      }
      return acc
    }, [] as { platform: string; label: string; count: number; color: string }[])

  plataformasAgregadas.sort((a, b) => b.count - a.count)

  return (
    <div
      className="group relative"
      style={{
        background: 'var(--ws-glass-bg, rgba(255,255,255,0.72))',
        border: '1px solid var(--ws-glass-border, rgba(255,255,255,0.35))',
        borderRadius: '14px',
        padding: '16px 18px',
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow, 0 8px 32px rgba(14,20,42,0.12), 0 2px 8px rgba(14,20,42,0.08))',
        position: 'relative',
        overflow: 'visible',
        transition: 'all 0.2s ease',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)"
        e.currentTarget.style.boxShadow = "var(--ws-glass-shadow-lg, 0 16px 48px rgba(14,20,42,0.18), 0 4px 16px rgba(14,20,42,0.10))"
        e.currentTarget.style.zIndex = "30"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ""
        e.currentTarget.style.boxShadow = "var(--ws-glass-shadow, 0 8px 32px rgba(14,20,42,0.12), 0 2px 8px rgba(14,20,42,0.08))"
        e.currentTarget.style.zIndex = ""
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)', pointerEvents: 'none', borderRadius: '14px 14px 0 0' }} />

      <div className="flex items-center justify-between mb-1">
        <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ws-text-3, #8892b0)', marginBottom: '8px' }}>
          Leads gerados
        </span>
      </div>

      <div style={{ 
        position: 'absolute', 
        top: '12px', 
        right: '12px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px' 
      }}>
        {leadsAnterior && leadsAnterior > 0 && (
          <MiniGauge 
            value={Math.round((totalLeads / leadsAnterior) * 100)}
            size={44}
            strokeWidth={3.5}
            trend={totalLeads > leadsAnterior ? 'up' : 'down'}
          />
        )}
        <div style={{
          width: '16px', height: '16px', borderRadius: '50%',
          border: '1px solid var(--ws-glass-border, rgba(255,255,255,0.35))',
          color: 'var(--ws-text-3, #8892b0)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Info style={{ width: 10, height: 10 }} />
        </div>
      </div>
      
      <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--ws-text-1, #0E142A)', letterSpacing: '-0.02em', lineHeight: 1 }}>
        {formatarNumero(totalLeads)}
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', borderTop: '1px solid var(--ws-divider, rgba(14,20,42,0.06))', paddingTop: '8px', marginTop: '10px' }}>
        {[
          { label: 'Conv. 7d', value: totalConversa7d || totalWhatsapp,  title: 'Início de conversa atribuído em até 7 dias' },
          { label: 'Link Click', value: totalLinkClick, title: 'Cliques no link (action_type: link_click)' },
          { label: 'Formulário', value: totalFormulario || totalInstagram, title: 'Leads via formulário/pixel' },
        ].map((item) => (
          <div key={item.label} title={item.title} style={{
            textAlign: 'center',
            minWidth: 0,
            cursor: 'help',
          }}>
            <div style={{ fontSize: '8px', color: 'var(--ws-text-3, #8892b0)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.label}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ws-text-1, #0E142A)', marginTop: '2px' }}>
              {item.value.toLocaleString('pt-BR')}
            </div>
          </div>
        ))}
      </div>

      {/* Tooltip on hover */}
      <div
        className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150"
        style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: '-1px',
          zIndex: 50,
          background: '#FFFFFF',
          border: '1px solid var(--ws-glass-border, rgba(14,20,42,0.1))',
          borderRadius: '12px',
          padding: '12px 14px',
          backdropFilter: 'none',
          boxShadow: 'var(--ws-glass-shadow-lg, 0 16px 48px rgba(14,20,42,0.18), 0 4px 16px rgba(14,20,42,0.10))',
          minWidth: '220px',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '10px', color: 'var(--ws-text-1, #0E142A)' }}>
          Origem dos leads
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {plataformasAgregadas.map((p, i, arr) => {
            let properColor = p.color
            if (p.platform === 'facebook_feed') properColor = '#1877f2'
            else if (p.platform === 'instagram_feed') properColor = '#e1306c'
            else if (p.platform === 'instagram_stories') properColor = '#833ab4'
            else if (p.platform === 'facebook_messenger') properColor = '#0084ff'
            else if (p.platform === 'whatsapp') properColor = '#25d366'
            else if (p.platform === 'instagram_reels') properColor = '#fd1d1d'

            const pct = totalLeads > 0 ? ((p.count / totalLeads) * 100).toFixed(1) : '0,0'
            return (
              <div key={p.platform} style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0',
                borderBottom: i < arr.length - 1 ? '1px solid var(--ws-divider, rgba(14,20,42,0.06))' : 'none'
              }}>
                <span
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: properColor, display: 'inline-block', flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '12px', color: 'var(--ws-text-1, #0E142A)', flex: 1 }}>{p.label}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ws-text-1, #0E142A)' }}>{formatarNumero(p.count)}</span>
                <span style={{ fontSize: '11px', color: 'var(--ws-text-3, #8892b0)', minWidth: '36px', textAlign: 'right' }}>{pct}%</span>
              </div>
            )
          })}
        </div>
        <div style={{
          fontSize: '10px', color: 'var(--ws-text-3, #8892b0)', marginTop: '8px',
          paddingTop: '8px', borderTop: '1px solid var(--ws-divider, rgba(14,20,42,0.06))'
        }}>
          Total: {formatarNumero(totalLeads)} leads
        </div>
      </div>
    </div>
  )
}

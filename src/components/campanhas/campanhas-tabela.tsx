'use client'

import React from 'react'
import { Smartphone, Eye, TrendingUp, TrendingDown, Target, Globe, Search, Briefcase, Music, MessageCircle } from 'lucide-react'
import { CampanhaMetrics } from '@/types/campanhas'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

interface CampanhasTabelaProps {
  campanhas: CampanhaMetrics[]
  onVerLeads: (campanha: CampanhaMetrics) => void
}

export function CampanhasTabela({ campanhas, onVerLeads }: CampanhasTabelaProps) {
  const getPlatIcon = (plat: string) => {
    const icons: Record<string, any> = {
      meta: Globe,
      google: Search,
      linkedin: Briefcase,
      tiktok: Music,
      whatsapp: MessageCircle,
      offline: Smartphone,
    }
    const Icon = icons[plat.toLowerCase()] || Globe
    const colors: Record<string, string> = {
      meta: '#1877F2',
      google: '#4285F4',
      linkedin: '#0A66C2',
      tiktok: '#000000',
      whatsapp: '#25D366',
      offline: '#64748b',
    }
    return <Icon size={20} style={{ color: colors[plat.toLowerCase()] || '#64748b' }} />
  }

  const getConvColor = (val: number) => {
    if (val >= 25) return 'var(--ws-green)'
    if (val >= 10) return 'var(--gold)'
    return 'var(--ws-coral)'
  }

  // Totais para o rodapé
  const totais = campanhas.reduce((acc, c) => ({
    leads: acc.leads + c.total_leads,
    ganhos: acc.ganhos + c.leads_ganhos,
    custo: acc.custo + (c.custo_total || 0)
  }), { leads: 0, ganhos: 0, custo: 0 })

  const cpfMedio = totais.ganhos > 0 ? totais.custo / totais.ganhos : 0

  const maxLeads = Math.max(...campanhas.map(c => c.total_leads), 1)

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      position: 'relative',
      overflow: 'hidden'
    }} className="mt-6">
      {/* Linha de brilho */}
      <div style={{ position:'absolute',top:0,left:0,right:0,height:1,
        background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)',
        pointerEvents:'none' }} />

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1200px]">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--ws-glass-border)' }}>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Plataforma</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Campanha</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-center">Leads</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-center">Ativos</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-center">Ganhos</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-center">Percas</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-center">Perdidos</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold" style={{ width: 160, minWidth: 160 }}>Conv. %</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Custo</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">CPL</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-right" style={{ width: 100, minWidth: 100 }}>CPF</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ws-glass-border)]">
            {campanhas.map((campanha, idx) => (
              <tr key={idx} className="hover:bg-white/5 transition-colors group">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    {getPlatIcon(campanha.plataforma)}
                    <span className="text-xs font-bold text-white uppercase">{campanha.plataforma}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 10px' }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', display: 'block' }}>
                      {campanha.campanha_nome}
                    </span>
                    {campanha.utm_campaign && (
                      <span style={{
                        fontSize: 10, color: 'var(--ws-text-3)',
                        fontFamily: 'monospace',
                        display: 'block', marginTop: 2,
                      }}>
                        {campanha.utm_campaign}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '12px 10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    {/* Número em destaque */}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                      {campanha.total_leads}
                    </span>
                    {/* Barra proporcional ao max de leads */}
                    <div style={{ width: 60, height: 3, borderRadius: 99, background: 'rgba(14,20,42,0.08)' }}>
                      <div style={{
                        height: '100%', borderRadius: 99,
                        background: 'var(--ws-blue)',
                        width: `${Math.min((campanha.total_leads / maxLeads) * 100, 100)}%`,
                      }} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <Badge variant="outline" className="rounded-full text-[10px] font-bold h-5 bg-[var(--ws-green-soft)] text-[var(--ws-green)] border-[var(--ws-green-soft)]">
                    {campanha.leads_ativos}
                  </Badge>
                </td>
                <td className="px-4 py-4 text-center">
                  <Badge variant="outline" className="rounded-full text-[10px] font-bold h-5 bg-[var(--ws-blue-soft)] text-[var(--ws-blue)] border-[var(--ws-blue-soft)]">
                    {campanha.leads_ganhos}
                  </Badge>
                </td>
                <td className="px-4 py-4 text-center">
                  <Badge variant="outline" className="rounded-full text-[10px] font-bold h-5 bg-[var(--ws-coral-soft)] text-[var(--ws-coral)] border-[var(--ws-coral-soft)]">
                    {campanha.leads_percas}
                  </Badge>
                </td>
                <td className="px-4 py-4 text-center">
                  <Badge variant="outline" className="rounded-full text-[10px] font-bold h-5 bg-white/5 text-muted-foreground border-white/10">
                    {campanha.leads_perdidos}
                  </Badge>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold" style={{ color: getConvColor(campanha.taxa_conversao) }}>
                        {campanha.taxa_conversao}%
                      </span>
                      {campanha.taxa_conversao >= 20 ? <TrendingUp size={12} className="text-[var(--ws-green)]" /> : <TrendingDown size={12} className="text-[var(--ws-coral)]" />}
                    </div>
                    <Progress value={campanha.taxa_conversao} className="h-1 bg-white/5" style={{ '--progress-foreground': getConvColor(campanha.taxa_conversao) } as any} />
                  </div>
                </td>
                <td className="px-4 py-4 text-sm font-medium text-white/80">
                  {campanha.custo_total ? `R$ ${campanha.custo_total.toLocaleString()}` : '—'}
                </td>
                <td className="px-4 py-4 text-xs font-medium text-muted-foreground">
                  {campanha.custo_por_lead ? `R$ ${campanha.custo_por_lead.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-4 text-right">
                  {campanha.custo_por_fechamento ? (
                    <span 
                      className="text-xs font-bold"
                      style={{ 
                        color: campanha.custo_por_fechamento <= 350 ? 'var(--ws-green)' 
                          : campanha.custo_por_fechamento <= 600 ? 'var(--ws-gold)' 
                          : 'var(--ws-coral)'
                      }}
                    >
                      R$ {campanha.custo_por_fechamento.toLocaleString()}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-4 text-right">
                  <button
                    onClick={() => onVerLeads(campanha)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px',
                      background: 'transparent',
                      border: '1px solid var(--ws-glass-border)',
                      borderRadius: 'var(--ws-radius-sm)',
                      color: 'var(--ws-blue)',
                      fontSize: 11, fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(62,91,255,0.08)'
                      e.currentTarget.style.borderColor = 'var(--ws-blue)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.borderColor = 'var(--ws-glass-border)'
                    }}
                  >
                    <Eye size={11} />
                    Ver Leads
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--ws-glass-border)' }}>
              <td colSpan={2} className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase">Totais Gerais</td>
              <td className="px-4 py-3 text-center text-sm font-bold text-white">{totais.leads}</td>
              <td colSpan={5} />
              <td className="px-4 py-3 text-sm font-bold text-[var(--ws-blue)]">R$ {totais.custo.toLocaleString()}</td>
              <td className="px-4 py-3 text-xs font-medium text-muted-foreground">R$ {(totais.custo / totais.leads).toFixed(2)}</td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-bold text-[var(--ws-green)]">R$ {cpfMedio.toLocaleString()}</span>
                <p className="text-[8px] text-muted-foreground uppercase mt-0.5">Média CPF</p>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

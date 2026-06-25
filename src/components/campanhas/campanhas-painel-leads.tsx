'use client'

import React, { useState } from 'react'
import { 
  X, 
  Search, 
  MessageSquare, 
  Clock, 
  ExternalLink,
  ChevronRight,
  User,
  Zap,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Smartphone,
  Globe,
  Briefcase,
  Music,
  MessageCircle
} from 'lucide-react'
import { FollowupLead, LeadStatusFollowup, LeadStatusFechamento } from '@/types/followup'
import { CampanhaMetrics } from '@/types/campanhas'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface CampanhasPainelLeadsProps {
  isOpen: boolean
  onClose: () => void
  campanha: CampanhaMetrics | null
  leads: FollowupLead[]
}

export function CampanhasPainelLeads({ isOpen, onClose, campanha, leads }: CampanhasPainelLeadsProps) {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')

  if (!campanha) return null

  const leadsFiltrados = leads.filter(l => {
    const matchBusca = !busca || l.nome?.toLowerCase().includes(busca.toLowerCase()) || l.telefone.includes(busca)
    
    let matchStatus = true
    if (filtroStatus === 'ativos') matchStatus = l.status_followup === 'ativo' || l.status_followup === 'vencido'
    if (filtroStatus === 'ganhos') matchStatus = l.status_fechamento === 'ganho'
    if (filtroStatus === 'percas') matchStatus = l.status_fechamento === 'perca'
    if (filtroStatus === 'perdidos') matchStatus = l.status_fechamento === 'perdido'

    return matchBusca && matchStatus
  })

  const getPlatIcon = (plat: string) => {
    const icons: Record<string, any> = {
      meta: Globe,
      google: Search,
      linkedin: Briefcase,
      tiktok: Music,
      whatsapp: MessageCircle,
    }
    const Icon = icons[plat.toLowerCase()] || Globe
    return <Icon size={16} />
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[998] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div 
        className={`fixed top-0 left-0 h-full bg-[var(--ws-navy)] z-[999] shadow-2xl transition-transform duration-500 ease-out border-r border-[var(--ws-glass-border)] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: '600px' }}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--ws-blue-soft)] text-[var(--ws-blue)]">
                {getPlatIcon(campanha.plataforma)}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white leading-tight">{campanha.campanha_nome}</h2>
                <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{campanha.utm_campaign}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
              <p className="text-[9px] uppercase font-bold text-white/40 mb-1">Leads</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-white">{campanha.total_leads}</span>
                <span className="text-[10px] text-white/60">captações</span>
              </div>
            </div>
            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
              <p className="text-[9px] uppercase font-bold text-white/40 mb-1">Conversão</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold" style={{ color: campanha.taxa_conversao >= 20 ? 'var(--ws-green)' : 'var(--gold)' }}>
                  {campanha.taxa_conversao}%
                </span>
                <span className="text-[10px] text-white/60">{campanha.leads_ganhos} ganhos</span>
              </div>
            </div>
            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
              <p className="text-[9px] uppercase font-bold text-white/40 mb-1">Custo</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-[var(--ws-blue)]">
                  {campanha.custo_total ? `R$ ${(campanha.custo_total / 1000).toFixed(1)}k` : '—'}
                </span>
                <span className="text-[10px] text-white/60">investido</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and List */}
        <div className="flex-1 flex flex-col h-[calc(100%-200px)]">
          <div className="p-6 border-b border-white/5 space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input 
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-[var(--ws-blue)] transition-colors"
              />
            </div>
            <div className="flex gap-1.5 p-1 bg-black/20 rounded-lg border border-white/5">
              {['todos', 'ativos', 'ganhos', 'percas', 'perdidos'].map(s => (
                <button
                  key={s}
                  onClick={() => setFiltroStatus(s)}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                    filtroStatus === s ? 'bg-[var(--ws-blue-soft)] text-[var(--ws-blue)] border border-[var(--ws-blue-soft)] shadow-lg shadow-blue-500/10' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
            <div className="space-y-3">
              {leadsFiltrados.map((lead) => (
                <div 
                  key={lead.id}
                  className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all group flex items-center justify-between gap-4"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-white truncate max-w-[140px]">{lead.nome || 'Sem Nome'}</span>
                      <TemperaturaBadge temp={lead.temperatura || null} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-white/40">
                      <Smartphone size={10} />
                      {lead.telefone}
                      {lead.session_id && (
                        <a href="#" className="text-[var(--ws-blue)] hover:underline flex items-center gap-0.5">
                          <MessageSquare size={10} /> Chat
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusPill status={lead.status_followup} />
                    <div className="flex items-center gap-1.5 text-[9px] font-medium text-white/30">
                      <Clock size={10} />
                      {lead.ultimo_contato ? formatDistanceToNow(parseISO(lead.ultimo_contato), { locale: ptBR, addSuffix: true }) : 'Sem contato'}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span className="text-[9px] font-bold text-white/40 uppercase">T{lead.tentativa_atual}</span>
                    <FechamentoPill status={lead.status_fechamento} />
                  </div>

                  <button className="p-2 rounded-lg bg-white/5 text-white/20 group-hover:text-white transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </div>
              ))}

              {leadsFiltrados.length === 0 && (
                <div className="py-20 flex flex-col items-center justify-center opacity-40">
                  <User size={32} className="mb-2" />
                  <p className="text-xs">Nenhum lead encontrado nesta campanha</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function TemperaturaBadge({ temp }: { temp: string | null }) {
  if (!temp) return null
  const colors: Record<string, string> = {
    quente: 'linear-gradient(135deg, #FF5C8D, #7A5AF8)',
    morno: 'linear-gradient(135deg, var(--gold), #FF5C8D)',
    frio: 'linear-gradient(135deg, var(--ws-blue), var(--ws-cyan))'
  }
  return <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[temp] || '#888' }} />
}

function StatusPill({ status }: { status: LeadStatusFollowup }) {
  const configs: Record<string, { label: string, color: string, bg: string }> = {
    ativo: { label: 'Ativo', color: 'var(--ws-green)', bg: 'var(--ws-green-soft)' },
    vencido: { label: 'Vencido', color: 'var(--ws-coral)', bg: 'var(--ws-coral-soft)' },
    respondeu: { label: 'Respondeu', color: 'var(--ws-blue)', bg: 'var(--ws-blue-soft)' },
    esgotado: { label: 'Esgotado', color: '#ff8a5e', bg: 'rgba(255,138,94,0.1)' }
  }
  const cfg = configs[status] || { label: status, color: '#888', bg: 'rgba(255,255,255,0.05)' }
  return (
    <div className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </div>
  )
}

function FechamentoPill({ status }: { status: LeadStatusFechamento }) {
  if (status === 'em_aberto') return <div className="p-1 rounded bg-white/5"><HelpCircle size={12} className="text-white/20" /></div>
  if (status === 'ganho') return <div className="p-1 rounded bg-[var(--ws-green-soft)]"><CheckCircle2 size={12} className="text-[var(--ws-green)]" /></div>
  if (status === 'perca') return <div className="p-1 rounded bg-[var(--ws-coral-soft)]"><XCircle size={12} className="text-[var(--ws-coral)]" /></div>
  return <div className="p-1 rounded bg-white/10"><XCircle size={12} className="text-white/40" /></div>
}

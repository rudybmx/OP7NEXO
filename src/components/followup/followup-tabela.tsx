'use client'

import React, { useState } from 'react'
import { 
  MessageSquare, 
  MessageCircle, 
  MapPin, 
  Globe, 
  Users, 
  AlertTriangle, 
  Clock, 
  ChevronRight,
  ChevronLeft,
  MoreHorizontal,
  Search,
  Briefcase,
  Music
} from 'lucide-react'
import { 
  formatDistanceToNow, 
  isToday, 
  isTomorrow, 
  isPast, 
  isThisWeek, 
  parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { 
  FollowupLead, 
  LeadStatusFechamento, 
  LeadTemperatura,
  LeadStatusFollowup,
  LeadOrigem
} from '@/types/followup'
import { toast } from 'sonner'
import { 
  Avatar, 
  AvatarFallback,
} from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import Link from 'next/link'

interface FollowupTabelaProps {
  leads: FollowupLead[]
  onLeadClick: (lead: FollowupLead) => void
  onStatusFechamentoChange: (id: string, status: LeadStatusFechamento) => void
  onTemperaturaChange: (id: string, temp: LeadTemperatura) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES AUXILIARES
// ─────────────────────────────────────────────────────────────────────────────

const getAgentColor = (id?: string) => {
  if (!id) return 'var(--ws-navy)'
  const colors = [
    'var(--ws-blue)',
    'var(--ws-purple)',
    'var(--ws-coral)',
    'var(--ws-green)',
    'var(--ws-gold)',
    '#00b8c8'
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const formatPhone = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  }
  return phone
}

const TentativaDots = ({ current, max }: { current: number, max: number }) => {
  const displayMax = Math.min(max, 8)
  const dots = Array.from({ length: displayMax })
  
  const getColor = (i: number) => {
    const pos = i + 1
    if (pos > current) return 'rgba(14,20,42,0.1)'
    if (pos <= 3) return 'var(--ws-blue)'
    if (pos <= 6) return 'var(--ws-gold)'
    return 'var(--ws-coral)'
  }

  return (
    <div className="flex flex-col items-center gap-1 min-w-[80px]">
      <div className="flex gap-1">
        {dots.map((_, i) => (
          <div 
            key={i} 
            className="w-1.5 h-1.5 rounded-full" 
            style={{ backgroundColor: getColor(i) }} 
          />
        ))}
      </div>
      <span className="text-[10px] text-[var(--ws-text-3)] font-medium">
        {current}/{max}
      </span>
    </div>
  )
}

const StatusBadge = ({ status }: { status: LeadStatusFollowup }) => {
  const configs: Record<LeadStatusFollowup, { bg: string, dot: string, label: string, pulse?: boolean }> = {
    ativo: { 
      bg: 'var(--ws-green-soft)', 
      dot: 'var(--ws-green)', 
      label: 'Ativo',
      pulse: true
    },
    vencido: { 
      bg: 'rgba(201,168,76,0.12)', 
      dot: 'var(--ws-gold)', 
      label: 'Vencido',
      pulse: true
    },
    respondeu: { 
      bg: 'var(--ws-blue-soft)', 
      dot: 'var(--ws-blue)', 
      label: 'Respondeu' 
    },
    encerrado: { 
      bg: 'rgba(14,20,42,0.06)', 
      dot: '#64748b', 
      label: 'Encerrado' 
    },
    esgotado: { 
      bg: 'var(--ws-coral-soft)', 
      dot: 'var(--ws-coral)', 
      label: 'Esgotado' 
    },
    pausado: { 
      bg: 'var(--ws-purple-soft)', 
      dot: 'var(--ws-purple)', 
      label: 'Pausado' 
    }
  }

  const config = configs[status] || configs.encerrado

  return (
    <div 
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: config.bg }}
    >
      <div 
        className={`w-1.5 h-1.5 rounded-full ${config.pulse ? 'animate-pulse' : ''}`}
        style={{ 
          backgroundColor: config.dot,
          boxShadow: config.pulse ? `0 0 8px ${config.dot}` : 'none'
        }}
      />
      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: config.dot }}>
        {config.label}
      </span>
    </div>
  )
}

const OrigemBadge = ({ origem }: { origem: LeadOrigem }) => {
  const configs: Record<LeadOrigem, { icon: any, color: string, label: string }> = {
    meta_ads: { icon: Globe, color: '#1877F2', label: 'Meta Ads' },
    google_ads: { icon: Search, color: '#4285F4', label: 'Google Ads' },
    linkedin_ads: { icon: Briefcase, color: '#0A66C2', label: 'Linkedin' },
    tiktok_ads: { icon: Music, color: '#000000', label: 'TikTok' },
    whatsapp: { icon: MessageCircle, color: '#25d366', label: 'WhatsApp' },
    offline: { icon: MapPin, color: '#64748b', label: 'Presencial' },
    organico: { icon: Globe, color: '#3E5BFF', label: 'Orgânico' },
    indicacao: { icon: Users, color: '#7A5AF8', label: 'Indicação' },
    outro: { icon: MoreHorizontal, color: '#64748b', label: 'Outro' }
  }

  const config = configs[origem] || configs.outro
  const Icon = config.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md cursor-help border transition-colors hover:bg-opacity-20"
            style={{ 
              backgroundColor: `${config.color}08`, 
              borderColor: `${config.color}20` 
            }}
          >
            <Icon size={12} style={{ color: config.color }} />
            <span className="text-[10px] font-bold" style={{ color: config.color }}>{config.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-[10px] bg-slate-900 text-white border-none">
          Origem: {config.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const TempBadge = ({ temp, onChange }: { temp: LeadTemperatura, onChange: (t: LeadTemperatura) => void }) => {
  const configs: Record<string, { gradient: string, label: string }> = {
    quente: { gradient: 'linear-gradient(135deg,#dc2626,#f97316)', label: 'Quente' },
    morno: { gradient: 'linear-gradient(135deg,#d97706,#fbbf24)', label: 'Morno' },
    frio: { gradient: 'linear-gradient(135deg,var(--ws-blue),var(--ws-cyan-dark))', label: 'Frio' }
  }

  if (!temp) return <span className="text-[10px] text-[var(--ws-text-3)] italic">Pendente</span>

  const config = configs[temp]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button 
          onClick={(e) => e.stopPropagation()}
          className="px-1.5 py-0.5 rounded text-white text-[9px] font-bold uppercase tracking-tight shadow-sm hover:scale-105 active:scale-95 transition-all min-w-[54px]"
          style={{ background: config.gradient }}
        >
          {config.label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-32 p-1 bg-[var(--ws-glass-bg)] border-[var(--ws-glass-border)] backdrop-blur-xl shadow-xl z-50">
        <div className="flex flex-col gap-1">
          {Object.entries(configs).map(([key, cfg]) => (
            <button
              key={key}
              onClick={(e) => {
                e.stopPropagation();
                onChange(key as LeadTemperatura);
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/10 text-[10px] font-bold text-[var(--ws-text-1)] transition-colors text-left"
            >
              <div 
                className="w-2 h-2 rounded-full shrink-0" 
                style={{ background: cfg.gradient }}
              />
              {cfg.label.toUpperCase()}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export function FollowupTabela({
  leads,
  onLeadClick,
  onStatusFechamentoChange,
  onTemperaturaChange
}: FollowupTabelaProps) {
  const [pagina, setPagina] = useState(1)
  const itensPorPagina = 20

  const totalPages = Math.ceil(leads.length / itensPorPagina)
  const currentLeads = leads.slice((pagina - 1) * itensPorPagina, pagina * itensPorPagina)

  const groupLeads = (leadsList: FollowupLead[]) => {
    const groups: Record<string, FollowupLead[]> = {
      'Hoje': [],
      'Amanhã': [],
      'Esta semana': [],
      'Mais antigos': [],
      'Sem data': []
    }

    leadsList.forEach(lead => {
      if (!lead.proximo_envio) {
        groups['Sem data'].push(lead)
        return
      }

      const date = parseISO(lead.proximo_envio)
      if (isToday(date)) {
        groups['Hoje'].push(lead)
      } else if (isTomorrow(date)) {
        groups['Amanhã'].push(lead)
      } else if (isThisWeek(date)) {
        groups['Esta semana'].push(lead)
      } else {
        groups['Mais antigos'].push(lead)
      }
    })

    return groups
  }

  const grouped = groupLeads(currentLeads)

  const renderRelativeDate = (dateStr?: string) => {
    if (!dateStr) return <span className="text-[var(--ws-text-3)]">—</span>
    const date = parseISO(dateStr)
    const relative = formatDistanceToNow(date, { addSuffix: true, locale: ptBR })
    const isAtrasado = isPast(date) && !isToday(date)
    const isHj = isToday(date)

    return (
      <div className="flex items-center gap-1.5">
        {isAtrasado && <AlertTriangle size={11} className="text-[var(--ws-coral)]" />}
        {isHj && <Clock size={11} className="text-[var(--ws-green)]" />}
        <span 
          className="text-[11px] font-medium"
          style={{ 
            color: isAtrasado ? 'var(--ws-coral)' : (isHj ? 'var(--ws-green)' : 'var(--ws-text-2)') 
          }}
        >
          {relative}
        </span>
      </div>
    )
  }

  const FechamentoSelect = ({ lead }: { lead: FollowupLead }) => {
    const [dropdownAberto, setDropdownAberto] = useState(false)
    
    const configs = {
      em_aberto: { label: 'Em aberto', color: 'var(--ws-text-3)', bg: 'rgba(14,20,42,0.06)' },
      ganho:     { label: 'Ganho',     color: 'var(--ws-green)',  bg: 'rgba(15,168,86,0.12)' },
      perca:     { label: 'Perca',     color: 'var(--ws-coral)',  bg: 'rgba(255,92,141,0.12)' },
      perdido:   { label: 'Perdido',   color: 'var(--ws-text-3)', bg: 'rgba(14,20,42,0.04)' },
      reagendado:{ label: 'Reagendado',color: 'var(--ws-gold)',          bg: 'rgba(201,168,76,0.12)' },
    }

    const config = configs[lead.status_fechamento] || configs.em_aberto

    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setDropdownAberto(!dropdownAberto)
          }}
          style={{
            background: config.bg,
            color: config.color,
            border: `1px solid currentColor`,
            borderRadius: 9999,
            padding: '2px 8px',
            fontSize: 9,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
          {config.label.toUpperCase()}
        </button>

        {dropdownAberto && (
          <>
            <div 
              style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
              onClick={(e) => {
                e.stopPropagation()
                setDropdownAberto(false)
              }} 
            />
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 50,
              background: 'var(--ws-glass-bg)',
              border: '1px solid var(--ws-glass-border)',
              borderRadius: 'var(--ws-radius-md)',
              backdropFilter: 'blur(16px)',
              boxShadow: 'var(--ws-glass-shadow)',
              padding: 4,
              minWidth: 130,
              marginTop: 4,
            }}>
              {Object.entries(configs).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={(e) => {
                    e.stopPropagation()
                    onStatusFechamentoChange(lead.id, key as LeadStatusFechamento)
                    setDropdownAberto(false)
                    toast.success(`Fechamento: ${cfg.label}`)
                  }}
                  style={{
                    display: 'flex', width: '100%', textAlign: 'left',
                    padding: '8px 12px', background: 'transparent', border: 'none',
                    color: cfg.color, fontSize: 11, cursor: 'pointer',
                    borderRadius: 'var(--ws-radius-sm)',
                    fontWeight: 600,
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'background 0.2s'
                  }}
                  className="hover:bg-white/5"
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
                  {cfg.label.toUpperCase()}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div 
      className="relative overflow-hidden"
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
      }}
    >
      {/* Glow line */}
      <div style={{ position:'absolute',top:0,left:0,right:0,height:1,
        background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)',
        pointerEvents:'none', zIndex: 10 }} />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left min-w-[1000px]">
          <thead>
            <tr style={{ background: 'rgba(14,20,42,0.04)' }}>
              <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Lead</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Origem</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)] text-center">Tentativa</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Próx. Envio</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Status</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Fechamento</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Temp.</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)] text-center">Agente</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)] text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ws-divider)]">
            {Object.entries(grouped).map(([period, periodLeads]) => (
              <React.Fragment key={period}>
                {periodLeads.length > 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ws-text-3)] py-1 pr-3">
                          {period}
                        </span>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-[var(--gold)] to-transparent opacity-20" />
                      </div>
                    </td>
                  </tr>
                )}
                {periodLeads.map(lead => (
                  <tr 
                    key={lead.id}
                    onClick={() => onLeadClick(lead)}
                    className="group hover:bg-[rgba(14,20,42,0.02)] dark:hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition-colors"
                  >
                    {/* LEAD */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-[var(--ws-text-1)]">{lead.nome || 'Sem Nome'}</span>
                            {lead.session_id && (
                              <Link 
                                href={`/crm/atendimento?session=${lead.session_id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[var(--ws-blue)] hover:scale-110 transition-transform"
                              >
                                <MessageSquare size={13} />
                              </Link>
                            )}
                            {lead.ultimo_resumo && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <MessageCircle size={13} className="text-[var(--ws-text-3)] cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[200px] text-[10px] p-2 bg-slate-900 leading-relaxed">
                                    {lead.ultimo_resumo}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <span className="text-[11px] text-[var(--ws-text-2)] font-medium">{formatPhone(lead.telefone)}</span>
                        </div>
                      </div>
                    </td>

                    {/* ORIGEM */}
                    <td className="px-4 py-3">
                      <OrigemBadge origem={lead.origem} />
                    </td>

                    {/* TENTATIVA */}
                    <td className="px-4 py-3 text-center">
                      <TentativaDots current={lead.tentativa_atual} max={lead.max_tentativas} />
                    </td>

                    {/* PROX ENVIO */}
                    <td className="px-4 py-3">
                      {renderRelativeDate(lead.proximo_envio)}
                    </td>

                    {/* STATUS */}
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status_followup} />
                    </td>

                    {/* FECHAMENTO */}
                    <td className="px-4 py-3">
                      <FechamentoSelect lead={lead} />
                    </td>

                    {/* TEMP */}
                    <td className="px-4 py-3">
                      <TempBadge 
                        temp={lead.temperatura || null} 
                        onChange={(t) => onTemperaturaChange(lead.id, t)} 
                      />
                    </td>

                    {/* AGENTE */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Avatar className="w-7 h-7 border border-white/10 ring-1 ring-black/5" style={{ backgroundColor: getAgentColor(lead.agente_id) }}>
                                <AvatarFallback className="text-[10px] font-bold text-white bg-transparent">
                                  {lead.agente_id?.substring(0, 2).toUpperCase() || 'IA'}
                                </AvatarFallback>
                              </Avatar>
                            </TooltipTrigger>
                            <TooltipContent className="text-[10px] bg-slate-900">
                              Agente: {lead.agente_id || 'Automação'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </td>

                    {/* ACOES */}
                    <td className="px-4 py-3 text-right">
                      <button className="p-1 px-2 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <ChevronRight size={16} className="text-[var(--ws-text-3)] group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* RODAPE / PAGINACAO */}
      <div className="px-5 py-4 border-t border-[var(--ws-divider)] flex items-center justify-between">
        <span className="text-[11px] text-[var(--ws-text-3)] font-medium">
          Mostrando <strong className="text-[var(--ws-text-1)]">{currentLeads.length}</strong> de <strong className="text-[var(--ws-text-1)]">{leads.length}</strong> leads
        </span>

        <div className="flex items-center gap-2">
          <button 
            disabled={pagina === 1}
            onClick={() => setPagina(p => p - 1)}
            className="p-1.5 rounded-md border border-[var(--ws-glass-border)] bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={16} className="text-[var(--ws-text-1)]" />
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPagina(i + 1)}
                className={`w-7 h-7 rounded-md text-[11px] font-bold transition-all ${
                  pagina === i + 1 
                  ? 'bg-gradient-to-br from-[var(--ws-blue)] to-[var(--ws-purple)] text-white shadow-md' 
                  : 'text-[var(--ws-text-2)] hover:bg-white/5'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button 
            disabled={pagina === totalPages}
            onClick={() => setPagina(p => p + 1)}
            className="p-1.5 rounded-md border border-[var(--ws-glass-border)] bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
          >
            <ChevronRight size={16} className="text-[var(--ws-text-1)]" />
          </button>
        </div>
      </div>
    </div>
  )
}

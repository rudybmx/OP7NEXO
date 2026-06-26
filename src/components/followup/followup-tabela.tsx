'use client'

import React, { useState } from 'react'
import {
  MessageSquare,
  MessageCircle,
  MapPin,
  Globe,
  Users,
  ChevronRight,
  ChevronLeft,
  MoreHorizontal,
  Search,
  Briefcase,
  Music,
  Clock
} from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
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
  AvatarImage,
} from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import Link from 'next/link'

interface FollowupTabelaProps {
  leads: FollowupLead[]
  onLeadClick: (lead: FollowupLead) => void
  onStatusFechamentoChange: (id: string, status: LeadStatusFechamento) => void
  /** Mapa agente_id → {nome, avatar} para exibir o nome do agente (não o UUID). */
  agenteMap?: Record<string, { nome: string; avatar_url?: string | null }>
  /** @deprecated temperatura é leitura da IA; mantido opcional p/ o sandbox followup-2. */
  onTemperaturaChange?: (id: string, temp: LeadTemperatura) => void
}

// Tempo desde nosso último envio (= há quanto o lead está sem responder) + cor de urgência.
function tempoSemResponder(iso?: string | null): { label: string; cor: string } | null {
  if (!iso) return null
  const d = parseISO(iso)
  const horas = (Date.now() - d.getTime()) / 3600000
  const cor = horas >= 24 ? 'var(--ws-coral)' : horas >= 6 ? 'var(--ws-gold)' : 'var(--ws-text-2)'
  return { label: formatDistanceToNow(d, { locale: ptBR }), cor }
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

const StatusBadge = ({ status }: { status: LeadStatusFollowup }) => {
  const configs: Record<LeadStatusFollowup, { bg: string, dot: string, label: string, pulse?: boolean }> = {
    ativo: {
      bg: 'var(--ws-green-soft)',
      dot: 'var(--ws-green)',
      label: 'Em follow-up',
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
      bg: 'var(--ws-surface-2)',
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

// Temperatura é leitura da análise da IA — não editável pelo operador.
const TempBadge = ({ temp }: { temp: LeadTemperatura }) => {
  const configs: Record<string, { gradient: string, label: string }> = {
    quente: { gradient: 'linear-gradient(135deg,#dc2626,#f97316)', label: 'Quente' },
    morno: { gradient: 'linear-gradient(135deg,#d97706,#fbbf24)', label: 'Morno' },
    frio: { gradient: 'linear-gradient(135deg,var(--ws-blue),var(--ws-cyan-dark))', label: 'Frio' }
  }

  if (!temp) return <span className="text-[10px] text-[var(--ws-text-3)] italic">Sem análise</span>

  const config = configs[temp]

  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-white text-[9px] font-bold uppercase tracking-tight shadow-sm min-w-[54px] text-center"
      style={{ background: config.gradient }}
    >
      {config.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export function FollowupTabela({
  leads,
  onLeadClick,
  onStatusFechamentoChange,
  agenteMap,
}: FollowupTabelaProps) {
  const [pagina, setPagina] = useState(1)
  const itensPorPagina = 20

  const totalPages = Math.max(1, Math.ceil(leads.length / itensPorPagina))
  const currentLeads = leads.slice((pagina - 1) * itensPorPagina, pagina * itensPorPagina)

  const FechamentoSelect = ({ lead }: { lead: FollowupLead }) => {
    const [dropdownAberto, setDropdownAberto] = useState(false)

    const configs = {
      em_aberto: { label: 'Em aberto', color: 'var(--ws-text-3)', bg: 'var(--ws-surface-2)' },
      ganho:     { label: 'Ganho',     color: 'var(--ws-green)',  bg: 'rgba(15,168,86,0.12)' },
      perca:     { label: 'Perca',     color: 'var(--ws-coral)',  bg: 'rgba(255,92,141,0.12)' },
      perdido:   { label: 'Perdido',   color: 'var(--ws-text-3)', bg: 'var(--ws-surface-2)' },
      reagendado:{ label: 'Reagendado',color: 'var(--ws-gold)',   bg: 'rgba(201,168,76,0.12)' },
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
        background:'linear-gradient(90deg,transparent,var(--ws-glass-border),transparent)',
        pointerEvents:'none', zIndex: 10 }} />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left min-w-[1000px]">
          <thead>
            <tr style={{ background: 'var(--ws-surface-2)' }}>
              <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Lead</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Origem</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Sem responder há</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Status</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Fechamento</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Temp.</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)]">Agente</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-[var(--ws-text-3)] text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ws-divider)]">
            {currentLeads.map(lead => (
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
                            href={`/crm/atendimento/conversas?conversa=${lead.session_id}`}
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

                {/* SEM RESPONDER HÁ */}
                <td className="px-4 py-3">
                  {(() => {
                    const t = tempoSemResponder(lead.ultimo_contato)
                    return t ? (
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <Clock size={11} style={{ color: t.cor }} />
                        <span className="text-[11px] font-medium" style={{ color: t.cor }}>{t.label}</span>
                      </div>
                    ) : (
                      <span className="text-[var(--ws-text-3)] text-[11px]">—</span>
                    )
                  })()}
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
                  <TempBadge temp={lead.temperatura || null} />
                </td>

                {/* AGENTE */}
                <td className="px-4 py-3">
                  {(() => {
                    const ag = lead.agente_id ? agenteMap?.[lead.agente_id] : undefined
                    const nome = ag?.nome || (lead.agente_id ? 'Agente' : 'Automação')
                    const iniciais = (ag?.nome || (lead.agente_id ? 'AG' : 'IA')).substring(0, 2).toUpperCase()
                    return (
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7 border border-white/10 ring-1 ring-black/5 shrink-0" style={{ backgroundColor: getAgentColor(lead.agente_id) }}>
                          {ag?.avatar_url ? <AvatarImage src={ag.avatar_url} alt={nome} /> : null}
                          <AvatarFallback className="text-[10px] font-bold text-white bg-transparent">
                            {iniciais}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[11px] text-[var(--ws-text-2)] font-medium truncate max-w-[120px]">{nome}</span>
                      </div>
                    )
                  })()}
                </td>

                {/* ACOES */}
                <td className="px-4 py-3 text-right">
                  <button className="p-1 px-2 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <ChevronRight size={16} className="text-[var(--ws-text-3)] group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </td>
              </tr>
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

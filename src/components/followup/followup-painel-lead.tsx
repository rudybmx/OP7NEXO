'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  X, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  MessageSquare, 
  Clock, 
  Pause, 
  Play, 
  Send, 
  User, 
  ExternalLink, 
  Tag, 
  Navigation,
  CheckCircle2,
  XCircle,
  RotateCw,
  Info
} from 'lucide-react'
import { format, parseISO, differenceInHours, isPast, differenceInMinutes, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { 
  FollowupLead, 
  LeadStatusFechamento, 
  LeadTemperatura, 
  LeadStatusFollowup,
  LeadOrigem
} from '@/types/followup'

interface FollowupPainelLeadProps {
  lead: FollowupLead | null
  aberto: boolean
  onFechar: () => void
  onStatusChange: (id: string, status: LeadStatusFechamento) => void
  onTemperaturaChange: (id: string, temp: LeadTemperatura) => void
  onPausar: (id: string) => void
  onReativar: (id: string) => void
}

// Estilo comum para labels de seção
const SectionTitle = ({ children, trailing }: { children: React.ReactNode, trailing?: React.ReactNode }) => (
  <div className="flex items-center gap-2 mt-8 mb-4">
    <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {children}
    </span>
    <div className="flex-1 h-[1px]" style={{ background: 'var(--ws-glass-border)' }} />
    {trailing}
  </div>
)

// Mapeamento de Cores e Labels
const STATUS_COLORS: Record<LeadStatusFollowup, string> = {
  ativo: 'var(--ws-green)',
  vencido: 'var(--ws-coral)',
  respondeu: 'var(--ws-purple)',
  encerrado: 'rgba(255,255,255,0.4)',
  esgotado: '#854f0b',
  pausado: 'var(--gold)'
}

const FECHAMENTO_COLORS: Record<LeadStatusFechamento, { bg: string, color: string, border: string }> = {
  em_aberto: { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: 'transparent' },
  ganho: { bg: 'var(--ws-green)', color: '#fff', border: 'var(--ws-green)' },
  perca: { bg: 'var(--ws-coral)', color: '#fff', border: 'var(--ws-coral)' },
  perdido: { bg: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.3)' },
  reagendado: { bg: 'rgba(201,168,76,0.12)', color: 'var(--gold)', border: 'var(--gold)' }
}

const TEMP_GRADIENTS: Record<Exclude<LeadTemperatura, null>, string> = {
  quente: 'linear-gradient(135deg, #FF5C8D, #7A5AF8)',
  morno: 'linear-gradient(135deg, var(--gold), #FF5C8D)',
  frio: 'linear-gradient(135deg, var(--ws-blue), var(--ws-cyan))'
}

const ORIGEM_ICONS: Record<LeadOrigem, any> = {
  meta_ads: MessageSquare,
  google_ads: ExternalLink,
  whatsapp: MessageSquare,
  indicacao: User,
  organico: Tag,
  offline: Navigation,
  linkedin_ads: ExternalLink,
  tiktok_ads: ExternalLink,
  outro: Info
}

export function FollowupPainelLead({
  lead,
  aberto,
  onFechar,
  onStatusChange,
  onTemperaturaChange,
  onPausar,
  onReativar
}: FollowupPainelLeadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Estados Locais (para edição rápida antes de salvar)
  const [interesse, setInteresse] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [utmExpandido, setUtmExpandido] = useState(false)
  const [localFechamento, setLocalFechamento] = useState<LeadStatusFechamento>('em_aberto')

  // Ao abrir, resetar estados e rolar para o topo
  useEffect(() => {
    if (aberto && lead) {
      setInteresse(lead.interesse || '')
      setObservacoes(lead.ultimo_resumo || '') // Usando resumo como base se não houver campo de notas
      setLocalFechamento(lead.status_fechamento)
      scrollRef.current?.scrollTo(0, 0)
    }
  }, [aberto, lead])

  if (!lead) return null

  const handleSalvar = () => {
    toast.success('Lead atualizado ✓')
    // Em produção, aqui chamaria o backend
  }

  const handleForcarEnvio = () => {
    toast.success('Disparo agendado para os próximos minutos')
  }

  const handlePausar = () => {
    onPausar(lead.id)
    toast.info('Follow-up pausado')
  }

  const handleReativar = () => {
    onReativar(lead.id)
    toast.success('Follow-up reativado')
  }

  // Lógica de tempo para próximo envio
  const renderProximoEnvio = () => {
    if (!lead.proximo_envio) return null
    
    const dataEnvio = parseISO(lead.proximo_envio)
    const atrasado = isPast(dataEnvio)
    const horasDiff = differenceInHours(dataEnvio, new Date())
    const minutosDiff = differenceInMinutes(dataEnvio, new Date())

    let labelTempo = ''
    if (atrasado) {
      labelTempo = `Atrasado ${Math.abs(horasDiff)}h`
    } else {
      if (Math.abs(horasDiff) < 1) {
        labelTempo = `Em ${Math.abs(minutosDiff)} min`
      } else if (Math.abs(horasDiff) < 24) {
        labelTempo = `Em ${Math.abs(horasDiff)}h`
      } else {
        labelTempo = `Em ${Math.ceil(Math.abs(horasDiff) / 24)} dias`
      }
    }

    return (
      <div 
        style={{
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)',
          padding: '16px',
          marginTop: '12px',
          position: 'relative',
          overflow: 'hidden'
        }}
        className="group"
      >
        <div style={{ position:'absolute',top:0,left:0,right:0,height:1, background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)', pointerEvents:'none' }} />
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: atrasado ? 'var(--ws-coral-soft)' : 'var(--ws-blue-soft)' }}
            >
              <Clock size={18} style={{ color: atrasado ? 'var(--ws-coral)' : 'var(--ws-blue)' }} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider opacity-40">Próximo Disparo</p>
              <p className="text-sm font-semibold">
                {format(dataEnvio, "dd 'de' MMM, HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>
          
          <div 
            className="px-2.5 py-1 rounded-full text-[10px] font-bold"
            style={{ 
              background: atrasado ? 'var(--ws-coral-soft)' : 'var(--ws-blue-soft)',
              color: atrasado ? 'var(--ws-coral)' : 'var(--ws-blue)',
              border: `1px solid ${atrasado ? 'rgba(255,92,141,0.2)' : 'rgba(62,91,255,0.2)'}`
            }}
          >
            {labelTempo}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lead.status_followup === 'pausado' ? (
            <button 
              onClick={handleReativar}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all hover:bg-white/5"
              style={{ color: 'var(--ws-green)', border: '1px solid rgba(15,168,86,0.3)' }}
            >
              <Play size={14} /> Reativar
            </button>
          ) : (
            <button 
              onClick={handlePausar}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all hover:bg-white/5"
              style={{ color: 'var(--ws-coral)', border: '1px solid rgba(255,92,141,0.3)' }}
            >
              <Pause size={14} /> Pausar Follow-up
            </button>
          )}
          
          <button 
            onClick={handleForcarEnvio}
            disabled={lead.status_followup === 'pausado'}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-semibold shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
            style={{ 
              background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
              color: '#fff'
            }}
          >
            <Send size={14} /> Forçar Agora
          </button>
        </div>
      </div>
    )
  }

  // Gera Timeline de tentativas
  const renderTimeline = () => {
    const total = lead.tentativa_atual
    const attempts = Array.from({ length: total }).map((_, i) => ({
      numero: i + 1,
      data: subDays(new Date(), total - i - 1), // Mock de data
      tipo: 'WhatsApp',
      respondeu: i === total - 1 && lead.status_followup === 'respondeu'
    })).reverse()

    return (
      <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
        {attempts.map((att, idx) => (
          <div key={idx} className="relative">
            <div 
              className="absolute left-[-19px] top-1 w-3 h-3 rounded-full border-2 border-[var(--ws-navy)]"
              style={{ background: att.respondeu ? 'var(--ws-purple)' : 'var(--ws-green)' }}
            />
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white/90">Tentativa {att.numero} — {att.tipo}</span>
              <span className="text-[10px] opacity-40 font-medium">
                {format(att.data, "dd/MM HH:mm")}
              </span>
            </div>
            {att.respondeu && (
              <div 
                className="mt-1 px-2 py-0.5 rounded text-[10px] font-bold inline-block"
                style={{ background: 'var(--ws-purple-soft)', color: 'var(--ws-purple)' }}
              >
                ✓ RESPONDEU
              </div>
            )}
          </div>
        ))}
        {lead.status_followup === 'ativo' && (
          <div className="relative opacity-30">
             <div className="absolute left-[-19px] top-1 w-3 h-3 rounded-full border-2 border-[var(--ws-navy)] bg-white/20" />
             <span className="text-xs font-medium">Próxima: Tentativa {lead.tentativa_atual + 1}</span>
          </div>
        )}
      </div>
    )
  }

  const hasUTMs = lead.utm_source || lead.utm_medium || lead.utm_campaign || lead.utm_content

  return (
    <div 
      style={{ 
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: '100%',
        zIndex: 50,
        pointerEvents: aberto ? 'auto' : 'none',
        overflow: 'hidden',
        display: aberto ? 'block' : 'none'
      }}
    >
      {/* Overlay */}
      <div 
        onClick={onFechar}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          opacity: aberto ? 1 : 0,
          transition: 'opacity 0.28s ease',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Painel Deslizante ESQUERDA -> DIREITA */}
      <div 
        ref={scrollRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '520px',
          maxWidth: '100%',
          height: '100vh',
          background: 'var(--ws-glass-bg)',
          borderRight: '1px solid var(--ws-glass-border)',
          backdropFilter: 'blur(24px)',
          transform: aberto ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--ws-glass-shadow)',
          fontFamily: 'var(--font-sans-base), sans-serif'
        }}
        className="text-white overflow-hidden"
      >
        {/* Linha de brilho no topo */}
        <div style={{ position:'absolute',top:0,left:0,right:0,height:1, 
          background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)', 
          pointerEvents:'none', zIndex: 10 }} />

        {/* 1. Header (Fixo) */}
        <div className="p-6 border-b shrink-0" style={{ borderColor: 'var(--ws-glass-border)' }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 pr-8">
              <h2 className="text-xl font-bold tracking-tight mb-2 truncate">
                {lead.nome || lead.telefone}
              </h2>
              
              <div className="flex flex-wrap gap-2">
                {/* Status Followup Pill */}
                <div 
                  className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                  style={{ 
                    background: `${STATUS_COLORS[lead.status_followup]}20`,
                    color: STATUS_COLORS[lead.status_followup],
                    border: `0.5px solid ${STATUS_COLORS[lead.status_followup]}40`
                  }}
                >
                   {lead.status_followup}
                </div>

                {/* Temperatura Pill */}
                {lead.temperatura && (
                  <div 
                    className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-white shadow-sm"
                    style={{ background: TEMP_GRADIENTS[lead.temperatura] }}
                  >
                    {lead.temperatura}
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={onFechar}
              className="p-2 hover:bg-white/10 rounded-full transition-colors shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium opacity-60">
            <div className="flex items-center gap-1.5">
              <MessageSquare size={13} />
              {lead.telefone}
            </div>
            {lead.origem && (
              <div className="flex items-center gap-1.5">
                {React.createElement(ORIGEM_ICONS[lead.origem] || Info, { size: 13 })}
                <span className="capitalize">{lead.origem.replace('_', ' ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2 scrollbar-hide pb-24">
          
          {/* Seção: Próximo Disparo */}
          {renderProximoEnvio()}

          {/* Seção: Resumo da Conversa */}
          {lead.ultimo_resumo && (
            <div className="mt-8">
               <SectionTitle>Último Resumo</SectionTitle>
               <div 
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--ws-glass-border)',
                  borderRadius: 'var(--ws-radius-lg)',
                  padding: '16px',
                }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <RotateCw size={12} />
                  </div>
                  <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest mt-1">Via Agente IA</span>
                </div>
                
                <p className="text-[13px] leading-relaxed text-white/80 italic mb-4">
                  "{lead.ultimo_resumo}"
                </p>

                {lead.session_id && (
                   <a 
                    href={`/crm/atendimento?session=${lead.session_id}`}
                    className="inline-flex items-center gap-2 text-xs font-semibold"
                    style={{ color: 'var(--ws-blue)' }}
                   >
                     Ver Conversa <ChevronDown size={14} className="-rotate-90" />
                   </a>
                )}
              </div>
            </div>
          )}

          {/* Seção: Timeline */}
          <SectionTitle>Histórico de Tentativas</SectionTitle>
          {renderTimeline()}

          {/* Seção: Interesse e Dados */}
          <SectionTitle>Interesse e Serviço</SectionTitle>
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold opacity-40 mb-2 block uppercase tracking-wider">Serviço</label>
              <select 
                value={interesse}
                onChange={(e) => setInteresse(e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--ws-glass-border)',
                  borderRadius: 'var(--ws-radius-md)',
                  color: '#fff',
                  fontSize: '14px',
                  outline: 'none',
                }}
              >
                <option value="Avaliação">Avaliação</option>
                <option value="Implante">Implante</option>
                <option value="Limpeza">Limpeza</option>
                <option value="Ortodontia">Ortodontia</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold opacity-40 mb-2 block uppercase tracking-wider">Anotações Internas</label>
               <textarea 
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: Lead pediu para retornar no próximo mês..."
                rows={3}
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--ws-glass-border)', 
                  borderRadius: 'var(--ws-radius-md)',
                  color: '#fff',
                  fontSize: '14px',
                  outline: 'none',
                  resize: 'none'
                }}
              />
            </div>
          </div>

          {/* Seção: Fechamento */}
          <SectionTitle>Fechamento</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {(['ganho', 'perca', 'reagendado', 'perdido'] as LeadStatusFechamento[]).map((status) => {
              const config = FECHAMENTO_COLORS[status]
              const ativo = localFechamento === status
              
              const icons: Record<string, any> = {
                ganho: CheckCircle2,
                perca: XCircle,
                reagendado: Calendar,
                perdido: Info
              }
              const Icon = icons[status]
              const labels: Record<string, string> = {
                ganho: 'Ganho',
                perca: 'Perda',
                reagendado: 'Reagendar',
                perdido: 'Perdido'
              }

              return (
                <button
                  key={status}
                  onClick={() => {
                    setLocalFechamento(status)
                    onStatusChange(lead.id, status)
                  }}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl transition-all border-2 ${ativo ? 'scale-[1.02]' : 'hover:scale-[1.02] opacity-60 hover:opacity-100'}`}
                  style={{
                    background: ativo ? config.bg : 'rgba(255,255,255,0.03)',
                    borderColor: ativo ? config.border : 'transparent',
                    boxShadow: ativo ? `0 8px 24px ${config.bg}40` : 'none',
                    color: ativo ? (status === 'reagendado' ? 'var(--gold)' : config.color) : 'rgba(255,255,255,0.4)'
                  }}
                >
                   <Icon size={24} style={{ color: ativo ? (status === 'reagendado' ? 'var(--gold)' : config.color) : 'inherit' }} />
                   <span className="text-xs font-bold mt-2">
                     {labels[status]}
                   </span>
                </button>
              )
            })}
          </div>

          {/* Seção: Dados de Origem (UTM) */}
          {hasUTMs && (
            <div className="mt-8">
              <button 
                onClick={() => setUtmExpandido(!utmExpandido)}
                className="flex items-center justify-between w-full py-2 group"
              >
                <SectionTitle trailing={utmExpandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}>
                  Origem e UTMs
                </SectionTitle>
              </button>

              {utmExpandido && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { label: 'Source', value: lead.utm_source },
                    { label: 'Medium', value: lead.utm_medium },
                    { label: 'Campaign', value: lead.utm_campaign },
                    { label: 'Content', value: lead.utm_content }
                  ].map((utm, i) => utm.value ? (
                    <div 
                      key={i}
                      className="p-3 rounded-lg bg-white/5 border border-white/5"
                    >
                      <p className="text-[9px] uppercase font-bold opacity-30 mb-0.5">{utm.label}</p>
                      <p className="text-xs font-semibold truncate">{utm.value}</p>
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Footer (Fixo) */}
        <div 
          className="p-6 border-t shrink-0 flex items-center justify-between bg-black/20 backdrop-blur-md" 
          style={{ borderColor: 'var(--ws-glass-border)' }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] opacity-30 font-medium">Criado em {format(parseISO(lead.created_at), 'dd/MM/yy')}</span>
            <span className="text-[10px] opacity-30 font-medium">Atualizado em {format(parseISO(lead.updated_at), 'dd/MM/yy HH:mm')}</span>
          </div>

          <button 
            onClick={handleSalvar}
            className="px-8 py-3 rounded-md text-sm font-bold shadow-lg transition-all active:scale-95 hover:brightness-110"
            style={{ 
              background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
              color: '#fff',
              boxShadow: '0 4px 16px rgba(62,91,255,0.35)'
            }}
          >
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  )
}

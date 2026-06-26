'use client'

import React, { useMemo } from 'react'
import { format, parseISO, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  MoreHorizontal,
  Bot,
  User,
  Code2,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Play,
  CalendarCheck,
  MessageSquare,
  Archive,
} from 'lucide-react'
import { toast } from 'sonner'
import { Agendamento, Agenda, AgendamentoStatus, STATUS_LABELS } from '@/types/agenda'

interface ListaAgendamentosProps {
  agendamentos: Agendamento[]
  agendas: Agenda[]
  onAgendamentoClick: (a: Agendamento) => void
  onStatusChange: (id: string, status: AgendamentoStatus) => void
}

export function ListaAgendamentos({
  agendamentos,
  agendas,
  onAgendamentoClick,
  onStatusChange,
}: ListaAgendamentosProps) {
  
  // 1. Agrupar por data
  const grupos = useMemo(() => {
    const map = new Map<string, Agendamento[]>()
    
    // Ordenar por data/hora antes de agrupar
    const sorted = [...agendamentos].sort((a, b) => 
      new Date(a.data_hora_inicio).getTime() - new Date(b.data_hora_inicio).getTime()
    )

    sorted.forEach(ag => {
      const diaKey = format(parseISO(ag.data_hora_inicio), 'yyyy-MM-dd')
      const g = map.get(diaKey) || []
      g.push(ag)
      map.set(diaKey, g)
    })

    return Array.from(map.entries()).map(([data, items]) => ({
      data: parseISO(data),
      items
    }))
  }, [agendamentos])

  const handleStatusUpdate = (id: string, next: AgendamentoStatus) => {
    onStatusChange(id, next)
    toast.success(`Status atualizado para ${STATUS_LABELS[next]} ✓`)
  }

  return (
    <>
      <style>{`
        @keyframes pulse-purple {
          0% { box-shadow: 0 0 0 0 rgba(122, 90, 248, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(122, 90, 248, 0); }
          100% { box-shadow: 0 0 0 0 rgba(122, 90, 248, 0); }
        }
      `}</style>
      <div className="flex flex-col h-full bg-card overflow-y-auto overflow-x-hidden p-4 gap-6 scrollbar-hide">

      {grupos.map((grupo, gIdx) => (
        <div key={gIdx} className="flex flex-col gap-3">
          {/* HEADER DE DATA */}
          <div className="flex items-center gap-4 px-2">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">
              {format(grupo.data, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </h3>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* GRID TIPO TABELA */}
          <div
            className="flex flex-col bg-card border border-border rounded-xl overflow-hidden"
          >
            {/* Headers da Tabela - Ocultos em telas pequenas se necessário */}
            <div className="grid grid-cols-[1.5fr,1fr,1fr,1.2fr,0.8fr,1fr,auto] gap-4 px-5 py-3 bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
              <div>Cliente</div>
              <div>Agenda</div>
              <div>Serviço</div>
              <div>Data/Hora</div>
              <div>Origem</div>
              <div>Status</div>
              <div className="w-8 text-center">Ações</div>
            </div>

            {grupo.items.map((ag, i) => {
              const agenda = agendas.find(a => a.id === ag.agenda_id)
              const dataInicio = parseISO(ag.data_hora_inicio)
              
              return (
                <div 
                  key={ag.id}
                  className={`grid grid-cols-[1.5fr,1fr,1fr,1.2fr,0.8fr,1fr,auto] gap-4 px-5 py-4 items-center transition-all hover:bg-muted/40 border-border ${
                    i !== grupo.items.length - 1 ? 'border-b' : ''
                  }`}
                >
                  {/* CLIENTE */}
                  <div
                    className="flex flex-col min-w-0 cursor-pointer group"
                    onClick={() => onAgendamentoClick(ag)}
                  >
                    <span className="text-[13px] font-bold text-foreground group-hover:text-primary transition-colors truncate">
                      {ag.cliente_nome}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium tabular-nums">
                      {ag.cliente_telefone}
                    </span>
                  </div>

                  {/* AGENDA */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: agenda?.cor || '#006EFF' }}
                    />
                    <span className="text-xs text-muted-foreground truncate">{agenda?.nome || '—'}</span>
                  </div>

                  {/* SERVIÇO */}
                  <div className="text-xs text-muted-foreground truncate font-medium">
                    {ag.servico || 'Não informado'}
                  </div>

                  {/* DATA/HORA */}
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs text-foreground font-bold tracking-tight">
                      {format(dataInicio, "d 'de' MMM", { locale: ptBR })}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {format(dataInicio, "HH:mm")}
                    </span>
                  </div>

                  {/* ORIGEM */}
                  <div>
                    {renderOrigemBadge(ag.origem)}
                  </div>

                  {/* STATUS */}
                  <div>
                    {renderStatusBadge(ag.status)}
                  </div>

                  {/* AÇÕES (Dropdown Contextual) */}
                  <div className="flex justify-end relative group/actions">
                    <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-all">
                      <MoreHorizontal size={18} />
                    </button>

                    {/* MENU FLUTUANTE SIMULADO (Aparece no hover do container ações para agilidade) */}
                    <div className="absolute right-0 top-10 w-48 bg-popover text-popover-foreground border border-border rounded-xl shadow-lg z-50 p-1 hidden group-hover/actions:flex flex-col">
                      {renderAcoesContextuais(ag)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
    </>
  )

  function renderStatusBadge(status: AgendamentoStatus) {
    const common = "px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5 w-fit uppercase tracking-tighter"
    
    switch (status) {
      case 'agendado':
        return <div className={`${common} bg-primary/10 text-primary border border-primary/20`}><Clock size={12}/> Agendado</div>
      case 'confirmado':
        return <div className={`${common} bg-[#0fa856]/10 text-[#0fa856] border border-[#0fa856]/20`}><CheckCircle2 size={12}/> Confirmado</div>
      case 'em_atendimento':
        return (
          <div 
            className={`${common} bg-[#7A5AF8]/20 text-[#7A5AF8] border border-[#7A5AF8]/30 animate-pulse`}
            style={{ animation: 'pulse-purple 2s infinite' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#7A5AF8]" /> Atendimento
          </div>
        )
      case 'compareceu':
        return <div className={`${common} bg-[#3b6d11] text-white shadow-lg shadow-[#3b6d11]/20`}><Check size={12} strokeWidth={4}/> Concluiu</div>
      case 'falta':
        return <div className={`${common} bg-[#a32d2d]/10 text-[#a32d2d] border border-[#a32d2d]/20`}><XCircle size={12}/> Falta</div>
      case 'cancelado':
        return <div className={`${common} bg-muted text-muted-foreground border border-border`}><XCircle size={12}/> Cancelado</div>
      case 'reagendado':
        return <div className={`${common} bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20`}><RotateCcw size={12}/> Reagendado</div>
      default:
        return <div className={common}>{status}</div>
    }
  }

  function renderOrigemBadge(origem: Agendamento['origem']) {
    const common = "flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border"
    
    if (origem === 'agente') {
      return <div className={`${common} bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20`}><Bot size={10}/> Agente</div>
    }
    if (origem === 'api') {
      return <div className={`${common} bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20`}><Code2 size={10}/> API</div>
    }
    return <div className={`${common} bg-primary/10 text-primary border-primary/20`}><User size={10}/> Manual</div>
  }

  function renderAcoesContextuais(ag: Agendamento) {
    const itemCls = "flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors text-left w-full"
    
    return (
      <>
        {ag.status === 'agendado' && (
          <>
            <button onClick={() => handleStatusUpdate(ag.id, 'confirmado')} className={itemCls}><CalendarCheck size={14} className="text-[#0fa856]"/> Confirmar</button>
            <button onClick={() => handleStatusUpdate(ag.id, 'falta')} className={itemCls}><XCircle size={14} className="text-[#a32d2d]"/> Marcar Falta</button>
            <button onClick={() => handleStatusUpdate(ag.id, 'cancelado')} className={itemCls}><XCircle size={14}/> Cancelar</button>
          </>
        )}
        {ag.status === 'confirmado' && (
          <>
            <button onClick={() => handleStatusUpdate(ag.id, 'em_atendimento')} className={itemCls}><Play size={14} className="text-[#7A5AF8]"/> Iniciar Atendimento</button>
            <button onClick={() => handleStatusUpdate(ag.id, 'cancelado')} className={itemCls}><XCircle size={14}/> Cancelar</button>
          </>
        )}
        {ag.status === 'em_atendimento' && (
          <>
            <button onClick={() => handleStatusUpdate(ag.id, 'compareceu')} className={itemCls}><CheckCircle2 size={14} className="text-[#0fa856]"/> Finalizar (Compareceu)</button>
            <button onClick={() => handleStatusUpdate(ag.id, 'falta')} className={itemCls}><XCircle size={14} className="text-[#a32d2d]"/> Falta (Interrompido)</button>
          </>
        )}
        {ag.status === 'compareceu' && !ag.nps_enviado && (
          <button onClick={() => toast.info('NPS enviado com sucesso!')} className={itemCls}><MessageSquare size={14} className="text-amber-500"/> Enviar NPS Manual</button>
        )}
        {(ag.status === 'falta' || ag.status === 'cancelado') && (
          <>
            <button onClick={() => handleStatusUpdate(ag.id, 'agendado')} className={itemCls}><RotateCcw size={14} className="text-amber-500"/> Reagendar</button>
            <button onClick={() => toast('Agendamento arquivado')} className={itemCls}><Archive size={14}/> Arquivar</button>
          </>
        )}
        
        <div className="h-[1px] bg-border my-1" />
        <button onClick={() => onAgendamentoClick(ag)} className={itemCls}><Play size={14} className="rotate-90"/> Ver Detalhes / Editar</button>
      </>
    )
  }
}

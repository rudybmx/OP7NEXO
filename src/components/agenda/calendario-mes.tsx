'use client'

import React, { useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Bot, Code2 } from 'lucide-react'
import { Agendamento, Agenda } from '@/types/agenda'

interface CalendarioMesProps {
  agendamentos: Agendamento[]
  agendas: Agenda[]
  agendasVisiveis: string[]
  mesAtual: Date
  onMesChange: (data: Date) => void
  onDiaClick: (data: Date) => void
  onAgendamentoClick: (a: Agendamento) => void
}

export function CalendarioMes({
  agendamentos,
  agendas,
  agendasVisiveis,
  mesAtual,
  onMesChange,
  onDiaClick,
  onAgendamentoClick,
}: CalendarioMesProps) {
  const daysInGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(mesAtual), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(mesAtual), { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end })
  }, [mesAtual])

  const periodoLabel = format(mesAtual, 'MMMM yyyy', { locale: ptBR })
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card select-none">
      {/* TOOLBAR NAVEGAÇÃO */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
            <button
              onClick={() => onMesChange(subMonths(mesAtual, 1))}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => onMesChange(addMonths(mesAtual, 1))}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <span className="text-sm font-semibold capitalize tracking-wide text-foreground">
            {periodoLabel}
          </span>
        </div>
        <button
          onClick={() => onMesChange(new Date())}
          className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
        >
          Hoje
        </button>
      </div>

      {/* HEADER DIAS DA SEMANA */}
      <div className="grid grid-cols-7 border-b border-border">
        {weekDays.map((day) => (
          <div key={day} className="py-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* GRID DE DIAS */}
      <div className="grid flex-1 grid-cols-7 overflow-auto">
        {daysInGrid.map((day, idx) => {
          const isCurrentMonth = isSameMonth(day, mesAtual)
          const isHoje = isToday(day)

          const agsDoDia = agendamentos.filter(
            (ag) =>
              isSameDay(parseISO(ag.data_hora_inicio), day) &&
              agendasVisiveis.includes(ag.agenda_id)
          )

          const moreCount = agsDoDia.length > 3 ? agsDoDia.length - 3 : 0
          const displayAgs = agsDoDia.slice(0, 3)

          return (
            <div
              key={idx}
              className={`flex min-h-[120px] flex-col border-b border-r border-border p-1 transition-colors hover:bg-primary/5 ${
                !isCurrentMonth ? 'opacity-40' : ''
              }`}
            >
              {/* NÚMERO DO DIA */}
              <div className="flex justify-end p-1">
                <button
                  onClick={() => onDiaClick(day)}
                  className={`flex size-7 items-center justify-center rounded-full text-xs font-bold transition-all hover:scale-110 ${
                    isHoje
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              </div>

              {/* LISTA DE EVENTOS (PILLS) */}
              <div className="mt-1 flex flex-col gap-1 px-1">
                {displayAgs.map((ag) => {
                  const agenda = agendas.find((a) => a.id === ag.agenda_id)
                  const color = agenda?.cor || '#006EFF'
                  const isCancelado = ag.status === 'cancelado'

                  return (
                    <button
                      key={ag.id}
                      onClick={() => onAgendamentoClick(ag)}
                      style={{
                        background: `${color}22`,
                        borderLeft: `2px solid ${color}`,
                      }}
                      className={`pointer-events-auto flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-left transition-all hover:translate-x-0.5 hover:brightness-105 ${
                        isCancelado ? 'opacity-50 grayscale' : ''
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        {ag.origem === 'agente' && <Bot size={10} className="shrink-0 text-amber-500" />}
                        {ag.origem === 'api' && <Code2 size={10} className="shrink-0 text-cyan-500" />}
                        <span className="truncate text-[10px] font-bold text-foreground">
                          {ag.cliente_nome}
                        </span>
                      </div>
                      <span className="shrink-0 text-[9px] font-bold text-muted-foreground">
                        {format(parseISO(ag.data_hora_inicio), 'H:mm')}
                      </span>
                    </button>
                  )
                })}

                {moreCount > 0 && (
                  <button
                    onClick={() => onDiaClick(day)}
                    className="mt-0.5 rounded px-2 py-0.5 text-left text-[10px] font-bold text-primary transition-colors hover:bg-primary/10"
                  >
                    + {moreCount} mais...
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

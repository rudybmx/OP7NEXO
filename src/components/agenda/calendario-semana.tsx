'use client'

import React, { useEffect, useRef, useMemo } from 'react'
import {
  format,
  startOfWeek,
  addDays,
  startOfDay,
  differenceInMinutes,
  isSameDay,
  parseISO,
  isToday,
  addWeeks,
  subWeeks,
  isValid,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  Bot,
  Code2,
  Check,
  Plus,
} from 'lucide-react'
import {
  Agendamento,
  Agenda,
  AgendamentoStatus,
  HorarioAgenda,
  Bloqueio,
  DiaSemana,
} from '@/types/agenda'

interface CalendarioSemanaProps {
  agendamentos: Agendamento[]
  agendas: Agenda[]
  agendasVisiveis: string[]
  semanaAtual: Date
  onSemanaChange: (data: Date) => void
  onAgendamentoClick: (agendamento: Agendamento) => void
  onSlotClick: (data: string, hora: string, agendaId?: string) => void
  horarios?: HorarioAgenda[]
  bloqueios?: Bloqueio[]
}

const ROW_HEIGHT_30MIN = 48
const HOUR_HEIGHT = 96
const HOUR_WIDTH = 60

// Faixa-horário padrão quando não há horários cadastrados.
const HORA_INICIO_DEFAULT = 8
const HORA_FIM_DEFAULT = 19

const DIAS_JS: DiaSemana[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

const hhmmParaMinutos = (s?: string) => {
  if (!s) return null
  const [h, m] = s.split(':').map(Number)
  if (Number.isNaN(h)) return null
  return h * 60 + (m || 0)
}

export function CalendarioSemana({
  agendamentos,
  agendas,
  agendasVisiveis,
  semanaAtual,
  onSemanaChange,
  onAgendamentoClick,
  onSlotClick,
  horarios = [],
  bloqueios = [],
}: CalendarioSemanaProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const diasDaSemana = useMemo(() => {
    const inicio = startOfWeek(semanaAtual, { weekStartsOn: 0 })
    return Array.from({ length: 7 }, (_, i) => addDays(inicio, i))
  }, [semanaAtual])

  const periodoLabel = useMemo(() => {
    const inicio = diasDaSemana[0]
    const fim = diasDaSemana[6]
    return `${format(inicio, "d 'de' MMM", { locale: ptBR })} — ${format(fim, "d 'de' MMM yyyy", { locale: ptBR })}`
  }, [diasDaSemana])

  // ── Faixa-horário dinâmica: derivada dos horários das agendas visíveis,
  // SEMPRE ampliada para conter qualquer agendamento da semana (nada fica oculto
  // fora da faixa — agente/equipe podem marcar 07h ou 21h). Default 08–19. ──
  const [horaInicioGrid, horaFimGrid] = useMemo(() => {
    let min = Infinity
    let max = -Infinity

    horarios
      .filter((h) => h.ativo && agendasVisiveis.includes(h.agenda_id))
      .forEach((h) => {
        const ini = hhmmParaMinutos(h.hora_inicio)
        const fim = hhmmParaMinutos(h.hora_fim)
        if (ini != null) min = Math.min(min, ini)
        if (fim != null) max = Math.max(max, fim)
      })

    // Engloba os agendamentos da semana visível (evita clipping de horário fora da faixa).
    const inicioSemana = startOfDay(diasDaSemana[0])
    const fimSemana = startOfDay(addDays(diasDaSemana[6], 1))
    agendamentos.forEach((ag) => {
      if (!agendasVisiveis.includes(ag.agenda_id)) return
      const d = parseISO(ag.data_hora_inicio)
      if (!isValid(d) || d < inicioSemana || d >= fimSemana) return
      const f = parseISO(ag.data_hora_fim)
      min = Math.min(min, d.getHours() * 60 + d.getMinutes())
      if (isValid(f) && isSameDay(d, f)) {
        max = Math.max(max, f.getHours() * 60 + f.getMinutes())
      } else {
        max = Math.max(max, d.getHours() * 60 + d.getMinutes() + 60)
      }
    })

    if (!isFinite(min) || !isFinite(max)) return [HORA_INICIO_DEFAULT, HORA_FIM_DEFAULT]
    const inicioH = Math.min(HORA_INICIO_DEFAULT, Math.max(0, Math.floor(min / 60)))
    const fimH = Math.max(HORA_FIM_DEFAULT, Math.min(24, Math.ceil(max / 60)))
    if (fimH <= inicioH) return [HORA_INICIO_DEFAULT, HORA_FIM_DEFAULT]
    return [inicioH, fimH]
  }, [horarios, agendasVisiveis, agendamentos, diasDaSemana])

  const numHoras = horaFimGrid - horaInicioGrid
  const gridHeight = numHoras * HOUR_HEIGHT
  const minutoBase = horaInicioGrid * 60

  const horasArr = useMemo(() => {
    return Array.from({ length: numHoras }, (_, i) => {
      const h = (horaInicioGrid + i).toString().padStart(2, '0')
      return [`${h}:00`, `${h}:30`]
    }).flat()
  }, [numHoras, horaInicioGrid])

  const agendamentosNoPeriodo = useMemo(() => {
    const inicioSemana = startOfDay(diasDaSemana[0])
    const fimSemana = startOfDay(addDays(diasDaSemana[6], 1))

    return agendamentos.filter((ag) => {
      const dataAg = parseISO(ag.data_hora_inicio)
      return (
        agendasVisiveis.includes(ag.agenda_id) &&
        dataAg >= inicioSemana &&
        dataAg < fimSemana
      )
    })
  }, [agendamentos, agendasVisiveis, diasDaSemana])

  // Helper para posicionamento (relativo à hora-base do grid)
  const getTop = (isoString: string) => {
    const date = parseISO(isoString)
    if (!isValid(date)) return 0
    const minutes = date.getHours() * 60 + date.getMinutes() - minutoBase
    return (minutes * HOUR_HEIGHT) / 60
  }

  const getHeightValue = (start: string, end: string) => {
    const dStart = parseISO(start)
    const dEnd = parseISO(end)
    if (!isValid(dStart) || !isValid(dEnd)) return 40
    const dur = differenceInMinutes(dEnd, dStart)
    return Math.max(40, (dur * HOUR_HEIGHT) / 60)
  }

  // ── Faixas de almoço por dia da semana (visual: azul-clara da brand) ──
  // Dedupe por (dia, inicio-fim) para não empilhar bandas idênticas de várias agendas.
  const faixasAlmoco = useMemo(() => {
    const out: { diaIdx: number; top: number; height: number; key: string }[] = []
    const vistos = new Set<string>()
    diasDaSemana.forEach((dia, diaIdx) => {
      const diaSem = DIAS_JS[dia.getDay()]
      horarios.forEach((h) => {
        if (
          !h.ativo ||
          !h.tem_almoco ||
          h.dia_semana !== diaSem ||
          !agendasVisiveis.includes(h.agenda_id)
        )
          return
        const ini = hhmmParaMinutos(h.almoco_inicio)
        const fim = hhmmParaMinutos(h.almoco_fim)
        if (ini == null || fim == null || fim <= ini) return
        const key = `${diaIdx}-${ini}-${fim}`
        if (vistos.has(key)) return
        vistos.add(key)
        out.push({
          diaIdx,
          top: ((ini - minutoBase) * HOUR_HEIGHT) / 60,
          height: ((fim - ini) * HOUR_HEIGHT) / 60,
          key,
        })
      })
    })
    return out
  }, [horarios, agendasVisiveis, diasDaSemana, minutoBase])

  // ── Faixas de bloqueio (visual: amarela-clara) ──
  const faixasBloqueio = useMemo(() => {
    const out: { diaIdx: number; top: number; height: number; motivo: string; key: string }[] = []
    bloqueios.forEach((b) => {
      // global (agenda_id null) ou de uma agenda visível
      if (b.agenda_id && !agendasVisiveis.includes(b.agenda_id)) return
      const ini = parseISO(b.inicio)
      const fim = parseISO(b.fim)
      if (!isValid(ini) || !isValid(fim)) return
      diasDaSemana.forEach((dia, diaIdx) => {
        if (!isSameDay(ini, dia)) return
        const iniMin = ini.getHours() * 60 + ini.getMinutes() - minutoBase
        const durMin = Math.max(20, differenceInMinutes(fim, ini))
        out.push({
          diaIdx,
          top: (iniMin * HOUR_HEIGHT) / 60,
          height: (durMin * HOUR_HEIGHT) / 60,
          motivo: b.motivo,
          key: b.id,
        })
      })
    })
    return out
  }, [bloqueios, agendasVisiveis, diasDaSemana, minutoBase])

  // Lógica de colisão
  const calculateEventPositions = (dayAgendamentos: Agendamento[]) => {
    const sorted = [...dayAgendamentos].sort((a, b) =>
      new Date(a.data_hora_inicio).getTime() - new Date(b.data_hora_inicio).getTime()
    )

    const groups: Agendamento[][] = []
    sorted.forEach(evt => {
      const group = groups.find(g =>
        g.some(e =>
          (evt.data_hora_inicio < e.data_hora_fim && evt.data_hora_fim > e.data_hora_inicio)
        )
      )
      if (group) group.push(evt)
      else groups.push([evt])
    })

    const positionedEvents: (Agendamento & { style: React.CSSProperties })[] = []

    groups.forEach(group => {
      const columns: Agendamento[][] = []
      group.forEach(evt => {
        let placed = false
        for (const col of columns) {
          if (col.every(e => evt.data_hora_inicio >= e.data_hora_fim || evt.data_hora_fim <= e.data_hora_inicio)) {
            col.push(evt)
            placed = true
            break
          }
        }
        if (!placed) columns.push([evt])
      })

      const colCount = columns.length
      columns.forEach((col, colIdx) => {
        col.forEach(evt => {
          positionedEvents.push({
            ...evt,
            style: {
              width: `${100 / colCount}%`,
              left: `${(100 / colCount) * colIdx}%`,
            }
          })
        })
      })
    })

    return positionedEvents
  }

  const currentTimePos = useMemo(() => {
    const agora = new Date()
    const minutosDesdeInicio = (agora.getHours() - horaInicioGrid) * 60 + agora.getMinutes()
    return (minutosDesdeInicio / 60) * HOUR_HEIGHT
  }, [horaInicioGrid])

  useEffect(() => {
    if (scrollContainerRef.current) {
      const scrollTarget = currentTimePos - 200 // mostra 2h acima da hora atual
      scrollContainerRef.current.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
    }
  }, [currentTimePos])

  function renderStatusBadge(status: AgendamentoStatus) {
    switch (status) {
      case 'confirmado':
        return <div className="rounded-full bg-green-500/30 p-0.5"><Check size={8} className="text-white" strokeWidth={4} /></div>
      case 'compareceu':
        return <div className="rounded-full bg-green-600 p-0.5 shadow"><Check size={8} className="text-white" strokeWidth={4} /></div>
      case 'falta':
        return <div className="rounded-full bg-red-500/40 px-1 py-0.5 text-[7px] font-black uppercase text-white">FALTA</div>
      case 'agendado':
        return <div className="size-2 rounded-full border border-white/60 bg-white/20" />
      default:
        return null
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card select-none" style={{ minHeight: 600 }}>
      {/* HEADER */}
      <div className="relative z-30 flex flex-shrink-0 flex-col border-b border-border bg-card">
        {/* Nav Toolbar */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              <button
                onClick={() => onSemanaChange(subWeeks(semanaAtual, 1))}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => onSemanaChange(addWeeks(semanaAtual, 1))}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <span className="text-sm font-semibold tracking-wide text-foreground">{periodoLabel}</span>
          </div>
          <button
            onClick={() => onSemanaChange(new Date())}
            className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
          >
            Hoje
          </button>
        </div>

        {/* Labels Dias */}
        <div className="flex">
          <div style={{ width: HOUR_WIDTH }} className="flex-shrink-0 border-r border-border" />
          <div className="flex flex-1">
            {diasDaSemana.map((dia, i) => {
              const hoje = isToday(dia)
              return (
                <div key={i} className="flex flex-1 flex-col items-center border-l border-border py-3">
                  <span className="ds-label mb-2 text-muted-foreground">
                    {format(dia, 'eee', { locale: ptBR })}
                  </span>
                  <div
                    className={`flex size-9 items-center justify-center rounded-full text-lg font-medium transition-colors ${
                      hoje ? 'bg-primary text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {format(dia, 'd')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* GRID CONTENT */}
      <div
        ref={scrollContainerRef}
        className="relative flex-1 overflow-y-auto scrollbar-hide"
      >
        <div className="relative flex" style={{ height: gridHeight }}>

          {/* Coluna Horas */}
          <div
            style={{ width: HOUR_WIDTH }}
            className="sticky left-0 z-20 flex-shrink-0 border-r border-border bg-card"
          >
            {Array.from({ length: numHoras }, (_, i) => (
              <div
                key={i}
                style={{ height: HOUR_HEIGHT }}
                className="relative flex justify-center pt-2"
              >
                <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                  {(horaInicioGrid + i).toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Grid de Dias */}
          <div className="relative flex flex-1">
            {/* Grid Lines */}
            <div className="pointer-events-none absolute inset-0 z-0">
              {Array.from({ length: numHoras * 2 }, (_, i) => (
                <div
                  key={i}
                  style={{ height: ROW_HEIGHT_30MIN }}
                  className={`w-full border-b ${i % 2 === 1 ? 'border-dashed border-border/40' : 'border-border/70'}`}
                />
              ))}
            </div>

            {/* Colunas */}
            {diasDaSemana.map((dia, diaIdx) => {
              const dateKey = format(dia, 'yyyy-MM-dd')
              const agsRaw = agendamentosNoPeriodo.filter(a => isSameDay(parseISO(a.data_hora_inicio), dia))
              const ags = calculateEventPositions(agsRaw)
              const hoje = isToday(dia)
              const almocosDoDia = faixasAlmoco.filter((f) => f.diaIdx === diaIdx)
              const bloqueiosDoDia = faixasBloqueio.filter((f) => f.diaIdx === diaIdx)

              return (
                <div key={diaIdx} className="group relative flex-1 border-l border-border transition-colors hover:bg-primary/5">

                  {/* Faixa de almoço (azul-clara da brand) */}
                  {almocosDoDia.map((f) => (
                    <div
                      key={`almoco-${f.key}`}
                      className="pointer-events-none absolute inset-x-0 z-0 bg-primary/10"
                      style={{ top: f.top, height: f.height }}
                      title="Intervalo de almoço"
                    />
                  ))}

                  {/* Faixa de bloqueio (amarela-clara) */}
                  {bloqueiosDoDia.map((f) => (
                    <div
                      key={`bloqueio-${f.key}`}
                      className="pointer-events-none absolute inset-x-0 z-[1] bg-yellow-400/15"
                      style={{ top: f.top, height: f.height }}
                      title={f.motivo || 'Bloqueio'}
                    />
                  ))}

                  {/* Slots clicáveis */}
                  {horasArr.map((hora, hIdx) => (
                    <div
                      key={hIdx}
                      style={{ height: ROW_HEIGHT_30MIN }}
                      onClick={() => onSlotClick(dateKey, hora)}
                      className="group/slot relative w-full cursor-pointer"
                    >
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/5 opacity-0 transition-all group-hover/slot:opacity-100">
                        <Plus size={16} className="text-primary" />
                      </div>
                    </div>
                  ))}

                  {/* Agendamentos */}
                  <div className="pointer-events-none absolute inset-0">
                    {ags.map((ag) => {
                      const agenda = agendas.find(a => a.id === ag.agenda_id)
                      const top = getTop(ag.data_hora_inicio)
                      const height = getHeightValue(ag.data_hora_inicio, ag.data_hora_fim)
                      const bgColor = agenda?.cor || '#006EFF'
                      const isCancelado = ag.status === 'cancelado'

                      return (
                        <div
                          key={ag.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            onAgendamentoClick(ag)
                          }}
                          style={{
                            position: 'absolute',
                            top: top + 2,
                            height: height - 4,
                            background: `${bgColor}E6`,
                            borderLeft: `4px solid ${bgColor}`,
                            zIndex: 10,
                            ...ag.style,
                            pointerEvents: 'auto',
                          }}
                          className={`group/card overflow-hidden rounded-r-md px-2 py-1 shadow-sm transition-all hover:z-20 hover:brightness-110 active:scale-[0.97] ${isCancelado ? 'opacity-50 grayscale' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span
                              className={`truncate text-[11px] font-bold leading-tight text-white ${isCancelado ? 'line-through opacity-60' : ''}`}
                            >
                              {ag.cliente_nome}
                            </span>
                            <div className="flex shrink-0 gap-1">
                              {ag.origem === 'agente' && <Bot size={10} className="text-amber-200" />}
                              {ag.origem === 'api' && <Code2 size={10} className="text-cyan-200" />}
                            </div>
                          </div>

                          {height > 44 && (
                            <div className="mt-0.5 flex flex-col">
                              <span className="truncate text-[9px] font-medium uppercase tracking-tighter text-white/80">{ag.servico}</span>
                              <span className="text-[8px] font-bold tabular-nums text-white/60">
                                {format(parseISO(ag.data_hora_inicio), 'HH:mm')}
                              </span>
                            </div>
                          )}

                          <div className="absolute bottom-1 right-1">
                            {renderStatusBadge(ag.status)}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Linha do Tempo */}
                  {hoje && currentTimePos >= 0 && currentTimePos <= gridHeight && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
                      style={{ top: currentTimePos }}
                    >
                      <div className="-ml-1.25 size-2.5 rounded-full border border-white/40 bg-red-500 shadow" />
                      <div className="h-[2px] flex-1 bg-red-500" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

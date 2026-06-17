'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Search } from 'lucide-react'
import { differenceInCalendarDays, endOfMonth, format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import GanttMonthHeader from '@/components/demandas/pmp/GanttMonthHeader'
import GanttTaskRow from '@/components/demandas/pmp/GanttTaskRow'
import { getMonthsInRange, getTodayOffsetPercent, getWeeksInRange } from '@/lib/gantt-utils'
import type { PmpPlan, PmpTask, TaskStatus, TaskStatusDerived } from '@/types/pmp'

interface GanttChartProps {
  plan: PmpPlan
  expandedPhases: Set<string>
  zoom: 'mes' | 'semana'
  selectedYear: number
  selectedMonth: number
  statusFilter: TaskStatusDerived | 'todos'
  focusTarget?: { taskId?: string; phaseId?: string } | null
  onZoomChange: (zoom: 'mes' | 'semana') => void
  onStatusFilterChange: (status: TaskStatusDerived | 'todos') => void
  onTogglePhase: (phaseId: string) => void
  onTaskSelect: (task: PmpTask) => void
  reorderMode?: boolean
  onReorderPhase?: (phaseId: string, orderedTaskIds: string[]) => void
}

const TASK_COLUMN_WIDTH = 280

export default function GanttChart({
  plan,
  expandedPhases,
  zoom,
  selectedYear,
  selectedMonth,
  statusFilter,
  focusTarget,
  onZoomChange,
  onStatusFilterChange,
  onTogglePhase,
  onTaskSelect,
  reorderMode,
  onReorderPhase,
}: GanttChartProps) {
  const [search, setSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [dragState, setDragState] = useState<{ taskId: string; phaseId: string } | null>(null)
  const [overTaskId, setOverTaskId] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? 0)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Visible range: full year for month view, full month for week view
  const viewStart = zoom === 'mes'
    ? `${selectedYear}-01-01`
    : `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
  const viewEnd = zoom === 'mes'
    ? `${selectedYear}-12-31`
    : format(endOfMonth(new Date(selectedYear, selectedMonth - 1)), 'yyyy-MM-dd')

  const months = useMemo(() => getMonthsInRange(viewStart, viewEnd), [viewStart, viewEnd])
  const weeks = useMemo(() => getWeeksInRange(viewStart, viewEnd), [viewStart, viewEnd])
  const unitCount = zoom === 'mes' ? months.length : weeks.length

  const columnWidth = useMemo(() => {
    if (zoom === 'mes') return 120
    if (containerWidth > TASK_COLUMN_WIDTH && unitCount > 0) {
      return Math.floor((containerWidth - TASK_COLUMN_WIDTH) / unitCount)
    }
    return 80
  }, [zoom, containerWidth, unitCount])

  const timelineWidth = unitCount * columnWidth
  const totalGridWidth = TASK_COLUMN_WIDTH + timelineWidth

  const filteredPhases = useMemo(() => {
    const query = search.trim().toLowerCase()

    return plan.phases
      .map((phase) => ({
        ...phase,
        tasks: phase.tasks.filter((task) => {
          const matchesStatus = statusFilter === 'todos' || task.statusDerived === statusFilter
          const matchesQuery =
            query.length === 0 ||
            task.title.toLowerCase().includes(query) ||
            task.assignee.toLowerCase().includes(query) ||
            task.tags?.some((tag) => tag.toLowerCase().includes(query))

          return matchesStatus && matchesQuery
        }),
      }))
      .filter((phase) => phase.tasks.length > 0)
  }, [plan.phases, search, statusFilter])

  const todayPercent = useMemo(() => getTodayOffsetPercent(viewStart, viewEnd), [viewStart, viewEnd])
  const todayLineLeft = TASK_COLUMN_WIDTH + (todayPercent / 100) * timelineWidth

  // Drag-and-drop só é permitido sem filtro/busca ativos (para reordenar a lista completa)
  const filtersActive = statusFilter !== 'todos' || search.trim().length > 0
  const dragEnabled = !!reorderMode && !filtersActive

  function handleTaskDrop(targetPhaseId: string, targetTaskId: string) {
    const drag = dragState
    setOverTaskId(null)
    setDragState(null)
    if (!drag || drag.phaseId !== targetPhaseId || drag.taskId === targetTaskId) return
    // Usa a fase completa (não filtrada) para garantir a lista íntegra de ids
    const sourcePhase = plan.phases.find((p) => p.id === targetPhaseId)
    if (!sourcePhase) return
    const ids = sourcePhase.tasks.map((t) => t.id)
    const from = ids.indexOf(drag.taskId)
    const to = ids.indexOf(targetTaskId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, drag.taskId)
    onReorderPhase?.(targetPhaseId, ids)
  }

  useEffect(() => {
    if (!focusTarget) return

    const nodeId = focusTarget.taskId
      ? `task-row-${focusTarget.taskId}`
      : focusTarget.phaseId
        ? `phase-row-${focusTarget.phaseId}`
        : null

    if (!nodeId) return

    const element = document.getElementById(nodeId)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [focusTarget])

  function handleScrollToToday() {
    if (!scrollRef.current) return
    const baseDate = new Date().toISOString().slice(0, 10)
    const startOffset = differenceInCalendarDays(parseISO(baseDate), parseISO(viewStart))
    const totalDays = differenceInCalendarDays(parseISO(viewEnd), parseISO(viewStart)) + 1
    const left = TASK_COLUMN_WIDTH + (Math.max(Math.min(startOffset, totalDays), 0) / totalDays) * timelineWidth - timelineWidth * 0.35
    scrollRef.current.scrollTo({ left: Math.max(left, 0), behavior: 'smooth' })
  }

  return (
    <section
      ref={containerRef}
      className="relative"
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 14,
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
      }}
    >
      <div className="absolute top-3 right-3">
        <InfoTooltip
          title="Gantt do plano"
          description="Visualização consolidada do cronograma por fase e tarefa, com leitura de status, progresso e responsáveis."
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--ws-glass-border)' }}>
        <div className="inline-flex rounded-lg p-1" style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)' }}>
          <button
            type="button"
            onClick={() => onZoomChange('mes')}
            className={`rounded-md px-3 py-1.5 text-[12px] transition-colors ${
              zoom === 'mes' ? 'bg-card font-medium text-[#92722a] shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Mês
          </button>
          <button
            type="button"
            onClick={() => onZoomChange('semana')}
            className={`rounded-md px-3 py-1.5 text-[12px] transition-colors ${
              zoom === 'semana' ? 'bg-card font-medium text-[#92722a] shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Semana
          </button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleScrollToToday}
          className="h-9 text-foreground hover:bg-muted/30"
          style={{ border: '1px solid var(--ws-glass-border)' }}
        >
          <CalendarClock className="h-4 w-4" />
          Hoje
        </Button>

        <Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as TaskStatusDerived | 'todos')}>
          <SelectTrigger className="h-9 min-w-40 text-foreground" style={{ border: '1px solid var(--ws-glass-border)' }}>
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="todo">A Fazer</SelectItem>
            <SelectItem value="in_progress">Em Andamento</SelectItem>
            <SelectItem value="done">Concluído</SelectItem>
            <SelectItem value="blocked">Bloqueado</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
            <SelectItem value="em_risco">Em Risco</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative ml-auto min-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar tarefa, tag ou responsável"
            className="h-9 pl-9 text-foreground placeholder:text-muted-foreground/70"
            style={{ border: '1px solid var(--ws-glass-border)' }}
          />
        </div>
      </div>

      {reorderMode && filtersActive && (
        <div className="px-4 py-2 text-[12px] text-[#854f0b]" style={{ background: 'rgba(133,79,11,0.06)', borderBottom: '1px solid var(--ws-glass-border)' }}>
          Limpe a busca e o filtro de status para arrastar e reordenar as tarefas.
        </div>
      )}

      <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden">
        <div className="relative min-w-max" style={{ width: totalGridWidth }}>
          <GanttMonthHeader
            planStart={viewStart}
            planEnd={viewEnd}
            zoom={zoom}
            columnWidth={columnWidth}
            taskColumnWidth={TASK_COLUMN_WIDTH}
          />

          <div className="pointer-events-none absolute top-0 bottom-0 z-20" style={{ left: todayLineLeft }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full bg-[#a32d2d] px-2 py-0.5 text-[10px] font-medium text-white">
              Hoje
            </div>
            <div className="absolute top-6 bottom-0 left-1/2 w-0 border-l-2 border-dashed border-[#a32d2d]/60" />
          </div>

          <div>
            {filteredPhases.map((phase) => (
              <div key={phase.id}>
                <GanttTaskRow
                  phase={phase}
                  isPhase
                  expanded={expandedPhases.has(phase.id)}
                  onTogglePhase={onTogglePhase}
                  planStart={viewStart}
                  planEnd={viewEnd}
                  unitCount={unitCount}
                  columnWidth={columnWidth}
                  taskColumnWidth={TASK_COLUMN_WIDTH}
                />

                {expandedPhases.has(phase.id) &&
                  phase.tasks.map((task) => (
                    <GanttTaskRow
                      key={task.id}
                      phase={phase}
                      task={task}
                      isPhase={false}
                      onTaskClick={onTaskSelect}
                      planStart={viewStart}
                      planEnd={viewEnd}
                      unitCount={unitCount}
                      columnWidth={columnWidth}
                      taskColumnWidth={TASK_COLUMN_WIDTH}
                      reorderMode={dragEnabled}
                      isDragging={dragState?.taskId === task.id}
                      isDragOver={
                        overTaskId === task.id &&
                        dragState?.phaseId === phase.id &&
                        dragState?.taskId !== task.id
                      }
                      onTaskDragStart={(taskId, phaseId) => setDragState({ taskId, phaseId })}
                      onTaskDragOver={(taskId) => setOverTaskId(taskId)}
                      onTaskDrop={handleTaskDrop}
                      onTaskDragEnd={() => { setDragState(null); setOverTaskId(null) }}
                    />
                  ))}
              </div>
            ))}

            {filteredPhases.length === 0 && (
              <div className="px-6 py-12 text-center text-[13px] text-muted-foreground">
                Nenhuma tarefa encontrada para os filtros atuais.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

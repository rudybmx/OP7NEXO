'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { calcTaskPosition, formatDateBR, getStatusColor, getStatusLabel, hashColor } from '@/lib/gantt-utils'
import { cn } from '@/lib/utils'
import type { PmpPhase, PmpTask } from '@/types/pmp'

interface GanttTaskRowProps {
  phase: PmpPhase
  task?: PmpTask
  isPhase: boolean
  expanded?: boolean
  onTogglePhase?: (phaseId: string) => void
  onTaskClick?: (task: PmpTask) => void
  planStart: string
  planEnd: string
  unitCount: number
  columnWidth: number
  taskColumnWidth: number
}

function getPhaseRange(phase: PmpPhase, planStart: string, planEnd: string) {
  const ordered = [...phase.tasks].sort((left, right) => left.startDate.localeCompare(right.startDate))
  if (ordered.length === 0) {
    return { left: '0%', width: '0%' }
  }

  return calcTaskPosition(
    {
      ...ordered[0],
      startDate: ordered[0].startDate,
      endDate: ordered[ordered.length - 1].endDate,
    },
    planStart,
    planEnd
  )
}

function getTaskBarClasses(statusDerived: PmpTask['statusDerived']): string {
  const classes: Record<PmpTask['statusDerived'], string> = {
    done: 'opacity-90 saturate-75',
    in_progress: 'opacity-95',
    atrasado: 'opacity-95 ring-1 ring-inset ring-[#a32d2d]/30',
    todo: 'opacity-45',
    em_risco: 'opacity-80 ring-1 ring-inset ring-[#854f0b]/25',
    blocked: 'opacity-50 saturate-50',
  }
  return classes[statusDerived] ?? ''
}

export default function GanttTaskRow({
  phase,
  task,
  isPhase,
  expanded,
  onTogglePhase,
  onTaskClick,
  planStart,
  planEnd,
  unitCount,
  columnWidth,
  taskColumnWidth,
}: GanttTaskRowProps) {
  const gridTemplateColumns = `${taskColumnWidth}px repeat(${unitCount}, ${columnWidth}px)`
  const phasePosition = getPhaseRange(phase, planStart, planEnd)

  if (isPhase) {
    return (
      <div
        id={`phase-row-${phase.id}`}
        className="grid"
        style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', gridTemplateColumns }}
      >
        <button
          type="button"
          onClick={() => onTogglePhase?.(phase.id)}
          className="sticky left-0 z-10 flex items-center gap-2 px-4 py-3 text-left shadow-[2px_0_8px_rgba(0,0,0,0.12)]"
          style={{ borderRight: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <div className="text-[12px] font-semibold text-foreground">{phase.name}</div>
            <div className="text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">
              {phase.tasks.length} tarefas
            </div>
          </div>
        </button>

        <div className="relative col-start-2 -col-end-1 h-12">
          {Array.from({ length: unitCount }).map((_, index) => (
            <div
              key={`${phase.id}-grid-${index + 1}`}
              className="absolute top-0 bottom-0 border-r border-[rgba(15,39,68,0.05)]"
              style={{ left: index * columnWidth, width: columnWidth }}
            />
          ))}
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-40"
            style={{
              left: phasePosition.left,
              width: phasePosition.width,
              backgroundColor: phase.color,
            }}
          />
        </div>
      </div>
    )
  }

  if (!task) {
    return null
  }

  const statusColor = getStatusColor(task.statusDerived)
  const position = calcTaskPosition(task, planStart, planEnd)

  return (
    <div
      id={`task-row-${task.id}`}
      className="grid transition-colors duration-200 ease-out"
      style={{ borderBottom: '1px solid var(--ws-glass-border)', gridTemplateColumns }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--ws-glass-bg-hover)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '' }}
    >
      <div
        className="sticky left-0 z-10 flex items-center gap-3 px-4 py-3 pl-6 shadow-[2px_0_8px_rgba(0,0,0,0.12)]"
        style={{ borderRight: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
      >
        <div
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: hashColor(task.assignee) }}
        >
          {task.assigneeInitials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] text-foreground">{task.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{task.assignee}</span>
            <Badge
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                statusColor.bg,
                statusColor.text,
                statusColor.border
              )}
            >
              {getStatusLabel(task.statusDerived)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="relative col-start-2 -col-end-1 h-[58px]">
        {Array.from({ length: unitCount }).map((_, index) => (
          <div
            key={`${task.id}-grid-${index + 1}`}
            className="absolute top-0 bottom-0 border-r border-[rgba(15,39,68,0.05)]"
            style={{ left: index * columnWidth, width: columnWidth }}
          />
        ))}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onTaskClick?.(task)}
                className={cn(
                  'absolute top-1/2 h-6 -translate-y-1/2 cursor-pointer rounded-md transition-transform duration-200 ease-out hover:-translate-y-[55%]',
                  getTaskBarClasses(task.statusDerived)
                )}
                style={{
                  left: position.left,
                  width: position.width,
                  backgroundColor: task.color ?? phase.color,
                }}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-md bg-black/15"
                  style={{ width: `${task.progress}%` }}
                />
                <span className="absolute inset-0 rounded-md border border-white/20" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={6}
              className="max-w-[260px] rounded-lg bg-[#0f2744] px-3 py-2 text-white"
            >
              <div className="text-[12px] font-medium">{task.title}</div>
              <div className="mt-1 text-[11px] text-white/75">
                {formatDateBR(task.startDate)} → {formatDateBR(task.endDate)}
              </div>
              <div className="mt-1 text-[11px] text-white/75">{task.assignee}</div>
              <div className="mt-1 text-[11px] text-white/75">Progresso: {task.progress}%</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

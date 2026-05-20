import {
  addWeeks,
  differenceInCalendarDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { PmpTask, TaskPriority, TaskStatus, TaskStatusDerived } from '@/types/pmp'

export function daysBetween(start: string, end: string): number {
  return Math.max(1, differenceInCalendarDays(parseISO(end), parseISO(start)) + 1)
}

export function formatDateBR(date: string): string {
  return format(parseISO(date), "dd MMM yyyy", { locale: ptBR }).toLowerCase()
}

export function getMonthsInRange(start: string, end: string): { month: number; year: number; label: string }[] {
  return eachMonthOfInterval({
    start: startOfMonth(parseISO(start)),
    end: endOfMonth(parseISO(end)),
  }).map((date) => ({
    month: date.getMonth(),
    year: date.getFullYear(),
    label: format(date, 'MMM yyyy', { locale: ptBR }),
  }))
}

export function getWeeksInRange(start: string, end: string): { weekStart: string; label: string }[] {
  const weeks = eachWeekOfInterval(
    {
      start: parseISO(start),
      end: parseISO(end),
    },
    { weekStartsOn: 1 }
  )

  return weeks.map((weekStart, index) => {
    const monthStart = startOfMonth(weekStart)
    const monthWeeks = eachWeekOfInterval(
      {
        start: monthStart,
        end: endOfMonth(weekStart),
      },
      { weekStartsOn: 1 }
    )
    const labelIndex = monthWeeks.findIndex((entry) => entry.getTime() === weekStart.getTime())

    return {
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      label: `S${labelIndex >= 0 ? labelIndex + 1 : index + 1}`,
    }
  })
}

export function calcTaskPosition(task: PmpTask, planStart: string, planEnd: string): { left: string; width: string } {
  const totalDays = daysBetween(planStart, planEnd)
  const taskStartOffset = Math.max(0, differenceInCalendarDays(parseISO(task.startDate), parseISO(planStart)))
  const taskDuration = daysBetween(task.startDate, task.endDate)

  return {
    left: `${(taskStartOffset / totalDays) * 100}%`,
    width: `${Math.max((taskDuration / totalDays) * 100, 0.8)}%`,
  }
}

export function getStatusLabel(status: TaskStatusDerived): string {
  const labels: Record<TaskStatusDerived, string> = {
    todo: 'A Fazer',
    in_progress: 'Em Andamento',
    done: 'Concluído',
    blocked: 'Bloqueado',
    atrasado: 'Atrasado',
    em_risco: 'Em Risco',
  }
  return labels[status] ?? status
}

export function getStatusColor(status: TaskStatusDerived): { bg: string; text: string; border: string } {
  const colors: Record<TaskStatusDerived, { bg: string; text: string; border: string }> = {
    in_progress: {
      bg: 'bg-[var(--ws-gold)]/10',
      text: 'text-[#92722a]',
      border: 'border-[var(--ws-gold)]/30',
    },
    done: {
      bg: 'bg-[#3b6d11]/10',
      text: 'text-[#3b6d11]',
      border: 'border-[#3b6d11]/30',
    },
    atrasado: {
      bg: 'bg-[#a32d2d]/10',
      text: 'text-[#a32d2d]',
      border: 'border-[#a32d2d]/30',
    },
    todo: {
      bg: 'bg-[#0f2744]/5',
      text: 'text-[#0f2744]/50',
      border: 'border-[#0f2744]/10',
    },
    em_risco: {
      bg: 'bg-[#854f0b]/10',
      text: 'text-[#854f0b]',
      border: 'border-[#854f0b]/30',
    },
    blocked: {
      bg: 'bg-[#6b21a8]/10',
      text: 'text-[#6b21a8]',
      border: 'border-[#6b21a8]/30',
    },
  }
  return colors[status] ?? colors.todo
}

export function getPriorityLabel(priority: TaskPriority): string {
  const labels: Record<TaskPriority, string> = {
    alta: 'Alta',
    media: 'Média',
    baixa: 'Baixa',
  }

  return labels[priority]
}

export function hashColor(str: string): string {
  let hash = 0
  for (let index = 0; index < str.length; index += 1) {
    hash = str.charCodeAt(index) + ((hash << 5) - hash)
  }

  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 55% 42%)`
}

export function getMonthSpansForWeeks(start: string, end: string): Array<{ label: string; span: number }> {
  const weeks = getWeeksInRange(start, end)
  const spans = new Map<string, number>()

  weeks.forEach(({ weekStart }) => {
    const key = format(parseISO(weekStart), 'MMM yyyy', { locale: ptBR })
    spans.set(key, (spans.get(key) ?? 0) + 1)
  })

  return Array.from(spans.entries()).map(([label, span]) => ({ label, span }))
}

export function getTodayOffsetPercent(planStart: string, planEnd: string, today = new Date()): number {
  const start = parseISO(planStart)
  const end = parseISO(planEnd)
  const clampedTime = Math.min(
    Math.max(today.getTime(), start.getTime()),
    addWeeks(endOfWeek(end, { weekStartsOn: 1 }), 0).getTime()
  )
  const clampedDate = new Date(clampedTime)

  const totalDays = daysBetween(planStart, planEnd)
  const offset = differenceInCalendarDays(clampedDate, start)

  return (offset / totalDays) * 100
}

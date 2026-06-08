'use client'

import { getMonthSpansForWeeks, getMonthsInRange, getWeeksInRange } from '@/lib/gantt-utils'

interface GanttMonthHeaderProps {
  planStart: string
  planEnd: string
  zoom: 'mes' | 'semana'
  columnWidth: number
  taskColumnWidth: number
}

export default function GanttMonthHeader({
  planStart,
  planEnd,
  zoom,
  columnWidth,
  taskColumnWidth,
}: GanttMonthHeaderProps) {
  const months = getMonthsInRange(planStart, planEnd)
  const weeks = getWeeksInRange(planStart, planEnd)
  const monthSpans = getMonthSpansForWeeks(planStart, planEnd)

  return (
    <>
      <div
        className="grid border-b border-border/10 bg-muted/40"
        style={{
          gridTemplateColumns:
            zoom === 'mes'
              ? `${taskColumnWidth}px repeat(${months.length}, ${columnWidth}px)`
              : `${taskColumnWidth}px repeat(${weeks.length}, ${columnWidth}px)`,
        }}
      >
        <div className="sticky left-0 z-20 flex items-center border-r border-border/10 bg-muted/40 px-4 py-2 text-[11px] font-medium text-muted-foreground shadow-[2px_0_8px_rgba(0,0,0,0.12)]">
          Entregas e fases
        </div>

        {zoom === 'mes'
          ? months.map((month) => (
              <div
                key={`${month.year}-${month.month}`}
                className="flex items-center justify-center border-r border-border/10 px-2 py-2 text-[11px] font-medium text-muted-foreground"
              >
                {month.label}
              </div>
            ))
          : monthSpans.map((month) => (
              <div
                key={month.label}
                className="flex items-center justify-center border-r border-border/10 px-2 py-2 text-[11px] font-medium text-muted-foreground"
                style={{ gridColumn: `span ${month.span}` }}
              >
                {month.label}
              </div>
            ))}
      </div>

      {zoom === 'semana' && (
        <div
          className="grid border-b border-border/10 bg-card"
          style={{ gridTemplateColumns: `${taskColumnWidth}px repeat(${weeks.length}, ${columnWidth}px)` }}
        >
          <div className="sticky left-0 z-20 border-r border-border/10 bg-card px-4 py-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70 shadow-[2px_0_8px_rgba(0,0,0,0.12)]">
            Semanas
          </div>
          {weeks.map((week) => (
            <div
              key={week.weekStart}
              className="flex items-center justify-center border-r border-border/10 px-1 py-2 text-[11px] font-medium text-muted-foreground"
            >
              {week.label}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

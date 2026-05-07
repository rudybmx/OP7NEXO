'use client'

import MatrizTableRow from '@/components/demandas/matriz/MatrizTableRow'
import { MONTH_LABELS, calcMonthMetrics, formatBRL, getExecucaoArrow, getExecucaoColor } from '@/lib/matriz-utils'
import { cn } from '@/lib/utils'
import type { Canal, MatrizDraft, MatrizPlan } from '@/types/matriz'

interface MatrizTableProps {
  plan: MatrizPlan
  draft: MatrizDraft | null
  isEditing: boolean
  highlightedCanal: Canal | null
  currentMonth: number
  onCellChange: (canal: Canal, month: number, value: number) => void
  viewMode?: 'month' | 'day'
}

export default function MatrizTable({
  plan,
  draft,
  isEditing,
  highlightedCanal,
  currentMonth,
  onCellChange,
  viewMode = 'month',
}: MatrizTableProps) {
  const rows = draft?.rows ?? plan.rows
  const totalApprovedAllChannels = rows.reduce(
    (sum, row) => sum + row.months.reduce((accumulator, month) => accumulator + month.aprovado, 0),
    0
  )
  const monthMetrics = calcMonthMetrics(rows)

  return (
    <div
      className="overflow-hidden"
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 14,
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1482px] table-fixed border-separate border-spacing-0">
          <thead>
            <tr style={{ background: 'var(--ws-glass-bg)' }}>
              <th
                className="sticky left-0 z-20 w-[220px] px-4 py-3 text-left text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70 shadow-[2px_0_8px_rgba(0,0,0,0.12)]"
                style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
              >
                Canal / Mês
              </th>
              {viewMode === 'month' ? MONTH_LABELS.map((label, index) => (
                <th
                  key={label}
                  className={cn(
                    'w-[90px] px-2 py-3 text-center text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70',
                    index + 1 === currentMonth && 'font-medium text-[#92722a]'
                  )}
                  style={{ borderBottom: '1px solid var(--ws-glass-border)' }}
                >
                  {label}
                </th>
              )) : Array.from({ length: 31 }, (_, i) => (
                <th
                  key={`day-${i + 1}`}
                  className="w-[90px] px-2 py-3 text-center text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70"
                  style={{ borderBottom: '1px solid var(--ws-glass-border)' }}
                >
                  Dia {i + 1}
                </th>
              ))}
              <th
                className="sticky right-[72px] z-20 w-[110px] px-3 py-3 text-right text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70 shadow-[-2px_0_8px_rgba(0,0,0,0.10)]"
                style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
              >
                Total
              </th>
              <th
                className="sticky right-0 z-20 w-[72px] px-3 py-3 text-right text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70 shadow-[-2px_0_8px_rgba(0,0,0,0.10)]"
                style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
              >
                %
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <MatrizTableRow
                key={row.canal}
                row={row}
                totalApprovedAllChannels={totalApprovedAllChannels}
                currentMonth={currentMonth}
                isEditing={isEditing}
                highlighted={highlightedCanal === row.canal}
                onCellChange={onCellChange}
                viewMode={viewMode}
              />
            ))}

            <tr style={{ background: 'var(--ws-glass-bg)' }}>
              <td
                className="sticky left-0 z-10 px-4 py-4 text-[13px] font-semibold text-foreground shadow-[2px_0_8px_rgba(0,0,0,0.12)]"
                style={{ borderTop: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
              >
                Total mensal
              </td>
              {viewMode === 'month' ? monthMetrics.map((month) => (
                <td
                  key={`total-${month.month}`}
                  className={cn(
                    'px-2 py-3 text-center',
                    month.month === currentMonth && 'bg-[var(--ws-gold)]/6'
                  )}
                  style={{ borderTop: '1px solid var(--ws-glass-border)' }}
                >
                  <div className="text-[13px] font-semibold tabular-nums text-foreground">{formatBRL(month.totalAprovado)}</div>
                  <div className="mt-1 text-[12px] tabular-nums text-muted-foreground">{formatBRL(month.totalRealizado)}</div>
                  {month.totalRealizado > 0 ? (
                    <div
                      className="mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        color: getExecucaoColor(month.execucao),
                        backgroundColor: `${getExecucaoColor(month.execucao)}1A`,
                      }}
                    >
                      {`${Math.round(month.execucao)}% ${getExecucaoArrow(month.execucao)}`}
                    </div>
                  ) : (
                    <div className="mt-1 text-[10px] text-muted-foreground">—</div>
                  )}
                </td>
              )) : Array.from({ length: 31 }, (_, i) => {
                const mockDayAprovado = monthMetrics[currentMonth - 1]?.totalAprovado / 31 || 0
                const mockDayRealizado = monthMetrics[currentMonth - 1]?.totalRealizado / 31 || 0
                return (
                  <td key={`total-day-${i + 1}`} className="px-2 py-3 text-center" style={{ borderTop: '1px solid var(--ws-glass-border)' }}>
                    <div className="text-[13px] font-semibold tabular-nums text-foreground">{formatBRL(mockDayAprovado)}</div>
                    <div className="mt-1 text-[12px] tabular-nums text-muted-foreground">{formatBRL(mockDayRealizado)}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">—</div>
                  </td>
                )
              })}
              <td
                className="sticky right-[72px] z-10 px-3 py-3 text-right shadow-[-2px_0_8px_rgba(0,0,0,0.10)]"
                style={{ borderTop: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
              >
                <div className="text-[13px] font-semibold tabular-nums text-foreground">{formatBRL(totalApprovedAllChannels)}</div>
              </td>
              <td
                className="sticky right-0 z-10 px-3 py-3 text-right shadow-[-2px_0_8px_rgba(0,0,0,0.10)]"
                style={{ borderTop: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
              >
                <div className="text-[12px] tabular-nums text-muted-foreground">100%</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

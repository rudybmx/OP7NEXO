'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  CANAL_CONFIG,
  formatBRL,
  getExecucaoArrow,
  getExecucaoColor,
} from '@/lib/matriz-utils'
import type { CanalRow } from '@/types/matriz'

interface MatrizTableRowProps {
  row: CanalRow
  totalApprovedAllChannels: number
  currentMonth: number
  isEditing: boolean
  highlighted: boolean
  onCellChange: (canal: CanalRow['canal'], month: number, value: number) => void
  viewMode?: 'month' | 'day'
}

function getExecution(monthApproved: number, monthRealized: number): number | null {
  if (monthApproved === 0 || monthRealized === 0) return null
  return (monthRealized / monthApproved) * 100
}

export default function MatrizTableRow({
  row,
  totalApprovedAllChannels,
  currentMonth,
  isEditing,
  highlighted,
  onCellChange,
  viewMode = 'month',
}: MatrizTableRowProps) {
  const [editingMonth, setEditingMonth] = useState<number | null>(null)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const totalAprovado = useMemo(
    () => row.months.reduce((sum, month) => sum + month.aprovado, 0),
    [row.months]
  )
  const totalRealizado = useMemo(
    () => row.months.reduce((sum, month) => sum + month.realizado, 0),
    [row.months]
  )
  const currentMonthData = row.months.find(m => m.month === currentMonth)
  const rowTotalAprovado = viewMode === 'day' ? (currentMonthData?.aprovado ?? 0) : totalAprovado
  const rowTotalRealizado = viewMode === 'day' ? (currentMonthData?.realizado ?? 0) : totalRealizado
  const rowPercentOfTotal = viewMode === 'day' 
    ? (totalApprovedAllChannels > 0 ? ((currentMonthData?.aprovado ?? 0) / (totalApprovedAllChannels / 12)) * 100 : 0) // Approximation for month total 
    : (totalApprovedAllChannels > 0 ? (totalAprovado / totalApprovedAllChannels) * 100 : 0)

  useEffect(() => {
    if (editingMonth !== null) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingMonth])

  function startEditing(month: number, approved: number) {
    if (!isEditing) return
    setEditingMonth(month)
    setInputValue(String(approved))
  }

  function commitEdit(targetMonth: number) {
    if (editingMonth === null) return
    const parsed = Number(inputValue)
    onCellChange(row.canal, targetMonth, Number.isFinite(parsed) ? Math.max(0, parsed) : 0)
    setEditingMonth(null)
    setInputValue('')
  }

  function cancelEdit() {
    setEditingMonth(null)
    setInputValue('')
  }

  const stickyShadow = 'shadow-[2px_0_8px_rgba(0,0,0,0.12)]'
  const rightShadow = 'shadow-[-2px_0_8px_rgba(0,0,0,0.10)]'
  const activeEditingMonth = isEditing ? editingMonth : null

  return (
    <>
      <tr className={cn('border-t-2 border-border/20', highlighted && 'ring-2 ring-[var(--ws-gold)] ring-inset')}>
        <td
          rowSpan={2}
          className={cn(
            'sticky left-0 z-10 w-[220px] px-4 py-2 align-top',
            stickyShadow,
            highlighted && 'ring-2 ring-[var(--ws-gold)] ring-inset'
          )}
          style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold',
                row.canal === 'tiktok' ? 'bg-muted text-black dark:text-white' : 'text-white'
              )}
              style={row.canal === 'tiktok' ? undefined : { backgroundColor: row.color }}
            >
              {CANAL_CONFIG[row.canal].icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-foreground">{row.label}</span>
                {row.sem_integracao && (
                  <span className="rounded-full border border-muted/60 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    sem integração
                  </span>
                )}
              </div>
              <div className="text-[12px] text-muted-foreground">Aprovado</div>
            </div>
          </div>
        </td>

        {viewMode === 'month' ? row.months.map((month) => {
          const isCurrentMonth = month.month === currentMonth
          const isEditingCell = activeEditingMonth === month.month
          return (
            <td
              key={`${row.canal}-approved-${month.month}`}
              className={cn(
                'h-[44px] w-[90px] px-2 text-center',
                isCurrentMonth && 'bg-[var(--ws-gold)]/6',
                isEditing && 'cursor-text bg-[var(--ws-gold)]/4',
                isEditing && 'ring-1 ring-[var(--ws-gold)]/40'
              )}
              style={{ borderBottom: '1px solid var(--ws-glass-border)' }}
              onClick={() => startEditing(month.month, month.aprovado)}
            >
              {isEditingCell ? (
                <input
                  ref={inputRef}
                  type="number"
                  min={0}
                  step={100}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onBlur={() => commitEdit(month.month)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitEdit(month.month)
                      const nextMonth = month.month < 12 ? month.month + 1 : null
                      if (nextMonth) {
                        const nextApproved = row.months.find((entry) => entry.month === nextMonth)?.aprovado ?? 0
                        setTimeout(() => startEditing(nextMonth, nextApproved), 0)
                      }
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelEdit()
                    }
                  }}
                  className="w-full border-none bg-transparent text-center text-[13px] font-medium tabular-nums text-foreground outline-none"
                />
              ) : (
                <span className={cn('text-[13px] font-medium tabular-nums', month.aprovado === 0 ? 'text-muted-foreground/30' : 'text-foreground')}>
                  {formatBRL(month.aprovado)}
                </span>
              )}
            </td>
          )
        }) : Array.from({ length: 31 }, (_, i) => {
          const currentMonthData = row.months.find(m => m.month === currentMonth)
          const mockAprovado = currentMonthData ? currentMonthData.aprovado / 31 : 0
          return (
            <td
              key={`${row.canal}-approved-day-${i + 1}`}
              className="h-[44px] w-[90px] px-2 text-center"
              style={{ borderBottom: '1px solid var(--ws-glass-border)' }}
            >
              <span className={cn('text-[13px] font-medium tabular-nums', mockAprovado === 0 ? 'text-muted-foreground/30' : 'text-foreground')}>
                {formatBRL(mockAprovado)}
              </span>
            </td>
          )
        })}

        <td
          className={cn('sticky right-[72px] z-10 w-[110px] px-3 text-right', rightShadow)}
          style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
        >
          <div className="text-[13px] font-medium tabular-nums text-foreground">{formatBRL(rowTotalAprovado)}</div>
        </td>
        <td
          className="sticky right-0 z-10 w-[72px] px-3 text-right shadow-[-2px_0_8px_rgba(0,0,0,0.10)]"
          style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
        >
          <div className="text-[12px] tabular-nums text-muted-foreground">{Math.round(rowPercentOfTotal)}%</div>
        </td>
      </tr>

      <tr className={highlighted ? 'ring-2 ring-[var(--ws-gold)] ring-inset' : undefined}>
        {viewMode === 'month' ? row.months.map((month) => {
          const execucao = row.sem_integracao ? null : getExecution(month.aprovado, month.realizado)
          const isCurrentMonth = month.month === currentMonth
          const isFuture = month.realizado === 0
          return (
            <td
              key={`${row.canal}-realizado-${month.month}`}
              className={cn(
                'h-[48px] w-[90px] px-2 text-center',
                isCurrentMonth && 'bg-[var(--ws-gold)]/6',
                !row.sem_integracao && isFuture && 'bg-muted/20'
              )}
              style={{ borderBottom: '1px solid var(--ws-glass-border)' }}
            >
              <div className="text-[13px] tabular-nums text-muted-foreground">
                {row.sem_integracao ? '—' : formatBRL(month.realizado)}
              </div>
              {execucao ? (
                <div
                  className="mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    color: getExecucaoColor(execucao),
                    backgroundColor: `${getExecucaoColor(execucao)}1A`,
                  }}
                >
                  {`${Math.round(execucao)}% ${getExecucaoArrow(execucao)}`}
                </div>
              ) : (
                <div className="mt-1 text-[10px] text-muted-foreground">—</div>
              )}
            </td>
          )
        }) : Array.from({ length: 31 }, (_, i) => {
          const currentMonthData = row.months.find(m => m.month === currentMonth)
          const mockRealizado = currentMonthData ? currentMonthData.realizado / 31 : 0
          const mockAprovado = currentMonthData ? currentMonthData.aprovado / 31 : 0
          const execucao = getExecution(mockAprovado, mockRealizado)
          return (
            <td
              key={`${row.canal}-realizado-day-${i + 1}`}
              className="h-[48px] w-[90px] px-2 text-center"
              style={{ borderBottom: '1px solid var(--ws-glass-border)' }}
            >
              <div className="text-[13px] tabular-nums text-muted-foreground">{formatBRL(mockRealizado)}</div>
              {execucao ? (
                <div
                  className="mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    color: getExecucaoColor(execucao),
                    backgroundColor: `${getExecucaoColor(execucao)}1A`,
                  }}
                >
                  {`${Math.round(execucao)}% ${getExecucaoArrow(execucao)}`}
                </div>
              ) : (
                <div className="mt-1 text-[10px] text-muted-foreground">—</div>
              )}
            </td>
          )
        })}

        <td
          className={cn('sticky right-[72px] z-10 w-[110px] px-3 text-right', rightShadow)}
          style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
        >
          <div className="text-[12px] tabular-nums text-muted-foreground">{formatBRL(rowTotalRealizado)}</div>
        </td>
        <td
          className="sticky right-0 z-10 w-[72px] px-3 text-right shadow-[-2px_0_8px_rgba(0,0,0,0.10)]"
          style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)', backdropFilter: 'blur(16px)' }}
        >
          <div className="text-[12px] text-muted-foreground"> </div>
        </td>
      </tr>
    </>
  )
}

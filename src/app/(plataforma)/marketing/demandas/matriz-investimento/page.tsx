'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import MatrizEditToolbar from '@/components/demandas/matriz/MatrizEditToolbar'
import MatrizHeader from '@/components/demandas/matriz/MatrizHeader'
import MatrizInsights from '@/components/demandas/matriz/MatrizInsights'
import MatrizKpiBar from '@/components/demandas/matriz/MatrizKpiBar'
import MatrizAdditionalCharts from '@/components/demandas/matriz/MatrizAdditionalCharts'
import MatrizTable from '@/components/demandas/matriz/MatrizTable'
import { Toaster } from '@/components/ui/sonner'
import { deepCloneRows } from '@/lib/matriz-utils'
import MatrizDistributionHorizontal from '@/components/demandas/matriz/MatrizDistributionHorizontal'
import { useWorkspace } from '@/lib/workspace-context'
import { useMatrizInvestimento } from '@/hooks/use-matriz-investimento'
import type { Canal, CanalRow, MatrizDraft } from '@/types/matriz'

const CURRENT_YEAR = new Date().getFullYear()
const MATRIZ_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

function countChangedCells(baseRows: CanalRow[], draftRows: CanalRow[]): number {
  return draftRows.reduce((sum, draftRow) => {
    const baseRow = baseRows.find((row) => row.canal === draftRow.canal)
    if (!baseRow) return sum

    return (
      sum +
      draftRow.months.filter((month) => {
        const baseMonth = baseRow.months.find((entry) => entry.month === month.month)
        return baseMonth?.aprovado !== month.aprovado
      }).length
    )
  }, 0)
}

export default function Page() {
  const { workspaceAtivo, workspaces } = useWorkspace()
  const workspaceName = useMemo(
    () => workspaces.find((w) => w.workspace_id === workspaceAtivo)?.workspace_nome ?? '',
    [workspaces, workspaceAtivo],
  )

  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR)
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<MatrizDraft | null>(null)
  const [highlightedCanal, setHighlightedCanal] = useState<Canal | null>(null)
  const [changesCount, setChangesCount] = useState(0)
  const [viewMode, setViewMode] = useState<'month' | 'day'>('month')

  const { plan, isLoading, isSaving, error, salvar } = useMatrizInvestimento(
    workspaceAtivo,
    workspaceName,
    selectedYear,
  )

  useEffect(() => {
    if (!highlightedCanal) return
    const timeout = window.setTimeout(() => setHighlightedCanal(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [highlightedCanal])

  // Reset edit state when year or workspace changes
  useEffect(() => {
    setDraft(null)
    setIsEditing(false)
    setChangesCount(0)
  }, [selectedYear, workspaceAtivo])

  function handleEditToggle() {
    if (!plan) return

    if (!isEditing) {
      const clonedRows = JSON.parse(JSON.stringify(plan.rows)) as CanalRow[]
      setDraft({ rows: clonedRows, isDirty: false })
      setChangesCount(0)
      setIsEditing(true)
      return
    }

    setDraft(null)
    setChangesCount(0)
    setIsEditing(false)
  }

  function handleCellChange(canal: Canal, month: number, value: number) {
    if (!draft || !plan) return

    const nextRows = deepCloneRows(draft.rows)
    const row = nextRows.find((entry) => entry.canal === canal)
    const targetMonth = row?.months.find((entry) => entry.month === month)

    if (!row || !targetMonth) return

    targetMonth.aprovado = value

    const nextChangesCount = countChangedCells(plan.rows, nextRows)
    setDraft({
      rows: nextRows,
      isDirty: nextChangesCount > 0,
    })
    setChangesCount(nextChangesCount)
  }

  async function handleSave() {
    if (!draft || !plan) return

    try {
      await salvar(draft.rows)
      setDraft(null)
      setIsEditing(false)
      setChangesCount(0)
      toast.success('Matriz salva com sucesso')
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    }
  }

  function handleCancel() {
    setDraft(null)
    setIsEditing(false)
    setChangesCount(0)
  }

  function handleYearChange(year: number) {
    setSelectedYear(year)
  }

  function handleMonthChange(month: number) {
    setSelectedMonth(month)
  }

  if (isLoading || !plan) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
        {error ? `Erro: ${error}` : 'Carregando...'}
      </div>
    )
  }

  const activePlan = draft ? { ...plan, rows: draft.rows } : plan

  return (
    <div className="flex flex-col gap-6 p-6 pb-20">
      <Toaster />

      <MatrizHeader
        workspaceName={workspaceName}
        years={MATRIZ_YEARS}
        selectedYear={selectedYear}
        onYearChange={handleYearChange}
        selectedMonth={selectedMonth}
        onMonthChange={handleMonthChange}
        isEditing={isEditing}
        onEditToggle={handleEditToggle}
        updatedAt={plan.updatedAt}
        updatedBy={plan.updatedBy}
      />

      <MatrizKpiBar plan={activePlan} />

      <MatrizInsights plan={activePlan} onCanalHighlight={setHighlightedCanal} />

      <div className="flex flex-col gap-4">
        <MatrizAdditionalCharts plan={activePlan} />

        <div className="min-w-0 w-full overflow-hidden">
          <MatrizDistributionHorizontal plan={activePlan} />

          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Distribuição Orçamentária</h3>
            <div className="flex items-center gap-1 rounded-md border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] p-1 backdrop-blur-md">
              <button
                onClick={() => setViewMode('month')}
                className={`rounded px-3 py-1 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                  viewMode === 'month'
                    ? 'bg-[var(--ws-gold)]/10 text-[var(--ws-gold)]'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                Por Mês
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={`rounded px-3 py-1 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                  viewMode === 'day'
                    ? 'bg-[var(--ws-gold)]/10 text-[var(--ws-gold)]'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                Por Dia
              </button>
            </div>
          </div>

          <MatrizTable
            plan={plan}
            draft={draft}
            isEditing={isEditing}
            highlightedCanal={highlightedCanal}
            currentMonth={selectedMonth}
            onCellChange={handleCellChange}
            viewMode={viewMode}
          />
        </div>
      </div>

      {isEditing && (
        <MatrizEditToolbar
          changesCount={changesCount}
          onCancel={handleCancel}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}
    </div>
  )
}

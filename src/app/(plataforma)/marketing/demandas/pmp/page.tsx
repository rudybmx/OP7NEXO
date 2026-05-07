'use client'

import { useMemo, useState } from 'react'
import GanttChart from '@/components/demandas/pmp/GanttChart'
import PmpHeader from '@/components/demandas/pmp/PmpHeader'
import PmpInsights from '@/components/demandas/pmp/PmpInsights'
import PmpKpiBar from '@/components/demandas/pmp/PmpKpiBar'
import PmpSummaryView from '@/components/demandas/pmp/PmpSummaryView'
import PmpTabs from '@/components/demandas/pmp/PmpTabs'
import PmpTaskDrawer from '@/components/demandas/pmp/PmpTaskDrawer'
import PmpVersionHistory from '@/components/demandas/pmp/PmpVersionHistory'
import { pmpClients, pmpPlans } from '@/lib/pmp-mock-data'
import type { PmpPlan, PmpTask, TaskStatus } from '@/types/pmp'

type ActiveTab = 'gantt' | 'resumo' | 'historico'

function getInitialExpandedPhases(plan: PmpPlan): Set<string> {
  return new Set(plan.phases.map((phase) => phase.id))
}

export default function Page() {
  const [selectedClientId, setSelectedClientId] = useState<string>(pmpClients[0]?.id ?? '')
  const [activeTab, setActiveTab] = useState<ActiveTab>('gantt')
  const [selectedTask, setSelectedTask] = useState<PmpTask | null>(null)
  const [ganttZoom, setGanttZoom] = useState<'mes' | 'semana'>('mes')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'todos'>('todos')
  const [focusTarget, setFocusTarget] = useState<{ taskId?: string; phaseId?: string } | null>(null)
  
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const pmpYears = [2024, 2025, 2026]

  const selectedPlan = useMemo(
    () => pmpPlans.find((plan) => plan.clientId === selectedClientId) ?? pmpPlans[0],
    [selectedClientId]
  )

  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(() =>
    selectedPlan ? getInitialExpandedPhases(selectedPlan) : new Set<string>()
  )

  function handleTogglePhase(phaseId: string) {
    setExpandedPhases((current) => {
      const next = new Set(current)
      if (next.has(phaseId)) {
        next.delete(phaseId)
      } else {
        next.add(phaseId)
      }
      return next
    })
  }

  function handleNewVersion() {
    setActiveTab('historico')
  }

  function handleClientChange(clientId: string) {
    const nextPlan = pmpPlans.find((plan) => plan.clientId === clientId) ?? pmpPlans[0]

    setSelectedClientId(clientId)
    setExpandedPhases(getInitialExpandedPhases(nextPlan))
    setSelectedTask(null)
    setFocusTarget(null)
    setStatusFilter('todos')
    setGanttZoom('mes')
    setActiveTab('gantt')
  }

  function handleInsightTarget(payload: { taskId?: string; phaseId?: string }) {
    setActiveTab('gantt')

    if (payload.taskId) {
      const parentPhase = selectedPlan.phases.find((phase) => phase.tasks.some((task) => task.id === payload.taskId))
      if (parentPhase) {
        setExpandedPhases((current) => new Set([...current, parentPhase.id]))
      }
    }

    if (payload.phaseId) {
      const phaseId = payload.phaseId
      setExpandedPhases((current) => {
        const next = new Set(current)
        next.add(phaseId)
        return next
      })
    }

    setFocusTarget(payload)
  }

  if (!selectedPlan) {
    return null
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PmpHeader
        clients={pmpClients}
        selectedClientId={selectedClientId}
        selectedVersion={selectedPlan.version}
        updatedAt={selectedPlan.updatedAt}
        planStatus={selectedPlan.status}
        onClientChange={handleClientChange}
        years={pmpYears}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        onNewVersion={handleNewVersion}
        onExport={() => window.print()}
      />

      <PmpKpiBar plan={selectedPlan} />

      <PmpInsights plan={selectedPlan} onSelectInsightTarget={handleInsightTarget} />

      <PmpTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'gantt' && (
        <GanttChart
          plan={selectedPlan}
          expandedPhases={expandedPhases}
          zoom={ganttZoom}
          statusFilter={statusFilter}
          focusTarget={focusTarget}
          onZoomChange={setGanttZoom}
          onStatusFilterChange={setStatusFilter}
          onTogglePhase={handleTogglePhase}
          onTaskSelect={setSelectedTask}
        />
      )}

      {activeTab === 'resumo' && <PmpSummaryView plan={selectedPlan} />}

      {activeTab === 'historico' && <PmpVersionHistory versions={selectedPlan.versions} />}

      <PmpTaskDrawer task={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  )
}

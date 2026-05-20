'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import GanttChart from '@/components/demandas/pmp/GanttChart'
import PmpHeader from '@/components/demandas/pmp/PmpHeader'
import PmpInsights from '@/components/demandas/pmp/PmpInsights'
import PmpKpiBar from '@/components/demandas/pmp/PmpKpiBar'
import PmpSummaryView from '@/components/demandas/pmp/PmpSummaryView'
import PmpTabs from '@/components/demandas/pmp/PmpTabs'
import PmpTaskCreateModal from '@/components/demandas/pmp/PmpTaskCreateModal'
import PmpTaskDrawer from '@/components/demandas/pmp/PmpTaskDrawer'
import PmpPlanCreateModal from '@/components/demandas/pmp/PmpPlanCreateModal'
import PmpVersionHistory from '@/components/demandas/pmp/PmpVersionHistory'
import { usePmpPlans, type PmpPlanApi } from '@/hooks/use-pmp-plans'
import { usePmpTasks, type PmpTaskApi } from '@/hooks/use-pmp-tasks'
import { useWorkspace } from '@/lib/workspace-context'
import { calcularStatusDerived, FASES_LABELS } from '@/types/pmp'
import type { PmpPlan, PmpPhase, PmpTask, TaskStatus, TaskStatusDerived } from '@/types/pmp'

type ActiveTab = 'gantt' | 'resumo' | 'historico'

const FASE_ORDER = ['diagnostico', 'identidade', 'conteudo', 'midia-paga', 'analise'] as const
const FASE_COLORS: Record<string, string> = {
  diagnostico: '#4f6bed',
  identidade: 'var(--ws-gold)',
  conteudo: '#3b8f6d',
  'midia-paga': '#7c4dbd',
  analise: '#bf5a2f',
}

function apiTaskToPmpTask(t: PmpTaskApi): PmpTask {
  const status = t.status.toLowerCase() as TaskStatus
  const task: PmpTask = {
    id: t.id,
    phase: t.phase,
    phaseOrder: FASE_ORDER.indexOf(t.phase),
    title: t.title,
    assignee: t.responsible_email ?? 'Não atribuído',
    assigneeInitials: (t.responsible_email ?? 'NA').slice(0, 2).toUpperCase(),
    startDate: t.start_date,
    endDate: t.end_date,
    status,
    statusDerived: 'todo',
    priority: 'media',
    progress: status === 'done' ? 100 : status === 'blocked' ? 0 : 50,
    description: t.description ?? undefined,
    completedAt: t.completed_at ?? undefined,
    blockedReason: t.blocked_reason ?? undefined,
    category: t.category,
    responsibleEmail: t.responsible_email ?? undefined,
  }
  task.statusDerived = calcularStatusDerived(task)
  return task
}

function apiPlanToPmpPlan(plan: PmpPlanApi, tasks: PmpTaskApi[]): PmpPlan {
  const pmpTasks = tasks.map(apiTaskToPmpTask)
  const phaseMap = new Map<string, PmpTask[]>()
  for (const fase of FASE_ORDER) phaseMap.set(fase, [])
  for (const task of pmpTasks) phaseMap.get(task.phase)?.push(task)

  const phases: PmpPhase[] = FASE_ORDER.map((id, order) => ({
    id,
    name: FASES_LABELS[id],
    order,
    tasks: phaseMap.get(id) ?? [],
    color: FASE_COLORS[id] ?? '#888',
  }))

  return {
    id: plan.id,
    clientId: plan.id,
    clientName: plan.client_name,
    version: plan.version,
    title: plan.title,
    startDate: plan.start_date,
    endDate: plan.end_date,
    status: plan.status.toLowerCase() as TaskStatus,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
    createdBy: '',
    phases,
    versions: [],
  }
}

function getInitialExpandedPhases(plan: PmpPlan): Set<string> {
  return new Set(plan.phases.map((p) => p.id))
}

export default function Page() {
  const { workspaceAtivo } = useWorkspace()

  const { plans: apiPlans, isLoading: loadingPlans, criarPlano } = usePmpPlans(workspaceAtivo)

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('gantt')
  const [selectedTask, setSelectedTask] = useState<PmpTask | null>(null)
  const [ganttZoom, setGanttZoom] = useState<'mes' | 'semana'>('mes')
  const [statusFilter, setStatusFilter] = useState<TaskStatusDerived | 'todos'>('todos')
  const [focusTarget, setFocusTarget] = useState<{ taskId?: string; phaseId?: string } | null>(null)
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())

  const { tasks: apiTasks, criarTarefa, atualizarStatus } = usePmpTasks(selectedPlanId)

  // Auto-select first plan when list loads
  useEffect(() => {
    if (apiPlans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(apiPlans[0].id)
    }
  }, [apiPlans, selectedPlanId])

  const selectedApiPlan = useMemo(
    () => apiPlans.find((p) => p.id === selectedPlanId) ?? apiPlans[0] ?? null,
    [apiPlans, selectedPlanId],
  )

  const selectedPlan = useMemo<PmpPlan | null>(
    () => (selectedApiPlan ? apiPlanToPmpPlan(selectedApiPlan, apiTasks) : null),
    [selectedApiPlan, apiTasks],
  )

  // Expand all phases when plan changes
  useEffect(() => {
    if (selectedPlan) setExpandedPhases(getInitialExpandedPhases(selectedPlan))
  }, [selectedPlan?.id])

  const clientList = useMemo(
    () => apiPlans.map((p) => ({ id: p.id, name: p.client_name })),
    [apiPlans],
  )

  function handleTogglePhase(phaseId: string) {
    setExpandedPhases((current) => {
      const next = new Set(current)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
      return next
    })
  }

  function handleClientChange(clientId: string) {
    setSelectedPlanId(clientId)
    setSelectedTask(null)
    setFocusTarget(null)
    setStatusFilter('todos')
    setGanttZoom('mes')
    setActiveTab('gantt')
  }

  function handleInsightTarget(payload: { taskId?: string; phaseId?: string }) {
    setActiveTab('gantt')
    if (!selectedPlan) return
    if (payload.taskId) {
      const parentPhase = selectedPlan.phases.find((ph) => ph.tasks.some((t) => t.id === payload.taskId))
      if (parentPhase) setExpandedPhases((c) => new Set([...c, parentPhase.id]))
    }
    if (payload.phaseId) {
      setExpandedPhases((c) => { const n = new Set(c); n.add(payload.phaseId!); return n })
    }
    setFocusTarget(payload)
  }

  async function handleStatusChange(
    taskId: string,
    update: { status: TaskStatus; completed_at?: string; blocked_reason?: string },
  ) {
    const apiStatus = update.status.toUpperCase() as 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
    await atualizarStatus(taskId, {
      status: apiStatus,
      completed_at: update.completed_at,
      blocked_reason: update.blocked_reason,
    })
    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) =>
        prev
          ? {
              ...prev,
              status: update.status,
              statusDerived: calcularStatusDerived({ status: update.status, endDate: prev.endDate }),
              completedAt: update.completed_at ?? prev.completedAt,
              blockedReason: update.blocked_reason ?? prev.blockedReason,
            }
          : null,
      )
    }
  }

  // Loading state
  if (loadingPlans) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-[14px]">Carregando planos…</span>
      </div>
    )
  }

  // Empty state
  if (!loadingPlans && apiPlans.length === 0) {
    return (
      <>
        <div className="flex h-64 flex-col items-center justify-center gap-4 text-muted-foreground">
          <FileText className="h-10 w-10 opacity-30" />
          <p className="text-[15px] font-medium text-foreground">Nenhum plano cadastrado</p>
          <p className="text-[13px] opacity-60">Crie o primeiro Plano de Marketing Personalizado para este workspace.</p>
          <button
            type="button"
            onClick={() => setShowPlanModal(true)}
            className="mt-2 rounded-xl border border-[var(--ws-gold)] bg-[var(--ws-gold)] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#b8943d]"
          >
            + Criar primeiro plano
          </button>
        </div>
        <PmpPlanCreateModal
          open={showPlanModal}
          onClose={() => setShowPlanModal(false)}
          onSalvar={async (data) => { await criarPlano(data) }}
        />
      </>
    )
  }

  if (!selectedPlan) return null

  return (
    <div className="flex flex-col gap-6 p-6">
      <PmpHeader
        clients={clientList}
        selectedClientId={selectedPlanId ?? ''}
        selectedVersion={selectedPlan.version}
        updatedAt={selectedPlan.updatedAt}
        planStatus={selectedPlan.status as TaskStatusDerived}
        onClientChange={handleClientChange}
        years={[2024, 2025, 2026]}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        onNewVersion={() => setActiveTab('historico')}
        onNovaTarefa={() => setShowCreateModal(true)}
        onNovoPlano={() => setShowPlanModal(true)}
      />

      <PmpKpiBar plan={selectedPlan} />

      <PmpInsights plan={selectedPlan} onSelectInsightTarget={handleInsightTarget} />

      <PmpTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'gantt' && (
        <GanttChart
          plan={selectedPlan}
          expandedPhases={expandedPhases}
          zoom={ganttZoom}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
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

      <PmpTaskDrawer
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onStatusChange={handleStatusChange}
      />

      <PmpTaskCreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSalvar={async (data) => {
          if (!selectedPlanId) return
          await criarTarefa(data)
        }}
      />

      <PmpPlanCreateModal
        open={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        onSalvar={async (data) => { await criarPlano(data) }}
      />
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Info, RefreshCw, TrendingUp, TriangleAlert } from 'lucide-react'
import type { PmpPlan, PmpTask } from '@/types/pmp'

type InsightKind = 'alerta' | 'oportunidade' | 'info'

interface PmpInsightItem {
  id: string
  kind: InsightKind
  message: string
  actionLabel: string
  targetTaskId?: string
  targetPhaseId?: string
}

interface PmpInsightsProps {
  plan: PmpPlan
  onSelectInsightTarget: (payload: { taskId?: string; phaseId?: string }) => void
}

const CONFIG: Record<
  InsightKind,
  {
    leftColor: string
    iconBg: string
    iconColor: string
    label: string
    Icon: typeof TriangleAlert
  }
> = {
  alerta: {
    leftColor: '#a32d2d',
    iconBg: 'bg-[#a32d2d]/10',
    iconColor: 'text-[#a32d2d]',
    label: 'ALERTA',
    Icon: TriangleAlert,
  },
  oportunidade: {
    leftColor: '#3b6d11',
    iconBg: 'bg-[#3b6d11]/10',
    iconColor: 'text-[#3b6d11]',
    label: 'OPORTUNIDADE',
    Icon: TrendingUp,
  },
  info: {
    leftColor: 'var(--ws-gold)',
    iconBg: 'bg-[var(--ws-gold)]/10',
    iconColor: 'text-[#92722a]',
    label: 'INFO',
    Icon: Info,
  },
}

const DEFAULT_VISIBLE = 2

function getOpenTasks(plan: PmpPlan): PmpTask[] {
  return plan.phases.flatMap((phase) => phase.tasks).filter((task) => task.status !== 'done')
}

export default function PmpInsights({ plan, onSelectInsightTarget }: PmpInsightsProps) {
  const [expanded, setExpanded] = useState(false)

  const insights = useMemo<PmpInsightItem[]>(() => {
    const phases = plan.phases
    const mediaPhase = phases.find((phase) => phase.name === 'Mídia Paga')
    const diagnosticoPhase = phases.find((phase) => phase.name === 'Diagnóstico e Estratégia')
    const analisePhase = phases.find((phase) => phase.name === 'Análise e Otimização')
    const openTasks = getOpenTasks(plan)

    const delayedInMedia = mediaPhase?.tasks.filter((task) => task.statusDerived === 'atrasado') ?? []
    const diagnosticoProgress = diagnosticoPhase
      ? Math.round(
          diagnosticoPhase.tasks.reduce((sum, task) => sum + task.progress, 0) /
            Math.max(diagnosticoPhase.tasks.length, 1)
        )
      : 0
    const biggestOwner = openTasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.assignee] = (acc[task.assignee] ?? 0) + 1
      return acc
    }, {})
    const topOwner = Object.entries(biggestOwner).sort((left, right) => right[1] - left[1])[0]
    const ownerPercent = topOwner ? Math.round((topOwner[1] / Math.max(openTasks.length, 1)) * 100) : 0

    return [
      {
        id: 'alerta-midia',
        kind: 'alerta',
        message: `${delayedInMedia.length || 3} tarefas estão atrasadas na fase de Mídia Paga. Risco de impacto no lançamento.`,
        actionLabel: 'Ir para fase de Mídia Paga',
        targetPhaseId: mediaPhase?.id,
      },
      {
        id: 'oportunidade-diagnostico',
        kind: 'oportunidade',
        message: `Fase de Diagnóstico ${diagnosticoProgress || 80}% completa — 5 dias antes do prazo.`,
        actionLabel: 'Ver fase de Diagnóstico',
        targetPhaseId: diagnosticoPhase?.id,
      },
      {
        id: 'info-owner',
        kind: 'info',
        message: `${topOwner?.[0] ?? 'Ana Lima'} é responsável por ${ownerPercent || 40}% das tarefas abertas.`,
        actionLabel: 'Ver tarefas da responsável',
        targetTaskId: openTasks.find((task) => task.assignee === topOwner?.[0])?.id,
      },
      {
        id: 'alerta-analise',
        kind: 'alerta',
        message: 'Fase de Análise ainda não iniciada, com início previsto para 15 dias.',
        actionLabel: 'Ver fase de Análise',
        targetPhaseId: analisePhase?.id,
      },
    ]
  }, [plan])

  const visibleInsights = expanded ? insights : insights.slice(0, DEFAULT_VISIBLE)
  const hiddenCount = insights.length - DEFAULT_VISIBLE

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-foreground">Insights da IA</span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.05em] text-muted-foreground"
          style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', backdropFilter: 'blur(12px)' }}
        >
          <RefreshCw className="h-3 w-3" />
          Atualizado agora
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {visibleInsights.map((insight) => {
          const config = CONFIG[insight.kind]
          const Icon = config.Icon

          return (
            <button
              key={insight.id}
              type="button"
              onClick={() =>
                onSelectInsightTarget({
                  taskId: insight.targetTaskId,
                  phaseId: insight.targetPhaseId,
                })
              }
              className="flex w-full items-start gap-3 p-4 text-left transition-colors duration-200 ease-out hover:brightness-105"
              style={{
                background: 'var(--ws-glass-bg)',
                border: '1px solid var(--ws-glass-border)',
                borderLeft: `3px solid ${config.leftColor}`,
                borderRadius: 14,
                backdropFilter: 'blur(16px)',
                boxShadow: 'var(--ws-glass-shadow-sm)',
              }}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${config.iconBg}`}>
                <Icon className={`h-4 w-4 ${config.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`mb-1 text-[10px] font-semibold tracking-[0.05em] ${config.iconColor}`}>
                  {config.label}
                </div>
                <div className="mb-2 text-[13px] leading-5 text-foreground/70">{insight.message}</div>
                <div className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground">
                  {insight.actionLabel}
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {hiddenCount > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-2xl px-3 py-2 text-[12px] text-foreground/70 transition-colors duration-200 ease-out hover:brightness-105"
            style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', backdropFilter: 'blur(12px)' }}
          >
            {expanded ? 'Recolher insights' : `Ver mais ${hiddenCount} insights`}
          </button>
        </div>
      )}
    </section>
  )
}

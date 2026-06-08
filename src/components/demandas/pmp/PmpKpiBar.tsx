'use client'

import { useMemo } from 'react'
import { Progress } from '@/components/ui/progress'
import type { PmpPlan } from '@/types/pmp'

interface PmpKpiBarProps {
  plan: PmpPlan
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export default function PmpKpiBar({ plan }: PmpKpiBarProps) {
  const metrics = useMemo(() => {
    const tasks = plan.phases.flatMap((phase) => phase.tasks)
    const total = tasks.length
    const completed = tasks.filter((task) => task.status === 'done').length
    const inProgress = tasks.filter((task) => task.status === 'in_progress').length
    const delayed = tasks.filter((task) => task.statusDerived === 'atrasado').length
    const activeTasks = tasks.filter((task) => task.status !== 'blocked')
    const averageProgress = Math.round(activeTasks.reduce((sum, task) => sum + task.progress, 0) / Math.max(activeTasks.length, 1))

    return {
      total,
      completed,
      inProgress,
      delayed,
      averageProgress,
    }
  }, [plan])

  const cards = [
    {
      id: 'total',
      label: 'Total tarefas',
      value: metrics.total,
      sublabel: `${metrics.total} tarefas`,
      valueClassName: 'text-foreground',
    },
    {
      id: 'completed',
      label: 'Concluídas',
      value: metrics.completed,
      sublabel: formatPercent((metrics.completed / Math.max(metrics.total, 1)) * 100),
      valueClassName: 'text-foreground',
    },
    {
      id: 'progress',
      label: 'Em andamento',
      value: metrics.inProgress,
      sublabel: formatPercent((metrics.inProgress / Math.max(metrics.total, 1)) * 100),
      valueClassName: 'text-foreground',
    },
    {
      id: 'delayed',
      label: 'Atrasadas',
      value: metrics.delayed,
      sublabel: formatPercent((metrics.delayed / Math.max(metrics.total, 1)) * 100),
      valueClassName: metrics.delayed > 0 ? 'text-[#a32d2d]' : 'text-foreground',
    },
  ]

  const glassCard = {
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    borderRadius: 14,
    backdropFilter: 'blur(16px)',
    boxShadow: 'var(--ws-glass-shadow-sm)',
  }

  return (
    <section className="grid gap-3 xl:grid-cols-5">
      {cards.map((card) => (
        <article
          key={card.id}
          className="p-4 transition-transform duration-200 hover:-translate-y-0.5"
          style={glassCard}
        >
          <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">{card.label}</div>
          <div className={`text-[20px] font-bold ${card.valueClassName}`}>{card.value}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">{card.sublabel}</div>
        </article>
      ))}

      <article
        className="p-4 transition-transform duration-200 hover:-translate-y-0.5"
        style={glassCard}
      >
        <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Progresso geral</div>
        <div className="text-[20px] font-bold text-foreground">{metrics.averageProgress}%</div>
        <div className="mt-3">
          <Progress value={metrics.averageProgress} indicatorClassName="bg-[var(--ws-gold)]" />
        </div>
        <div className="mt-2 text-[12px] text-muted-foreground">Média de avanço das entregas ativas do plano</div>
      </article>
    </section>
  )
}

'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarClock, CheckCircle2, Clock3 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarGroup } from '@/components/ui/avatar'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Progress } from '@/components/ui/progress'
import { formatDateBR, hashColor } from '@/lib/gantt-utils'
import type { PmpPlan } from '@/types/pmp'

interface PmpSummaryViewProps {
  plan: PmpPlan
}

export default function PmpSummaryView({ plan }: PmpSummaryViewProps) {
  const phaseCards = useMemo(
    () =>
      plan.phases.map((phase) => {
        const completed = phase.tasks.filter((task) => task.status === 'concluido').length
        const delayed = phase.tasks.filter((task) => task.status === 'atrasado').length
        const progress = Math.round(
          phase.tasks.reduce((sum, task) => sum + task.progress, 0) / Math.max(phase.tasks.length, 1)
        )
        const owners = Array.from(new Set(phase.tasks.map((task) => `${task.assignee}|${task.assigneeInitials}`))).map(
          (owner) => {
            const [name, initials] = owner.split('|')
            return { name, initials }
          }
        )

        return {
          ...phase,
          completed,
          delayed,
          progress,
          owners,
        }
      }),
    [plan]
  )

  const assigneeData = useMemo(() => {
    const grouped = new Map<
      string,
      { assignee: string; concluido: number; em_andamento: number; atrasado: number }
    >()

    plan.phases.flatMap((phase) => phase.tasks).forEach((task) => {
      const current = grouped.get(task.assignee) ?? {
        assignee: task.assignee,
        concluido: 0,
        em_andamento: 0,
        atrasado: 0,
      }

      if (task.status === 'concluido') current.concluido += 1
      if (task.status === 'em_andamento') current.em_andamento += 1
      if (task.status === 'atrasado') current.atrasado += 1

      grouped.set(task.assignee, current)
    })

    return Array.from(grouped.values())
  }, [plan])

  const milestones = useMemo(
    () =>
      plan.phases
        .flatMap((phase) => [
          {
            id: `${phase.id}-start`,
            date: phase.tasks[0]?.startDate ?? plan.startDate,
            label: `Início da fase ${phase.name}`,
            color: phase.color,
          },
          {
            id: `${phase.id}-end`,
            date: phase.tasks[phase.tasks.length - 1]?.endDate ?? plan.endDate,
            label: `Conclusão da fase ${phase.name}`,
            color: phase.color,
          },
        ])
        .sort((left, right) => left.date.localeCompare(right.date)),
    [plan]
  )

  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-4 xl:grid-cols-2">
        {phaseCards.map((phase) => (
          <article
            key={phase.id}
            className="p-5 transition-transform duration-200 hover:-translate-y-0.5"
            style={{
              background: 'var(--ws-glass-bg)',
              border: '1px solid var(--ws-glass-border)',
              borderRadius: 14,
              backdropFilter: 'blur(16px)',
              boxShadow: 'var(--ws-glass-shadow-sm)',
            }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-medium text-foreground">{phase.name}</h3>
                <p className="mt-1 text-[13px] text-foreground/70">
                  {phase.completed}/{phase.tasks.length} tarefas concluídas
                </p>
              </div>
              <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: phase.color }} />
            </div>

            <div className="flex items-center gap-3">
              <Progress value={phase.progress} className="h-2.5" indicatorClassName="bg-[var(--ws-gold)]" />
              <span className="text-[14px] font-medium text-foreground">{phase.progress}%</span>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <AvatarGroup>
                {phase.owners.slice(0, 4).map((owner) => (
                  <Avatar key={owner.name} size="sm">
                    <AvatarFallback
                      className="text-[10px] font-semibold text-white"
                      style={{ backgroundColor: hashColor(owner.name) }}
                    >
                      {owner.initials}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </AvatarGroup>

              <div
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] ${
                  phase.delayed > 0 ? 'bg-[#a32d2d]/8 text-[#a32d2d]' : 'bg-[#3b6d11]/8 text-[#3b6d11]'
                }`}
              >
                {phase.delayed > 0 ? <Clock3 className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {phase.delayed > 0
                  ? `${phase.delayed} tarefa${phase.delayed > 1 ? 's' : ''} atrasada${phase.delayed > 1 ? 's' : ''}`
                  : 'No prazo'}
              </div>
            </div>
          </article>
        ))}
      </div>

      <article
        className="relative p-5"
        style={{
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 14,
          backdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow)',
        }}
      >
        <div className="absolute top-3 right-3">
          <InfoTooltip
            title="Distribuição por responsável"
            description="Leitura consolidada do volume de tarefas por responsável, segmentado por concluído, andamento e atrasado."
          />
        </div>
        <div className="mb-5">
          <h3 className="text-[13px] font-medium text-foreground">Distribuição por responsável</h3>
          <p className="mt-1 text-[13px] text-foreground/70">Carga atual de tarefas por pessoa e status principal.</p>
        </div>

        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={assigneeData} layout="vertical" margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(15,39,68,0.06)" strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'rgba(15,39,68,0.55)' }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="assignee"
                tick={{ fontSize: 11, fill: 'rgba(15,39,68,0.60)' }}
                axisLine={false}
                tickLine={false}
                width={92}
              />
              <RechartsTooltip
                cursor={{ fill: 'rgba(15,39,68,0.03)' }}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid rgba(15,39,68,0.10)',
                  background: '#0f2744',
                  color: '#ffffff',
                }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#fff', fontWeight: '600' }}
              />
              <Bar dataKey="concluido" stackId="a" fill="#3b6d11" />
              <Bar dataKey="em_andamento" stackId="a" fill="var(--ws-gold)" />
              <Bar dataKey="atrasado" stackId="a" fill="#a32d2d" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article
        className="relative p-5"
        style={{
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 14,
          backdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow)',
        }}
      >
        <div className="absolute top-3 right-3">
          <InfoTooltip
            title="Timeline de marcos"
            description="Sequência cronológica de início e fechamento das fases do plano, útil para leitura executiva."
          />
        </div>
        <div className="mb-5">
          <h3 className="text-[13px] font-medium text-foreground">Timeline de marcos</h3>
          <p className="mt-1 text-[13px] text-foreground/70">Datas-chave de início e encerramento das fases do plano.</p>
        </div>

        <div className="space-y-4">
          {milestones.map((milestone, index) => (
            <div key={milestone.id} className="relative flex gap-4 pl-1">
              {index < milestones.length - 1 && (
                <div className="absolute top-5 left-[7px] h-[calc(100%+12px)] border-l border-dashed border-[rgba(15,39,68,0.14)]" />
              )}
              <div className="relative z-10 mt-1 h-3.5 w-3.5 rounded-full" style={{ backgroundColor: milestone.color }} />
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-foreground">{milestone.label}</div>
                <div className="mt-1 inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {formatDateBR(milestone.date)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

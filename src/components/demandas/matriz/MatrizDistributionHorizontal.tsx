'use client'

import { InfoTooltip } from '@/components/ui/info-tooltip'
import { calcCanalMetrics, formatBRL } from '@/lib/matriz-utils'
import type { MatrizPlan } from '@/types/matriz'

interface MatrizDistributionHorizontalProps {
  plan: MatrizPlan
}

export default function MatrizDistributionHorizontal({ plan }: MatrizDistributionHorizontalProps) {
  const canalMetrics = calcCanalMetrics(plan.rows)
  const total = canalMetrics.reduce((sum, metric) => sum + metric.totalAprovado, 0)

  return (
    <div
      className="mb-4 p-4 flex flex-col gap-4"
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 14,
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Distribuição Aprovada</div>
        <InfoTooltip
          title="Distribuição aprovada"
          description="Participação de cada canal no total de verba aprovada."
        />
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/30">
        {canalMetrics.map((metric) => {
          const row = plan.rows.find((entry) => entry.canal === metric.canal)
          if (!row || metric.totalAprovado === 0) return null
          const width = `${(metric.totalAprovado / total) * 100}%`
          return (
            <div
              key={metric.canal}
              style={{ width, backgroundColor: row.color }}
              className="h-full transition-all"
              title={`${row.label}: ${formatBRL(metric.totalAprovado)}`}
            />
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-6 text-[12px]">
        {canalMetrics.map((metric) => {
          const row = plan.rows.find((entry) => entry.canal === metric.canal)
          if (!row || metric.totalAprovado === 0) return null
          return (
            <div key={metric.canal} className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="text-foreground/70 font-medium">{row.label}</span>
              <span className="font-semibold text-foreground">{formatBRL(metric.totalAprovado)}</span>
              <span className="text-muted-foreground tabular-nums">({metric.percentualDoTotal.toFixed(0)}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

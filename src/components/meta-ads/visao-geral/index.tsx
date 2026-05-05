'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { FiltrosMeta } from '@/types/meta-ads'
import { useMetaInsights } from '@/hooks/use-meta-insights'
import { CartoesKpi } from './cartoes-kpi'
import { GraficoTemporal } from './grafico-temporal'
import { GraficoBarrasContas, GraficoDonutInvestimento } from './graficos-distribuicao'
import { TopCriativos } from './top-criativos'
import { TabelaContas } from './tabela-contas'
import { InsightsIA } from '../anuncios/insights-ia'

interface VisaoGeralProps {
  filtros: FiltrosMeta
}

export function VisaoGeral({ filtros }: VisaoGeralProps) {
  const { data, isLoading, error } = useMetaInsights(filtros)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-md" />
          ))}
        </div>
        <Skeleton className="h-[200px] rounded-md" />
        <Skeleton className="h-[180px] rounded-md" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Erro ao carregar dados: {error.message}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-[16px]">
      <CartoesKpi contas={data.contas} comparativo={filtros.comparativo} />

      {data.insightsIA && data.insightsIA.length > 0 && (
        <InsightsIA insights={data.insightsIA} onAbrirAnuncio={() => {}} />
      )}

      <GraficoTemporal dados={data.dadosDiarios} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[12px]">
        <GraficoBarrasContas contas={data.contas} />
        <GraficoDonutInvestimento contas={data.contas} />
      </div>

      <TopCriativos criativos={data.topCriativos} />

      <TabelaContas contas={data.contas} />
    </div>
  )
}


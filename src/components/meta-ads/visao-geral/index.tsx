'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { FiltrosMeta } from '@/types/meta-ads'
import type { FinanceiroMetaAds } from '@/types/meta-ads-financeiro'
import { useMetaInsights } from '@/hooks/use-meta-insights'
import { CartoesKpi } from './cartoes-kpi'
import { GraficoTemporal } from './grafico-temporal'
import { GraficoBarrasContas, GraficoDonutInvestimento } from './graficos-distribuicao'
import { TopCriativos } from './top-criativos'
import { TabelaContas } from './tabela-contas'
import { InsightsIA } from '../anuncios/insights-ia'

interface VisaoGeralProps {
  filtros: FiltrosMeta
  workspaceId: string | null
  financeiro: FinanceiroMetaAds | null
  onAbrirFinanceiro: () => void
  onSelecionarConta: (contaId: string) => void
  syncVersion?: string | null
}

export function VisaoGeral({
  filtros,
  workspaceId,
  financeiro,
  onAbrirFinanceiro,
  onSelecionarConta,
  syncVersion = null,
}: VisaoGeralProps) {
  const { data, isLoading, error } = useMetaInsights(filtros, workspaceId, syncVersion)
  const temDados = Boolean(data)

  if (isLoading && !temDados) {
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

  if (error && !temDados) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Erro ao carregar dados: {error.message || 'não foi possível conectar à API de relatórios.'}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-[16px]">
      {error && temDados && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Alguns dados não puderam ser atualizados agora. A tela continua com o último conjunto válido.
        </div>
      )}
      <CartoesKpi
        contas={data.contas}
        leadsPorCanal={data.leadsPorCanal}
        comparativo={filtros.comparativo}
        financeiro={financeiro}
        onAbrirFinanceiro={onAbrirFinanceiro}
        onSelecionarConta={onSelecionarConta}
      />

      {data.insightsIA && data.insightsIA.length > 0 && (
        <InsightsIA insights={data.insightsIA} onAbrirAnuncio={() => {}} />
      )}

      <GraficoTemporal dados={data.dadosDiarios} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[12px]">
        <GraficoBarrasContas contas={data.contas} />
        <GraficoDonutInvestimento contas={data.contas} />
      </div>

      <TopCriativos criativos={data.topCriativos} filtros={filtros} workspaceId={workspaceId} syncVersion={syncVersion} />

      <TabelaContas contas={data.contas} financeiro={financeiro} />
    </div>
  )
}

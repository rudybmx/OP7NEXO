'use client'

import useSWR from 'swr'
import { format } from 'date-fns'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import type {
  FiltrosGoogle, KpiGoogleVisaoGeral, BreakdownTipo,
  DistribuicaoQS, DadosDiarios, CampanhaGoogle,
} from '@/types/google-ads'

interface VisaoGeralResponse {
  kpi: KpiGoogleVisaoGeral
  breakdownTipos: BreakdownTipo[]
  distribuicaoQS: DistribuicaoQS[]
  dadosDiarios: DadosDiarios[]
}

function mapCampanha(r: Record<string, unknown>): CampanhaGoogle {
  return {
    id: String(r.campaign_id ?? ''),
    nome: String(r.campaign_name ?? ''),
    tipo: (r.tipo_campanha as CampanhaGoogle['tipo']) ?? 'SEARCH',
    status: (r.status as CampanhaGoogle['status']) ?? 'PAUSED',
    orcamentoDiario: Number(r.orcamento_diario ?? 0),
    investimento: Number(r.investimento ?? 0),
    cliques: Number(r.cliques ?? 0),
    impressoes: Number(r.impressoes ?? 0),
    conversoes: Number(r.conversoes ?? 0),
    valorConversoes: Number(r.valor_conversoes ?? 0),
    ctr: Number(r.ctr ?? 0),
    cpcMedio: Number(r.cpc_medio ?? 0),
    cpm: Number(r.cpm ?? 0),
    roas: Number(r.roas ?? 0),
    taxaConversao: Number(r.taxa_conversao ?? 0),
    custoConversao: Number(r.custo_conversao ?? 0),
    impressionShare: Number(r.impression_share ?? 0),
    isPeridoBudget: Number(r.is_perdido_budget ?? 0),
    isPerdidoRank: Number(r.is_perdido_rank ?? 0),
    absoluteTopIS: Number(r.absolute_top_is ?? 0),
    qualityScoreMedio: Number(r.quality_score_medio ?? 0),
  }
}

export function useGoogleVisaoGeral(filtros: FiltrosGoogle, adsAccountId?: string) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = workspaceAtivo?.id

  const baseParams = new URLSearchParams({
    start_date: format(filtros.dateRange.start, 'yyyy-MM-dd'),
    end_date: format(filtros.dateRange.end, 'yyyy-MM-dd'),
  })
  if (wsId) baseParams.set('workspace_id', wsId)
  if (adsAccountId) baseParams.set('ads_account_id', adsAccountId)

  // Visão geral (KPI, breakdown, QS, diários)
  const { data: vg, isLoading: vgLoading } = useSWR<VisaoGeralResponse>(
    wsId ? `/google-ads/visao-geral?${baseParams}` : null,
    (p: string) => api.get<VisaoGeralResponse>(p),
    { revalidateOnFocus: false }
  )

  // Campanhas — mesmo cache que useGoogleCampanhas se params iguais
  const campParams = new URLSearchParams(baseParams)
  if (filtros.tipoCampanha && filtros.tipoCampanha !== 'todas') campParams.set('tipo', filtros.tipoCampanha)
  if (filtros.status && filtros.status !== 'todos') campParams.set('status', filtros.status)

  const { data: campRaw, isLoading: campLoading } = useSWR<Record<string, unknown>[]>(
    wsId ? `/google-ads/campanhas?${campParams}` : null,
    (p: string) => api.get<Record<string, unknown>[]>(p),
    { revalidateOnFocus: false }
  )

  const campanhas: CampanhaGoogle[] = (campRaw ?? []).map(mapCampanha)

  return {
    campanhas,
    kpi: vg?.kpi ?? null,
    dadosDiarios: vg?.dadosDiarios ?? [],
    breakdownTipos: vg?.breakdownTipos ?? [],
    distribuicaoQS: vg?.distribuicaoQS ?? [],
    isLoading: vgLoading || campLoading,
    refetch: () => {},
  }
}

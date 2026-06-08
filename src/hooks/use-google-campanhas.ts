'use client'

import useSWR from 'swr'
import { format } from 'date-fns'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import type { CampanhaGoogle, GrupoAnunciosDetalhe, FiltrosCampanhasGoogle } from '@/types/google-ads'

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

function mapGrupo(r: Record<string, unknown>): GrupoAnunciosDetalhe {
  return {
    id: String(r.grupo_id ?? ''),
    campanhaId: String(r.campaign_id ?? ''),
    campanhaNome: String(r.campaign_name ?? ''),
    tipoCampanha: (r.tipo_campanha as GrupoAnunciosDetalhe['tipoCampanha']) ?? 'SEARCH',
    nome: String(r.grupo_nome ?? ''),
    status: (r.status as GrupoAnunciosDetalhe['status']) ?? 'PAUSED',
    estrategiaLance: (r.estrategia_lance as GrupoAnunciosDetalhe['estrategiaLance']) ?? 'MAXIMIZE_CONVERSIONS',
    targetCpaMicros: r.target_cpa != null ? Number(r.target_cpa) * 1_000_000 : null,
    targetRoas: r.target_roas != null ? Number(r.target_roas) : null,
    cpcMaximoMicros: r.cpc_maximo != null ? Number(r.cpc_maximo) * 1_000_000 : null,
    emAprendizado: Boolean(r.em_aprendizado),
    diasAprendizado: 0,
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
    qualityScoreMedio: Number(r.quality_score_medio ?? 0),
    keywordsAtivas: Number(r.keywords_ativas ?? 0),
    keywordsTotal: Number(r.keywords_total ?? 0),
    adStrength: (r.ad_strength as GrupoAnunciosDetalhe['adStrength']) ?? null,
    anunciosAtivos: Number(r.anuncios_ativos ?? 0),
    impressionShare: r.impression_share != null ? Number(r.impression_share) : null,
    isPerdidoBudget: r.is_perdido_budget != null ? Number(r.is_perdido_budget) : null,
    isPerdidoRank: r.is_perdido_rank != null ? Number(r.is_perdido_rank) : null,
  }
}

export function useGoogleCampanhas(
  filtros: FiltrosCampanhasGoogle,
  dateRange: { start: Date; end: Date },
  adsAccountId?: string
) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = workspaceAtivo ?? undefined

  const campParams = new URLSearchParams({
    start_date: format(dateRange.start, 'yyyy-MM-dd'),
    end_date: format(dateRange.end, 'yyyy-MM-dd'),
  })
  if (wsId) campParams.set('workspace_id', wsId)
  if (adsAccountId) campParams.set('ads_account_id', adsAccountId)
  if (filtros.tipo && filtros.tipo !== 'todos') campParams.set('tipo', filtros.tipo)
  if (filtros.status && filtros.status !== 'todos') campParams.set('status', filtros.status)

  const { data: campRaw, isLoading: campLoading, mutate } = useSWR<Record<string, unknown>[]>(
    wsId ? `/google-ads/campanhas?${campParams}` : null,
    (p: string) => api.get<Record<string, unknown>[]>(p),
    { revalidateOnFocus: false }
  )

  // Pré-carrega grupos para a função grupos(campanhaId)
  const grupoParams = new URLSearchParams({
    start_date: format(dateRange.start, 'yyyy-MM-dd'),
    end_date: format(dateRange.end, 'yyyy-MM-dd'),
  })
  if (wsId) grupoParams.set('workspace_id', wsId)
  if (adsAccountId) grupoParams.set('ads_account_id', adsAccountId)

  const { data: gruposRaw } = useSWR<Record<string, unknown>[]>(
    wsId ? `/google-ads/grupos?${grupoParams}` : null,
    (p: string) => api.get<Record<string, unknown>[]>(p),
    { revalidateOnFocus: false }
  )

  let campanhas: CampanhaGoogle[] = (campRaw ?? []).map(mapCampanha)

  if (filtros.busca)
    campanhas = campanhas.filter(c =>
      c.nome.toLowerCase().includes(filtros.busca.toLowerCase())
    )

  campanhas.sort((a, b) => {
    const mult = filtros.ordem === 'asc' ? 1 : -1
    switch (filtros.ordenarPor) {
      case 'conversoes':   return (b.conversoes - a.conversoes) * mult
      case 'roas':         return (b.roas - a.roas) * mult
      case 'ctr':          return (b.ctr - a.ctr) * mult
      case 'qualityScore': return (b.qualityScoreMedio - a.qualityScoreMedio) * mult
      default:             return (b.investimento - a.investimento) * mult
    }
  })

  const todosGrupos: GrupoAnunciosDetalhe[] = (gruposRaw ?? []).map(mapGrupo)

  // Mantém assinatura original: grupos(campanhaId) => GrupoAnunciosDetalhe[]
  const grupos = (campanhaId: string) =>
    todosGrupos.filter(g => g.campanhaId === campanhaId)

  return { campanhas, grupos, isLoading: campLoading, refetch: mutate }
}

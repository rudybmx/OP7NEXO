'use client'

import useSWR from 'swr'
import { format } from 'date-fns'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import type { GrupoAnunciosDetalhe, FiltrosGruposGoogle } from '@/types/google-ads'

function mapRow(r: Record<string, unknown>): GrupoAnunciosDetalhe {
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

export function useGoogleGrupos(
  filtros: FiltrosGruposGoogle,
  dateRange: { start: Date; end: Date },
  adsAccountId?: string
) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = workspaceAtivo ?? undefined

  const params = new URLSearchParams({
    start_date: format(dateRange.start, 'yyyy-MM-dd'),
    end_date: format(dateRange.end, 'yyyy-MM-dd'),
  })
  if (wsId) params.set('workspace_id', wsId)
  if (adsAccountId) params.set('ads_account_id', adsAccountId)
  if (filtros.campanhaId && filtros.campanhaId !== 'todas') params.set('campaign_id', filtros.campanhaId)

  const { data, error, isLoading, mutate } = useSWR<Record<string, unknown>[]>(
    wsId ? `/google-ads/grupos?${params}` : null,
    (path: string) => api.get<Record<string, unknown>[]>(path),
    { revalidateOnFocus: false }
  )

  let grupos: GrupoAnunciosDetalhe[] = (data ?? []).map(mapRow)

  if (filtros.busca)
    grupos = grupos.filter(g =>
      g.nome.toLowerCase().includes(filtros.busca.toLowerCase()) ||
      g.campanhaNome.toLowerCase().includes(filtros.busca.toLowerCase())
    )
  if (filtros.status !== 'todos')
    grupos = grupos.filter(g => g.status === filtros.status)
  if (filtros.estrategia !== 'todas')
    grupos = grupos.filter(g => g.estrategiaLance === filtros.estrategia)

  grupos.sort((a, b) => {
    const m = filtros.ordem === 'asc' ? 1 : -1
    switch (filtros.ordenarPor) {
      case 'conversoes':     return (b.conversoes - a.conversoes) * m
      case 'roas':           return (b.roas - a.roas) * m
      case 'ctr':            return (b.ctr - a.ctr) * m
      case 'qualityScore':   return (b.qualityScoreMedio - a.qualityScoreMedio) * m
      case 'custoConversao': return (a.custoConversao - b.custoConversao) * m
      default:               return (b.investimento - a.investimento) * m
    }
  })

  const campanhasUnicas = Array.from(
    new Map(grupos.map(g => [g.campanhaId, { id: g.campanhaId, nome: g.campanhaNome }])).values()
  )

  return { grupos, campanhasUnicas, isLoading, error, refetch: mutate }
}

'use client'

import useSWR from 'swr'
import { format } from 'date-fns'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import type { KeywordGoogle } from '@/types/google-ads'

function mapRow(r: Record<string, unknown>): KeywordGoogle {
  return {
    id: String(r.criterion_id ?? ''),
    adGroupId: String(r.ad_group_id ?? ''),
    campanhaId: String(r.campaign_id ?? ''),
    texto: String(r.keyword_text ?? ''),
    matchType: (r.match_type as KeywordGoogle['matchType']) ?? 'BROAD',
    status: (r.status as KeywordGoogle['status']) ?? 'ENABLED',
    qualityScore: Number(r.quality_score ?? 0),
    investimento: Number(r.investimento ?? 0),
    cliques: Number(r.cliques ?? 0),
    impressoes: Number(r.impressoes ?? 0),
    conversoes: Number(r.conversoes ?? 0),
    ctr: Number(r.ctr ?? 0),
    cpcMedio: Number(r.cpc_medio ?? 0),
    custoConversao: Number(r.custo_conversao ?? 0),
  }
}

export function useGooglePalavras(
  dateRange: { start: Date; end: Date },
  adsAccountId?: string,
  campaignId?: string
) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = workspaceAtivo?.id

  const params = new URLSearchParams({
    start_date: format(dateRange.start, 'yyyy-MM-dd'),
    end_date: format(dateRange.end, 'yyyy-MM-dd'),
  })
  if (wsId) params.set('workspace_id', wsId)
  if (adsAccountId) params.set('ads_account_id', adsAccountId)
  if (campaignId) params.set('campaign_id', campaignId)

  const { data, error, isLoading, mutate } = useSWR<Record<string, unknown>[]>(
    wsId ? `/google-ads/keywords?${params}` : null,
    (path: string) => api.get<Record<string, unknown>[]>(path),
    { revalidateOnFocus: false }
  )

  return {
    palavras: (data ?? []).map(mapRow),
    isLoading,
    error,
    refetch: mutate,
  }
}

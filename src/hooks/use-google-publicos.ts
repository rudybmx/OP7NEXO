'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import type { PublicoGoogle } from '@/types/google-ads'

function mapRow(r: Record<string, unknown>): PublicoGoogle {
  return {
    id: String(r.criterion_id ?? ''),
    nome: String(r.audience_name ?? ''),
    leads: Number(r.leads ?? 0),
    investimento: Number(r.investimento ?? 0),
    cpl: Number(r.cpl ?? 0),
    ctr: Number(r.ctr ?? 0),
    percentual: Number(r.percentual ?? 0),
  }
}

export function useGooglePublicos(
  periodo: string = '30d',
  adsAccountId?: string,
  campaignId?: string
) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = workspaceAtivo?.id

  const params = new URLSearchParams({ periodo })
  if (wsId) params.set('workspace_id', wsId)
  if (adsAccountId) params.set('ads_account_id', adsAccountId)
  if (campaignId) params.set('campaign_id', campaignId)

  const { data, error, isLoading, mutate } = useSWR<Record<string, unknown>[]>(
    wsId ? `/google-ads/publicos?${params}` : null,
    (path: string) => api.get<Record<string, unknown>[]>(path),
    { revalidateOnFocus: false }
  )

  return {
    publicos: (data ?? []).map(mapRow),
    isLoading,
    error,
    refetch: mutate,
  }
}

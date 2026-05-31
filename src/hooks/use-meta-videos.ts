'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import type { MetaVideoRow } from '@/types/meta-ads-videos'

export function useMetaVideos(params: {
  workspaceId: string | null
  dataInicio: string
  dataFim: string
  contaIds?: string[]
  campaignId?: string | null
}) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = (params.workspaceId ?? workspaceAtivo) ?? null
  const contaParam = params.contaIds?.length ? `&conta_ids=${params.contaIds.join(',')}` : ''
  const campaignParam = params.campaignId ? `&campaign_id=${params.campaignId}` : ''
  const key = wsId
    ? `/meta/insights/videos?workspace_id=${wsId}&data_inicio=${params.dataInicio}&data_fim=${params.dataFim}${contaParam}${campaignParam}`
    : null
  const { data, isLoading, error } = useSWR(
    key,
    () => api.get<MetaVideoRow[]>(key!),
    { revalidateOnFocus: false }
  )
  return { rows: data ?? [], isLoading, error: error ?? null }
}

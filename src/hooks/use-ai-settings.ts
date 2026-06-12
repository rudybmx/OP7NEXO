'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'

export type AiFeature = 'insights' | 'image' | 'vision' | 'copy' | 'agent'

export interface AiSetting {
  feature: AiFeature
  label: string
  provider: string | null
  model: string
  base_url: string
  source: 'db' | 'env'
  ativo: boolean
  has_override: boolean
  api_key_mask: string
}

export interface AiSettingUpdate {
  provider?: string | null
  model?: string | null
  base_url?: string | null
  api_key?: string | null // omitir = mantém; '' = limpa override
  ativo?: boolean | null
}

export interface AiInsight {
  id: string
  workspace_id: string
  workspace_nome: string | null
  ads_account_id: string | null
  account_name: string | null
  modulo: string
  tipo: string
  titulo: string
  mensagem: string
  acao: string | null
  model_usado: string | null
  gerado_em: string | null
}

export function useAiSettings() {
  const { data, error, isLoading, mutate } = useSWR<AiSetting[]>(
    '/ai/settings',
    (p: string) => api.get<AiSetting[]>(p),
    { revalidateOnFocus: false }
  )

  async function atualizar(feature: AiFeature, payload: AiSettingUpdate) {
    const updated = await api.put<AiSetting>(`/ai/settings/${feature}`, payload)
    await mutate()
    return updated
  }

  return { settings: data ?? [], isLoading, error, atualizar, refetch: mutate }
}

export function useAiInsights(workspaceId?: string, limit = 50) {
  const qs = new URLSearchParams()
  if (workspaceId) qs.set('workspace_id', workspaceId)
  if (limit) qs.set('limit', String(limit))
  const path = `/ai/insights${qs.toString() ? `?${qs.toString()}` : ''}`
  const { data, error, isLoading, mutate } = useSWR<AiInsight[]>(
    path,
    (p: string) => api.get<AiInsight[]>(p),
    { revalidateOnFocus: false }
  )
  return { insights: data ?? [], isLoading, error, refetch: mutate }
}

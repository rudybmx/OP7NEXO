'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'

export type UsageGroupBy = 'feature' | 'model' | 'workspace'

export interface UsageItem {
  chave: string
  chamadas: number
  tokens: number
  custo_usd: number
  custo_brl: number | null
}

export interface UsageSummary {
  inicio: string
  fim: string
  group_by: UsageGroupBy
  fx: { dia: string; usd_brl: number; fonte: string } | null
  totais: { chamadas: number; tokens: number; custo_usd: number; custo_brl: number | null; sem_preco: number }
  itens: UsageItem[]
}

export interface AiPricing {
  model: string
  kind: string
  input_usd_1m: number | null
  output_usd_1m: number | null
  image_prices_json: Record<string, number> | null
  ativo: boolean
}

export interface AiPricingUpdate {
  kind?: string
  input_usd_1m?: number | null
  output_usd_1m?: number | null
  image_prices_json?: Record<string, number> | null
  ativo?: boolean
}

export function useAiUsageSummary(inicio?: string, fim?: string, groupBy: UsageGroupBy = 'feature') {
  const qs = new URLSearchParams()
  if (inicio) qs.set('inicio', inicio)
  if (fim) qs.set('fim', fim)
  qs.set('group_by', groupBy)
  const { data, error, isLoading, mutate } = useSWR<UsageSummary>(
    `/ai/usage/summary?${qs.toString()}`,
    (p: string) => api.get<UsageSummary>(p),
    { revalidateOnFocus: false }
  )
  return { summary: data, isLoading, error, refetch: mutate }
}

export function useAiPricing() {
  const { data, error, isLoading, mutate } = useSWR<AiPricing[]>(
    '/ai/usage/pricing',
    (p: string) => api.get<AiPricing[]>(p),
    { revalidateOnFocus: false }
  )
  async function atualizar(model: string, payload: AiPricingUpdate) {
    const updated = await api.put<AiPricing>(`/ai/usage/pricing/${encodeURIComponent(model)}`, payload)
    await mutate()
    return updated
  }
  return { pricing: data ?? [], isLoading, error, atualizar, refetch: mutate }
}

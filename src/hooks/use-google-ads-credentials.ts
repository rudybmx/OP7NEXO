'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'

export interface GoogleAdsCredential {
  id: string
  nome: string
  developer_token: string
  client_id: string
  manager_customer_id: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface GoogleAdsCredentialIn {
  nome: string
  developer_token: string
  client_id: string
  client_secret: string
  refresh_token: string
  manager_customer_id?: string
}

export function useGoogleAdsCredentials(includeAll = false) {
  const path = `/google-ads/credentials${includeAll ? '?include_all=true' : ''}`
  const { data, error, isLoading, mutate } = useSWR<GoogleAdsCredential[]>(
    path,
    (p: string) => api.get<GoogleAdsCredential[]>(p),
    { revalidateOnFocus: false }
  )

  async function criar(payload: GoogleAdsCredentialIn) {
    const created = await api.post<GoogleAdsCredential>('/google-ads/credentials', payload)
    await mutate()
    return created
  }

  async function atualizar(id: string, payload: Partial<GoogleAdsCredentialIn & { ativo: boolean }>) {
    const updated = await api.put<GoogleAdsCredential>(`/google-ads/credentials/${id}`, payload)
    await mutate()
    return updated
  }

  async function deletar(id: string) {
    await api.delete(`/google-ads/credentials/${id}`)
    await mutate()
  }

  async function testar(id: string): Promise<{ ok: boolean; message: string; contas_count: number }> {
    return api.post(`/google-ads/credentials/${id}/test`, {})
  }

  return {
    credentials: data ?? [],
    isLoading,
    error,
    criar,
    atualizar,
    deletar,
    testar,
    refetch: mutate,
  }
}

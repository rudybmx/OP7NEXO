'use client'

import { useCallback, useState } from 'react'
import api from '@/lib/api-client'

export interface LlmModelo {
  id: string
  nome_modelo: string
  label_display: string | null
  ativo: boolean
}

export interface LlmProvider {
  id: string
  nome: string
  base_url: string
  tipo: string
  ativo: boolean
  descricao: string | null
  token_configurado: boolean
  token_mask: string
  modelos: LlmModelo[]
}

export interface ProviderTokenInfo {
  provider_id: string
  configurado: boolean
  token_mask: string
  ativo: boolean
}

export interface ProviderInput {
  nome: string
  base_url: string
  tipo?: string
  descricao?: string | null
  ativo?: boolean
}

/** Providers e modelos de LLM (platform_admin). Padrão imperativo (igual use-meta-tokens). */
export function useLlmProviders() {
  const [providers, setProviders] = useState<LlmProvider[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setProviders(await api.get<LlmProvider[]>('/llm-providers'))
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar providers')
    } finally {
      setCarregando(false)
    }
  }, [])

  const criar = useCallback(
    (payload: ProviderInput) => api.post<LlmProvider>('/llm-providers', payload),
    [],
  )

  const atualizar = useCallback(
    (id: string, payload: Partial<ProviderInput>) => api.put<LlmProvider>(`/llm-providers/${id}`, payload),
    [],
  )

  const salvarToken = useCallback(
    (id: string, token: string) => api.post<ProviderTokenInfo>(`/llm-providers/${id}/token`, { token }),
    [],
  )

  const adicionarModelo = useCallback(
    (id: string, payload: { nome_modelo: string; label_display?: string | null; ativo?: boolean }) =>
      api.post<LlmModelo>(`/llm-providers/${id}/modelos`, payload),
    [],
  )

  const removerModelo = useCallback(
    (id: string, modeloId: string) => api.delete<void>(`/llm-providers/${id}/modelos/${modeloId}`),
    [],
  )

  return { providers, carregando, erro, carregar, criar, atualizar, salvarToken, adicionarModelo, removerModelo }
}

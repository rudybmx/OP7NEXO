'use client'

import { useState, useCallback } from 'react'
import api from '@/lib/api-client'

export interface MetaToken {
  id: string
  nome: string
  token: string
  valido_ate: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export function useMetaTokens() {
  const [tokens, setTokens] = useState<MetaToken[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async (includeAll = false) => {
    setCarregando(true)
    setErro(null)
    try {
      const params = new URLSearchParams()
      if (includeAll) params.set('include_all', 'true')
      const qs = params.toString()
      const data = await api.get<MetaToken[]>(`/meta/tokens${qs ? `?${qs}` : ''}`)
      setTokens(data)
    } catch (err: any) {
      setErro(err.message || 'Erro ao carregar tokens')
    } finally {
      setCarregando(false)
    }
  }, [])

  const criar = useCallback(async (payload: {
    nome: string
    token: string
    valido_ate?: string | null
  }) => {
    return api.post<MetaToken>('/meta/tokens', payload)
  }, [])

  const atualizar = useCallback(async (id: string, payload: {
    nome?: string
    token?: string
    valido_ate?: string | null
    ativo?: boolean
  }) => {
    return api.put<MetaToken>(`/meta/tokens/${id}`, payload)
  }, [])

  const desativar = useCallback(async (id: string) => {
    return api.delete<void>(`/meta/tokens/${id}`)
  }, [])

  const reativar = useCallback(async (id: string) => {
    return api.put<MetaToken>(`/meta/tokens/${id}`, { ativo: true })
  }, [])

  return { tokens, carregando, erro, carregar, criar, atualizar, desativar, reativar, setTokens }
}

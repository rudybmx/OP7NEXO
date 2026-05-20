'use client'

import { useState, useCallback, useEffect } from 'react'

export interface ContatoApi {
  id: string
  workspace_id: string
  jid: string
  telefone: string | null
  nome: string | null
  push_name: string | null
  avatar_url: string | null
  origem: string | null
  tags: string[] | null
  perfil_json: Record<string, unknown> | null
  resumo_ia: string | null
  sentimento_ia: string | null
  score_lead_ia: number | null
  last_message_at: string | null
  etapa_funil: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  equipe_id: string | null
  equipe_nome: string | null
  notas: string | null
  instagram: string | null
  facebook: string | null
  primeira_conversa_at: string | null
  campanha_origem: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  meta_ad_id: string | null
  meta_headline: string | null
  meta_image_url: string | null
  conversation_count: number
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

interface UseContatosReturn {
  contatos: ContatoApi[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useContatos(
  busca?: string,
  origem?: string,
  etapaFunil?: string,
  responsavelId?: string,
  tag?: string,
  enabled = true
): UseContatosReturn {
  const [contatos, setContatos] = useState<ContatoApi[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchContatos = useCallback(async () => {
    if (!enabled) return
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      params.set('limit', '80')
      if (busca) params.set('busca', busca)
      if (origem) params.set('origem', origem)
      if (etapaFunil) params.set('etapa_funil', etapaFunil)
      if (responsavelId) params.set('responsavel_id', responsavelId)
      if (tag) params.set('tag', tag)

      const res = await fetch(`/api/whatsapp/contacts?${params.toString()}`)
      if (!res.ok) throw new Error('Erro ao carregar contatos')

      const data = await res.json()
      setContatos(data.contacts ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }, [enabled, busca, origem, etapaFunil, responsavelId, tag])

  useEffect(() => {
    if (!enabled) return
    queueMicrotask(() => {
      void fetchContatos()
    })
  }, [enabled, fetchContatos])

  const refetch = useCallback(() => {
    fetchContatos()
  }, [fetchContatos])

  return {
    contatos,
    isLoading: enabled ? isLoading : false,
    error: enabled ? error : null,
    refetch,
  }
}

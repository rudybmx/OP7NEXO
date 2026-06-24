'use client'

import { useCallback, useState } from 'react'
import api from '@/lib/api-client'

export interface KbItem {
  id: string
  tipo: string
  titulo: string | null
  preview: string
  criado_em: string | null
}

export interface KbIngestResult {
  titulo: string | null
  tipo: string
  chunks: number
}

export interface KbInput {
  tipo: 'documento' | 'url' | 'faq'
  titulo?: string | null
  conteudo?: string | null
  url?: string | null
}

/** Base de conhecimento (RAG) de um agente. Padrão imperativo (igual use-meta-tokens). */
export function useBaseConhecimento(workspaceId: string | null, agenteId: string | null) {
  const [itens, setItens] = useState<KbItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const base = workspaceId && agenteId ? `/workspaces/${workspaceId}/agentes/${agenteId}/base-conhecimento` : null

  const carregar = useCallback(async () => {
    if (!base) {
      setItens([])
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      setItens(await api.get<KbItem[]>(base))
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar base de conhecimento')
    } finally {
      setCarregando(false)
    }
  }, [base])

  const adicionar = useCallback((payload: KbInput) => api.post<KbIngestResult>(base as string, payload), [base])

  const remover = useCallback((kbId: string) => api.delete<void>(`${base}/${kbId}`), [base])

  return { itens, carregando, erro, carregar, adicionar, remover }
}

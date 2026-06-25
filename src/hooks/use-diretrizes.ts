'use client'

import { useCallback, useState } from 'react'
import api from '@/lib/api-client'

export interface Diretrizes {
  diretrizes: string
  atualizado_em: string | null
}

/** Diretrizes de IA por workspace (platform_admin). Texto injetado no system prompt de
 * TODOS os agentes do workspace. Padrão imperativo (igual use-llm-providers). */
export function useDiretrizes() {
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async (ws: string): Promise<Diretrizes> => {
    setCarregando(true)
    setErro(null)
    try {
      return await api.get<Diretrizes>(`/workspaces/${ws}/diretrizes`)
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar diretrizes')
      throw e
    } finally {
      setCarregando(false)
    }
  }, [])

  const salvar = useCallback(async (ws: string, diretrizes: string): Promise<Diretrizes> => {
    setSalvando(true)
    setErro(null)
    try {
      return await api.put<Diretrizes>(`/workspaces/${ws}/diretrizes`, { diretrizes })
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar diretrizes')
      throw e
    } finally {
      setSalvando(false)
    }
  }, [])

  return { carregando, salvando, erro, carregar, salvar }
}

'use client'

import { useState, useEffect, useCallback } from 'react'

export interface AgenteApi {
  id: string
  nome: string
  avatar_url?: string | null
  telefone?: string | null
  cargo?: string | null
  pode_atender_canais: boolean
  org_id?: string | null
  org_nome?: string | null
}

interface UseAgentesDisponiveisReturn {
  agentes: AgenteApi[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useAgentesDisponiveis(workspaceId?: string, enabled = true): UseAgentesDisponiveisReturn {
  const [agentes, setAgentes] = useState<AgenteApi[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAgentes = useCallback(async () => {
    if (!enabled) return
    try {
      setIsLoading(true)
      const params = workspaceId ? `?workspace_id=${workspaceId}` : ''
      const res = await fetch(`/api/whatsapp/agentes${params}`)
      if (!res.ok) throw new Error('Erro ao carregar agentes')
      const data = await res.json()
      setAgentes(data.agentes ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }, [enabled, workspaceId])

  useEffect(() => {
    if (!enabled) return
    queueMicrotask(() => {
      void fetchAgentes()
    })
  }, [enabled, fetchAgentes])

  return { agentes, isLoading: enabled ? isLoading : false, error: enabled ? error : null, refetch: fetchAgentes }
}

'use client'

import { useState, useEffect, useCallback } from 'react'

export interface EquipeApi {
  id: string
  nome: string
  descricao?: string
  workspace_id: string
  membros_count: number
  created_at: string
}

interface UseEquipesReturn {
  equipes: EquipeApi[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useEquipes(workspaceId?: string, enabled = true): UseEquipesReturn {
  const [equipes, setEquipes] = useState<EquipeApi[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEquipes = useCallback(async () => {
    if (!enabled) return
    try {
      setIsLoading(true)
      const params = workspaceId ? `?workspace_id=${workspaceId}` : ''
      const res = await fetch(`/api/equipes${params}`)
      if (!res.ok) throw new Error('Erro ao carregar equipes')
      const data = await res.json()
      setEquipes(data.equipes ?? [])
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
      void fetchEquipes()
    })
  }, [enabled, fetchEquipes])

  return { equipes, isLoading: enabled ? isLoading : false, error: enabled ? error : null, refetch: fetchEquipes }
}

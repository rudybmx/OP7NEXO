'use client'

import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api-client'

export interface WhatsappCanal {
  id: string
  workspace_id: string
  tipo: string
  nome: string
  status: string
  numero_telefone?: string | null
  evolution_instance_id?: string | null
  connection_status?: string | null
}

interface UseWhatsappCanaisReturn {
  canais: WhatsappCanal[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useWhatsappCanais(workspaceId?: string | null, enabled = true): UseWhatsappCanaisReturn {
  const [canais, setCanais] = useState<WhatsappCanal[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCanais = useCallback(async () => {
    if (!enabled || !workspaceId) {
      setCanais([])
      setError(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const data = await api.get<WhatsappCanal[]>(`/workspaces/${workspaceId}/canais`)
      setCanais(data.filter(canal => canal.tipo === 'whatsapp_evolution' || canal.tipo === 'whatsapp_oficial'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar canais')
    } finally {
      setIsLoading(false)
    }
  }, [enabled, workspaceId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void fetchCanais()
    })
    return () => {
      cancelled = true
    }
  }, [fetchCanais])

  return { canais, isLoading, error, refetch: fetchCanais }
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api-client'

export interface PmpUnidade {
  id: string
  workspace_id: string
  nome: string
  ativo: boolean
}

export function usePmpUnidades(workspaceId: string | null) {
  const [unidades, setUnidades] = useState<PmpUnidade[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!workspaceId) return
    setIsLoading(true)
    try {
      const data = await api.get<PmpUnidade[]>(`/pmp/workspaces/${workspaceId}/unidades`)
      setUnidades(data)
    } catch {
      // unidades são opcionais — falha silenciosa
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void fetch()
  }, [fetch])

  return { unidades, isLoading }
}

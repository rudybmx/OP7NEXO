'use client'

import { useState, useCallback } from 'react'

interface UseAssumirConversaReturn {
  assumir: (conversaId: string) => Promise<boolean>
  isAssumindo: boolean
  error: string | null
}

export function useAssumirConversa(): UseAssumirConversaReturn {
  const [isAssumindo, setIsAssumindo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assumir = useCallback(async (conversaId: string): Promise<boolean> => {
    if (!conversaId) return false
    try {
      setIsAssumindo(true)
      setError(null)
      const res = await fetch(`/api/whatsapp/conversations/${conversaId}/assumir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao assumir conversa')
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return false
    } finally {
      setIsAssumindo(false)
    }
  }, [])

  return { assumir, isAssumindo, error }
}

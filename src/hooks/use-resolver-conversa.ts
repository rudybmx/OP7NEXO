'use client'

import { useState, useCallback } from 'react'

interface UseResolverConversaReturn {
  resolver: (conversaId: string, resolucao?: string, observacao?: string) => Promise<boolean>
  isResolvendo: boolean
  error: string | null
}

export function useResolverConversa(): UseResolverConversaReturn {
  const [isResolvendo, setIsResolvendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolver = useCallback(async (conversaId: string, resolucao?: string, observacao?: string): Promise<boolean> => {
    if (!conversaId) return false
    try {
      setIsResolvendo(true)
      setError(null)
      const res = await fetch(`/api/whatsapp/conversations/${conversaId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolvido', resolucao, observacao }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao resolver conversa')
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return false
    } finally {
      setIsResolvendo(false)
    }
  }, [])

  return { resolver, isResolvendo, error }
}

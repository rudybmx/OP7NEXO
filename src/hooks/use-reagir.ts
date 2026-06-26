'use client'

import { useState, useCallback } from 'react'

interface UseReagirReturn {
  reagir: (
    conversaId: string,
    targetEvolutionMsgId: string,
    emoji: string,
    canalId?: string | null,
  ) => Promise<boolean>
  isReagindo: boolean
  error: string | null
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('op7nexo_token')
}

/** Reage (ou remove, emoji='') a uma mensagem, espelhando no WhatsApp. */
export function useReagir(): UseReagirReturn {
  const [isReagindo, setIsReagindo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reagir = useCallback(async (
    conversaId: string,
    targetEvolutionMsgId: string,
    emoji: string,
    canalId?: string | null,
  ): Promise<boolean> => {
    if (!conversaId || !targetEvolutionMsgId) return false
    try {
      setIsReagindo(true)
      setError(null)
      const token = getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch('/api/whatsapp/reagir', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversa_id: conversaId,
          target_evolution_msg_id: targetEvolutionMsgId,
          emoji: emoji ?? '',
          canal_id: canalId || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao reagir')
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return false
    } finally {
      setIsReagindo(false)
    }
  }, [])

  return { reagir, isReagindo, error }
}

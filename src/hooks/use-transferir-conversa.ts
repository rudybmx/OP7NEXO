'use client'

import { useState, useCallback } from 'react'

interface UseTransferirConversaReturn {
  transferir: (conversaId: string, novoResponsavelId: string, novaEquipeId?: string) => Promise<boolean>
  isTransferindo: boolean
  error: string | null
}

export function useTransferirConversa(): UseTransferirConversaReturn {
  const [isTransferindo, setIsTransferindo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const transferir = useCallback(async (conversaId: string, novoResponsavelId: string, novaEquipeId?: string): Promise<boolean> => {
    if (!conversaId || !novoResponsavelId) return false
    try {
      setIsTransferindo(true)
      setError(null)
      const res = await fetch('/api/whatsapp/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversaId,
          novoResponsavelId,
          ...(novaEquipeId ? { novaEquipeId } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao transferir conversa')
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return false
    } finally {
      setIsTransferindo(false)
    }
  }, [])

  return { transferir, isTransferindo, error }
}

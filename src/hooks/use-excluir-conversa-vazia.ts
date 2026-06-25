'use client'

import { useState, useCallback } from 'react'

interface UseExcluirConversaVaziaReturn {
  excluir: (conversaId: string) => Promise<boolean>
  isExcluindo: boolean
  error: string | null
}

/** Exclui uma conversa VAZIA (sem mensagens). O backend valida e recusa com 409 se houver
 *  histórico — o erro ("Conversa não está vazia.") é propagado para a UI. */
export function useExcluirConversaVazia(): UseExcluirConversaVaziaReturn {
  const [isExcluindo, setIsExcluindo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const excluir = useCallback(async (conversaId: string): Promise<boolean> => {
    if (!conversaId) return false
    try {
      setIsExcluindo(true)
      setError(null)
      const res = await fetch(`/api/whatsapp/conversations/${conversaId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao excluir conversa')
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return false
    } finally {
      setIsExcluindo(false)
    }
  }, [])

  return { excluir, isExcluindo, error }
}

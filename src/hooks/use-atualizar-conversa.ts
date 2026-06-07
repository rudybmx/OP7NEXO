'use client'

import { useCallback } from 'react'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('op7nexo_token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

interface ConversaPatch {
  favorita?: boolean
  fixada?: boolean
}

export function useAtualizarConversa() {
  const atualizar = useCallback(async (conversaId: string, patch: ConversaPatch): Promise<boolean> => {
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversaId}/atualizar`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(patch),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  return { atualizar }
}

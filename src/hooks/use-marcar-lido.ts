'use client'

import { useCallback } from 'react'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('op7nexo_token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function useMarcarLido() {
  const marcarLido = useCallback(async (conversaId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversaId}/marcar-lido`, {
        method: 'PATCH',
        headers: authHeaders(),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const marcarNaoLido = useCallback(async (conversaId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversaId}/marcar-nao-lido`, {
        method: 'PATCH',
        headers: authHeaders(),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  return { marcarLido, marcarNaoLido }
}

'use client'

import { useState, useCallback } from 'react'

interface UseEnviarMensagemReturn {
  enviar: (conversaId: string, numero: string, texto: string, workspaceId?: string | null) => Promise<boolean>
  isEnviando: boolean
  error: string | null
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('op7nexo_token')
}

export function useEnviarMensagem(): UseEnviarMensagemReturn {
  const [isEnviando, setIsEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = useCallback(async (conversaId: string, numero: string, texto: string, workspaceId?: string | null): Promise<boolean> => {
    if (!conversaId || !texto.trim()) return false
    try {
      setIsEnviando(true)
      setError(null)
      const token = getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversa_id: conversaId,
          number: numero,
          text: texto.trim(),
          workspace_id: workspaceId || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao enviar mensagem')
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return false
    } finally {
      setIsEnviando(false)
    }
  }, [])

  return { enviar, isEnviando, error }
}

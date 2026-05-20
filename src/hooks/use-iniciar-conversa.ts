'use client'

import { useState, useCallback } from 'react'

export interface ConversaIniciada {
  id: string
  remoteJid: string
  contato: {
    id: string
    nome: string
    telefone: string
    remoteJid: string
  }
}

interface UseIniciarConversaReturn {
  iniciar: (numero: string) => Promise<ConversaIniciada | null>
  isIniciando: boolean
  error: string | null
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('op7nexo_token')
}

export function useIniciarConversa(workspaceId?: string | null): UseIniciarConversaReturn {
  const [isIniciando, setIsIniciando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const iniciar = useCallback(async (numero: string): Promise<ConversaIniciada | null> => {
    if (!numero || numero.trim().length < 10) {
      setError('Número inválido. Digite o DDD + número (mínimo 10 dígitos).')
      return null
    }
    if (!workspaceId) {
      setError('Workspace não definido para iniciar a conversa.')
      return null
    }
    try {
      setIsIniciando(true)
      setError(null)
      const token = getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch('/api/whatsapp/conversations/iniciar', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          numero: numero.trim(),
          workspace_id: workspaceId,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao criar conversa')
      }
      const data = await res.json()
      return data.conversa as ConversaIniciada
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return null
    } finally {
      setIsIniciando(false)
    }
  }, [workspaceId])

  return { iniciar, isIniciando, error }
}

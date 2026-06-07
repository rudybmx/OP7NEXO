'use client'

import { useState, useEffect, useCallback } from 'react'

export interface Etiqueta {
  id: string
  nome: string
  cor: string
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('op7nexo_token')
}

function authHeaders(withJson = false): Record<string, string> {
  const token = getToken()
  return {
    ...(withJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function useEtiquetas(workspaceId?: string | null) {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    setIsLoading(true)
    fetch(`/api/whatsapp/etiquetas?workspace_id=${workspaceId}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { etiquetas: [] })
      .then(data => setEtiquetas(data.etiquetas ?? []))
      .catch(() => setEtiquetas([]))
      .finally(() => setIsLoading(false))
  }, [workspaceId])

  const aplicar = useCallback(async (conversaId: string, etiquetaId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversaId}/etiquetas/${etiquetaId}`, {
        method: 'POST',
        headers: authHeaders(),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const remover = useCallback(async (conversaId: string, etiquetaId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversaId}/etiquetas/${etiquetaId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const criar = useCallback(async (workspaceId: string, nome: string, cor: string): Promise<Etiqueta | null> => {
    try {
      const res = await fetch('/api/whatsapp/etiquetas', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ workspace_id: workspaceId, nome, cor }),
      })
      if (!res.ok) return null
      const data = await res.json()
      const nova = data.etiqueta as Etiqueta
      setEtiquetas(prev => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome)))
      return nova
    } catch {
      return null
    }
  }, [])

  return { etiquetas, isLoading, aplicar, remover, criar }
}

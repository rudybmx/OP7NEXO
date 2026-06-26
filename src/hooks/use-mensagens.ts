'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { MensagemApi } from './use-conversas'

interface UseMensagensReturn {
  mensagens: MensagemApi[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  addMensagemLocal: (msg: MensagemApi) => void
  removerMensagemLocal: (id: string) => void
}

export function useMensagens(conversaId?: string, workspaceId?: string, enabled = true): UseMensagensReturn {
  const [mensagens, setMensagens] = useState<MensagemApi[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const conversaIdRef = useRef<string | undefined>(conversaId)
  const workspaceIdRef = useRef<string | undefined>(workspaceId)

  useEffect(() => {
    conversaIdRef.current = conversaId
  }, [conversaId])

  useEffect(() => {
    workspaceIdRef.current = workspaceId
  }, [workspaceId])

  // Ao TROCAR de conversa, limpa imediatamente as mensagens da anterior. Sem isso, o
  // PainelChat ancora o scroll com as mensagens stale (da conversa anterior) e, quando
  // as novas chegam, os timeouts de re-âncora já foram cancelados pelo cleanup do effect
  // → a conversa abria fora do fim. Limpando, o scroll ancora com as mensagens certas.
  useEffect(() => {
    setMensagens([])
  }, [conversaId])

  const fetchMensagens = useCallback(async () => {
    if (!enabled || !conversaId || !workspaceId) {
      abortRef.current?.abort()
      setMensagens([])
      setError(null)
      setIsLoading(false)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestedFor = conversaId
    const requestedWorkspace = workspaceId
    try {
      setIsLoading(true)
      const params = new URLSearchParams({ workspace_id: workspaceId })
      const res = await fetch(`/api/whatsapp/conversations/${conversaId}/messages?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('Erro ao carregar mensagens')
      const data = await res.json()
      if (requestedFor !== conversaIdRef.current || requestedWorkspace !== workspaceIdRef.current) return
      const msgs: MensagemApi[] = data.messages ?? []
      setMensagens(prev => {
        const otimistas = prev.filter(m => m.id.startsWith('optimistic-'))
        if (otimistas.length === 0) return msgs
        const conteudosSaida = new Set(
          msgs.filter(m => m.direcao === 'saida').map(m => m.conteudo)
        )
        const otimistasPendentes = otimistas.filter(m => !conteudosSaida.has(m.conteudo))
        return [...msgs, ...otimistasPendentes]
      })
      setError(null)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      if (
        abortRef.current === controller &&
        requestedFor === conversaIdRef.current &&
        requestedWorkspace === workspaceIdRef.current
      ) {
        setIsLoading(false)
      }
    }
  }, [enabled, conversaId, workspaceId])

  const addMensagemLocal = useCallback((msg: MensagemApi) => {
    setMensagens(prev => [...prev, msg])
  }, [])

  const removerMensagemLocal = useCallback((id: string) => {
    setMensagens(prev => prev.filter(m => m.id !== id))
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (!enabled || !conversaId || !workspaceId) {
        abortRef.current?.abort()
        setMensagens([])
        setError(null)
        setIsLoading(false)
        return
      }
      setMensagens([])
      setError(null)
      void fetchMensagens()
    })
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
  }, [enabled, conversaId, workspaceId, fetchMensagens])

  return { mensagens, isLoading, error, refetch: fetchMensagens, addMensagemLocal, removerMensagemLocal }
}

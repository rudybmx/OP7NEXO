'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

export interface Notificacao {
  id: string
  tipo: string
  severidade: 'info' | 'aviso' | 'critico'
  titulo: string
  mensagem: string | null
  link: string | null
  entidade_tipo: string | null
  entidade_id: string | null
  payload: Record<string, unknown> | null
  criado_em: string | null
  lida: boolean
}

// Com SSE ativo, o polling vira só um fallback lento; sem SSE, polling normal.
const POLL_SSE_MS = 120_000
const POLL_BASE_MS = 45_000

/** Sino + feed. SSE (realtime) com fallback de polling; tolerante a 400. */
export function useNotificacoes() {
  const { workspaceAtual } = useWorkspace()
  const qs = workspaceAtual ? `?workspace_id=${workspaceAtual}` : ''
  const [sseAtivo, setSseAtivo] = useState(false)
  const refreshInterval = sseAtivo ? POLL_SSE_MS : POLL_BASE_MS

  const { data: contador, mutate: mutateContador } = useSWR<{ nao_lidas: number }>(
    `/notificacoes/contador${qs}`,
    (p: string) => api.get(p),
    { refreshInterval, revalidateOnFocus: true, shouldRetryOnError: false },
  )

  const { data: lista, isLoading, mutate: mutateLista } = useSWR<Notificacao[]>(
    `/notificacoes${qs}`,
    (p: string) => api.get(p),
    { refreshInterval, revalidateOnFocus: true, shouldRetryOnError: false },
  )

  // ref "latest" evita stale closure no listener do EventSource (criado 1x por workspace).
  // Atualizada em effect (não no render) — respeita a regra react-hooks de refs.
  const revalidarRef = useRef<() => void>(() => {})
  useEffect(() => {
    revalidarRef.current = () => {
      void mutateContador()
      void mutateLista()
    }
  }, [mutateContador, mutateLista])

  // SSE: re-busca ao receber sinal. O evento NÃO carrega contagem/audiência —
  // o re-fetch passa pelos endpoints autenticados (audiência + leitura por usuário).
  useEffect(() => {
    if (!workspaceAtual || typeof window === 'undefined') return
    const es = new EventSource(`/api/notificacoes/stream?workspace_id=${workspaceAtual}`)
    es.addEventListener('ready', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data)
        setSseAtivo(d?.mode === 'sse')
      } catch {}
    })
    es.addEventListener('notificacao.refresh', () => revalidarRef.current())
    es.onerror = () => setSseAtivo(false) // cai para polling
    return () => {
      es.close()
      setSseAtivo(false)
    }
  }, [workspaceAtual])

  const naoLidas = contador?.nao_lidas ?? 0
  const notificacoes = lista ?? []

  async function marcarLida(id: string) {
    void mutateLista((cur) => (cur ?? []).map((n) => (n.id === id ? { ...n, lida: true } : n)), false)
    void mutateContador((c) => ({ nao_lidas: Math.max(0, (c?.nao_lidas ?? 1) - 1) }), false)
    try {
      await api.post(`/notificacoes/${id}/lida${qs}`)
    } finally {
      revalidarRef.current()
    }
  }

  async function marcarTodas() {
    void mutateLista((cur) => (cur ?? []).map((n) => ({ ...n, lida: true })), false)
    void mutateContador(() => ({ nao_lidas: 0 }), false)
    try {
      await api.post(`/notificacoes/marcar-todas-lidas${qs}`)
    } finally {
      revalidarRef.current()
    }
  }

  return { notificacoes, naoLidas, isLoading, sseAtivo, marcarLida, marcarTodas, refetch: () => revalidarRef.current() }
}

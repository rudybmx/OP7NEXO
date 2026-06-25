'use client'

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

// Polling no v1 (o backend já publica no Redis para um SSE futuro — ver redis_pub).
const POLL_MS = 45_000

/** Sino + feed. Tolerante a erro (platform_admin sem workspace → contador 0, sem retry). */
export function useNotificacoes() {
  const { workspaceAtual } = useWorkspace()
  const qs = workspaceAtual ? `?workspace_id=${workspaceAtual}` : ''

  const { data: contador, mutate: mutateContador } = useSWR<{ nao_lidas: number }>(
    `/notificacoes/contador${qs}`,
    (p: string) => api.get(p),
    { refreshInterval: POLL_MS, revalidateOnFocus: true, shouldRetryOnError: false },
  )

  const { data: lista, isLoading, mutate: mutateLista } = useSWR<Notificacao[]>(
    `/notificacoes${qs}`,
    (p: string) => api.get(p),
    { refreshInterval: POLL_MS, revalidateOnFocus: true, shouldRetryOnError: false },
  )

  const naoLidas = contador?.nao_lidas ?? 0
  const notificacoes = lista ?? []

  function revalidar() {
    void mutateContador()
    void mutateLista()
  }

  async function marcarLida(id: string) {
    void mutateLista((cur) => (cur ?? []).map((n) => (n.id === id ? { ...n, lida: true } : n)), false)
    void mutateContador((c) => ({ nao_lidas: Math.max(0, (c?.nao_lidas ?? 1) - 1) }), false)
    try {
      await api.post(`/notificacoes/${id}/lida${qs}`)
    } finally {
      revalidar()
    }
  }

  async function marcarTodas() {
    void mutateLista((cur) => (cur ?? []).map((n) => ({ ...n, lida: true })), false)
    void mutateContador(() => ({ nao_lidas: 0 }), false)
    try {
      await api.post(`/notificacoes/marcar-todas-lidas${qs}`)
    } finally {
      revalidar()
    }
  }

  return { notificacoes, naoLidas, isLoading, marcarLida, marcarTodas, refetch: revalidar }
}

'use client'

import { useEffect, useState } from 'react'
import type { ConversaApi } from './use-conversas'

/**
 * Busca UMA conversa por id (deep-link) quando ela não está no inbox carregado —
 * ex.: lead frio/antigo aberto a partir da tela de Follow-up. Só dispara quando
 * `conversaId` é passado (o chamador passa null se a conversa já está na lista).
 */
export function useConversaUnica(conversaId: string | null, workspaceId?: string, enabled = true) {
  const [conversa, setConversa] = useState<ConversaApi | null>(null)

  useEffect(() => {
    if (!enabled || !conversaId || !workspaceId) { setConversa(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/whatsapp/conversations/${conversaId}?workspace_id=${workspaceId}`)
        if (!res.ok) { if (!cancelled) setConversa(null); return }
        const data = await res.json()
        if (!cancelled) setConversa((data?.conversation as ConversaApi) ?? null)
      } catch {
        if (!cancelled) setConversa(null)
      }
    })()
    return () => { cancelled = true }
  }, [conversaId, workspaceId, enabled])

  return { conversa }
}

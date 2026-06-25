import Redis from 'ioredis'
import { resolveRedisUrl } from './redis-url'

// Espelha whatsapp-realtime.ts, mas para o canal de notificações in-app.
// O Python publica em `notifications:events` (ver app/services/redis_pub.py).
const NOTIFICACOES_EVENTS_CHANNEL = process.env.NOTIFICACOES_EVENTS_CHANNEL || 'notifications:events'

type NotificacaoRealtimeEvent = {
  type: string // ex.: 'notificacao.nova'
  workspaceId?: string | null
  tipo?: string | null
  id?: string | null
}

type Listener = (event: NotificacaoRealtimeEvent) => void

type RealtimeState = {
  sub: Redis | null
  listeners: Set<Listener>
  subscribed: boolean
  messageHandlerAttached: boolean
}

const globalState = globalThis as typeof globalThis & {
  __op7_nexoNotificacoesRealtimeState__?: RealtimeState
}

function getState(): RealtimeState {
  if (!globalState.__op7_nexoNotificacoesRealtimeState__) {
    globalState.__op7_nexoNotificacoesRealtimeState__ = {
      sub: null,
      listeners: new Set<Listener>(),
      subscribed: false,
      messageHandlerAttached: false,
    }
  }
  return globalState.__op7_nexoNotificacoesRealtimeState__
}

function getSubscriber(): Redis {
  const state = getState()
  if (state.sub) return state.sub

  state.sub = new Redis(resolveRedisUrl('notificacoes-realtime'), {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 100, 2000)
    },
  })

  state.sub.on('error', (error) => {
    console.error('[notificacoes-realtime] erro no subscriber Redis:', error.message)
  })

  return state.sub
}

async function ensureSubscribed() {
  const state = getState()
  const sub = getSubscriber()

  if (!state.messageHandlerAttached) {
    sub.on('message', (channel, rawMessage) => {
      if (channel !== NOTIFICACOES_EVENTS_CHANNEL) return
      try {
        const parsed = JSON.parse(rawMessage) as NotificacaoRealtimeEvent
        for (const listener of state.listeners) {
          listener(parsed)
        }
      } catch (error) {
        console.error('[notificacoes-realtime] falha ao parsear evento Redis:', error)
      }
    })
    state.messageHandlerAttached = true
  }

  if (!state.subscribed) {
    await sub.subscribe(NOTIFICACOES_EVENTS_CHANNEL)
    state.subscribed = true
  }
}

export async function subscribeToNotificacaoEvents(
  listener: Listener,
): Promise<{ unsubscribe: () => void; subscribed: boolean }> {
  const state = getState()
  state.listeners.add(listener)

  try {
    await ensureSubscribed()
    return {
      unsubscribe: () => {
        state.listeners.delete(listener)
      },
      subscribed: true,
    }
  } catch (error) {
    state.listeners.delete(listener)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export type { NotificacaoRealtimeEvent }

import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://default:t868uuo98kj2g9q0akmvlnf82elr1q6t@redis_wersun:6379'
const WHATSAPP_EVENTS_CHANNEL = process.env.WHATSAPP_EVENTS_CHANNEL || 'whatsapp:events'

type WhatsappRealtimeEvent = {
  type: 'message.upsert' | 'conversation.refresh'
  orgId?: string | null
  conversaId?: string | null
  remoteJid?: string | null
  direction?: 'entrada' | 'saida' | null
  text?: string | null
  instance?: string | null
  messageType?: string | null
  timestamp?: string | null
}

type Listener = (event: WhatsappRealtimeEvent) => void

type RealtimeState = {
  sub: Redis | null
  listeners: Set<Listener>
  subscribed: boolean
  messageHandlerAttached: boolean
}

const globalState = globalThis as typeof globalThis & {
  __wersunWhatsappRealtimeState__?: RealtimeState
}

function getState(): RealtimeState {
  if (!globalState.__wersunWhatsappRealtimeState__) {
    globalState.__wersunWhatsappRealtimeState__ = {
      sub: null,
      listeners: new Set<Listener>(),
      subscribed: false,
      messageHandlerAttached: false,
    }
  }

  return globalState.__wersunWhatsappRealtimeState__
}

function getSubscriber(): Redis {
  const state = getState()
  if (state.sub) return state.sub

  state.sub = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 100, 2000)
    },
  })

  state.sub.on('error', (error) => {
    console.error('[whatsapp-realtime] erro no subscriber Redis:', error.message)
  })

  return state.sub
}

async function ensureSubscribed() {
  const state = getState()
  const sub = getSubscriber()

  if (!state.messageHandlerAttached) {
    sub.on('message', (channel, rawMessage) => {
      if (channel !== WHATSAPP_EVENTS_CHANNEL) return

      try {
        const parsed = JSON.parse(rawMessage) as WhatsappRealtimeEvent
        for (const listener of state.listeners) {
          listener(parsed)
        }
      } catch (error) {
        console.error('[whatsapp-realtime] falha ao parsear evento Redis:', error)
      }
    })

    state.messageHandlerAttached = true
  }

  if (!state.subscribed) {
    await sub.subscribe(WHATSAPP_EVENTS_CHANNEL)
    state.subscribed = true
  }
}

export async function subscribeToWhatsappEvents(listener: Listener): Promise<() => void> {
  const state = getState()
  await ensureSubscribed()
  state.listeners.add(listener)

  return () => {
    state.listeners.delete(listener)
  }
}

export type { WhatsappRealtimeEvent }

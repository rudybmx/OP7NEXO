import type { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import { subscribeToWhatsappEvents, type WhatsappRealtimeEvent } from '@/lib/whatsapp-realtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const encoder = new TextEncoder()

function formatSse(payload: string, eventName?: string) {
  const lines = payload.split('\n').map((line) => `data: ${line}`).join('\n')
  return `${eventName ? `event: ${eventName}\n` : ''}${lines}\n\n`
}

function serializeEvent(event: WhatsappRealtimeEvent) {
  return JSON.stringify({
    type: event.type,
    conversaId: event.conversaId ?? null,
    remoteJid: event.remoteJid ?? null,
    direction: event.direction ?? null,
    text: event.text ?? null,
    instance: event.instance ?? null,
    messageType: event.messageType ?? null,
    timestamp: event.timestamp ?? null,
  })
}

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      let pingTimer: ReturnType<typeof setInterval> | null = null
      let unsubscribe: (() => void) | null = null

      const close = () => {
        if (closed) return
        closed = true
        if (pingTimer) clearInterval(pingTimer)
        if (unsubscribe) unsubscribe()
        try {
          controller.close()
        } catch {}
      }

      const send = (payload: string, eventName?: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(formatSse(payload, eventName)))
        } catch {
          close()
        }
      }

      send(JSON.stringify({ ok: true, mode: 'sse' }), 'ready')

      unsubscribe = await subscribeToWhatsappEvents((event) => {
        if (user.level !== 0) {
          if (!user.org_id || !event.orgId || event.orgId !== user.org_id) {
            return
          }
        }

        send(serializeEvent(event), 'whatsapp.refresh')
      })

      pingTimer = setInterval(() => {
        send(JSON.stringify({ ts: new Date().toISOString() }), 'ping')
      }, 15000)

      request.signal.addEventListener('abort', close)
    },
    cancel() {
      // cleanup acontece no abort/close acima
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

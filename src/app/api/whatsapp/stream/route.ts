import type { NextRequest } from 'next/server'
import { forbidden, getUserFromRequest, unauthorized } from '@/lib/api-auth'
import { subscribeToWhatsappEvents, type WhatsappRealtimeEvent } from '@/lib/whatsapp-realtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const API_BASE_URL = 'http://op7nexo-api:8000'

interface WorkspaceAccessRow {
  workspace_id?: string | null
}

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

  const url = new URL(request.url)
  const workspaceId = url.searchParams.get('workspace_id')
  if (!workspaceId) {
    return Response.json({ error: 'workspace_id é obrigatório para o stream.' }, { status: 400 })
  }

  const authHeader = request.headers.get('authorization') || ''
  const cookieToken = request.cookies.get('ws-session')?.value
  const tokenToForward = authHeader || (cookieToken ? `Bearer ${cookieToken}` : '')

  const allowedResponse = await fetch(`${API_BASE_URL}/me/workspaces`, {
    headers: { Authorization: tokenToForward },
    cache: 'no-store',
  })

  if (!allowedResponse.ok) {
    return Response.json(
      { error: 'Falha ao validar workspace.' },
      { status: allowedResponse.status }
    )
  }

  const allowedData = await allowedResponse.json().catch(() => [])
  const allowedWorkspaceIds = new Set(
    (Array.isArray(allowedData) ? allowedData as WorkspaceAccessRow[] : [])
      .map((row) => row.workspace_id)
      .filter(Boolean)
  )

  if (!allowedWorkspaceIds.has(workspaceId)) {
    return forbidden()
  }

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

      let readyMode: 'sse' | 'polling' = 'polling'
      try {
        const subscription = await subscribeToWhatsappEvents((event) => {
          if (!event.workspaceId || event.workspaceId !== workspaceId) {
            return
          }

          send(serializeEvent(event), 'whatsapp.refresh')
        })
        unsubscribe = subscription.unsubscribe
        readyMode = subscription.subscribed ? 'sse' : 'polling'
      } catch (error) {
        console.error('[API /whatsapp/stream] falha ao assinar Redis:', error instanceof Error ? error.message : error)
      }

      send(JSON.stringify({ ok: true, mode: readyMode }), 'ready')

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

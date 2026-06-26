import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'

type RouteContext = { params: Promise<{ id: string }> }

const API_BASE_URL = 'http://op7nexo-api:8000'

export const dynamic = 'force-dynamic'

// Disparo proativo do agente de IA (botão "Acionar IA"): encaminha à API FastAPI
// (POST /conversas/{id}/acionar-ia), que gera + envia a mensagem de reengajamento.
// Sem acesso direto ao DB (regra 2.2). Síncrono — a geração leva alguns segundos.
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params
    const resp = await fetch(`${API_BASE_URL}/conversas/${id}/acionar-ia`, {
      method: 'POST',
      headers: { Authorization: access.tokenToForward },
      cache: 'no-store',
    })

    const data = await resp.json().catch(() => null)
    if (!resp.ok) {
      return NextResponse.json(
        { error: data?.detail || data?.error || 'Erro ao acionar a IA' },
        { status: resp.status },
      )
    }
    return NextResponse.json(data ?? { ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}

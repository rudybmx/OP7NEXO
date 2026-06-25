import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'

const API_BASE_URL = 'http://op7nexo-api:8000'

type RouteContext = {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

// DELETE /api/whatsapp/conversations/{id} → repassa ao backend, que só exclui se a conversa
// estiver VAZIA (sem mensagens); senão o backend retorna 409 "Conversa não está vazia.".
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params

    const response = await fetch(`${API_BASE_URL}/conversas/${id}`, {
      method: 'DELETE',
      headers: { Authorization: access.tokenToForward },
      cache: 'no-store',
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: data.detail || data.error || 'Erro ao excluir conversa' },
        { status: response.status }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/conversations/[id] DELETE] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'

type RouteContext = { params: Promise<{ id: string }> }

const API_BASE_URL = 'http://op7nexo-api:8000'

export const dynamic = 'force-dynamic'

// Editar / excluir etiqueta — encaminha para a API FastAPI
// (PUT/DELETE /etiquetas/{id}); isolamento por workspace é feito no backend.
// Sem acesso direto ao DB (regra 2.2).

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params
    const body = await request.json().catch(() => ({})) as { nome?: string; cor?: string }

    const resp = await fetch(`${API_BASE_URL}/etiquetas/${id}`, {
      method: 'PUT',
      headers: { Authorization: access.tokenToForward, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: body.nome, cor: body.cor }),
    })

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '')
      return NextResponse.json({ error: detail || 'Erro' }, { status: resp.status })
    }
    const etiqueta = await resp.json()
    return NextResponse.json({ etiqueta })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params
    const resp = await fetch(`${API_BASE_URL}/etiquetas/${id}`, {
      method: 'DELETE',
      headers: { Authorization: access.tokenToForward },
    })

    if (resp.ok) return NextResponse.json({ ok: true })
    const detail = await resp.text().catch(() => '')
    return NextResponse.json({ error: detail || 'Erro' }, { status: resp.status })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}

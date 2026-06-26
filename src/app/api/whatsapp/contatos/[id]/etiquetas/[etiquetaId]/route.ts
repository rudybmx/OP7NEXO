import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'

type RouteContext = { params: Promise<{ id: string; etiquetaId: string }> }

const API_BASE_URL = 'http://op7nexo-api:8000'

export const dynamic = 'force-dynamic'

// Encaminha o vínculo etiqueta↔contato para a API FastAPI
// (POST/DELETE /contatos/{id}/etiquetas/{etiquetaId}); isolamento por workspace
// é feito no backend. Sem acesso direto ao DB (regra 2.2).
async function forward(method: 'POST' | 'DELETE', request: NextRequest, context: RouteContext) {
  const access = await resolveWhatsappWorkspaceAccess(request)
  if (access instanceof Response) return access

  const { id, etiquetaId } = await context.params
  const resp = await fetch(`${API_BASE_URL}/contatos/${id}/etiquetas/${etiquetaId}`, {
    method,
    headers: { Authorization: access.tokenToForward },
  })

  if (resp.ok) return NextResponse.json({ ok: true })
  const detail = await resp.text().catch(() => '')
  return NextResponse.json({ error: detail || 'Erro' }, { status: resp.status })
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    return await forward('POST', request, context)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    return await forward('DELETE', request, context)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}

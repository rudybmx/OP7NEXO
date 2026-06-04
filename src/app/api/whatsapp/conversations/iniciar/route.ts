import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess, normalizeWorkspaceId } from '@/lib/whatsapp-workspace-access'
import { formatarTelefoneBR } from '@/lib/formatar'

const API_BASE_URL = 'http://op7nexo-api:8000'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const body = await request.json()
    const { numero, workspace_id } = body

    if (!numero || typeof numero !== 'string' || numero.trim().length < 10) {
      return NextResponse.json(
        { error: 'Número inválido. Digite o DDD + número (mínimo 10 dígitos).' },
        { status: 400 }
      )
    }

    const workspaceId = normalizeWorkspaceId(typeof workspace_id === 'string' ? workspace_id : null)
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspace_id é obrigatório para iniciar conversa.' },
        { status: 400 }
      )
    }
    if (!access.allowedWorkspaceIds.has(workspaceId)) {
      return NextResponse.json(
        { error: 'Sem acesso a este workspace.' },
        { status: 403 }
      )
    }

    const response = await fetch(`${API_BASE_URL}/conversas/iniciar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: access.tokenToForward,
      },
      body: JSON.stringify({
        numero: numero.trim(),
        workspace_id: workspaceId,
      }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || data.error || 'Erro ao iniciar conversa' },
        { status: response.status }
      )
    }

    // Transforma resposta do backend para formato esperado pelo hook
    const conversa = data.conversa
    const contato = data.contato

    return NextResponse.json({
      conversa: {
        id: conversa.id,
        remoteJid: conversa.remote_jid,
        status: conversa.status,
        contato: {
          id: contato.id,
          nome: contato.push_name || contato.nome || formatarTelefoneBR(conversa.remote_jid?.split('@')[0]) || 'Contato',
          pushName: contato.push_name || null,
          telefone: contato.telefone || conversa.remote_jid?.split('@')[0]?.replace(/\D/g, ''),
          remoteJid: contato.jid,
        },
      },
      existente: data.existente,
    }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/conversations/iniciar] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

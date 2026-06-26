import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'

const API_BASE_URL = 'http://op7nexo-api:8000'

// POST /api/whatsapp/reagir — reage (ou remove) com emoji a uma mensagem, espelhando
// no WhatsApp. O canal vem do front (conversaAtiva.canalId); o dado passa pela API
// FastAPI (sem acesso direto ao banco).
export async function POST(request: NextRequest) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const payload = await request.json()
    const { conversa_id, target_evolution_msg_id, emoji, canal_id } = payload

    if (!conversa_id || !target_evolution_msg_id) {
      return NextResponse.json(
        { error: 'Informe conversa_id e target_evolution_msg_id' },
        { status: 400 }
      )
    }
    if (!canal_id) {
      return NextResponse.json(
        { error: 'canal_id não informado para a reação.' },
        { status: 400 }
      )
    }

    const response = await fetch(`${API_BASE_URL}/canais/${canal_id}/reagir`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': access.tokenToForward,
      },
      body: JSON.stringify({
        conversa_id,
        target_evolution_msg_id,
        emoji: emoji ?? '',
      }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.detail || 'Falha ao reagir', details: data },
        { status: response.status }
      )
    }
    return NextResponse.json({ ok: true, result: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

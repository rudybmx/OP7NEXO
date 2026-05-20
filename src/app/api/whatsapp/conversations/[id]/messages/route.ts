import { NextResponse } from 'next/server'
import { resolveWhatsappWorkspaceAccess, normalizeWorkspaceId } from '@/lib/whatsapp-workspace-access'
import type { NextRequest } from 'next/server'

const API_BASE_URL = 'http://op7nexo-api:8000'

export const dynamic = 'force-dynamic'

interface BackendMensagemRow {
  id: string
  direcao: 'entrada' | 'saida'
  conteudo?: string | null
  remetente_nome?: string | null
  remetente_tipo?: string | null
  enviada_em?: string | null
  recebida_em?: string | null
  criado_em?: string | null
  wa_status?: string | null
  message_type?: string | null
  participant_jid?: string | null
  participant_name?: string | null
  is_mentioned?: boolean | null
}

interface MensagemRespostaRow {
  id: string
  direcao: 'entrada' | 'saida'
  conteudo: string | null
  remetenteNome: string | null
  remetenteTipo: string | null
  enviadaEm: string | null
  recebidaEm: string | null
  criadaEm: string | null
  waStatus: string | null
  messageType: string | null
  participantJid: string | null
  participantName: string | null
  isMentioned: boolean
}

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params
    const url = new URL(request.url)
    const limitParam = Number(url.searchParams.get('limit') || '120')
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 120, 1), 300)
    const workspaceId = normalizeWorkspaceId(url.searchParams.get('workspace_id'))

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspace_id é obrigatório para listar mensagens.' },
        { status: 400 }
      )
    }
    if (!access.allowedWorkspaceIds.has(workspaceId)) {
      return NextResponse.json(
        { error: 'Sem acesso a este workspace.' },
        { status: 403 }
      )
    }

    // Chama backend Python
    const backendUrl = new URL(`${API_BASE_URL}/mensagens`)
    backendUrl.searchParams.set('conversa_id', id)
    backendUrl.searchParams.set('limit', String(limit))
    backendUrl.searchParams.set('workspace_id', workspaceId)

    const response = await fetch(backendUrl.toString(), {
      headers: { Authorization: access.tokenToForward },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      return NextResponse.json(
        { error: errorData?.detail || 'Erro ao buscar mensagens' },
        { status: response.status }
      )
    }

    const data = await response.json()
    const backendMensagens: BackendMensagemRow[] = Array.isArray(data) ? data : []

    const messages: MensagemRespostaRow[] = backendMensagens.reverse().map((row) => ({
      id: row.id,
      direcao: row.direcao,
      conteudo: row.conteudo,
      remetenteNome: row.remetente_nome,
      remetenteTipo: row.remetente_tipo,
      enviadaEm: row.enviada_em,
      recebidaEm: row.recebida_em,
      criadaEm: row.criado_em,
      waStatus: row.wa_status,
      messageType: row.message_type,
      participantJid: row.participant_jid || null,
      participantName: row.participant_name || null,
      isMentioned: row.is_mentioned || false,
    }))

    // Debug: log se há mensagens com conteúdo vazio
    const vazias = messages.filter((m) => !m.conteudo || m.conteudo === '')
    if (vazias.length > 0) {
      console.warn('[API /messages] mensagens com conteudo vazio:', vazias.length)
    }

    return NextResponse.json(
      { messages, source: 'api', count: messages.length },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/conversations/messages] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

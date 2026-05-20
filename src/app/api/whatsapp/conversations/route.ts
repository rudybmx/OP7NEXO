import { NextResponse } from 'next/server'
import { resolveWhatsappWorkspaceAccess, normalizeWorkspaceId } from '@/lib/whatsapp-workspace-access'
import type { NextRequest } from 'next/server'

const API_BASE_URL = 'http://op7nexo-api:8000'

export const dynamic = 'force-dynamic'

interface BackendConversaRow {
  id: string
  instance?: string | null
  remote_jid: string
  status: string
  nao_lidas?: number | null
  ultima_mensagem?: string | null
  ultima_msg_at?: string | null
  agente?: string | null
  campanha?: string | null
  is_group?: boolean | null
  group_name?: string | null
  group_avatar_url?: string | null
  contato_id: string
  contato_nome?: string | null
  contato_avatar_url?: string | null
  contato_campanha_origem?: string | null
  contato_meta_headline?: string | null
  contato_meta_body?: string | null
  contato_meta_image_url?: string | null
  contato_meta_source_url?: string | null
  contato_utm_source?: string | null
  contato_utm_medium?: string | null
  contato_primeira_conversa_at?: string | null
  equipe_id?: string | null
  equipe_nome?: string | null
  responsavel_id?: string | null
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function formatPhone(telefone: string | null, remoteJid: string) {
  const digits = telefone || remoteJid?.split('@')[0]?.replace(/\D/g, '') || remoteJid || ''
  if (!digits.startsWith('55') || digits.length < 12) return digits
  return `+55 ${digits.slice(2, 4)} ${digits.slice(4)}`
}

export async function GET(request: NextRequest) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const url = new URL(request.url)
    const limitParam = Number(url.searchParams.get('limit') || '80')
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 80, 1), 200)
    const instance = url.searchParams.get('instance')
    const workspaceIdParam = normalizeWorkspaceId(url.searchParams.get('workspace_id'))
    const filtro = url.searchParams.get('filtro')
    const equipeIdParam = url.searchParams.get('equipe_id')

    if (!workspaceIdParam) {
      return NextResponse.json(
        { error: 'workspace_id é obrigatório para listar conversas.' },
        { status: 400 }
      )
    }
    if (!access.allowedWorkspaceIds.has(workspaceIdParam)) {
      return NextResponse.json(
        { error: 'Sem acesso a este workspace.' },
        { status: 403 }
      )
    }

    // Monta query params para backend Python
    const backendUrl = new URL(`${API_BASE_URL}/conversas`)
    backendUrl.searchParams.set('limit', String(limit))
    backendUrl.searchParams.set('workspace_id', workspaceIdParam)
    if (instance) backendUrl.searchParams.set('instance', instance)
    if (filtro) backendUrl.searchParams.set('status', filtro)
    if (equipeIdParam) backendUrl.searchParams.set('equipe_id', equipeIdParam)

    const response = await fetch(backendUrl.toString(), {
      headers: { Authorization: access.tokenToForward },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      return NextResponse.json(
        { error: errorData?.detail || 'Erro ao buscar conversas' },
        { status: response.status }
      )
    }

    const data = await response.json()
    const backendConversas: BackendConversaRow[] = Array.isArray(data) ? data : []

      // Transforma resposta do backend para formato do frontend
    const conversations = backendConversas.map((row) => ({
      id: row.id,
      instance: row.instance,
      remoteJid: row.remote_jid,
      status: row.status,
      iaAtiva: true, // legado, removido do schema
      naoLidas: row.nao_lidas || 0,
      ultimaMensagem: row.ultima_mensagem || '',
      ultimaMensagemAt: iso(row.ultima_msg_at),
      agente: row.agente || 'Op7 Nexo',
      campanha: row.campanha,
      canal: 'whatsapp',
      tags: ['WhatsApp', 'Evolution'],
      responsavelId: row.responsavel_id,
      isGroup: row.is_group || false,
      groupName: row.group_name || null,
      groupAvatarUrl: row.group_avatar_url || null,
      contato: {
        id: row.contato_id,
        nome: row.contato_nome || formatPhone(null, row.remote_jid),
        telefone: formatPhone(null, row.remote_jid),
        remoteJid: row.remote_jid,
        numeroEvo: null,
        avatarUrl: row.contato_avatar_url || null,
        campanhaOrigem: row.contato_campanha_origem || null,
        metaHeadline: row.contato_meta_headline || null,
        metaBody: row.contato_meta_body || null,
        metaImageUrl: row.contato_meta_image_url || null,
        metaSourceUrl: row.contato_meta_source_url || null,
        utmSource: row.contato_utm_source || null,
        utmMedium: row.contato_utm_medium || null,
        primeiraConversaAt: iso(row.contato_primeira_conversa_at),
      },
      equipe: row.equipe_id
        ? { id: row.equipe_id, nome: row.equipe_nome, membrosCount: 0 }
        : null,
      mensagens: [], // mensagens são carregadas sob demanda no painel de chat
    }))

    return NextResponse.json(
      {
        conversations,
        source: 'api',
        count: conversations.length,
      },
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
    console.error('[API /whatsapp/conversations] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

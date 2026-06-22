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
  delivered_at?: string | null
  read_at?: string | null
  failed_reason?: string | null
  media_status?: string | null
  media_error?: string | null
  media_kind?: string | null
  media_mimetype?: string | null
  media_filename?: string | null
  media_caption?: string | null
  media_gif?: boolean | null
  message_type?: string | null
  participant_jid?: string | null
  participant_name?: string | null
  is_mentioned?: boolean | null
  mentioned_jids?: string[] | null
  quoted_message_id?: string | null
  quoted_remote_jid?: string | null
  quoted_message_type?: string | null
  quoted_text?: string | null
  midias?: Array<{
    id: string
    tipo?: string | null
    url?: string | null
    minio_path?: string | null
    mimetype?: string | null
    filename?: string | null
    caption?: string | null
    storage_status?: string | null
    duration_seconds?: number | null
  }>
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
  deliveredAt: string | null
  readAt: string | null
  failedReason: string | null
  messageType: string | null
  mediaUrl: string | null
  mediaStatus: string | null
  mediaError: string | null
  mediaKind: string | null
  mediaMimetype: string | null
  mediaFilename: string | null
  mediaCaption: string | null
  mediaGif: boolean
  midias: Array<{
    id: string
    tipo: string
    url: string | null
    minioPath: string | null
    mimetype: string | null
    filename: string | null
    caption: string | null
    storageStatus: string | null
    durationSeconds: number | null
  }>
  participantJid: string | null
  participantName: string | null
  isMentioned: boolean
  mentionedJids: string[]
  quotedText: string | null
  quotedAuthor: string | null
  quotedRemoteJid: string | null
  quotedMessageId: string | null
  quotedMessageType: string | null
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

    const messages: MensagemRespostaRow[] = backendMensagens.reverse().map((row) => {
      const midias = (row.midias || []).map(media => ({
        id: media.id,
        tipo: media.tipo || 'document',
        url: media.minio_path
          ? `/api/whatsapp/media/file?path=${encodeURIComponent(media.minio_path)}`
          : media.url || null,
        minioPath: media.minio_path || null,
        mimetype: media.mimetype || null,
        filename: media.filename || null,
        caption: media.caption || null,
        storageStatus: media.storage_status || null,
        durationSeconds: media.duration_seconds || null,
      }))
      return {
        id: row.id,
        direcao: row.direcao,
        conteudo: row.conteudo ?? null,
        remetenteNome: row.remetente_nome ?? null,
        remetenteTipo: row.remetente_tipo ?? null,
        enviadaEm: row.enviada_em ?? null,
        recebidaEm: row.recebida_em ?? null,
        criadaEm: row.criado_em ?? null,
        waStatus: row.wa_status ?? null,
        deliveredAt: row.delivered_at || null,
        readAt: row.read_at || null,
        failedReason: row.failed_reason || null,
        messageType: row.message_type ?? null,
        mediaUrl: midias[0]?.url || null,
        mediaStatus: row.media_status || null,
        mediaError: row.media_error || null,
        mediaKind: row.media_kind ?? null,
        mediaMimetype: row.media_mimetype ?? null,
        mediaFilename: row.media_filename ?? null,
        mediaCaption: row.media_caption ?? null,
        mediaGif: row.media_gif || false,
        midias,
        participantJid: row.participant_jid || null,
        participantName: row.participant_name || null,
        isMentioned: row.is_mentioned || false,
        mentionedJids: row.mentioned_jids || [],
        quotedText: row.quoted_text ?? null,
        quotedAuthor: null,
        quotedRemoteJid: row.quoted_remote_jid ?? null,
        quotedMessageId: row.quoted_message_id ?? null,
        quotedMessageType: row.quoted_message_type ?? null,
      }
    })

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

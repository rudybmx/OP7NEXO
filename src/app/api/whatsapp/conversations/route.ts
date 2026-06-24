import { NextResponse } from 'next/server'
import { resolveWhatsappWorkspaceAccess, normalizeWorkspaceId } from '@/lib/whatsapp-workspace-access'
import { getCanalTags } from '@/lib/whatsapp-canal'
import { formatarTelefoneBR } from '@/lib/formatar'
import type { NextRequest } from 'next/server'

const API_BASE_URL = 'http://op7nexo-api:8000'

export const dynamic = 'force-dynamic'

interface BackendConversaRow {
  id: string
  workspace_id?: string
  canal_id?: string | null
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
  contato_push_name?: string | null
  contato_avatar_url?: string | null
  contato_telefone?: string | null
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
  lead_status?: string | null
  followup_due_at?: string | null
  last_inbound_at?: string | null
  last_outbound_at?: string | null
  favorita?: boolean | null
  fixada?: boolean | null
  ai_ativo?: boolean | null
  etiquetas?: Array<{ id: string; nome: string; cor: string }> | null
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function isGroupJid(jid?: string | null) { return !!jid?.endsWith('@g.us') }
function jidDigits(jid?: string | null) { return jid?.split('@')[0]?.replace(/\D/g, '') ?? '' }
function isRealPhoneJid(jid?: string | null) {
  return !!jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us'))
}

function isJidLike(value: string): boolean {
  const text = value.trim().toLowerCase()
  return text.includes('@') && (
    text.endsWith('@s.whatsapp.net') ||
    text.endsWith('@c.us') ||
    text.endsWith('@g.us') ||
    text.endsWith('@lid')
  )
}

function isRawPhoneName(value: string, remoteJid?: string | null): boolean {
  const compact = value.replace(/[\s()+.-]/g, '')
  const digits = value.replace(/\D/g, '')
  if (!digits || compact !== digits) return false
  const jid = jidDigits(remoteJid)
  return !jid || digits === jid || isValidBrDigits(digits)
}

function isValidDisplayName(value: string | null | undefined, remoteJid?: string | null): value is string {
  const text = value?.trim()
  if (!text) return false
  const lower = text.toLowerCase()
  if (lower === 'contato' || lower === 'contato whatsapp') return false
  if (isJidLike(text) || lower.includes('@lid')) return false
  if (isRawPhoneName(text, remoteJid)) return false
  return true
}

function resolveContactNome(
  contato_push_name: string | null | undefined,
  contato_nome: string | null | undefined,
  remote_jid: string | null | undefined,
  group_name: string | null | undefined,
  contato_telefone?: string | null,
): string {
  const jid = remote_jid ?? ''
  if (isGroupJid(jid)) return group_name?.trim() || 'Grupo WhatsApp'
  if (isValidDisplayName(contato_push_name, jid)) return contato_push_name.trim()
  if (isValidDisplayName(contato_nome, jid)) return contato_nome.trim()
  if (isRealPhoneJid(jid)) return formatarTelefoneBR(jid.split('@')[0]) || 'Contato'
  if (contato_telefone) {
    return formatarTelefoneBR(contato_telefone) || 'Contato'
  }
  return 'Contato'
}

function isValidBrDigits(digits: string): boolean {
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
}

function resolveContactTelefone(
  remote_jid: string | null | undefined,
  contato_telefone?: string | null,
): string | null {
  // 1. JID de telefone real (@s.whatsapp.net ou @c.us) → extrair dali
  if (isRealPhoneJid(remote_jid)) {
    const digits = jidDigits(remote_jid)
    if (digits) return digits
  }
  // 2. Fallback: contato.telefone do banco — devolve os dígitos canônicos que existirem
  if (contato_telefone) {
    const digits = contato_telefone.replace(/\D/g, '')
    if (digits) return digits
  }
  // 3. @lid ou qualquer outro JID sem telefone real → null
  return null
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
    const canalIdParam = url.searchParams.get('canal_id')
    const equipeIdParam = url.searchParams.get('equipe_id')
    const etiquetaIds = url.searchParams.getAll('etiqueta_ids')
    // --- filtros V2 (server-side): só ativos quando o front sinaliza v2=1 ---
    const isV2 = url.searchParams.get('v2') === '1'
    const escopoParam = url.searchParams.get('escopo')
    const acompanhamentoParam = url.searchParams.get('acompanhamento')
    const tipoParam = url.searchParams.get('tipo')
    const arquivadasParam = url.searchParams.get('arquivadas') // 'true' | 'false' | null
    const naoLidasParam = url.searchParams.get('nao_lidas')     // 'true' | null
    const responsavelIdParam = url.searchParams.get('responsavel_id')

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
    // etiqueta_ids é ortogonal ao modo => repassado nos dois caminhos.
    etiquetaIds.forEach(id => backendUrl.searchParams.append('etiqueta_ids', id))
    if (isV2) {
      // V2: o backend filtra tudo (antes do limit) => paginação correta. Repasse direto.
      if (canalIdParam) backendUrl.searchParams.set('canal_id', canalIdParam)
      if (equipeIdParam) backendUrl.searchParams.set('equipe_id', equipeIdParam)
      if (responsavelIdParam) backendUrl.searchParams.set('responsavel_id', responsavelIdParam)
      if (escopoParam) backendUrl.searchParams.set('escopo', escopoParam)
      if (acompanhamentoParam) backendUrl.searchParams.set('acompanhamento', acompanhamentoParam)
      if (tipoParam) backendUrl.searchParams.set('tipo', tipoParam)
      // arquivadas é tri-state: V2 sempre envia (false=exclui resolvidas; true=só arquivadas)
      backendUrl.searchParams.set('arquivadas', arquivadasParam === 'true' ? 'true' : 'false')
      if (naoLidasParam === 'true') backendUrl.searchParams.set('nao_lidas', 'true')
    } else {
      if (filtro === 'novas') backendUrl.searchParams.set('status', 'nova')
      else if (filtro === 'resgate') backendUrl.searchParams.set('status', 'resgate')
      else if (filtro === 'resolvidas') backendUrl.searchParams.set('status', 'resolvido')
      else if (filtro === 'minhas') backendUrl.searchParams.set('responsavel_id', access.user.id)
      else if (filtro && !['todas', 'grupos', 'equipe'].includes(filtro)) backendUrl.searchParams.set('status', filtro)
      if (equipeIdParam) backendUrl.searchParams.set('equipe_id', equipeIdParam)
    }

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
    // V2: backend já filtrou (antes do limit) => usa direto, sem refiltrar pós-página.
    const isResolvidas = filtro === 'resolvidas'
    const filteredRows = isV2 ? backendConversas : backendConversas.filter(row => {
      if (canalIdParam && row.canal_id !== canalIdParam) return false
      if (isResolvidas) {
        if (row.status !== 'resolvido') return false
      } else if (row.status === 'resolvido') {
        return false
      }
      if (filtro === 'grupos' && !row.is_group) return false
      if (filtro === 'equipe' && (!row.equipe_id || row.responsavel_id === access.user.id)) return false
      return true
    })

    const channelIds = [...new Set(filteredRows.map(row => row.canal_id).filter(Boolean) as string[])]
    const channelById = new Map<string, { nome?: string | null; numero_telefone?: string | null; tipo?: string | null }>()
    if (channelIds.length > 0) {
      const channelsResponse = await fetch(`${API_BASE_URL}/workspaces/${workspaceIdParam}/canais`, {
        headers: { Authorization: access.tokenToForward },
        cache: 'no-store',
      })
      if (channelsResponse.ok) {
        const channels = await channelsResponse.json().catch(() => [])
        if (Array.isArray(channels)) {
          for (const channel of channels) {
            if (channel?.id) channelById.set(channel.id, channel)
          }
        }
      }
    }

    const conversations = filteredRows.map((row) => {
      const channel = row.canal_id ? channelById.get(row.canal_id) : null
      const hasOverdueFollowup = row.followup_due_at ? new Date(row.followup_due_at).getTime() < Date.now() : false
      return {
      id: row.id,
      workspaceId: row.workspace_id || workspaceIdParam,
      canalId: row.canal_id || null,
      instance: row.instance,
      remoteJid: row.remote_jid,
      status: row.status,
      iaAtiva: row.ai_ativo ?? false,
      naoLidas: row.nao_lidas || 0,
      ultimaMensagem: row.ultima_mensagem || '',
      ultimaMensagemAt: iso(row.ultima_msg_at),
      agente: row.agente || 'Op7 Nexo',
      campanha: row.campanha,
      canal: 'whatsapp',
      canalNome: channel?.nome || null,
      canalNumero: channel?.numero_telefone || null,
      canalTipo: channel?.tipo || null,
      tags: getCanalTags(channel?.tipo),
      responsavelId: row.responsavel_id,
      leadStatus: row.lead_status || null,
      followupDueAt: iso(row.followup_due_at),
      lastInboundAt: iso(row.last_inbound_at),
      lastOutboundAt: iso(row.last_outbound_at),
      badges: {
        mentioned: false,
        hasMedia: false,
        overdueFollowup: hasOverdueFollowup,
      },
      isGroup: row.is_group || false,
      groupName: row.group_name || null,
      groupAvatarUrl: row.group_avatar_url || row.contato_avatar_url || null,
      contato: {
        id: row.contato_id,
        nome: resolveContactNome(row.contato_push_name, row.contato_nome, row.remote_jid, row.group_name, row.contato_telefone),
        pushName: row.contato_push_name || null,
        telefone: resolveContactTelefone(row.remote_jid, row.contato_telefone),
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
      favorita: row.favorita ?? false,
      fixada: row.fixada ?? false,
      etiquetas: row.etiquetas ?? [],
      mensagens: [], // mensagens são carregadas sob demanda no painel de chat
    }})

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

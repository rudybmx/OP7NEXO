import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess, normalizeWorkspaceId } from '@/lib/whatsapp-workspace-access'
import { getCanalTags } from '@/lib/whatsapp-canal'
import { formatarTelefoneBR } from '@/lib/formatar'

const API_BASE_URL = 'http://op7nexo-api:8000'

type RouteContext = {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento de UMA conversa (ConversaOut do backend → shape ConversaApi do front).
// ⚠️ Espelha o mapeamento de `conversations/route.ts` (lista). Duplicado de PROPÓSITO:
// a rota da lista é o caminho crítico do inbox e não deve ser tocada por este fix.
// Mantenha em sincronia se a lista mudar.
// ─────────────────────────────────────────────────────────────────────────────
interface BackendConversaRow {
  id: string
  workspace_id?: string
  canal_id?: string | null
  instance?: string | null
  remote_jid: string
  status: string
  nao_lidas?: number | null
  marcada_nao_lida?: boolean | null
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
  ai_escalado?: boolean | null
  ai_handoff_motivo?: string | null
  resumo_ia?: string | null
  contexto_ia?: {
    temperatura?: string | null
    temperatura_score?: number | null
    interesse?: string | null
    observacoes?: string | null
  } | null
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
    text.endsWith('@s.whatsapp.net') || text.endsWith('@c.us') ||
    text.endsWith('@g.us') || text.endsWith('@lid')
  )
}
function isValidBrDigits(digits: string): boolean {
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
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
  if (contato_telefone) return formatarTelefoneBR(contato_telefone) || 'Contato'
  return 'Contato'
}
function resolveContactTelefone(
  remote_jid: string | null | undefined,
  contato_telefone?: string | null,
): string | null {
  if (isRealPhoneJid(remote_jid)) {
    const digits = jidDigits(remote_jid)
    if (digits) return digits
  }
  if (contato_telefone) {
    const digits = contato_telefone.replace(/\D/g, '')
    if (digits) return digits
  }
  return null
}

type Channel = { nome?: string | null; numero_telefone?: string | null; tipo?: string | null }

function mapConversaRow(row: BackendConversaRow, workspaceId: string, channel: Channel | null) {
  const hasOverdueFollowup = row.followup_due_at ? new Date(row.followup_due_at).getTime() < Date.now() : false
  return {
    id: row.id,
    workspaceId: row.workspace_id || workspaceId,
    canalId: row.canal_id || null,
    instance: row.instance,
    remoteJid: row.remote_jid,
    status: row.status,
    iaAtiva: row.ai_ativo ?? false,
    aiEscalado: row.ai_escalado ?? false,
    aiHandoffMotivo: row.ai_handoff_motivo ?? null,
    resumoIa: row.resumo_ia ?? null,
    temperatura: row.contexto_ia?.temperatura ?? null,
    temperaturaScore: row.contexto_ia?.temperatura_score ?? null,
    interesse: row.contexto_ia?.interesse ?? null,
    observacoes: row.contexto_ia?.observacoes ?? null,
    naoLidas: row.nao_lidas || 0,
    marcadaNaoLida: row.marcada_nao_lida ?? false,
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
    badges: { mentioned: false, hasMedia: false, overdueFollowup: hasOverdueFollowup },
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
    equipe: row.equipe_id ? { id: row.equipe_id, nome: row.equipe_nome, membrosCount: 0 } : null,
    favorita: row.favorita ?? false,
    fixada: row.fixada ?? false,
    etiquetas: row.etiquetas ?? [],
    mensagens: [],
  }
}

// GET /api/whatsapp/conversations/{id}?workspace_id= → uma conversa única (deep-link de
// conversa fora do inbox carregado, ex.: lead frio no Follow-up).
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params
    const url = new URL(request.url)
    const workspaceId = normalizeWorkspaceId(url.searchParams.get('workspace_id'))
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspace_id é obrigatório.' }, { status: 400 })
    }
    if (!access.allowedWorkspaceIds.has(workspaceId)) {
      return NextResponse.json({ error: 'Sem acesso a este workspace.' }, { status: 403 })
    }

    const response = await fetch(`${API_BASE_URL}/conversas/${id}`, {
      headers: { Authorization: access.tokenToForward },
      cache: 'no-store',
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: data.detail || data.error || 'Conversa não encontrada' },
        { status: response.status },
      )
    }
    const row: BackendConversaRow = await response.json()

    // Enriquecimento do canal (nome/tipo) — mesmo padrão da lista.
    let channel: Channel | null = null
    if (row.canal_id) {
      const ch = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/canais`, {
        headers: { Authorization: access.tokenToForward },
        cache: 'no-store',
      })
      if (ch.ok) {
        const canais = await ch.json().catch(() => [])
        if (Array.isArray(canais)) channel = canais.find((c) => c?.id === row.canal_id) || null
      }
    }

    return NextResponse.json(
      { conversation: mapConversaRow(row, workspaceId, channel) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/conversations/[id] GET] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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

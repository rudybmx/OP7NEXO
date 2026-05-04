import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSql } from '@/lib/db'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

type DbMensagem = {
  id: string
  evolution_msg_id: string | null
  instance: string
  remote_jid: string
  direcao: 'entrada' | 'saida'
  from_me: boolean
  remetente_nome: string | null
  conteudo: string
  message_type: string | null
  enviada_em: Date | string | null
  recebida_em: Date | string | null
  payload?: Record<string, unknown> | null
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString()
  if (value instanceof Date) return value.toISOString()
  return value
}

function toEpochSeconds(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date()
  const time = date.getTime()
  return Number.isNaN(time) ? Math.floor(Date.now() / 1000) : Math.floor(time / 1000)
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return unauthorized()

    const url = new URL(request.url)
    const limitParam = Number(url.searchParams.get('limit') || '300')
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 300, 1), 1000)
    const since = url.searchParams.get('since')

    const db = getSql()
    const orgFilter = user.level === 0 ? db`` : db`AND c.org_id = ${user.org_id || null}::uuid`

    const rows = since
      ? await db<DbMensagem[]>`
          SELECT
            m.id,
            m.evolution_msg_id,
            m.instance,
            m.remote_jid,
            m.direcao,
            m.from_me,
            m.remetente_nome,
            m.conteudo,
            m.message_type,
            m.enviada_em,
            m.recebida_em
          FROM public.crm_whatsapp_mensagens m
          JOIN public.crm_whatsapp_conversas c ON c.id = m.conversa_id
          WHERE COALESCE(m.enviada_em, m.recebida_em) >= ${since}::timestamptz
            ${orgFilter}
          ORDER BY COALESCE(m.enviada_em, m.recebida_em) DESC
          LIMIT ${limit}
        `
      : await db<DbMensagem[]>`
          SELECT
            m.id,
            m.evolution_msg_id,
            m.instance,
            m.remote_jid,
            m.direcao,
            m.from_me,
            m.remetente_nome,
            m.conteudo,
            m.message_type,
            m.enviada_em,
            m.recebida_em
          FROM public.crm_whatsapp_mensagens m
          JOIN public.crm_whatsapp_conversas c ON c.id = m.conversa_id
          WHERE TRUE
            ${orgFilter}
          ORDER BY COALESCE(m.enviada_em, m.recebida_em) DESC
          LIMIT ${limit}
        `

    const messages = rows
      .reverse()
      .map((row) => {
        const when = row.enviada_em || row.recebida_em
        return {
          event: 'messages.upsert',
          instance: row.instance,
          direction: row.direcao === 'saida' ? 'outbound' : undefined,
          text: row.conteudo,
          _received_at: toIso(row.recebida_em || row.enviada_em),
          data: {
            key: {
              remoteJid: row.remote_jid,
              fromMe: row.from_me,
              id: row.evolution_msg_id || row.id,
            },
            pushName: row.remetente_nome || undefined,
            message: {
              conversation: row.conteudo,
            },
            messageType: row.message_type || 'conversation',
            messageTimestamp: toEpochSeconds(when),
          },
        }
      })

    return NextResponse.json({ messages, source: 'postgres', count: messages.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

type DbConversation = {
  id: string
  instance: string
  remote_jid: string
  status: 'nova' | 'em_atendimento' | 'aguardando' | 'resolvida' | 'arquivada'
  ia_ativa: boolean
  nao_lidas: number
  ultima_mensagem: string | null
  ultima_msg_at: Date | string | null
  agente: string | null
  campanha: string | null
  contato_id: string
  telefone: string | null
  contato_nome: string | null
  avatar_url: string | null
  tags: string[] | null
  equipe_id: string | null
  equipe_nome: string | null
  equipe_membros_count: number | null
  responsavel_id: string | null
  mensagens: Array<{
    id: string
    direcao: 'entrada' | 'saida'
    conteudo: string
    remetenteNome: string | null
    remetenteTipo: 'contato' | 'agente' | 'ia' | 'sistema'
    enviadaEm: string | null
    recebidaEm: string | null
    criadaEm: string | null
  }>
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function formatPhone(telefone: string | null, remoteJid: string) {
  const digits = telefone || remoteJid.split('@')[0]?.replace(/\D/g, '') || remoteJid
  if (!digits.startsWith('55') || digits.length < 12) return digits
  return `+55 ${digits.slice(2, 4)} ${digits.slice(4)}`
}

export async function GET(request: NextRequest) {
  try {
    // --- Autenticação ---
    const user = await getUserFromRequest(request)
    if (!user) return unauthorized()

    // --- Parâmetros ---
    const url = new URL(request.url)
    const limitParam = Number(url.searchParams.get('limit') || '80')
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 80, 1), 200)
    const instance = url.searchParams.get('instance') || 'opcl'
    const filtro = url.searchParams.get('filtro')
    const equipeIdParam = url.searchParams.get('equipe_id')

    const db = getSql()

    // --- Monta query base (SELECT / FROM / JOINs) ---
    let query = db`
      SELECT
        c.id::text,
        c.instance,
        c.remote_jid,
        c.status,
        c.ia_ativa,
        c.nao_lidas,
        c.ultima_mensagem,
        c.ultima_msg_at,
        c.agente,
        c.campanha,
        c.responsavel_id::text,
        ct.id::text AS contato_id,
        ct.telefone,
        COALESCE(ct.nome, ct.push_name, ct.telefone, ct.jid) AS contato_nome,
        ct.avatar_url,
        ct.tags,
        e.id::text AS equipe_id,
        e.nome AS equipe_nome,
        (SELECT COUNT(*) FROM public.crm_whatsapp_equipe_membros em WHERE em.equipe_id = c.equipe_id)::int AS equipe_membros_count,
        COALESCE(msgs.mensagens, '[]'::jsonb) AS mensagens
      FROM public.crm_whatsapp_conversas c
      JOIN public.crm_whatsapp_contatos ct ON ct.id = c.contato_id
      LEFT JOIN public.crm_whatsapp_equipes e ON e.id = c.equipe_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', m.id::text,
            'direcao', m.direcao,
            'conteudo', m.conteudo,
            'messageType', m.message_type,
            'remetenteNome', m.remetente_nome,
            'remetenteTipo', m.remetente_tipo,
            'enviadaEm', m.enviada_em,
            'recebidaEm', m.recebida_em,
            'criadaEm', m.created_at,
            'mediaUrl', CASE 
              WHEN m.message_type IN ('imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage','ptvMessage')
              THEN (SELECT '/api/whatsapp/media/file?path=' || md.minio_path 
                    FROM public.crm_whatsapp_midia md 
                    WHERE md.conversa_id = m.conversa_id 
                      AND md.created_at >= m.recebida_em - interval '5 seconds'
                      AND md.created_at <= m.recebida_em + interval '5 seconds'
                    ORDER BY md.created_at DESC LIMIT 1)
              ELSE NULL
            END
          )
          ORDER BY COALESCE(m.enviada_em, m.recebida_em, m.created_at) ASC
        ) AS mensagens
        FROM (
          SELECT *
          FROM public.crm_whatsapp_mensagens mx
          WHERE mx.conversa_id = c.id
          ORDER BY COALESCE(mx.enviada_em, mx.recebida_em, mx.created_at) DESC
          LIMIT 120
        ) m
      ) msgs ON true
      WHERE c.instance = ${instance}
    `

    // --- RBAC: filtro de visibilidade ---
    if (user.level === 0) {
      // Superadmin: vê tudo, sem restrições adicionais
    } else {
      // Busca equipes do usuário
      const membros = await db<{ equipe_id: string }[]>`
        SELECT equipe_id FROM public.crm_whatsapp_equipe_membros WHERE user_id = ${user.id}
      `
      const teamIds = membros.map((m) => m.equipe_id)

      // Busca permissões extras de visibilidade
      const perms = await db<{
        pode_ver_outras_equipes: boolean
        equipes_visiveis: string[] | null
      }[]>`
        SELECT pode_ver_outras_equipes, equipes_visiveis
        FROM public.crm_whatsapp_permissoes
        WHERE user_id = ${user.id}
      `

      // Constrói conjunto de equipes visíveis
      const visibleTeamIds = new Set<string>(teamIds)
      if (perms.length > 0 && perms[0].pode_ver_outras_equipes && perms[0].equipes_visiveis) {
        for (const tid of perms[0].equipes_visiveis) {
          visibleTeamIds.add(tid)
        }
      }

      if (visibleTeamIds.size > 0) {
        const ids = Array.from(visibleTeamIds)
        // Vê conversas das suas equipes OU onde é o responsável
        query = db`${query} AND (c.equipe_id = ANY(${ids}::uuid[]) OR c.responsavel_id = ${user.id}::uuid)`
      } else {
        // Sem equipes: vê apenas conversas próprias
        query = db`${query} AND c.responsavel_id = ${user.id}::uuid`
      }
    }

    // --- Filtro por status/atribuição ---
    if (filtro === 'novos') {
      query = db`${query} AND c.status = 'nova' AND c.responsavel_id IS NULL`
    } else if (filtro === 'meus') {
      query = db`${query} AND c.responsavel_id = ${user.id}::uuid`
    } else if (filtro === 'outros') {
      // Conversas visíveis atribuídas a outros agentes (não ao usuário atual)
      query = db`${query} AND c.responsavel_id IS NOT NULL AND c.responsavel_id != ${user.id}::uuid`
    }
    // 'todos' ou valor inválido: sem filtro adicional

    // --- Filtro por equipe específica ---
    if (equipeIdParam) {
      query = db`${query} AND c.equipe_id = ${equipeIdParam}::uuid`
    }

    // --- Ordenação e limite ---
    query = db`${query} ORDER BY c.ultima_msg_at DESC NULLS LAST, c.updated_at DESC LIMIT ${limit}`

    const rows = (await query) as DbConversation[]

    // --- Mapeamento da resposta ---
    const conversations = rows.map((row) => ({
      id: row.id,
      instance: row.instance,
      remoteJid: row.remote_jid,
      status: row.status,
      iaAtiva: row.ia_ativa,
      naoLidas: row.nao_lidas,
      ultimaMensagem: row.ultima_mensagem || '',
      ultimaMensagemAt: iso(row.ultima_msg_at),
      agente: row.agente || 'Wersun',
      campanha: row.campanha,
      canal: 'whatsapp',
      tags: row.tags?.length ? row.tags : ['WhatsApp', 'Evolution'],
      responsavelId: row.responsavel_id,
      contato: {
        id: row.contato_id,
        nome: row.contato_nome || formatPhone(row.telefone, row.remote_jid),
        telefone: formatPhone(row.telefone, row.remote_jid),
        remoteJid: row.remote_jid,
        avatarUrl: row.avatar_url,
      },
      equipe: row.equipe_id
        ? {
            id: row.equipe_id,
            nome: row.equipe_nome,
            membrosCount: row.equipe_membros_count || 0,
          }
        : null,
      mensagens: row.mensagens || [],
    }))

    return NextResponse.json({
      conversations,
      source: 'postgres',
      count: conversations.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/conversations] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

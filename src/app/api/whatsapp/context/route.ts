import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getConversationContext, clearContext } from '@/lib/redis-buffer'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import { getSql } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/whatsapp/context?conversaId=xxx
 * Retorna o contexto armazenado no Redis para a conversa informada.
 */
export async function GET(request: NextRequest) {
  try {
    // --- Autenticação ---
    const user = await getUserFromRequest(request)
    if (!user) return unauthorized()

    // --- Parâmetros ---
    const url = new URL(request.url)
    const conversaId = url.searchParams.get('conversaId')

    if (!conversaId) {
      return NextResponse.json(
        { error: 'Parâmetro "conversaId" é obrigatório' },
        { status: 400 },
      )
    }

    // --- Garante escopo da organização antes de ler Redis ---
    const db = getSql()
    const conversas = user.level === 0
      ? await db<{ id: string }[]>`
          SELECT id FROM public.crm_whatsapp_conversas WHERE id = ${conversaId}::uuid
        `
      : await db<{ id: string }[]>`
          SELECT id FROM public.crm_whatsapp_conversas
          WHERE id = ${conversaId}::uuid
            AND org_id = ${user.org_id || null}::uuid
        `
    if (conversas.length === 0) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    // --- Busca no Redis ---
    const context = await getConversationContext(conversaId)

    return NextResponse.json({
      conversaId,
      context,
      count: context.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/context] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/whatsapp/context?conversaId=xxx
 * Limpa o contexto armazenado no Redis para a conversa informada.
 */
export async function DELETE(request: NextRequest) {
  try {
    // --- Autenticação ---
    const user = await getUserFromRequest(request)
    if (!user) return unauthorized()

    // --- Parâmetros ---
    const url = new URL(request.url)
    const conversaId = url.searchParams.get('conversaId')

    if (!conversaId) {
      return NextResponse.json(
        { error: 'Parâmetro "conversaId" é obrigatório' },
        { status: 400 },
      )
    }

    // --- Garante escopo da organização antes de limpar Redis ---
    const db = getSql()
    const conversas = user.level === 0
      ? await db<{ id: string }[]>`
          SELECT id FROM public.crm_whatsapp_conversas WHERE id = ${conversaId}::uuid
        `
      : await db<{ id: string }[]>`
          SELECT id FROM public.crm_whatsapp_conversas
          WHERE id = ${conversaId}::uuid
            AND org_id = ${user.org_id || null}::uuid
        `
    if (conversas.length === 0) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    // --- Limpa no Redis ---
    await clearContext(conversaId)

    return NextResponse.json({
      conversaId,
      cleared: true,
      mensagem: 'Contexto removido com sucesso',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/context] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

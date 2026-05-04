import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/equipes/[id]/membros — Lista membros da equipe
export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  try {
    const { id } = await context.params
    const db = getSql()

    const membros = await db`
      SELECT 
        em.user_id::text,
        em.perfil,
        COALESCE(up.full_name, u.email) as nome,
        u.email,
        up.avatar_url
      FROM public.crm_whatsapp_equipe_membros em
      LEFT JOIN public.user_profiles up ON up.id = em.user_id
      LEFT JOIN auth.users u ON u.id = em.user_id
      WHERE em.equipe_id = ${id}::uuid
      ORDER BY 
        CASE em.perfil 
          WHEN 'admin' THEN 1 
          WHEN 'agente' THEN 2 
          WHEN 'viewer' THEN 3 
        END,
        nome
    `

    return NextResponse.json({ membros, count: membros.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/equipes/[id]/membros — Adiciona membro à equipe
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  try {
    const { id } = await context.params
    const body = await request.json()
    const { userId, perfil } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 })
    }

    const perfilValido = ['admin', 'agente', 'viewer'].includes(perfil) ? perfil : 'agente'
    const db = getSql()

    // Verifica se a equipe existe
    const eq = await db`SELECT id FROM public.crm_whatsapp_equipes WHERE id = ${id}::uuid`
    if (eq.length === 0) {
      return NextResponse.json({ error: 'Equipe não encontrada' }, { status: 404 })
    }

    // Verifica se usuário existe
    const usr = await db`SELECT id FROM auth.users WHERE id = ${userId}::uuid AND deleted_at IS NULL`
    if (usr.length === 0) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // Insere ou atualiza (upsert)
    await db`
      INSERT INTO public.crm_whatsapp_equipe_membros (equipe_id, user_id, perfil)
      VALUES (${id}::uuid, ${userId}::uuid, ${perfilValido})
      ON CONFLICT (equipe_id, user_id) 
      DO UPDATE SET perfil = ${perfilValido}
    `

    return NextResponse.json({ ok: true, userId, perfil: perfilValido }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/equipes/[id]/membros — Remove membro da equipe
export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  try {
    const { id } = await context.params
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Parâmetro userId é obrigatório' }, { status: 400 })
    }

    const db = getSql()

    await db`
      DELETE FROM public.crm_whatsapp_equipe_membros
      WHERE equipe_id = ${id}::uuid AND user_id = ${userId}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

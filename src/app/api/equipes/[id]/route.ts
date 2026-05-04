import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/equipes/[id] — Detalhes da equipe
export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  try {
    const { id } = await context.params
    const db = getSql()

    const equipes = await db`
      SELECT 
        e.id::text,
        e.nome,
        e.descricao,
        e.org_id::text,
        e.created_at,
        (SELECT COUNT(*) FROM public.crm_whatsapp_equipe_membros em WHERE em.equipe_id = e.id)::int as membros_count
      FROM public.crm_whatsapp_equipes e
      WHERE e.id = ${id}::uuid
    `

    if (equipes.length === 0) {
      return NextResponse.json({ error: 'Equipe não encontrada' }, { status: 404 })
    }

    // Busca membros
    const membros = await db`
      SELECT 
        em.user_id::text,
        em.perfil,
        COALESCE(up.full_name, u.email) as nome,
        u.email
      FROM public.crm_whatsapp_equipe_membros em
      LEFT JOIN public.user_profiles up ON up.id = em.user_id
      LEFT JOIN auth.users u ON u.id = em.user_id
      WHERE em.equipe_id = ${id}::uuid
      ORDER BY em.perfil, nome
    `

    return NextResponse.json({ equipe: { ...equipes[0], membros } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PUT /api/equipes/[id] — Atualiza equipe
export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  try {
    const { id } = await context.params
    const body = await request.json()
    const { nome, descricao } = body

    const db = getSql()

    const result = await db`
      UPDATE public.crm_whatsapp_equipes
      SET 
        nome = COALESCE(${nome || null}, nome),
        descricao = COALESCE(${descricao ?? null}, descricao)
      WHERE id = ${id}::uuid
      RETURNING id::text, nome, descricao, org_id::text, created_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Equipe não encontrada' }, { status: 404 })
    }

    return NextResponse.json({ equipe: result[0] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/equipes/[id] — Remove equipe
export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  try {
    const { id } = await context.params
    const db = getSql()

    const result = await db`
      DELETE FROM public.crm_whatsapp_equipes
      WHERE id = ${id}::uuid
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Equipe não encontrada' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

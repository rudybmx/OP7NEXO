import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/equipes — Lista equipes do usuário (org)
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  try {
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
      WHERE (e.org_id = ${user.org_id || null}::uuid OR e.org_id IS NULL)
      ORDER BY e.nome ASC
    `

    return NextResponse.json({ equipes, count: equipes.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/equipes — Cria nova equipe (admin level=0 ou admin da org)
export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  try {
    const body = await request.json()
    const { nome, descricao } = body

    if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
      return NextResponse.json({ error: 'Nome da equipe é obrigatório' }, { status: 400 })
    }

    const db = getSql()

    // Verifica se já existe equipe com mesmo nome na org
    const existente = await db`
      SELECT id FROM public.crm_whatsapp_equipes 
      WHERE nome = ${nome.trim()} AND org_id = ${user.org_id || null}::uuid
    `
    if (existente.length > 0) {
      return NextResponse.json({ error: 'Já existe uma equipe com este nome' }, { status: 409 })
    }

    const result = await db`
      INSERT INTO public.crm_whatsapp_equipes (org_id, nome, descricao)
      VALUES (${user.org_id || null}::uuid, ${nome.trim()}, ${descricao || null})
      RETURNING id::text, nome, descricao, org_id::text, created_at
    `

    return NextResponse.json({ equipe: result[0] }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

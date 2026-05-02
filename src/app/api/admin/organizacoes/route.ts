import { NextResponse } from 'next/server'
import { getUserFromRequest, unauthorized, forbidden } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.level !== 0) return forbidden()

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let query = sql`
      SELECT 
        o.*,
        (SELECT COUNT(*) FROM public.perfis p WHERE p.org_id = o.id) as total_usuarios
      FROM public.organizacoes o
      WHERE 1=1
    `

    if (status) {
      query = sql`${query} AND o.status = ${status}`
    }

    query = sql`${query} ORDER BY o.created_at DESC`

    const orgs = await query
    return NextResponse.json(orgs)
  } catch (err) {
    console.error('[API /admin/organizacoes GET] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.level !== 0) return forbidden()

  try {
    const body = await req.json()
    const { nome, slug, cnpj, nivel_plano = 'basico' } = body

    if (!nome || !slug) {
      return NextResponse.json({ error: 'Nome e slug obrigatorios' }, { status: 400 })
    }

    const existente = await sql`SELECT id FROM public.organizacoes WHERE slug = ${slug}`
    if (existente.length > 0) {
      return NextResponse.json({ error: 'Slug ja existe' }, { status: 409 })
    }

    const org = await sql`
      INSERT INTO public.organizacoes (nome, slug, cnpj, nivel_plano)
      VALUES (${nome}, ${slug}, ${cnpj || null}, ${nivel_plano})
      RETURNING *
    `

    return NextResponse.json(org[0])
  } catch (err) {
    console.error('[API /admin/organizacoes POST] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.level !== 0) return forbidden()

  try {
    const body = await req.json()
    const { id, nome, slug, cnpj, status, nivel_plano } = body

    if (!id) {
      return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 })
    }

    await sql`
      UPDATE public.organizacoes
      SET 
        nome = COALESCE(${nome}, nome),
        slug = COALESCE(${slug}, slug),
        cnpj = COALESCE(${cnpj}, cnpj),
        status = COALESCE(${status}, status),
        nivel_plano = COALESCE(${nivel_plano}, nivel_plano),
        updated_at = NOW()
      WHERE id = ${id}
    `

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API /admin/organizacoes PUT] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getUserFromRequest, unauthorized, forbidden } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import type { NextRequest } from 'next/server'

// Lista todos os usuários com perfil e org
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.level !== 0) return forbidden()

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let query = sql`
      SELECT 
        u.id,
        u.email,
        u.status as user_status,
        u.email_verificado,
        u.last_login_at,
        u.created_at,
        p.nome,
        p.nivel,
        p.cargo,
        p.telefone,
        p.status as perfil_status,
        o.id as org_id,
        o.nome as org_nome,
        o.slug as org_slug
      FROM public.usuarios u
      LEFT JOIN public.perfis p ON p.id = u.id
      LEFT JOIN public.organizacoes o ON o.id = p.org_id
      WHERE 1=1
    `

    if (status) {
      query = sql`${query} AND u.status = ${status}`
    }

    query = sql`${query} ORDER BY u.created_at DESC`

    const usuarios = await query
    return NextResponse.json(usuarios)
  } catch (err) {
    console.error('[API /admin/usuarios GET] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// Cria novo usuário (admin)
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.level !== 0) return forbidden()

  try {
    const body = await req.json()
    const { email, password, nome, org_id, nivel = 2, cargo, telefone } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha obrigatorios' }, { status: 400 })
    }

    const existente = await sql`SELECT id FROM public.usuarios WHERE email = ${email}`
    if (existente.length > 0) {
      return NextResponse.json({ error: 'Email ja cadastrado' }, { status: 409 })
    }

    const password_hash = await hashPassword(password)

    const usuario = await sql`
      INSERT INTO public.usuarios (email, password_hash, email_verificado)
      VALUES (${email}, ${password_hash}, true)
      RETURNING id, email, status, created_at
    `

    const newUser = usuario[0]

    await sql`
      INSERT INTO public.perfis (id, org_id, nome, nivel, cargo, telefone, status)
      VALUES (${newUser.id}, ${org_id || null}, ${nome || email.split('@')[0]}, ${nivel}, ${cargo || null}, ${telefone || null}, 'ativo')
    `

    return NextResponse.json({
      id: newUser.id,
      email: newUser.email,
      nome: nome || email.split('@')[0],
      nivel,
      org_id,
    })
  } catch (err) {
    console.error('[API /admin/usuarios POST] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// Atualiza usuário
export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.level !== 0) return forbidden()

  try {
    const body = await req.json()
    const { id, nome, nivel, cargo, status, org_id, telefone } = body

    if (!id) {
      return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 })
    }

    await sql`
      UPDATE public.perfis
      SET 
        nome = COALESCE(${nome}, nome),
        nivel = COALESCE(${nivel}, nivel),
        cargo = COALESCE(${cargo}, cargo),
        status = COALESCE(${status}, status),
        org_id = COALESCE(${org_id}, org_id),
        telefone = COALESCE(${telefone}, telefone),
        updated_at = NOW()
      WHERE id = ${id}
    `

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API /admin/usuarios PUT] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

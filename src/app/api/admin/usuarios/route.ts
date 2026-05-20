import { NextResponse } from 'next/server'
import { getUserFromRequest, unauthorized, forbidden } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import type { NextRequest } from 'next/server'

// Lista todos os usuários com workspace
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'platform_admin') return forbidden()

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let query = sql`
      SELECT 
        u.id,
        u.email,
        u.nome,
        u.role as cargo,
        u.ativo,
        u.pode_atender_canais,
        u.pode_acessar_crm,
        u.workspace_id,
        w.nome as workspace_nome,
        w.slug as workspace_slug,
        u.criado_em as created_at
      FROM public.users u
      LEFT JOIN public.workspaces w ON w.id = u.workspace_id
      WHERE u.ativo = true
    `

    if (status) {
      const ativo = status === 'ativo'
      query = sql`${query} AND u.ativo = ${ativo}`
    }

    query = sql`${query} ORDER BY u.criado_em DESC`

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
  if (user.role !== 'platform_admin') return forbidden()

  try {
    const body = await req.json()
    const { email, password, nome, workspace_id, role = 'company_agent' } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha obrigatorios' }, { status: 400 })
    }

    const existente = await sql`SELECT id FROM public.users WHERE email = ${email} AND ativo = true`
    if (existente.length > 0) {
      return NextResponse.json({ error: 'Email ja cadastrado' }, { status: 409 })
    }

    const password_hash = await hashPassword(password)

    const usuario = await sql`
      INSERT INTO public.users (nome, email, senha_hash, role, workspace_id, ativo, pode_atender_canais, pode_acessar_crm, criado_em, atualizado_em)
      VALUES (${nome || email.split('@')[0]}, ${email}, ${password_hash}, ${role}, ${workspace_id || null}, true, false, false, NOW(), NOW())
      RETURNING id, email, nome, role, workspace_id, criado_em
    `

    const newUser = usuario[0]

    return NextResponse.json({
      id: newUser.id,
      email: newUser.email,
      nome: newUser.nome,
      role: newUser.role,
      workspace_id: newUser.workspace_id,
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
  if (user.role !== 'platform_admin') return forbidden()

  try {
    const body = await req.json()
    const { id, nome, email, role, ativo, workspace_id, pode_atender_canais, pode_acessar_crm } = body

    if (!id) {
      return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 })
    }

    await sql`
      UPDATE public.users
      SET 
        nome = COALESCE(${nome}, nome),
        email = COALESCE(${email}, email),
        role = COALESCE(${role}, role),
        ativo = COALESCE(${ativo}, ativo),
        workspace_id = COALESCE(${workspace_id}, workspace_id),
        pode_atender_canais = COALESCE(${pode_atender_canais}, pode_atender_canais),
        pode_acessar_crm = COALESCE(${pode_acessar_crm}, pode_acessar_crm),
        atualizado_em = NOW()
      WHERE id = ${id}
    `

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API /admin/usuarios PUT] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

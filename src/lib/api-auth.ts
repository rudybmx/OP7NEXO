import { NextRequest } from 'next/server'
import { verifyToken } from './jwt'

export interface AuthUser {
  id: string
  email: string
  role?: string
  level?: number
  org_id?: string
}

export async function getUserFromRequest(req: NextRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  try {
    const payload = await verifyToken(token)
    if (!payload.sub) return null
    return {
      id: payload.sub,
      email: payload.email || '',
      role: payload.role,
      level: payload.level,
      org_id: payload.org_id,
    }
  } catch {
    return null
  }
}

export function unauthorized() {
  return Response.json({ error: 'Nao autorizado' }, { status: 401 })
}

export function forbidden() {
  return Response.json({ error: 'Acesso negado' }, { status: 403 })
}

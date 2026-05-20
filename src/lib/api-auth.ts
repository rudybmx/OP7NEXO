import { NextRequest } from 'next/server'
import { verifyToken } from './jwt'

// Mapeia role da API Python para level numérico (compatibilidade)
function roleToLevel(role?: string): number {
  switch (role) {
    case 'platform_admin': return 0
    case 'network_admin': return 1
    case 'network_viewer': return 2
    case 'company_admin': return 3
    case 'company_agent': return 4
    default: return 99
  }
}

export interface AuthUser {
  id: string
  email?: string
  role?: string
  level?: number
  workspace_id?: string
  // compat legacy
  org_id?: string
}

export async function getUserFromRequest(req: NextRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const cookieToken = req.cookies.get('ws-session')?.value || null
  const token = bearerToken || cookieToken
  if (!token) return null

  try {
    const payload = await verifyToken(token)
    if (!payload.sub) return null
    const role = payload.role as string | undefined
    const workspaceId = (payload.workspace_id as string | undefined) || (payload.org_id as string | undefined)
    return {
      id: payload.sub,
      email: payload.email || '',
      role,
      level: payload.level ?? roleToLevel(role),
      workspace_id: workspaceId,
      org_id: workspaceId, // compat legacy
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

import type { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'

const API_BASE_URL = 'http://op7nexo-api:8000'

interface WorkspaceAccessRow {
  workspace_id?: string | null
}

export interface WhatsappWorkspaceAccess {
  user: NonNullable<Awaited<ReturnType<typeof getUserFromRequest>>>
  tokenToForward: string
  allowedWorkspaceIds: Set<string>
}

function getTokenToForward(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const cookieToken = request.cookies.get('ws-session')?.value
  return authHeader || (cookieToken ? `Bearer ${cookieToken}` : '')
}

function isString(value: string | null | undefined): value is string {
  return Boolean(value)
}

export async function resolveWhatsappWorkspaceAccess(request: NextRequest): Promise<WhatsappWorkspaceAccess | Response> {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  const tokenToForward = getTokenToForward(request)
  const response = await fetch(`${API_BASE_URL}/users/me/workspaces`, {
    headers: { Authorization: tokenToForward },
    cache: 'no-store',
  })

  if (!response.ok) {
    return Response.json(
      { error: 'Falha ao validar workspaces.' },
      { status: response.status }
    )
  }

  const allowedData = await response.json().catch(() => [])
  const allowedWorkspaceIds = new Set(
    (Array.isArray(allowedData) ? allowedData as WorkspaceAccessRow[] : [])
      .map((row) => row.workspace_id)
      .filter(isString)
  )

  return {
    user,
    tokenToForward,
    allowedWorkspaceIds,
  }
}

export function normalizeWorkspaceId(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

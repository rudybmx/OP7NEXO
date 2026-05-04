const API = process.env.NEXT_PUBLIC_API_URL || ''

function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '' // usa URL relativa no browser
  }
  return 'http://localhost:3000'
}

async function retryWithRefresh<T>(url: string, init: RequestInit): Promise<T> {
  if (typeof window === 'undefined') {
    throw new Error('Sessão expirada.')
  }

  try {
    const { refreshToken, clearToken } = await import('./auth')
    const newToken = await refreshToken()
    const nextInit: RequestInit = {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> || {}),
        Authorization: `Bearer ${newToken}`,
      },
    }
    const retryRes = await fetch(url, nextInit)
    if (retryRes.ok) return retryRes.json()
    clearToken()
    window.location.href = '/login'
    throw new Error('Sessão expirada. Redirecionando para login...')
  } catch {
    const { clearToken } = await import('./auth')
    clearToken()
    window.location.href = '/login'
    throw new Error('Sessão expirada. Redirecionando para login...')
  }
}

/** Fetcher autenticado para uso direto com SWR.
 *  Lê o access_token do localStorage automaticamente.
 *  Uso: useSWR('/endpoint', apiGet)
 */
export async function apiGet<T = unknown>(endpoint: string): Promise<T> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('access_token')
    : null
  const path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  return apiFetch<T>(path, undefined, token)
}

export async function apiFetch<T>(
  endpoint: string,
  params?: Record<string, any>,
  token?: string | null,
  method: string = 'GET',
  body?: unknown
): Promise<T> {
  const base = getBaseUrl()
  const url = new URL(`${base}/api/${endpoint}`, base || undefined)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) {
          v.forEach(val => url.searchParams.append(k, String(val)))
        } else {
          url.searchParams.append(k, String(v))
        }
      }
    })
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[API] Fetching: ${url.toString()}`)
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[API] Response ${res.status}: ${url.pathname}`)
  }

  if (res.status === 401) {
    return retryWithRefresh<T>(url.toString(), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  }

  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)

  return res.json()
}

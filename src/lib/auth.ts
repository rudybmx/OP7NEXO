const API = '/api'
const REFRESH_KEY = 'ws_refresh_token'

let inMemoryToken: string | null = null

export function setSessionCookie(token: string): void {
  if (typeof window !== 'undefined') {
    document.cookie = `ws-session=${token}; path=/; max-age=86400; SameSite=Lax`
  }
}

export function clearSessionCookie(): void {
  if (typeof window !== 'undefined') {
    document.cookie = 'ws-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  }
}

export async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Falha na autenticacao')
  }

  const data = await res.json()
  const { access_token, refresh_token } = data

  inMemoryToken = access_token
  setSessionCookie(access_token)

  if (typeof window !== 'undefined') {
    localStorage.setItem(REFRESH_KEY, refresh_token)
  }

  return access_token
}

export async function signUp(email: string, password: string, nome?: string, org_nome?: string): Promise<string> {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, nome, org_nome }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Falha no cadastro')
  }

  const data = await res.json()
  const { access_token, refresh_token } = data

  inMemoryToken = access_token
  setSessionCookie(access_token)

  if (typeof window !== 'undefined') {
    localStorage.setItem(REFRESH_KEY, refresh_token)
  }

  return access_token
}

export async function refreshToken(): Promise<string> {
  if (typeof window === 'undefined') throw new Error('No refresh in SSR')

  const refresh_token = localStorage.getItem(REFRESH_KEY)
  if (!refresh_token) throw new Error('No refresh token available')

  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token }),
  })

  if (!res.ok) {
    clearToken()
    throw new Error('Falha ao atualizar token')
  }

  const data = await res.json()
  inMemoryToken = data.access_token
  setSessionCookie(data.access_token)

  if (data.refresh_token) {
    localStorage.setItem(REFRESH_KEY, data.refresh_token)
  }

  return inMemoryToken as string
}

export async function logout(): Promise<void> {
  clearToken()
}

export async function getUser() {
  if (!inMemoryToken) throw new Error('Sem token de acesso')

  const res = await fetch(`${API}/auth/me`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${inMemoryToken}` }
  })
  if (!res.ok) throw new Error('Falha ao buscar usuario')
  return res.json()
}

export function getToken(): string | null {
  return inMemoryToken
}

export function hasRefreshToken(): boolean {
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem(REFRESH_KEY)
}

export function clearToken(): void {
  inMemoryToken = null
  clearSessionCookie()
  if (typeof window !== 'undefined') {
    localStorage.removeItem(REFRESH_KEY)
  }
}

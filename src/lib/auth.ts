import api, { clearToken, getToken, setToken } from '@/lib/api-client'

export { getToken, clearToken, setToken }

interface LoginResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

interface MeResponse {
  id: string
  nome: string
  email: string
  role: string
  ativo: boolean
}

export async function signIn(email: string, password: string, remember = false): Promise<string> {
  const data = await api.post<LoginResponse>('/auth/login', { email, senha: password, remember })
  setToken(data.access_token, remember, data.expires_in ?? 2592000)
  return data.access_token
}

export async function getMe(): Promise<MeResponse> {
  return api.get<MeResponse>('/auth/me')
}

export async function logout(): Promise<void> {
  clearToken()
}

// Compat aliases
export { getMe as getUser }
export function clearSessionCookie(): void { clearToken() }
export function hasRefreshToken(): boolean { return false }
export async function refreshToken(): Promise<string> {
  throw new Error('refreshToken removido — use signIn novamente')
}

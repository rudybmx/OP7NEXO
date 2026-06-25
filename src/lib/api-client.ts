const BASE_URL = '/api/proxy'
const TOKEN_KEY = 'op7nexo_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  // Persistente (localStorage) tem prioridade; sessão (sessionStorage) some ao fechar o navegador.
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
}

/**
 * Grava o token de sessão.
 * @param remember  true → persistente (localStorage + cookie com max-age); false → sessão (sessionStorage + cookie de sessão).
 * @param maxAgeSeconds  duração do cookie persistente (default 30d); ignorado quando remember=false.
 */
export function setToken(token: string, remember = true, maxAgeSeconds = 2592000): void {
  if (typeof window === 'undefined') return
  // Evita resíduo entre os dois storages.
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  if (remember) localStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.setItem(TOKEN_KEY, token)

  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  // remember → cookie persistente; senão → cookie de sessão (sem max-age).
  const idade = remember ? `; max-age=${maxAgeSeconds}` : ''
  document.cookie = `ws-session=${token}; path=/; SameSite=Lax${secure}${idade}`
}

export function clearToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  document.cookie = 'ws-session=; path=/; max-age=0; SameSite=Lax'
}

function redirectToLogin(): void {
  clearToken()
  if (typeof window !== 'undefined') {
    window.location.href = '/login'
  }
}

function formatApiError(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail

  if (Array.isArray(detail)) {
    const mensagens = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const registro = item as Record<string, unknown>
          const mensagem = typeof registro.msg === 'string'
            ? registro.msg
            : typeof registro.message === 'string'
              ? registro.message
              : typeof registro.detail === 'string'
                ? registro.detail
                : null
          if (!mensagem) return null

          const local = Array.isArray(registro.loc)
            ? registro.loc.filter((parte) => typeof parte === 'string' || typeof parte === 'number').join('.')
            : null
          return local ? `${local}: ${mensagem}` : mensagem
        }
        return null
      })
      .filter((mensagem): mensagem is string => Boolean(mensagem))

    if (mensagens.length > 0) return mensagens.join('; ')
  }

  if (detail && typeof detail === 'object') {
    const registro = detail as Record<string, unknown>
    const msg = formatApiError(registro.detail, fallback)
    if (msg !== fallback) return msg
    if (typeof registro.error_message === 'string' && registro.error_message.trim()) return registro.error_message
    if (typeof registro.message === 'string' && registro.message.trim()) return registro.message
  }

  return fallback
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    redirectToLogin()
    throw new Error('Sessão expirada')
  }

  if (!res.ok) {
    const body = await res.text()
    if (body) {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>
        throw new Error(formatApiError(parsed.detail ?? parsed.message ?? parsed.error, `Erro ${res.status}`))
      } catch (parseErr) {
        if (parseErr instanceof SyntaxError) {
          throw new Error(body || `Erro ${res.status}`)
        }
        if (parseErr instanceof Error) throw parseErr
        throw new Error(body || `Erro ${res.status}`)
      }
    }
    throw new Error(`Erro ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

export default api

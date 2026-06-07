'use client'

import React, { createContext, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn as authSignIn, logout as authLogout, getMe, getToken } from '@/lib/auth'

interface AuthUser {
  id: string
  email: string
  nome: string
  role: string
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  reloadUser: () => Promise<void>
  isLoading: boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setTokenState] = useState<string | null>(getToken())
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const loadUser = useCallback(async () => {
    const t = getToken()
    if (!t) {
      setUser(null)
      setTokenState(null)
      return
    }
    try {
      const userData = await getMe()
      setUser({ id: userData.id, email: userData.email, nome: userData.nome, role: userData.role })
      setTokenState(t)
    } catch {
      setUser(null)
      setTokenState(null)
    }
  }, [])

  useEffect(() => {
    loadUser().finally(() => setIsLoading(false))
  }, [loadUser])

  const login = useCallback(async (email: string, password: string) => {
    const newToken = await authSignIn(email, password)
    setTokenState(newToken)
    await loadUser()
  }, [loadUser])

  const logout = useCallback(async () => {
    await authLogout()
    setUser(null)
    setTokenState(null)
    router.push('/login')
  }, [router])

  if (isLoading) {
    return (
      <div className="dark" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', width: '100vw',
        background: 'linear-gradient(160deg, rgba(14,20,42,1) 0%, rgba(10,15,35,1) 100%)',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid rgba(62,91,255,0.2)', borderTopColor: '#3E5BFF',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.60)', fontWeight: 500 }}>
          Verificando credenciais...
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, reloadUser: loadUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signIn(email.trim(), password)
      router.push('/marketing/campanhas/meta-ads')
    } catch {
      setError('Email ou senha incorretos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #c50953 0%, #880D07 40%, #000000 100%)',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 14,
        padding: '40px 36px',
        width: 380,
        maxWidth: '90vw',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <img
            src="https://pub-db8ed4fb33634589a6ce5fb07e85cb46.r2.dev/logo/bihmks/logo%20branca%20bmk.png"
            alt="BMK"
            style={{ height: 60, width: 'auto', objectFit: 'contain', marginBottom: 12 }}
          />
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)' }}>
            Acesse sua conta para continuar
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nome@empresa.com.br"
              required
              autoComplete="email"
              style={{
                width: '100%', height: 42, padding: '0 14px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, fontSize: 14, color: '#ffffff',
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(197,9,83,0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(197,9,83,0.12)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={{
                width: '100%', height: 42, padding: '0 14px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, fontSize: 14, color: '#ffffff',
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(197,9,83,0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(197,9,83,0.12)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 12, color: '#FF5C8D', textAlign: 'center',
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(255,92,141,0.08)',
              border: '1px solid rgba(255,92,141,0.20)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', height: 44, marginTop: 4,
              background: loading ? 'rgba(197,9,83,0.50)' : 'linear-gradient(135deg, #c50953, #880D07)',
              border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 600, color: '#ffffff',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 16px rgba(197,9,83,0.30)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Entrando...' : 'Entrar na plataforma'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
          © 2026 BMK Marketing · Acesso seguro e criptografado
        </div>
      </div>
    </div>
  )
}
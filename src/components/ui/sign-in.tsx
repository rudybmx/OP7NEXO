'use client'

import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface SignInPageProps {
  heroImageSrc?: string
  onSignIn?: (data: { email: string; password: string; rememberMe: boolean }) => Promise<void>
  onResetPassword?: () => void
  onRequestAccess?: () => void
  error?: string
  loading?: boolean
}

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-colors focus-within:border-[#006EFF]/50 focus-within:bg-[#006EFF]/5">
    {children}
  </div>
)

export const SignInPage: React.FC<SignInPageProps> = ({
  heroImageSrc,
  onSignIn,
  onResetPassword,
  onRequestAccess,
  error,
  loading = false,
}) => {
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    await onSignIn?.({ email, password, rememberMe })
  }

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row w-[100dvw] overflow-hidden">
      {/* Coluna esquerda — formulário */}
      <section className="flex-1 flex items-center justify-center p-8 bg-[#000533]">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            {/* Logo / título */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 mb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://pub-db8ed4fb33634589a6ce5fb07e85cb46.r2.dev/logo/op7_dash_odc/logo_op7nexo.svg"
                  alt="Op7 Nexo"
                  className="h-8 w-auto opacity-90"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
                <span className="text-white/80 text-sm font-semibold tracking-widest uppercase">
                  Op7 Nexo
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-semibold leading-tight text-white animate-element animate-delay-100">
                Bem-vindo
              </h1>
              <p className="text-white/50 animate-element animate-delay-200">
                Acesse sua conta para continuar
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {/* E-mail */}
              <div className="animate-element animate-delay-300">
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-2">
                  E-mail
                </label>
                <GlassInputWrapper>
                  <input
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome@empresa.com.br"
                    required
                    autoComplete="email"
                    className="w-full bg-transparent text-sm p-4 rounded-xl focus:outline-none text-white placeholder:text-white/25"
                  />
                </GlassInputWrapper>
              </div>

              {/* Senha */}
              <div className="animate-element animate-delay-400">
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-2">
                  Senha
                </label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="w-full bg-transparent text-sm p-4 pr-12 rounded-xl focus:outline-none text-white placeholder:text-white/25"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 flex items-center"
                    >
                      {showPassword
                        ? <EyeOff className="w-4 h-4 text-white/30 hover:text-white/60 transition-colors" />
                        : <Eye className="w-4 h-4 text-white/30 hover:text-white/60 transition-colors" />
                      }
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              {/* Erro */}
              {error && (
                <div className="text-xs text-[#c80010] text-center px-3 py-2 rounded-lg bg-[#c80010]/8 border border-[#c80010]/20 animate-element">
                  {error}
                </div>
              )}

              {/* Manter logado + esqueci senha */}
              <div className="animate-element animate-delay-500 flex items-center justify-between text-sm">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 accent-[#006EFF] cursor-pointer"
                  />
                  <span className="text-white/70 text-xs">Manter logado</span>
                </label>
                <button
                  type="button"
                  onClick={onResetPassword}
                  className="text-xs text-[#006EFF] hover:text-[#2f7dff] transition-colors hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>

              {/* Botão entrar */}
              <button
                type="submit"
                disabled={loading}
                className="animate-element animate-delay-600 w-full rounded-xl bg-[#006EFF] py-4 text-sm font-semibold text-white hover:bg-[#2f7dff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-[#006EFF]/20"
              >
                {loading ? 'Entrando...' : 'Entrar na plataforma'}
              </button>
            </form>

            {/* Solicitar acesso */}
            <p className="animate-element animate-delay-700 text-center text-xs text-white/30">
              Não tem acesso?{' '}
              <button
                type="button"
                onClick={onRequestAccess}
                className="text-[#006EFF] hover:text-[#2f7dff] hover:underline transition-colors"
              >
                Solicitar acesso
              </button>
            </p>

            {/* Rodapé */}
            <p className="text-center text-[10px] text-white/15 mt-2">
              © 2026 Op7 Nexo · Acesso seguro e criptografado
            </p>
          </div>
        </div>
      </section>

      {/* Coluna direita — imagem hero */}
      {heroImageSrc && (
        <section className="hidden md:block flex-1 relative p-4 bg-[#000533]">
          <div
            className="absolute inset-4 rounded-3xl bg-cover bg-center animate-slide-right animate-delay-300"
            style={{ backgroundImage: `url(${heroImageSrc})` }}
          />
          {/* Overlay sutil com gradiente do sistema */}
          <div className="absolute inset-4 rounded-3xl bg-gradient-to-br from-[#006EFF]/30 via-transparent to-[#006EFF]/10 pointer-events-none" />
        </section>
      )}
    </div>
  )
}

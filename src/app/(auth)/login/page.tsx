'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth'
import { SignInPage } from '@/components/ui/sign-in'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignIn({
    email,
    password,
    rememberMe,
  }: {
    email: string
    password: string
    rememberMe: boolean
  }) {
    setLoading(true)
    setError('')
    try {
      await signIn(email.trim(), password, rememberMe)
      router.push('/marketing/campanhas/meta-ads')
    } catch {
      setError('E-mail ou senha incorretos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SignInPage
      heroImageSrc="https://pub-db8ed4fb33634589a6ce5fb07e85cb46.r2.dev/logo/op7_dash_odc/imagem_login_inicio_nexo.png"
      onSignIn={handleSignIn}
      onResetPassword={() => {
        // TODO: implementar fluxo de recuperação de senha
      }}
      onRequestAccess={() => {
        // TODO: implementar fluxo de solicitação de acesso
      }}
      error={error}
      loading={loading}
    />
  )
}

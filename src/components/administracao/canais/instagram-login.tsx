'use client'

import React from 'react'

/**
 * Botão "Entrar com Instagram" (Instagram Login direto via OAuth).
 *
 * FASE 2 — fica oculto enquanto NEXT_PUBLIC_INSTAGRAM_LOGIN !== 'on'.
 * O login OAuth depende de App Review da permissão instagram_business_manage_messages.
 * Até lá, a conexão é feita por token manual (ig_id + access_token).
 *
 * Quando habilitado, deve redirecionar para
 * https://www.instagram.com/oauth/authorize?...&scope=instagram_business_basic,instagram_business_manage_messages
 * e o backend troca o code em graph.instagram.com.
 */
export function InstagramLoginButton() {
  const enabled = process.env.NEXT_PUBLIC_INSTAGRAM_LOGIN === 'on'
  if (!enabled) return null

  return (
    <button
      type="button"
      disabled
      title="Disponível após App Review da Meta (fase 2)"
      style={{
        width: '100%', height: 40, borderRadius: 10,
        background: 'rgba(225,48,108,0.10)', border: '1px solid rgba(225,48,108,0.30)',
        fontSize: 13, fontWeight: 600, color: '#E1306C', cursor: 'not-allowed',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      Entrar com Instagram (em breve)
    </button>
  )
}

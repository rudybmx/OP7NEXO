'use client'

import React from 'react'

/**
 * Botão "Conectar com a Meta" (Embedded Signup / Facebook Login for Business).
 *
 * FASE 2 — fica oculto enquanto NEXT_PUBLIC_META_EMBEDDED_SIGNUP !== 'on'.
 * O Embedded Signup depende de App Review aprovado (whatsapp_business_management,
 * whatsapp_business_messaging), Business Verification e um config_id de Login
 * configurado no app Meta. Até lá, a conexão é feita por token manual (System User).
 *
 * Quando habilitado, este componente deve:
 *  1. Carregar o Facebook JS SDK e chamar FB.login({ config_id, response_type: 'code',
 *     override_default_response_type: true }).
 *  2. Capturar o `code` + WABA/phone via evento `message` (sessionInfoListener).
 *  3. POST /canais/meta/embedded-signup { code, ... } para o backend trocar o code,
 *     resolver waba_id/phone_number_id, registrar número e subscribed_apps.
 */
export function MetaEmbeddedSignupButton() {
  const enabled = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP === 'on'
  if (!enabled) return null

  return (
    <button
      type="button"
      disabled
      title="Disponível após App Review da Meta (fase 2)"
      style={{
        width: '100%', height: 40, borderRadius: 10,
        background: 'rgba(24,119,242,0.10)', border: '1px solid rgba(24,119,242,0.30)',
        fontSize: 13, fontWeight: 600, color: '#1877F2', cursor: 'not-allowed',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      Conectar com a Meta (em breve)
    </button>
  )
}

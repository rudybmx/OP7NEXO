import React from 'react'

// Tokens e blocos visuais compartilhados pela Central de Agentes (lista + form de agente).
// Mantém a linguagem visual da tela (input nativo + tokens --ws-*); a migração para
// flat-shadcn da Central inteira é uma tarefa futura à parte.

export const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none border'
export const inputStyle: React.CSSProperties = { borderColor: 'var(--ws-glass-border)', background: 'var(--card)', color: 'var(--ws-text-1)' }
export const labelCls = 'block text-xs font-medium mb-1 uppercase tracking-wide'
export const labelStyle: React.CSSProperties = { color: 'var(--ws-text-2)', letterSpacing: '0.04em' }

/** Card de seção. `full` faz o card ocupar as 2 colunas no grid; `action` renderiza um
 *  controle à direita do título (ex.: botão Publicar). */
export function Section({
  titulo,
  full,
  action,
  children,
}: {
  titulo: string
  full?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl p-4${full ? ' lg:col-span-2' : ''}`} style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)' }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ws-text-1)' }}>{titulo}</h3>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls} style={labelStyle}>{label}</span>
      {children}
    </label>
  )
}

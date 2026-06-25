import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const tabAtiva = {
  color: 'var(--ws-gold)',
  borderBottom: '2px solid var(--ws-gold)',
  fontWeight: 500,
  background: 'transparent',
  border: 'none',
  borderBottomWidth: '2px',
  borderBottomStyle: 'solid' as const,
  borderBottomColor: 'var(--ws-gold)',
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: 13,
  transition: 'var(--ws-transition)',
} as const

export const tabInativa = {
  color: 'var(--ws-text-2)',
  borderBottom: '2px solid transparent',
  fontWeight: 400,
  background: 'transparent',
  border: 'none',
  borderBottomWidth: '2px',
  borderBottomStyle: 'solid' as const,
  borderBottomColor: 'transparent',
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: 13,
  transition: 'var(--ws-transition)',
} as const

// filtroAtivo/filtroInativo/glassCard/glassCardHover/botaoPrimario removidos na F2 (dead code, 0 imports).
// tabAtiva/tabInativa permanecem (3 telas de abas) até a migração para shadcn Tabs.

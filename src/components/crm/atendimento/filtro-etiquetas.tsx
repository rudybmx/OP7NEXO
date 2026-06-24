'use client'

import type { CSSProperties } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { Etiqueta } from '@/hooks/use-etiquetas'

interface FiltroEtiquetasProps {
  etiquetas: Etiqueta[]
  selecionadas: string[]
  onChange: (ids: string[]) => void
  isMobile?: boolean
}

/**
 * Caixinha de filtro de conversas por etiqueta (multi-select, lógica OR).
 * Mostra apenas as etiquetas do workspace; ao selecionar uma ou mais, a lista
 * de conversas carrega só as que têm pelo menos uma das etiquetas marcadas.
 */
export function FiltroEtiquetas({ etiquetas, selecionadas, onChange, isMobile = false }: FiltroEtiquetasProps) {
  if (etiquetas.length === 0) return null

  const qtd = selecionadas.length
  const ativo = qtd > 0

  const toggle = (id: string) => {
    const nova = selecionadas.includes(id)
      ? selecionadas.filter(x => x !== id)
      : [...selecionadas, id]
    onChange(nova)
  }

  const triggerStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    boxSizing: 'border-box',
    padding: isMobile ? '12px 14px' : '10px 14px',
    borderRadius: 14,
    cursor: 'pointer',
    fontSize: isMobile ? 16 : 12,
    fontWeight: 600,
    outline: 'none',
    border: ativo ? '1px solid #c9a84c' : '1px solid var(--ws-glass-border)',
    background: ativo ? 'rgba(201, 168, 76, 0.12)' : 'var(--ws-glass-bg)',
    color: ativo ? '#c9a84c' : 'var(--ws-text-1)',
    boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.04)',
  }

  const itemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '7px 8px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--ws-text-1)',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" style={triggerStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          <span style={{ flex: 1 }}>
            {ativo ? `Etiquetas · ${qtd}` : 'Etiquetas'}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-2)' }}>Filtrar por etiqueta</span>
          {ativo && (
            <button
              type="button"
              onClick={() => onChange([])}
              style={{ fontSize: 11, fontWeight: 600, color: '#c9a84c', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Limpar
            </button>
          )}
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {etiquetas.map(et => {
            const marcada = selecionadas.includes(et.id)
            return (
              <button
                key={et.id}
                type="button"
                onClick={() => toggle(et.id)}
                style={{ ...itemStyle, background: marcada ? 'rgba(201, 168, 76, 0.10)' : 'transparent' }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: marcada ? '1px solid #c9a84c' : '1px solid var(--ws-glass-border)',
                    background: marcada ? '#c9a84c' : 'transparent',
                    color: '#fff',
                  }}
                >
                  {marcada && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span style={{ width: 10, height: 10, borderRadius: 999, flexShrink: 0, background: et.cor }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{et.nome}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

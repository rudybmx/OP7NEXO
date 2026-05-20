'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CSSProperties } from 'react'

interface Props {
  page: number
  limit: number
  total: number
  onPageChange: (page: number) => void
  isBusy?: boolean
}

function buttonStyle(disabled: boolean): CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 'var(--ws-radius-md)',
    border: '1px solid var(--ws-glass-border)',
    background: disabled ? 'var(--ws-surface-2)' : 'var(--ws-glass-bg)',
    color: disabled ? 'var(--ws-text-3)' : 'var(--ws-text-1)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: disabled ? 'none' : 'var(--ws-glass-shadow-sm)',
    transition: 'var(--ws-transition)',
  }
}

export function PaginacaoAnuncios({ page, limit, total, onPageChange, isBusy = false }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const inicio = total === 0 ? 0 : ((page - 1) * limit) + 1
  const fim = total === 0 ? 0 : Math.min(page * limit, total)
  const prevDisabled = page <= 1 || isBusy
  const nextDisabled = page >= totalPages || isBusy

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
      padding: '10px 12px',
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow-sm)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }} />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 0,
      }}>
        <div style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--ws-text-3)',
          fontWeight: 600,
        }}>
          Paginação
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--ws-text-2)',
          lineHeight: 1.35,
        }}>
          {total === 0
            ? 'Nenhum anúncio encontrado no filtro atual.'
            : `Mostrando ${inicio.toLocaleString('pt-BR')}–${fim.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} anúncios.`}
        </div>
      </div>

      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={prevDisabled}
          aria-label="Página anterior"
          style={buttonStyle(prevDisabled)}
        >
          <ChevronLeft size={14} />
        </button>

        <div style={{
          minWidth: 126,
          height: 32,
          padding: '0 10px',
          borderRadius: 'var(--ws-radius-md)',
          border: '1px solid var(--ws-glass-border)',
          background: 'var(--ws-surface-2)',
          color: 'var(--ws-text-1)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
          boxShadow: 'var(--ws-glass-shadow-sm)',
        }}>
          Página {page.toLocaleString('pt-BR')} de {totalPages.toLocaleString('pt-BR')}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={nextDisabled}
          aria-label="Próxima página"
          style={buttonStyle(nextDisabled)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

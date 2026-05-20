'use client'

import { createPortal } from 'react-dom'
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface AdCreativeModalShellProps {
  aberto: boolean
  onFechar: () => void
  children: ReactNode
}

interface AdCreativeModalStateCardProps {
  title: string
  description: string
  accent?: string
  icon?: ReactNode
}

export function AdCreativeModalShell({ aberto, onFechar, children }: AdCreativeModalShellProps) {
  useEffect(() => {
    if (!aberto) return

    const body = document.body
    const previousOverflow = body.style.overflow
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }

    body.style.overflow = 'hidden'
    window.addEventListener('keydown', handler)

    return () => {
      body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handler)
    }
  }, [aberto, onFechar])

  if (!aberto || typeof document === 'undefined') return null

  const overlayTop = typeof window !== 'undefined' ? window.scrollY : 0

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'absolute',
        top: overlayTop,
        left: 0,
        right: 0,
        minHeight: '100vh',
        zIndex: 9999,
        background: 'rgba(9,12,24,0.56)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar()
      }}
    >
      <div
        style={{
          width: 'min(1280px, 96vw)',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <button
          type="button"
          aria-label="Fechar modal"
          onClick={onFechar}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 1,
            width: 34,
            height: 34,
            borderRadius: 9999,
            border: '1px solid var(--ws-divider)',
            background: 'var(--ws-surface-2)',
            color: 'var(--ws-text-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: 'var(--ws-glass-shadow-sm)',
          }}
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function AdCreativeModalStateCard({
  title,
  description,
  accent = 'var(--ws-blue)',
  icon,
}: AdCreativeModalStateCardProps) {
  return (
    <section
      style={{
        width: '100%',
        minHeight: 360,
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-xl)',
        boxShadow: 'var(--ws-glass-shadow-lg)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(560px, 100%)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 16,
            background: 'var(--ws-surface-2)',
            border: '1px solid var(--ws-divider)',
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--ws-text-1)',
              lineHeight: 1.25,
              marginBottom: 6,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--ws-text-2)',
            }}
          >
            {description}
          </div>
        </div>
      </div>
    </section>
  )
}

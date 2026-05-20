'use client'

import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description: string
  icon?: LucideIcon
  actionLabel?: string
  onAction?: () => void
}

export function FinanceiroEmptyState({
  title,
  description,
  icon: Icon = undefined,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow-sm)',
      position: 'relative',
      overflow: 'hidden',
      padding: 16,
      minHeight: 160,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      justifyContent: 'center',
    }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }} />

      {Icon && (
        <div style={{
          width: 34,
          height: 34,
          borderRadius: '9999px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--ws-blue-soft)',
          color: 'var(--ws-blue)',
        }}>
          <Icon size={16} />
        </div>
      )}

      <div>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ws-text-1)',
          marginBottom: 4,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--ws-text-2)',
          lineHeight: 1.5,
        }}>
          {description}
        </div>
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            alignSelf: 'flex-start',
            height: 32,
            padding: '0 12px',
            borderRadius: 'var(--ws-radius-md)',
            border: '1px solid var(--ws-glass-border-strong)',
            background: 'var(--ws-blue-soft)',
            color: 'var(--ws-blue)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'var(--ws-transition)',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

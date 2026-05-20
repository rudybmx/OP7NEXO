import React from 'react'

interface WSTableShellProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

interface WSTableActionsProps {
  children: React.ReactNode
  gap?: number
  style?: React.CSSProperties
}

interface WSTableProps {
  children: React.ReactNode
  minWidth?: number
  style?: React.CSSProperties
}

export function WSTableShell({ children, style }: WSTableShellProps) {
  return (
    <div
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.06)',
        borderRadius: 14,
        overflowX: 'auto',
        overflowY: 'hidden',
        backdropFilter: 'blur(16px)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function WSTable({ children, minWidth = 980, style }: WSTableProps) {
  return <table style={{ width: '100%', minWidth, borderCollapse: 'collapse', ...style }}>{children}</table>
}

export function WSTableActions({ children, gap = 8, style }: WSTableActionsProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap,
        flexWrap: 'nowrap',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

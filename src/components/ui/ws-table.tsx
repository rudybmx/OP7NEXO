import React from 'react'

/** Estilos de tabela inline — espelham `.ds-table-th` / `.ds-table-td` (globals.css).
 * Use em tabelas montadas com `style={{}}` para padronizar a tipografia (14px). */
export const wsTableHeadStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 1.4,
  textAlign: 'left',
  color: 'var(--ws-text-2)',
}
export const wsTableCellStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  lineHeight: 1.45,
  color: 'var(--ws-text-1)',
}

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
        boxShadow: 'var(--ws-glass-shadow)',
        borderRadius: 14,
        overflowX: 'auto',
        overflowY: 'hidden',
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

'use client'

import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal, Edit2, Plus, Filter, ArrowUpDown, Trash2 } from 'lucide-react'
import type { KanbanColuna } from '@/types/kanban'

interface ColunaMenuProps {
  coluna: KanbanColuna
  onRenomear: (novoNome: string) => void
  onNovoCard: () => void
  onExcluir: () => void
}

export function ColunaMenu({ coluna, onRenomear, onNovoCard, onExcluir }: ColunaMenuProps) {
  const [aberto, setAberto] = useState(false)
  const [renomeando, setRenomeando] = useState(false)
  const [novoNome, setNovoNome] = useState(coluna.nome)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (renomeando && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renomeando])

  function confirmarRename() {
    if (novoNome.trim()) onRenomear(novoNome.trim())
    setRenomeando(false)
    setAberto(false)
  }

  if (renomeando) {
    return (
      <input
        ref={inputRef}
        value={novoNome}
        onChange={e => setNovoNome(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') confirmarRename()
          if (e.key === 'Escape') { setRenomeando(false); setNovoNome(coluna.nome) }
        }}
        onBlur={confirmarRename}
        style={{
          fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)',
          background: 'var(--ws-surface)', border: '1px solid rgba(62,91,255,0.40)',
          borderRadius: 6, padding: '2px 6px', outline: 'none', width: 130,
          fontFamily: 'inherit',
        }}
      />
    )
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setAberto(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--ws-text-2)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center',
          transition: 'all 150ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--ws-glass-bg)'; e.currentTarget.style.color = 'var(--ws-text-1)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--ws-text-2)' }}
      >
        <MoreHorizontal size={14} />
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 200,
          background: 'var(--ws-surface)',
          border: '1px solid var(--ws-glass-border)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 10,
          boxShadow: 'var(--ws-glass-shadow-lg)',
          minWidth: 180,
          overflow: 'hidden',
          padding: '4px 0',
        }}>
          {[
            { icon: Plus, label: 'Novo card', action: () => { onNovoCard(); setAberto(false) } },
            { icon: Edit2, label: 'Renomear', action: () => { setRenomeando(true); setAberto(false) } },
            { icon: ArrowUpDown, label: 'Ordenar', action: () => setAberto(false) },
            { icon: Filter, label: 'Filtrar', action: () => setAberto(false) },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 14px',
                fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ws-text-1)',
                transition: 'background 100ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(62,91,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <item.icon size={13} style={{ color: 'var(--ws-text-2)' }} />
              {item.label}
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--ws-divider)', margin: '4px 0' }} />
          <button
            onClick={() => { if (confirm(`Excluir coluna "${coluna.nome}"?`)) { onExcluir(); setAberto(false) } }}
            style={{
              width: '100%', textAlign: 'left', padding: '8px 14px',
              fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, color: '#FF5C8D',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,92,141,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <Trash2 size={13} />
            Excluir coluna
          </button>
        </div>
      )}
    </div>
  )
}

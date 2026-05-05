'use client'

import { useEffect } from 'react'
import type { FiltrosCriativos } from '@/types/meta-ads-criativos'

const LS_KEY = 'odontocompany-criativos-cols'

interface Props {
  filtros: FiltrosCriativos
  onChange: (f: FiltrosCriativos) => void
  comparadorAtivo: boolean
  onToggleComparador: () => void
}

const selectStyle: React.CSSProperties = {
  fontSize: '12px',
  padding: '5px 8px',
  border: '0.5px solid var(--border)',
  borderRadius: '6px',
  background: 'var(--card)',
  color: 'var(--text)',
  cursor: 'pointer',
  outline: 'none',
}

export function FiltrosCriativos({ filtros, onChange, comparadorAtivo, onToggleComparador }: Props) {
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) {
      const cols = parseInt(saved, 10)
      if ([3, 4, 5, 6, 8].includes(cols)) {
        onChange({ ...filtros, colunas: cols })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(LS_KEY, String(filtros.colunas))
  }, [filtros.colunas])

  function setColunas(n: number) {
    localStorage.setItem(LS_KEY, String(n))
    onChange({ ...filtros, colunas: n })
  }

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
      <select
        style={selectStyle}
        value={filtros.tipo}
        onChange={e => onChange({ ...filtros, tipo: e.target.value })}
      >
        <option value="todos">Todos os tipos</option>
        <option value="IMAGE">Imagem</option>
        <option value="VIDEO">Vídeo</option>
        <option value="CAROUSEL">Carrossel</option>
      </select>

      <select
        style={selectStyle}
        value={filtros.status}
        onChange={e => onChange({ ...filtros, status: e.target.value })}
      >
        <option value="todos">Todos os status</option>
        <option value="evergreen">Evergreen</option>
        <option value="novo">Novo</option>
        <option value="atencao">Atenção</option>
        <option value="fadiga">Fadiga</option>
      </select>

      <select
        style={selectStyle}
        value={filtros.ordenarPor}
        onChange={e => onChange({ ...filtros, ordenarPor: e.target.value as FiltrosCriativos['ordenarPor'] })}
      >
        <option value="score">Ordenar: Score IA</option>
        <option value="hookRate">Hook Rate</option>
        <option value="holdRate">Hold Rate</option>
        <option value="cpl">CPL</option>
        <option value="leads">Leads</option>
        <option value="diasAtivo">Mais antigo</option>
      </select>

      <div style={{ marginLeft: 'auto' }}>
        <button
          onClick={onToggleComparador}
          style={{
            fontSize: '12px',
            padding: '5px 12px',
            borderRadius: '6px',
            border: comparadorAtivo ? '0.5px solid var(--foreground)' : '0.5px solid var(--border)',
            background: comparadorAtivo ? 'color-mix(in srgb, var(--foreground) 8%, transparent)' : 'var(--card)',
            color: comparadorAtivo ? 'var(--foreground)' : 'var(--text2)',
            cursor: 'pointer',
            fontWeight: comparadorAtivo ? 500 : 400,
            transition: 'all 150ms',
          }}
        >
          Comparar selecionados
        </button>
      </div>
    </div>
  )
}

'use client'

import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { FiltrosPublicos, MetricaPublicos } from '@/types/meta-ads-publicos'

interface Props {
  filtros: FiltrosPublicos
  onChange: (f: FiltrosPublicos) => void
  campanhaOptions?: { label: string; value: string }[]
}

const METRICAS: { valor: MetricaPublicos; label: string }[] = [
  { valor: 'leads',        label: 'Leads' },
  { valor: 'cpl',          label: 'CPL' },
  { valor: 'investimento', label: 'Investimento' },
  { valor: 'ctr',          label: 'CTR' },
]

export function FiltrosPublicos({ filtros, onChange, campanhaOptions }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

      {/* Campanhas */}
      <Select
        value={filtros.campanha}
        onValueChange={v => onChange({
          ...filtros,
          campanha: v,
          campaign_id: v === 'todas' ? undefined : v,
        })}
      >
        <SelectTrigger
          className="h-8 text-xs border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)]
                     backdrop-blur-md hover:bg-[var(--ws-glass-bg-hover)] min-w-[160px]
                     max-w-[220px] truncate"
        >
          <SelectValue placeholder="Todas as campanhas" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="min-w-[280px] max-h-[320px] z-[200]
                     bg-[var(--ws-glass-bg-hover)] border-[var(--ws-glass-border)]
                     backdrop-blur-xl"
        >
          {(campanhaOptions ?? [{ label: 'Todas as campanhas', value: 'todas' }]).map(o => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Conjuntos */}
      <Select
        value={filtros.conjunto}
        onValueChange={v => onChange({ ...filtros, conjunto: v })}
      >
        <SelectTrigger
          className="h-8 text-xs border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)]
                     backdrop-blur-md hover:bg-[var(--ws-glass-bg-hover)] min-w-[160px]"
        >
          <SelectValue placeholder="Todos os conjuntos" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="min-w-[200px] z-[200]
                     bg-[var(--ws-glass-bg-hover)] border-[var(--ws-glass-border)]
                     backdrop-blur-xl"
        >
          <SelectItem value="todos" className="text-xs">Todos os conjuntos</SelectItem>
        </SelectContent>
      </Select>

      {/* Toggle de métrica */}
      <div style={{ marginLeft: 'auto' }}>
        <div style={{
          display: 'inline-flex',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-md)',
          overflow: 'hidden',
          background: 'var(--ws-glass-bg)',
          backdropFilter: 'blur(10px)',
        }}>
          {METRICAS.map((m, i) => (
            <button
              key={m.valor}
              type="button"
              onClick={() => onChange({ ...filtros, metrica: m.valor })}
              style={{
                height: 32, padding: '0 12px',
                fontSize: 12, fontWeight: filtros.metrica === m.valor ? 500 : 400,
                background: filtros.metrica === m.valor ? 'rgba(62,91,255,0.12)' : 'transparent',
                color: filtros.metrica === m.valor ? 'var(--ws-blue)' : 'var(--ws-text-3)',
                border: 'none', cursor: 'pointer',
                borderRight: i < METRICAS.length - 1 ? '1px solid var(--ws-divider)' : 'none',
                transition: 'var(--ws-transition)', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (filtros.metrica !== m.valor) e.currentTarget.style.background = 'rgba(62,91,255,0.06)' }}
              onMouseLeave={e => { if (filtros.metrica !== m.valor) e.currentTarget.style.background = 'transparent' }}
            >{m.label}</button>
          ))}
        </div>
      </div>

    </div>
  )
}

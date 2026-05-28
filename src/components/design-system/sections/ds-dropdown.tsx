'use client'

import { useState } from 'react'
import { ChevronDown, Calendar as CalendarIcon, Check } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import {
  DateRangePickerRefinado,
  buildDateRangeShortcuts,
  type DateRangeShortcut,
} from '@/components/ui/date-range-picker-refinado'

type Periodo = '7d' | '30d' | '90d' | 'custom'

function GlassSelect({ options, value, onChange }: {
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value)

  return (
    <div style={{ position: 'relative', width: 200 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', height: 32, padding: '0 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
          backdropFilter: 'blur(10px)', borderRadius: 'var(--ws-radius-md)',
          boxShadow: 'var(--ws-glass-shadow-sm)', fontSize: 12,
          color: 'var(--ws-text-1)', cursor: 'pointer',
          transition: 'var(--ws-transition)',
        }}
      >
        <span>{selected?.label}</span>
        <ChevronDown size={12} style={{ color: 'var(--ws-text-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 100,
          background: 'var(--ws-glass-bg-hover)',
          border: '1px solid var(--ws-glass-border)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 'var(--ws-radius-md)',
          boxShadow: 'var(--ws-glass-shadow-lg)',
          overflow: 'hidden',
        }}>
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px',
                fontSize: 12, color: o.value === value ? 'var(--ws-blue)' : 'var(--ws-text-1)',
                fontWeight: o.value === value ? 500 : 400,
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'var(--ws-transition)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(62,91,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {o.value === value && <Check size={11} style={{ color: 'var(--ws-blue)' }} />}
              {o.value !== value && <div style={{ width: 11 }} />}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ToggleGroup({ options, value, onChange }: {
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-md)',
      overflow: 'hidden',
      background: 'var(--ws-glass-bg)',
      backdropFilter: 'blur(10px)',
    }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            height: 32, padding: '0 12px',
            fontSize: 12, fontWeight: o.value === value ? 500 : 400,
            background: o.value === value ? 'rgba(62,91,255,0.12)' : 'transparent',
            color: o.value === value ? 'var(--ws-blue)' : 'var(--ws-text-3)',
            border: 'none', cursor: 'pointer',
            borderRight: '1px solid var(--ws-divider)',
            transition: 'var(--ws-transition)',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = 'rgba(62,91,255,0.06)' }}
          onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = 'transparent' }}
        >{o.label}</button>
      ))}
    </div>
  )
}

function DateRangePicker() {
  const [periodo, setPeriodo] = useState<Periodo>('30d')

  const atalhos: { label: string; value: Periodo }[] = [
    { label: 'Hoje', value: '7d' },
    { label: '7 dias', value: '7d' },
    { label: '30 dias', value: '30d' },
    { label: '90 dias', value: '90d' },
    { label: 'Personalizado', value: 'custom' },
  ]

  return (
    <div style={{
      background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
      backdropFilter: 'blur(16px)', borderRadius: 'var(--ws-radius-lg)',
      boxShadow: 'var(--ws-glass-shadow)', padding: 16,
      display: 'inline-flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Atalhos */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {atalhos.map(a => (
          <button
            key={a.value + a.label}
            type="button"
            onClick={() => setPeriodo(a.value)}
            style={{
              height: 28, padding: '0 12px', borderRadius: 9999,
              fontSize: 11, fontWeight: 500,
              background: periodo === a.value ? 'rgba(62,91,255,0.12)' : 'transparent',
              border: `1px solid ${periodo === a.value ? 'rgba(62,91,255,0.30)' : 'var(--ws-glass-border)'}`,
              color: periodo === a.value ? 'var(--ws-blue)' : 'var(--ws-text-2)',
              cursor: 'pointer', transition: 'var(--ws-transition)',
            }}
          >{a.label}</button>
        ))}
      </div>

      {periodo === 'custom' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <CalendarIcon size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)', pointerEvents: 'none' }} />
            <input type="date" style={{
              height: 32, paddingLeft: 26, paddingRight: 8,
              background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
              borderRadius: 8, fontSize: 11, color: 'var(--ws-text-1)', outline: 'none',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>até</span>
          <div style={{ position: 'relative' }}>
            <CalendarIcon size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)', pointerEvents: 'none' }} />
            <input type="date" style={{
              height: 32, paddingLeft: 26, paddingRight: 8,
              background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
              borderRadius: 8, fontSize: 11, color: 'var(--ws-text-1)', outline: 'none',
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

export function DSDropdown() {
  const [select1, setSelect1] = useState('all')
  const [select2, setSelect2] = useState('leads')
  const [toggle1, setToggle1] = useState('leads')
  const [toggle2, setToggle2] = useState('semana')
  const [dsRange, setDsRange] = useState<DateRange | undefined>(undefined)
  const [dsShortcut, setDsShortcut] = useState<string | null>(null)
  const dsShortcuts = buildDateRangeShortcuts()

  const handleDsRangeChange = (range: DateRange | undefined) => {
    setDsRange(range)
    setDsShortcut(range ? 'personalizado' : null)
  }

  const handleDsShortcutSelect = (shortcut: DateRangeShortcut) => {
    setDsShortcut(shortcut.id)
    setDsRange(shortcut.range)
  }

  const handleDsCancel = () => {
    setDsRange(undefined)
    setDsShortcut(null)
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', marginBottom: 6 }}>Dropdowns & Filtros</h2>
        <p style={{ fontSize: 14, color: 'var(--ws-text-2)', lineHeight: 1.6 }}>
          Select glass, toggle group de métricas, e date range picker com atalhos.
        </p>
      </div>

      <div style={{
        background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)', backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)', padding: 24,
        position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 28,
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />

        <div>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ws-text-3)', marginBottom: 12 }}>Select Glass</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <GlassSelect
              value={select1}
              onChange={setSelect1}
              options={[
                { label: 'Todos os status', value: 'all' },
                { label: 'Ativo', value: 'active' },
                { label: 'Pausado', value: 'paused' },
                { label: 'Aprendendo', value: 'learning' },
              ]}
            />
            <GlassSelect
              value={select2}
              onChange={setSelect2}
              options={[
                { label: 'Leads', value: 'leads' },
                { label: 'CPL', value: 'cpl' },
                { label: 'Investimento', value: 'invest' },
                { label: 'ROAS', value: 'roas' },
              ]}
            />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ws-text-3)', marginBottom: 12 }}>Toggle Group de Métrica</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ToggleGroup
              value={toggle1}
              onChange={setToggle1}
              options={[
                { label: 'Leads', value: 'leads' },
                { label: 'CPL', value: 'cpl' },
                { label: 'Investimento', value: 'invest' },
                { label: 'CTR', value: 'ctr' },
              ]}
            />
            <ToggleGroup
              value={toggle2}
              onChange={setToggle2}
              options={[
                { label: 'Dia', value: 'dia' },
                { label: 'Semana', value: 'semana' },
                { label: 'Mês', value: 'mes' },
              ]}
            />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ws-text-3)', marginBottom: 12 }}>Date Range com Atalhos</div>
          <DateRangePicker />
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--ws-text-3)', marginBottom: 12 }}>
            Date Range Picker — Refinado
          </div>
          <DateRangePickerRefinado
            range={dsRange}
            shortcuts={dsShortcuts}
            selectedShortcutId={dsShortcut}
            onRangeChange={handleDsRangeChange}
            onShortcutSelect={handleDsShortcutSelect}
            onCancel={handleDsCancel}
            onApply={() => undefined}
            style={{ maxWidth: 680 }}
          />
        </div>
      </div>
    </div>
  )
}

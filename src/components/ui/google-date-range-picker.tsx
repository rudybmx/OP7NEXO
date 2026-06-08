'use client'

/**
 * GoogleDateRangePicker — date range picker glassmorphism adaptado do 21dev Calendar.
 * Auto-contido: sem date-fns-tz, sem sub-componentes externos.
 * Tokens: var(--ws-*) do design system do projeto.
 */

import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isEqual,
  isSameDay,
  isSameMonth,
  isToday,
  isWithinInterval,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  isValid,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

export interface DateRange {
  start: Date
  end: Date
}

interface GoogleDateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLabel(range: DateRange): string {
  const s = range.start
  const e = range.end
  const sameYear = s.getFullYear() === e.getFullYear()
  const sameMonth = sameYear && s.getMonth() === e.getMonth()

  if (isSameDay(s, e)) return format(s, 'd MMM yyyy', { locale: ptBR })
  if (sameMonth) return `${format(s, 'd', { locale: ptBR })} – ${format(e, 'd MMM yyyy', { locale: ptBR })}`
  if (sameYear) return `${format(s, 'd MMM', { locale: ptBR })} – ${format(e, 'd MMM yyyy', { locale: ptBR })}`
  return `${format(s, 'd MMM yy', { locale: ptBR })} – ${format(e, 'd MMM yy', { locale: ptBR })}`
}

function buildPresets(): { label: string; range: DateRange }[] {
  const hoje = new Date()
  return [
    { label: 'Hoje',            range: { start: startOfDay(hoje), end: endOfDay(hoje) } },
    { label: 'Ontem',           range: { start: startOfDay(subDays(hoje, 1)), end: endOfDay(subDays(hoje, 1)) } },
    { label: 'Últimos 7 dias',  range: { start: startOfDay(subDays(hoje, 6)), end: endOfDay(hoje) } },
    { label: 'Últimos 30 dias', range: { start: startOfDay(subDays(hoje, 29)), end: endOfDay(hoje) } },
    { label: 'Últimos 90 dias', range: { start: startOfDay(subDays(hoje, 89)), end: endOfDay(hoje) } },
    { label: 'Este mês',        range: { start: startOfMonth(hoje), end: endOfDay(hoje) } },
    { label: 'Mês passado',     range: { start: startOfMonth(subMonths(hoje, 1)), end: endOfDay(endOfMonth(subMonths(hoje, 1))) } },
    { label: 'Últimos 6 meses', range: { start: startOfDay(subMonths(hoje, 6)), end: endOfDay(hoje) } },
  ]
}

function parseInput(val: string): Date | null {
  const formats = ['dd/MM/yyyy', 'dd/MM/yy', 'yyyy-MM-dd', 'd/M/yyyy']
  for (const f of formats) {
    const d = parse(val, f, new Date())
    if (isValid(d)) return d
  }
  return null
}

// ── Styles helpers ─────────────────────────────────────────────────────────────

const GLASS: React.CSSProperties = {
  background: 'var(--ws-glass-bg)',
  border: '1px solid var(--ws-glass-border)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
}

const POPOVER: React.CSSProperties = {
  ...GLASS,
  borderRadius: 14,
  boxShadow: 'var(--ws-glass-shadow-lg)',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GoogleDateRangePicker({ value, onChange }: GoogleDateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState<Date>(value.start)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  // Seleção interativa: fase 'start' = aguardando segundo clique
  const [selecting, setSelecting] = useState<{ start: Date } | null>(null)

  // Inputs manuais
  const [inputStart, setInputStart] = useState(format(value.start, 'dd/MM/yyyy'))
  const [inputEnd, setInputEnd] = useState(format(value.end, 'dd/MM/yyyy'))
  const [errStart, setErrStart] = useState(false)
  const [errEnd, setErrEnd] = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)

  // Click outside fecha
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSelecting(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Sincroniza inputs quando value muda externamente
  useEffect(() => {
    setInputStart(format(value.start, 'dd/MM/yyyy'))
    setInputEnd(format(value.end, 'dd/MM/yyyy'))
  }, [value])

  // ── Calendário ───────────────────────────────────────────────────────────────

  const daysArray: Date[] = []
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  let d = startOfWeek(monthStart, { weekStartsOn: 1 })
  const limit = endOfWeek(monthEnd, { weekStartsOn: 1 })
  while (d <= limit) {
    daysArray.push(d)
    d = addDays(d, 1)
  }

  const activeStart = selecting?.start ?? value.start
  const activeEnd = selecting
    ? (hoverDate ?? activeStart)
    : value.end

  const handleDayClick = (day: Date) => {
    if (!selecting) {
      // Primeiro clique: inicia seleção
      setSelecting({ start: startOfDay(day) })
      setHoverDate(null)
    } else {
      // Segundo clique: confirma range
      let s = selecting.start
      let e = endOfDay(day)
      if (day < s) { e = endOfDay(s); s = startOfDay(day) }
      onChange({ start: s, end: e })
      setSelecting(null)
      setHoverDate(null)
      setOpen(false)
    }
  }

  // ── Apply manual ─────────────────────────────────────────────────────────────

  const handleApply = () => {
    const ps = parseInput(inputStart)
    const pe = parseInput(inputEnd)
    if (!ps) { setErrStart(true); return } else setErrStart(false)
    if (!pe) { setErrEnd(true); return } else setErrEnd(false)
    const s = startOfDay(ps)
    const e = endOfDay(pe)
    onChange(s <= e ? { start: s, end: e } : { start: e, end: s })
    setOpen(false)
    setSelecting(null)
  }

  // ── Presets ──────────────────────────────────────────────────────────────────

  const presets = buildPresets()
  const activePreset = presets.find(
    p => isSameDay(p.range.start, value.start) && isSameDay(p.range.end, value.end)
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          setOpen(v => !v)
          setSelecting(null)
          setCurrentMonth(value.start)
        }}
        style={{
          height: 32,
          padding: '0 10px',
          display: 'flex', alignItems: 'center', gap: 6,
          ...GLASS,
          borderRadius: 'var(--ws-radius-md)',
          boxShadow: 'var(--ws-glass-shadow-sm)',
          fontSize: 12, color: 'var(--ws-text-1)', cursor: 'pointer',
          transition: 'background 150ms', whiteSpace: 'nowrap',
          minWidth: 180,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--ws-glass-bg-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--ws-glass-bg)' }}
      >
        <Calendar size={12} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {activePreset?.label ?? formatLabel(value)}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: 'var(--ws-text-3)', flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 150ms',
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          ...POPOVER,
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 6,
          zIndex: 100,
          display: 'flex',
          overflow: 'hidden',
          minWidth: 560,
        }}>
          {/* Coluna esquerda: presets */}
          <div style={{
            width: 168,
            flexShrink: 0,
            borderRight: '1px solid var(--ws-glass-border)',
            padding: '10px 0',
          }}>
            <div style={{ padding: '0 10px 6px', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ws-text-3)' }}>
              Períodos
            </div>
            {presets.map(p => {
              const isActive = activePreset?.label === p.label
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onChange(p.range)
                    setSelecting(null)
                    setOpen(false)
                  }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '6px 12px',
                    fontSize: 12,
                    color: isActive ? 'var(--ws-blue)' : 'var(--ws-text-1)',
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? 'var(--ws-blue-soft)' : 'none',
                    border: 'none', cursor: 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--ws-glass-bg-hover)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none' }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Coluna direita: calendário + inputs */}
          <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Cabeçalho do mês */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', textTransform: 'capitalize' }}>
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </span>
              <div style={{ display: 'flex', gap: 2 }}>
                <NavBtn onClick={() => setCurrentMonth(m => subMonths(m, 1))}><ChevronLeft size={14} /></NavBtn>
                <NavBtn onClick={() => setCurrentMonth(m => addMonths(m, 1))}><ChevronRight size={14} /></NavBtn>
              </div>
            </div>

            {/* Grid dias da semana */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', gap: '2px 0', marginBottom: 2 }}>
              {['S','T','Q','Q','S','S','D'].map((d, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--ws-text-3)', fontWeight: 600, letterSpacing: '0.06em', padding: '2px 0' }}>{d}</div>
              ))}
            </div>

            {/* Dias */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px 0' }}>
              {daysArray.map((day, idx) => {
                const inCurrentMonth = isSameMonth(day, currentMonth)
                const isStart = isSameDay(day, activeStart)
                const isEnd = isSameDay(day, selecting ? (hoverDate ?? activeStart) : value.end)
                const rangeEnd = selecting ? (hoverDate ?? activeStart) : value.end
                const inRange = isWithinInterval(day, {
                  start: activeStart <= rangeEnd ? activeStart : rangeEnd,
                  end: activeStart <= rangeEnd ? rangeEnd : activeStart,
                })
                const todayDay = isToday(day)

                let bg = 'transparent'
                let color = inCurrentMonth ? 'var(--ws-text-1)' : 'var(--ws-text-3)'
                let borderRadius = '6px'
                let fontWeight: React.CSSProperties['fontWeight'] = 400
                let border = 'none'

                if (isStart || isEnd) {
                  bg = 'var(--ws-blue)'
                  color = '#fff'
                  fontWeight = 600
                  border = 'none'
                } else if (inRange) {
                  bg = 'var(--ws-blue-soft)'
                  borderRadius = '0'
                } else if (todayDay) {
                  border = '1px solid var(--ws-blue)'
                  color = 'var(--ws-blue)'
                  fontWeight = 600
                }

                // Arredondar extremidades do range
                if (inRange && isStart) borderRadius = '6px 0 0 6px'
                else if (inRange && isEnd) borderRadius = '0 6px 6px 0'

                return (
                  <div
                    key={idx}
                    onMouseEnter={() => selecting && setHoverDate(startOfDay(day))}
                    onClick={() => handleDayClick(day)}
                    style={{
                      position: 'relative',
                      height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      background: bg,
                      borderRadius,
                      color,
                      fontWeight,
                      fontSize: 12,
                      border,
                      opacity: inCurrentMonth ? 1 : 0.35,
                      transition: 'background 100ms',
                      userSelect: 'none',
                    }}
                    onMouseEnterCapture={e => {
                      if (!isStart && !isEnd && !inRange) {
                        (e.currentTarget as HTMLElement).style.background = 'var(--ws-glass-bg-hover)'
                      }
                    }}
                    onMouseLeaveCapture={e => {
                      if (!isStart && !isEnd && !inRange) {
                        (e.currentTarget as HTMLElement).style.background = bg
                      }
                    }}
                  >
                    {format(day, 'd')}
                  </div>
                )
              })}
            </div>

            {/* Divisor */}
            <div style={{ borderTop: '1px solid var(--ws-glass-border)', margin: '0 -16px' }} />

            {/* Inputs manuais + Apply */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <DateInput label="Início" value={inputStart} onChange={setInputStart} error={errStart} />
              <DateInput label="Fim" value={inputEnd} onChange={setInputEnd} error={errEnd} />
              <button
                type="button"
                onClick={handleApply}
                style={{
                  height: 32, padding: '0 14px',
                  background: 'var(--ws-blue)', color: '#fff',
                  border: 'none', borderRadius: 'var(--ws-radius-md)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'opacity 150ms', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                Aplicar
              </button>
            </div>

            {/* Hint seleção */}
            {selecting && (
              <div style={{ fontSize: 11, color: 'var(--ws-text-3)', textAlign: 'center', marginTop: -4 }}>
                Clique em uma data para definir o fim do período
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-componentes internos ─────────────────────────────────────────────────

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: '1px solid var(--ws-glass-border)',
        borderRadius: 6, cursor: 'pointer', color: 'var(--ws-text-2)',
        transition: 'background 120ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--ws-glass-bg-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {children}
    </button>
  )
}

function DateInput({ label, value, onChange, error }: {
  label: string
  value: string
  onChange: (v: string) => void
  error: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--ws-text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="dd/mm/aaaa"
        style={{
          height: 32, padding: '0 10px',
          background: 'var(--ws-glass-bg)',
          border: `1px solid ${error ? '#ef4444' : 'var(--ws-glass-border)'}`,
          borderRadius: 'var(--ws-radius-md)',
          fontSize: 12, color: 'var(--ws-text-1)',
          outline: 'none', width: '100%',
          boxSizing: 'border-box',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--ws-blue)' }}
        onBlur={e => { e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--ws-glass-border)' }}
      />
    </div>
  )
}

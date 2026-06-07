'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Moon, Sun, ArrowLeft } from 'lucide-react'
import { useTheme } from '@/components/provedores/provedor-tema'
import { DS2Button } from './sections/ds2-button'
import { DS2Input } from './sections/ds2-input'
import { DS2Select } from './sections/ds2-select'
import { DS2Checkbox } from './sections/ds2-checkbox'
import { DS2Switch } from './sections/ds2-switch'
import { DS2Slider } from './sections/ds2-slider'
import { DS2Chip } from './sections/ds2-chip'
import { DS2Avatar } from './sections/ds2-avatar'
import { DS2Card } from './sections/ds2-card'
import { DS2Modal } from './sections/ds2-modal'
import { DS2Dropdown } from './sections/ds2-dropdown'
import { DS2Table } from './sections/ds2-table'
import { DS2Tabs } from './sections/ds2-tabs'
import { DS2Pagination } from './sections/ds2-pagination'
import { DS2Tooltip } from './sections/ds2-tooltip'
import { DS2Progress } from './sections/ds2-progress'
import { DS2Spinner } from './sections/ds2-spinner'
import { DS2Autocomplete } from './sections/ds2-autocomplete'
import { DS2DatePicker } from './sections/ds2-datepicker'
import { DS2Atendimento } from './sections/ds2-atendimento'

const SECTIONS = [
  { id: 'button',       label: 'Button' },
  { id: 'input',        label: 'Input / TextField' },
  { id: 'select',       label: 'Select' },
  { id: 'checkbox',     label: 'Checkbox / Radio' },
  { id: 'switch',       label: 'Switch' },
  { id: 'slider',       label: 'Slider' },
  { id: 'chip',         label: 'Chip' },
  { id: 'avatar',       label: 'Avatar' },
  { id: 'card',         label: 'Card' },
  { id: 'modal',        label: 'Modal' },
  { id: 'dropdown',     label: 'Dropdown / Menu' },
  { id: 'table',        label: 'Table' },
  { id: 'tabs',         label: 'Tabs' },
  { id: 'pagination',   label: 'Pagination' },
  { id: 'tooltip',      label: 'Tooltip' },
  { id: 'progress',     label: 'Progress' },
  { id: 'spinner',      label: 'Spinner' },
  { id: 'autocomplete', label: 'Autocomplete' },
  { id: 'datepicker',   label: 'Date Picker' },
  { id: 'atendimento',  label: 'Atendimento / Inbox' },
]

const SECTION_MAP: Record<string, React.ReactNode> = {
  button:       <DS2Button />,
  input:        <DS2Input />,
  select:       <DS2Select />,
  checkbox:     <DS2Checkbox />,
  switch:       <DS2Switch />,
  slider:       <DS2Slider />,
  chip:         <DS2Chip />,
  avatar:       <DS2Avatar />,
  card:         <DS2Card />,
  modal:        <DS2Modal />,
  dropdown:     <DS2Dropdown />,
  table:        <DS2Table />,
  tabs:         <DS2Tabs />,
  pagination:   <DS2Pagination />,
  tooltip:      <DS2Tooltip />,
  progress:     <DS2Progress />,
  spinner:      <DS2Spinner />,
  autocomplete: <DS2Autocomplete />,
  datepicker:   <DS2DatePicker />,
  atendimento:  <DS2Atendimento />,
}

export function DS2Shell() {
  const [active, setActive] = useState('button')
  const { theme, setTheme } = useTheme()

  return (
    <div
      className="ds2-shell-root"
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        background: 'var(--bg)',
        fontSize: 13, /* herança para Checkbox/Switch labels que não usam text-sm */
        /* Restore HeroUI canonical tokens — project overrides these with smaller values */
        ['--accent' as string]:     'oklch(0.6204 0.195 253.83)',
        ['--radius' as string]:     '0.5rem',
        ['--radius-sm' as string]:  '4px',
        ['--radius-md' as string]:  '6px',
        ['--radius-lg' as string]:  '8px',
        ['--radius-xl' as string]:  '12px',
        ['--radius-2xl' as string]: '16px',
        ['--radius-3xl' as string]: '24px',
        ['--radius-4xl' as string]: '32px',
        /* Tailwind v4: @apply text-sm expands to font-size: var(--text-sm) — override to match platform 13px */
        ['--text-sm' as string]: '0.8125rem',
      }}
    >
      {/* Sidebar */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--ws-text-1)',
              letterSpacing: '-0.01em',
            }}>
              HeroUI v3.1
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'oklch(0.6204 0.195 253.83)',
              color: '#fff',
              letterSpacing: '0.02em',
            }}>
              react-aria
            </span>
          </div>
          <Link
            href="/design-system"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'var(--ws-text-2)',
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={11} />
            v1 Glassmorphism
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 8px' }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 10px',
                borderRadius: 6,
                fontSize: 13,
                border: 'none',
                cursor: 'pointer',
                marginBottom: 1,
                transition: 'all 0.12s',
                background: active === s.id ? 'oklch(0.6204 0.195 253.83)' : 'transparent',
                color: active === s.id ? '#fff' : 'var(--ws-text-1)',
                fontWeight: active === s.id ? 500 : 400,
              }}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Alternar tema"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 8px',
              cursor: 'pointer',
              color: 'var(--ws-text-2)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px 40px',
        minWidth: 0,
      }}>
        {SECTION_MAP[active]}
      </main>
    </div>
  )
}

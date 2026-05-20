'use client'
import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/provedores/provedor-tema'
import { DSCores } from './sections/ds-cores'
import { DSTipografia } from './sections/ds-tipografia'
import { DSSidebar } from './sections/ds-sidebar'
import { DSCards } from './sections/ds-cards'
import { DSKpiCards } from './sections/ds-kpi-cards'
import { DSBadges } from './sections/ds-badges'
import { DSBotoes } from './sections/ds-botoes'
import { DSInputs } from './sections/ds-inputs'
import { DSTabela } from './sections/ds-tabela'
import { DSGraficos } from './sections/ds-graficos'
import { DSHeatmap } from './sections/ds-heatmap'
import { DSInsightsIA } from './sections/ds-insights-ia'
import { DSModais } from './sections/ds-modais'
import { DSDropdown } from './sections/ds-dropdown'
import { DSSkeleton } from './sections/ds-skeleton'
import { DSTabs } from './sections/ds-tabs'
import { DSMiniGauge } from './sections/ds-mini-gauge'
import { DSCrmInbox } from './sections/ds-crm-inbox'
import { DSCrmContatos } from './sections/ds-crm-contatos'
import { DSCrmChat } from './sections/ds-crm-chat'
import { GLMCrmInbox } from './sections/glm-crm/glm-crm-inbox'
import { GLMCrmContatos } from './sections/glm-crm/glm-crm-contatos'
import { GLMCrmChat } from './sections/glm-crm/glm-crm-chat'
import { DSFunil } from './sections/ds-funil'

const SECTIONS = [
  { id: 'cores',      label: '🎨 Cores & Tokens' },
  { id: 'tipografia', label: '📝 Tipografia' },
  { id: 'sidebar',    label: '◧ Sidebar' },
  { id: 'cards',      label: '⬜ Glass Cards' },
  { id: 'kpi',        label: '📊 KPI Cards' },
  { id: 'badges',     label: '🏷 Badges & Pills' },
  { id: 'botoes',     label: '⚡ Botões' },
  { id: 'inputs',     label: '✏️ Inputs & Forms' },
  { id: 'tabela',     label: '📋 Tabelas' },
  { id: 'graficos',   label: '📈 Gráficos' },
  { id: 'heatmap',    label: '🌡 Heatmaps' },
  { id: 'insights',   label: '🤖 Insights IA' },
  { id: 'modais',     label: '🪟 Modais' },
  { id: 'modal-anuncios', label: 'Modal Anúncios', href: '/design-system/modal-anuncios' },
  { id: 'dropdown',   label: '⬇ Dropdowns' },
  { id: 'tabs',       label: '↔ Tabs & Navegação' },
  { id: 'minigauge',  label: '◎ Mini Gauge' },
  { id: 'skeleton',   label: '💀 Skeleton' },
  { id: 'crm-inbox',    label: '💬 CRM · Inbox' },
  { id: 'crm-contatos', label: '👥 CRM · Contatos' },
  { id: 'crm-chat',     label: '💬 CRM · Chat' },
  { id: 'glm-inbox',    label: '🧪 GLM · Inbox' },
  { id: 'glm-contatos', label: '🧪 GLM · Contatos' },
  { id: 'glm-chat',     label: '🧪 GLM · Chat' },
  { id: 'funil',        label: '🔻 Funil de Campanhas' },
]

const SECTION_MAP: Record<string, React.ReactNode> = {
  cores: <DSCores />,
  tipografia: <DSTipografia />,
  sidebar: <DSSidebar />,
  cards: <DSCards />,
  kpi: <DSKpiCards />,
  badges: <DSBadges />,
  botoes: <DSBotoes />,
  inputs: <DSInputs />,
  tabela: <DSTabela />,
  graficos: <DSGraficos />,
  heatmap: <DSHeatmap />,
  insights: <DSInsightsIA />,
  modais: <DSModais />,
  dropdown: <DSDropdown />,
  tabs: <DSTabs />,
  minigauge: <DSMiniGauge />,
  skeleton: <DSSkeleton />,
  'crm-inbox':    <DSCrmInbox />,
  'crm-contatos': <DSCrmContatos />,
  'crm-chat':     <DSCrmChat />,
  'glm-inbox':    <GLMCrmInbox />,
  'glm-contatos': <GLMCrmContatos />,
  'glm-chat':     <GLMCrmChat />,
  funil: <DSFunil />,
}

export function DSShell() {
  const [activeSection, setActiveSection] = useState('cores')
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const isDark = theme === 'dark'

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      background: 'var(--ws-page-bg)',
      fontFamily: 'var(--font-plus-jakarta-sans), ui-sans-serif, system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Sidebar DS */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        height: '100vh',
        overflowY: 'auto',
        background: 'var(--ws-sidebar-bg)',
        borderRight: '1px solid var(--ws-sidebar-border)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 14px',
        scrollbarWidth: 'none',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: 'white', fontWeight: 700, flexShrink: 0,
          }}>W</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ws-text-1)', lineHeight: 1.2 }}>Op7 Nexo</div>
            <div style={{ fontSize: 9, color: 'var(--ws-text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Design System</div>
          </div>
        </div>

        {/* Badge versão */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'var(--ws-blue-soft)', border: '1px solid rgba(62,91,255,0.20)',
          borderRadius: 'var(--ws-radius-full)', padding: '2px 10px',
          fontSize: 10, fontWeight: 600, color: 'var(--ws-blue)',
          marginBottom: 20, alignSelf: 'flex-start',
        }}>v2.0 Glassmorphism</div>

        {/* Nav */}
        <nav style={{ flex: 1 }}>
          {SECTIONS.map(s => {
            const isActive = activeSection === s.id
            const navStyle = {
              width: '100%',
              textAlign: 'left' as const,
              display: 'flex',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 2,
              cursor: 'pointer',
              border: 'none',
              transition: 'var(--ws-transition)',
              background: isActive ? 'var(--ws-glass-bg-hover)' : 'transparent',
              color: isActive ? 'var(--ws-blue)' : 'var(--ws-text-2)',
              fontWeight: isActive ? 500 : 400,
              boxShadow: isActive ? 'var(--ws-glass-shadow-sm)' : 'none',
              borderWidth: isActive ? 1 : 0,
              borderStyle: 'solid',
              borderColor: isActive ? 'rgba(62,91,255,0.15)' : 'transparent',
              textDecoration: 'none',
            }

            if ('href' in s && s.href) {
              return (
                <Link key={s.id} href={s.href} style={navStyle}>
                  {s.label}
                </Link>
              )
            }

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                style={navStyle}
              >
                {s.label}
              </button>
            )
          })}
        </nav>

        {/* Theme toggle no rodapé */}
        <div style={{ borderTop: '1px solid var(--ws-divider)', paddingTop: 14, marginTop: 8 }}>
          {mounted && (
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '7px 10px',
                borderRadius: 8, border: '1px solid var(--ws-glass-border)',
                background: 'var(--ws-glass-bg)', backdropFilter: 'blur(10px)',
                cursor: 'pointer', fontSize: 12, color: 'var(--ws-text-2)',
                transition: 'var(--ws-transition)',
              }}
            >
              {isDark
                ? <Sun size={14} color="var(--ws-blue)" />
                : <Moon size={14} color="var(--ws-blue)" />}
              {isDark ? 'Modo claro' : 'Modo escuro'}
            </button>
          )}
        </div>
      </aside>

      {/* Content */}
      <main style={{
        flex: 1, overflowY: 'auto', padding: '32px 40px',
        scrollbarWidth: 'thin',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {SECTION_MAP[activeSection]}
        </div>
      </main>
    </div>
  )
}

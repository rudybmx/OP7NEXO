'use client'

import { useState, useEffect } from 'react'
import { subDays, startOfDay, endOfDay } from 'date-fns'
import {
  ChevronDown,
  Check,
  LayoutDashboard,
  Megaphone,
  Users,
  Type,
  Image,
  Globe
} from 'lucide-react'
import type { FiltrosGoogle } from '@/types/google-ads'
import { useWorkspace } from '@/lib/workspace-context'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api-client'
import { VisaoGeralGoogle } from './visao-geral'
import { AbaCampanhasGoogle } from './campanhas'
import { AbaGruposGoogle } from './grupos'
import { AbaPalavrasChaveGoogle } from './palavras-chave'
import { AbaAnunciosGoogle } from './anuncios'
import { AbaPublicosGoogle } from './publicos'
import { BreadcrumbMobile } from '@/components/ui/breadcrumb-mobile'
import { GoogleDateRangePicker } from '@/components/ui/google-date-range-picker'
import { siGoogle } from 'simple-icons'

const ABAS_CONFIG = [
  { id: 'Visão geral',          icon: LayoutDashboard },
  { id: 'Campanhas',            icon: Megaphone },
  { id: 'Grupos de anúncios',   icon: Users },
  { id: 'Palavras-chave',       icon: Type },
  { id: 'Anúncios',             icon: Image },
  { id: 'Públicos',             icon: Globe },
] as const

type Aba = typeof ABAS_CONFIG[number]['id']

function GlassSelect({ label, value, onChange, options, minWidth = 160 }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  minWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value)
  
  return (
    <div style={{ position: 'relative', minWidth }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', height: 32, padding: '0 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          borderRadius: 'var(--ws-radius-md)', boxShadow: 'var(--ws-glass-shadow-sm)',
          fontSize: 12, color: 'var(--ws-text-1)', cursor: 'pointer',
          transition: 'var(--ws-transition)', whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--ws-glass-bg-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--ws-glass-bg)' }}
      >
        <span>{selected?.label ?? label}</span>
        <ChevronDown size={12} style={{ color: 'var(--ws-text-3)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 100,
          background: 'var(--ws-glass-bg-hover)', border: '1px solid var(--ws-glass-border)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 'var(--ws-radius-md)', boxShadow: 'var(--ws-glass-shadow-lg)',
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
              {o.value === value
                ? <Check size={11} style={{ color: 'var(--ws-blue)', flexShrink: 0 }} />
                : <div style={{ width: 11 }} />}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PaginaGoogleAds() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('Visão geral')
  const [filtros, setFiltros] = useState<FiltrosGoogle>({
    dateRange: { start: startOfDay(subDays(new Date(), 30)), end: endOfDay(new Date()) },
    tipoCampanha: 'todas',
    status: 'todos',
  })

  const { workspaceAtivo } = useWorkspace()
  const wsId = workspaceAtivo?.id
  const { user } = useAuth()
  const isAdmin = user?.role === 'platform_admin'

  const [contasGoogle, setContasGoogle] = useState<{ id: string; account_name: string }[]>([])
  const [selectedContaId, setSelectedContaId] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      try {
        if (isAdmin) {
          // Admin vê todas as contas Google de todos os workspaces
          const all = await api.get<{ id: string; account_name: string; plataforma: string }[]>('/ads-accounts')
          setContasGoogle(all.filter(c => c.plataforma === 'google'))
        } else if (wsId) {
          const all = await api.get<{ id: string; account_name: string; plataforma: string }[]>(
            `/workspaces/${wsId}/ads-accounts`
          )
          setContasGoogle(all.filter(c => c.plataforma === 'google'))
        }
      } catch {
        // silencioso
      }
    }
    load()
  }, [isAdmin, wsId])

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Filtros globais */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {/* Seletor de conta — primeiro na barra */}
        {contasGoogle.length > 0 && (
          <GlassSelect
            label="Todas as contas"
            value={selectedContaId}
            onChange={setSelectedContaId}
            minWidth={180}
            options={[
              { label: 'Todas as contas', value: '' },
              ...contasGoogle.map(c => ({ label: c.account_name, value: c.id })),
            ]}
          />
        )}

        <GlassSelect
          label="Todos os tipos"
          value={filtros.tipoCampanha}
          onChange={v => setFiltros(f => ({ ...f, tipoCampanha: v }))}
          options={[
            { label: 'Todos os tipos', value: 'todas' },
            { label: 'Search', value: 'SEARCH' },
            { label: 'Performance Max', value: 'PERFORMANCE_MAX' },
            { label: 'Display', value: 'DISPLAY' },
            { label: 'Video', value: 'VIDEO' },
          ]}
        />

        <GlassSelect
          label="Todos os status"
          value={filtros.status}
          onChange={v => setFiltros(f => ({ ...f, status: v }))}
          minWidth={140}
          options={[
            { label: 'Todos os status', value: 'todos' },
            { label: 'Ativa', value: 'ENABLED' },
            { label: 'Pausada', value: 'PAUSED' },
          ]}
        />

        {/* Date Range Picker */}
        <div style={{ marginLeft: 'auto' }}>
          <GoogleDateRangePicker
            value={filtros.dateRange}
            onChange={(range) => setFiltros(f => ({ ...f, dateRange: range }))}
          />
        </div>
      </div>

      <BreadcrumbMobile
        plataforma="Google Ads"
        paginaAtual={abaAtiva}
        iconeSvgPath={siGoogle.path}
        iconeCor="#4285F4"
      />

      {/* Tabs */}
      <div className="flex bg-[rgba(14,20,42,0.05)] dark:bg-[rgba(255,255,255,0.05)] border border-[rgba(14,20,42,0.08)] dark:border-[rgba(255,255,255,0.08)] rounded-[12px] p-[4px] gap-[2px] mb-[20px] relative overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        <div className="absolute top-0 left-[12px] right-[12px] h-[1px] bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.70)] to-transparent rounded-[1px]" />
        {ABAS_CONFIG.map(({ id, icon: Icon }) => {
          const isActive = abaAtiva === id
          return (
            <div
              key={id}
              onClick={() => setAbaAtiva(id as Aba)}
              className={`
                flex items-center gap-[6px] px-[14px] py-[6px] text-[13px] rounded-[8px]
                cursor-pointer transition-all duration-150 whitespace-nowrap border select-none relative
                ${isActive
                  ? 'bg-[rgba(255,255,255,0.85)] dark:bg-[rgba(255,255,255,0.10)] text-[#3E5BFF] dark:text-white font-medium border-[rgba(62,91,255,0.20)] dark:border-[rgba(62,91,255,0.30)] shadow-[0_2px_8px_rgba(14,20,42,0.10),0_1px_3px_rgba(14,20,42,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.25)]'
                  : 'text-[var(--ws-text-3)] border-transparent hover:text-[var(--ws-text-1)] hover:bg-[rgba(62,91,255,0.05)]'
                }
              `}
            >
              <Icon size={14} className={isActive ? 'opacity-100 text-[#3E5BFF] dark:text-white' : 'opacity-50'} />
              {id}
              {isActive && (
                <div className="absolute top-0 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.90)] to-transparent" />
              )}
            </div>
          )
        })}
      </div>

      {/* Conteúdo das Abas */}
      {abaAtiva === 'Visão geral'        && <VisaoGeralGoogle      filtros={filtros} adsAccountId={selectedContaId || undefined} />}
      {abaAtiva === 'Campanhas'          && <AbaCampanhasGoogle     dateRange={filtros.dateRange} adsAccountId={selectedContaId || undefined} />}
      {abaAtiva === 'Grupos de anúncios' && <AbaGruposGoogle        dateRange={filtros.dateRange} adsAccountId={selectedContaId || undefined} />}
      {abaAtiva === 'Palavras-chave'     && <AbaPalavrasChaveGoogle dateRange={filtros.dateRange} adsAccountId={selectedContaId || undefined} />}
      {abaAtiva === 'Anúncios'           && <AbaAnunciosGoogle      dateRange={filtros.dateRange} adsAccountId={selectedContaId || undefined} />}
      {abaAtiva === 'Públicos'           && <AbaPublicosGoogle      dateRange={filtros.dateRange} adsAccountId={selectedContaId || undefined} />}
    </div>
  )
}

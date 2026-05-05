'use client'

import { useState } from 'react'
import { FiltrosMeta } from '@/components/meta-ads/visao-geral/filtros-meta'
import { VisaoGeral } from '@/components/meta-ads/visao-geral'
import { AbaCampanhas } from '@/components/meta-ads/campanhas'
import { AbaAnuncios } from '@/components/meta-ads/anuncios'
import { AbaCriativos } from '@/components/meta-ads/criativos'
import { AbaPublicos } from '@/components/meta-ads/publicos'
import type { FiltrosMeta as FiltrosMetaTipo } from '@/types/meta-ads'
import { BreadcrumbMobile } from '@/components/ui/breadcrumb-mobile'
import { siMeta } from 'simple-icons'

import { LayoutDashboard, Megaphone, Image, Palette, Users } from 'lucide-react'

const ABAS_CONFIG = [
  { id: 'Visão geral', icon: LayoutDashboard },
  { id: 'Campanhas', icon: Megaphone },
  { id: 'Anúncios', icon: Image },
  { id: 'Criativos', icon: Palette },
  { id: 'Públicos', icon: Users },
] as const

type Aba = (typeof ABAS_CONFIG)[number]['id']

export function PaginaMetaAds() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('Visão geral')
  const [filtros, setFiltros] = useState<FiltrosMetaTipo>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('odontocompany-meta-filtros')
        const filtrosSalvos = saved ? JSON.parse(saved) : null
        return {
          agrupamento: null,
          contaIds: [],
          dataInicio: filtrosSalvos?.dataInicio ?? '2026-04-01',
          dataFim: filtrosSalvos?.dataFim ?? '2026-04-13',
          comparativo: filtrosSalvos?.comparativo ?? 'periodo_anterior',
        }
      } catch (e) { }
    }
    return {
      agrupamento: null,
      contaIds: [],
      dataInicio: '2026-04-01',
      dataFim: '2026-04-13',
      comparativo: 'periodo_anterior',
    }
  })

  const handleFiltrosChange = (novosFiltros: FiltrosMetaTipo) => {
    setFiltros(novosFiltros)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('odontocompany-meta-filtros', JSON.stringify({
          dataInicio: novosFiltros.dataInicio,
          dataFim: novosFiltros.dataFim,
          comparativo: novosFiltros.comparativo,
        }))
      } catch (e) {}
    }
  }

  return (
    <div className="p-6 md:p-8">
      <FiltrosMeta filtros={filtros} onChange={handleFiltrosChange} />

      <BreadcrumbMobile
        plataforma="Meta Ads"
        paginaAtual={abaAtiva}
        iconeSvgPath={siMeta.path}
        iconeCor="#0082FB"
      />

      {/* Underline Tabs Container */}
      <div className="[&::-webkit-scrollbar]:hidden" style={{
        display: 'flex',
        borderTop: 'none',
        borderRight: 'none',
        borderLeft: 'none',
        borderBottom: '1px solid var(--ws-divider)',
        gap: 0,
        marginBottom: 20,
        overflowX: 'auto',
        overflowY: 'hidden',
        minHeight: 42,
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        {ABAS_CONFIG.map(({ id: aba }) => {
          const isActive = abaAtiva === aba
          return (
            <button
              key={aba}
              onClick={() => setAbaAtiva(aba)}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                color: isActive ? '#92722a' : 'var(--ws-text-3)',
                fontWeight: isActive ? 500 : 400,
                borderTop: '0 solid transparent',
                borderRight: '0 solid transparent',
                borderLeft: '0 solid transparent',
                borderBottom: isActive ? '2px solid var(--ws-gold)' : '2px solid transparent',
                marginBottom: '-1px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                whiteSpace: 'nowrap',
                background: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--ws-text-1)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--ws-text-3)'
              }}
            >
              {aba}
            </button>
          )
        })}
      </div>

      {abaAtiva === 'Visão geral' && <VisaoGeral filtros={filtros} />}
      {abaAtiva === 'Campanhas' && <AbaCampanhas dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} />}
      {abaAtiva === 'Anúncios' && <AbaAnuncios dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} />}
      {abaAtiva === 'Criativos' && <AbaCriativos dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} />}
      {abaAtiva === 'Públicos' && <AbaPublicos dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} />}
    </div>
  )
}
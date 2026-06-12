'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePersistedState } from '@/hooks/use-estado-persistido'
import { FiltrosMeta } from '@/components/meta-ads/visao-geral/filtros-meta'
import { VisaoGeral } from '@/components/meta-ads/visao-geral'
import { AbaCampanhas } from '@/components/meta-ads/campanhas'
import { AbaFinanceiro } from '@/components/meta-ads/financeiro'
import { AbaAnuncios } from '@/components/meta-ads/anuncios'
import { AbaCriativos } from '@/components/meta-ads/criativos'
import { AbaVideos } from '@/components/meta-ads/videos'
import { AbaPublicos } from '@/components/meta-ads/publicos'
import type { FiltrosMeta as FiltrosMetaTipo } from '@/types/meta-ads'
import type { FiltrosCampanhas } from '@/types/meta-ads-campanhas'
import { useMetaCampanhas } from '@/hooks/use-meta-campanhas'
import { useMetaFinanceiro } from '@/hooks/use-meta-financeiro'
import { BreadcrumbMobile } from '@/components/ui/breadcrumb-mobile'
import { siMeta } from 'simple-icons'
import { useWorkspace } from '@/lib/workspace-context'

import { LayoutDashboard, Megaphone, Image, Palette, Users, Clapperboard, Wallet } from 'lucide-react'

const ABAS_CONFIG = [
  { id: 'Visão geral', icon: LayoutDashboard },
  { id: 'Campanhas', icon: Megaphone },
  { id: 'Anúncios', icon: Image },
  { id: 'Criativos', icon: Palette },
  { id: 'Públicos', icon: Users },
  { id: 'Vídeo', icon: Clapperboard },
  { id: 'Financeiro', icon: Wallet },
] as const

type Aba = (typeof ABAS_CONFIG)[number]['id']

function periodoPadraoAtual() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return {
    inicio: `${y}-${m}-01`,
    fim: `${y}-${m}-${d}`,
  }
}

function periodoSalvoEhRecente(dataFim?: string | null) {
  if (!dataFim) return false
  return dataFim >= periodoPadraoAtual().inicio
}

export function PaginaMetaAds() {
  const { workspaceAtual: wsId } = useWorkspace()

  const [abaAtiva, setAbaAtiva] = usePersistedState<Aba>('op7-nexo-meta-aba', 'Visão geral')
  const [campanhaSelecionadaId, setCampanhaSelecionadaId] = useState<string | null>(null)
  const [filtrosCampanhas, setFiltrosCampanhas] = useState<FiltrosCampanhas>({
    busca: '',
    objetivo: 'todos',
    veiculacao: 'todos',
    resultado: 'performance',
    plataformas: ['facebook', 'instagram', 'whatsapp'],
  })
  const [filtros, setFiltros] = useState<FiltrosMetaTipo>(() => {
    const periodoPadrao = periodoPadraoAtual()
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('op7-nexo-meta-filtros')
        const filtrosSalvos = saved ? JSON.parse(saved) : null
        const usarSalvo = periodoSalvoEhRecente(filtrosSalvos?.dataFim)
        return {
          agrupamento: null,
          contaIds: [],
          dataInicio: usarSalvo ? filtrosSalvos?.dataInicio ?? periodoPadrao.inicio : periodoPadrao.inicio,
          dataFim: usarSalvo ? filtrosSalvos?.dataFim ?? periodoPadrao.fim : periodoPadrao.fim,
          comparativo: filtrosSalvos?.comparativo ?? 'periodo_anterior',
        }
      } catch {
      }
    }
    return {
      agrupamento: null,
      contaIds: [],
      dataInicio: periodoPadrao.inicio,
      dataFim: periodoPadrao.fim,
      comparativo: 'periodo_anterior',
    }
  })

  const {
    campanhas,
    resumo,
    insightsIA,
    isLoading: campanhasLoading,
  } = useMetaCampanhas(filtrosCampanhas, filtros.dataInicio, filtros.dataFim, filtros.contaIds, wsId ?? null)
  const {
    data: financeiro,
  } = useMetaFinanceiro(filtros.contaIds, wsId ?? null)

  const campanhasOrdenadas = useMemo(
    () => [...campanhas].sort((a, b) => {
      const spendDiff = (b.investimento ?? 0) - (a.investimento ?? 0)
      if (spendDiff !== 0) return spendDiff
      const leadsDiff = (b.leads ?? 0) - (a.leads ?? 0)
      if (leadsDiff !== 0) return leadsDiff
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    }),
    [campanhas],
  )

  const campanhaIdsVisiveis = useMemo(
    () => campanhasOrdenadas.map(c => c.id).filter(Boolean).sort(),
    [campanhasOrdenadas],
  )

  const campanhaPadraoId = campanhasOrdenadas[0]?.id ?? null
  const campanhaAtivaId = useMemo(() => {
    if (campanhaSelecionadaId && campanhas.some(c => c.id === campanhaSelecionadaId)) {
      return campanhaSelecionadaId
    }
    return campanhaPadraoId
  }, [campanhas, campanhaPadraoId, campanhaSelecionadaId])

  useEffect(() => {
    if (campanhaSelecionadaId && !campanhas.some(c => c.id === campanhaSelecionadaId)) {
      const frame = window.requestAnimationFrame(() => setCampanhaSelecionadaId(null))
      return () => window.cancelAnimationFrame(frame)
    }
  }, [campanhas, campanhaSelecionadaId])

  const ultimaAtualizacao = financeiro?.accounts
    ?.map(a => a.updatedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1) ?? null

  const handleFiltrosChange = (novosFiltros: FiltrosMetaTipo) => {
    setFiltros(novosFiltros)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('op7-nexo-meta-filtros', JSON.stringify({
          dataInicio: novosFiltros.dataInicio,
          dataFim: novosFiltros.dataFim,
          comparativo: novosFiltros.comparativo,
        }))
      } catch {
      }
    }
  }

  const handleSelecionarConta = (contaId: string) => {
    setFiltros((atual) => ({
      ...atual,
      agrupamento: null,
      contaIds: [contaId],
    }))
  }

  const handleAbrirFinanceiro = () => {
    setAbaAtiva('Financeiro')
  }

  const handleVoltarVisaoGeral = () => {
    setAbaAtiva('Visão geral')
  }

  return (
    <div className="p-6 md:p-8" style={{ position: 'relative', minHeight: '100vh' }}>
      <FiltrosMeta workspaceId={wsId ?? null} filtros={filtros} onChange={handleFiltrosChange} ultimaAtualizacao={ultimaAtualizacao} />

      <BreadcrumbMobile
        plataforma="Meta Ads"
        paginaAtual={abaAtiva}
        iconeSvgPath={siMeta.path}
        iconeCor="var(--ws-blue)"
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
                color: isActive ? 'var(--ws-gold)' : 'var(--ws-text-3)',
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
              onMouseEnter={(_e) => {
                if (!isActive) _e.currentTarget.style.color = 'var(--ws-text-1)'
              }}
              onMouseLeave={(_e) => {
                if (!isActive) _e.currentTarget.style.color = 'var(--ws-text-3)'
              }}
            >
              {aba}
            </button>
          )
        })}
      </div>

      {abaAtiva === 'Visão geral' && (
        <VisaoGeral
          filtros={filtros}
          workspaceId={wsId ?? null}
          financeiro={financeiro}
          onAbrirFinanceiro={handleAbrirFinanceiro}
          onSelecionarConta={handleSelecionarConta}
        />
      )}
      {abaAtiva === 'Financeiro' && (
        <AbaFinanceiro
          financeiro={financeiro}
          onSelecionarConta={handleSelecionarConta}
          onVoltarVisaoGeral={handleVoltarVisaoGeral}
        />
      )}
      {abaAtiva === 'Campanhas' && (
        <AbaCampanhas
          filtros={filtrosCampanhas}
          onFiltrosChange={setFiltrosCampanhas}
          campanhas={campanhas}
          resumo={resumo}
          insightsIA={insightsIA}
          workspaceId={wsId ?? null}
          dataInicio={filtros.dataInicio}
          dataFim={filtros.dataFim}
          contaIds={filtros.contaIds}
          isLoading={campanhasLoading}
          campanhaAtivaId={campanhaAtivaId}
          onSelecionarCampanha={setCampanhaSelecionadaId}
        />
      )}
      {abaAtiva === 'Anúncios' && (
        <AbaAnuncios
          workspaceId={wsId ?? null}
          dataInicio={filtros.dataInicio}
          dataFim={filtros.dataFim}
          contaIds={filtros.contaIds}
          campaignIds={campanhaIdsVisiveis}
          campaignsReady={!campanhasLoading}
        />
      )}
      {abaAtiva === 'Criativos' && <AbaCriativos workspaceId={wsId ?? null} dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} contaIds={filtros.contaIds} />}
      {abaAtiva === 'Vídeo' && <AbaVideos workspaceId={wsId ?? null} dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} contaIds={filtros.contaIds} />}
      {abaAtiva === 'Públicos' && <AbaPublicos workspaceId={wsId ?? null} dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} contaIds={filtros.contaIds} />}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { FiltrosMeta } from '@/components/meta-ads/visao-geral/filtros-meta'
import { VisaoGeral } from '@/components/meta-ads/visao-geral'
import { AbaCampanhas } from '@/components/meta-ads/campanhas'
import { AbaFinanceiro } from '@/components/meta-ads/financeiro'
import { AbaAnuncios } from '@/components/meta-ads/anuncios'
import { AbaCriativos } from '@/components/meta-ads/criativos'
import { AbaVideos } from '@/components/meta-ads/videos'
import { AbaPublicos } from '@/components/meta-ads/publicos'
import type { FiltrosMeta as FiltrosMetaTipo, TipoComparativo } from '@/types/meta-ads'
import type { FiltrosCampanhas } from '@/types/meta-ads-campanhas'
import { useMetaCampanhas } from '@/hooks/use-meta-campanhas'
import { useMetaFinanceiro } from '@/hooks/use-meta-financeiro'
import { BreadcrumbMobile } from '@/components/ui/breadcrumb-mobile'
import { siMeta } from 'simple-icons'
import { useWorkspace } from '@/lib/workspace-context'

import { LayoutDashboard, Megaphone, Image, Users, Clapperboard, Wallet } from 'lucide-react'

const META_FILTROS_SESSION_KEY = 'op7-nexo-meta-filtros'
const COMPARATIVOS_VALIDOS: TipoComparativo[] = ['periodo_anterior', 'mes_anterior', 'ano_anterior', 'nenhum']

const ABAS_CONFIG = [
  { id: 'Visão geral', icon: LayoutDashboard },
  { id: 'Campanhas', icon: Megaphone },
  { id: 'Anúncios', icon: Image },
  { id: 'Vídeos', icon: Clapperboard },
  { id: 'Públicos', icon: Users },
  { id: 'Financeiro', icon: Wallet },
] as const

type Aba = (typeof ABAS_CONFIG)[number]['id'] | 'Criativos'

function getPeriodoPadraoAtual(referenceDate = new Date()) {
  const y = referenceDate.getFullYear()
  const m = String(referenceDate.getMonth() + 1).padStart(2, '0')
  const d = String(referenceDate.getDate()).padStart(2, '0')
  return {
    inicio: `${y}-${m}-01`,
    fim: `${y}-${m}-${d}`,
  }
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function clampIsoDate(value: unknown, min: string, max: string) {
  if (!isIsoDateString(value)) return null
  if (value < min) return min
  if (value > max) return max
  return value
}

function isTipoComparativo(value: unknown): value is TipoComparativo {
  return typeof value === 'string' && COMPARATIVOS_VALIDOS.includes(value as TipoComparativo)
}

function lerFiltrosPersistidos(periodoPadrao = getPeriodoPadraoAtual()): Pick<FiltrosMetaTipo, 'dataInicio' | 'dataFim' | 'comparativo'> {
  const fallback: Pick<FiltrosMetaTipo, 'dataInicio' | 'dataFim' | 'comparativo'> = {
    dataInicio: periodoPadrao.inicio,
    dataFim: periodoPadrao.fim,
    comparativo: 'periodo_anterior',
  }

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const saved = sessionStorage.getItem(META_FILTROS_SESSION_KEY)
    if (!saved) {
      return fallback
    }

    const parsed = JSON.parse(saved) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return fallback
    }

    const persisted = parsed as Record<string, unknown>
    const comparativo = isTipoComparativo(persisted.comparativo) ? persisted.comparativo : fallback.comparativo
    if (!isIsoDateString(persisted.dataInicio) || !isIsoDateString(persisted.dataFim)) {
      return {
        ...fallback,
        comparativo,
      }
    }

    if (persisted.dataFim < periodoPadrao.inicio || persisted.dataInicio > periodoPadrao.fim) {
      return {
        ...fallback,
        comparativo,
      }
    }

    const dataInicio = clampIsoDate(persisted.dataInicio, periodoPadrao.inicio, periodoPadrao.fim)
    const dataFim = clampIsoDate(persisted.dataFim, periodoPadrao.inicio, periodoPadrao.fim)

    if (!dataInicio || !dataFim || dataInicio > dataFim) {
      return {
        ...fallback,
        comparativo,
      }
    }

    return {
      dataInicio,
      dataFim,
      comparativo,
    }
  } catch {
    return fallback
  }
}

function salvarFiltrosPersistidos(filtros: Pick<FiltrosMetaTipo, 'dataInicio' | 'dataFim' | 'comparativo'>) {
  if (typeof window === 'undefined') return

  try {
    sessionStorage.setItem(META_FILTROS_SESSION_KEY, JSON.stringify(filtros))
  } catch {
    // Ignora falhas de storage para não bloquear a navegação do dashboard.
  }
}

export function PaginaMetaAds() {
  const { workspaceAtual: wsId } = useWorkspace()

  const [abaAtiva, setAbaAtiva] = useState<Aba>('Visão geral')
  const [campanhaSelecionadaId, setCampanhaSelecionadaId] = useState<string | null>(null)
  const [filtrosCampanhas, setFiltrosCampanhas] = useState<FiltrosCampanhas>({
    busca: '',
    objetivo: 'todos',
    veiculacao: 'todos',
    resultado: 'performance',
    plataformas: ['facebook', 'instagram', 'whatsapp'],
  })
  const [filtros, setFiltros] = useState<FiltrosMetaTipo>(() => {
    const periodoPadrao = getPeriodoPadraoAtual()
    const filtrosPersistidos = lerFiltrosPersistidos(periodoPadrao)
    return {
      agrupamento: null,
      contaIds: [],
      ...filtrosPersistidos,
    }
  })
  const [syncVersion, setSyncVersion] = useState<string | null>(null)

  useEffect(() => {
    salvarFiltrosPersistidos({
      dataInicio: filtros.dataInicio,
      dataFim: filtros.dataFim,
      comparativo: filtros.comparativo,
    })
  }, [filtros.dataInicio, filtros.dataFim, filtros.comparativo])

  const {
    campanhas,
    resumo,
    insightsIA,
    isLoading: campanhasLoading,
  } = useMetaCampanhas(filtrosCampanhas, filtros.dataInicio, filtros.dataFim, filtros.contaIds, wsId ?? null, syncVersion)
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

  const handleFiltrosChange = (novosFiltros: FiltrosMetaTipo) => {
    setFiltros(novosFiltros)
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
      <FiltrosMeta
        workspaceId={wsId ?? null}
        filtros={filtros}
        onChange={handleFiltrosChange}
        onSyncVersionChange={setSyncVersion}
      />

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
          syncVersion={syncVersion}
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
          syncVersion={syncVersion}
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
          syncVersion={syncVersion}
        />
      )}
      {abaAtiva === 'Criativos' && (
        <AbaCriativos
          workspaceId={wsId ?? null}
          dataInicio={filtros.dataInicio}
          dataFim={filtros.dataFim}
          contaIds={filtros.contaIds}
          syncVersion={syncVersion}
        />
      )}
      {abaAtiva === 'Vídeos' && <AbaVideos workspaceId={wsId ?? null} dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} contaIds={filtros.contaIds} />}
      {abaAtiva === 'Públicos' && <AbaPublicos workspaceId={wsId ?? null} dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} contaIds={filtros.contaIds} />}
    </div>
  )
}

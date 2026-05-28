'use client'

import type { Campanha, FiltrosCampanhas, ResumoCampanhas } from '@/types/meta-ads-campanhas'
import { FiltrosCampanhasComp } from './filtros-campanhas'
import { ResumoCampanhasComp } from './resumo-campanhas'
import { TabelaHierarquica } from './tabela-hierarquica'
import { InsightsIA } from '../anuncios/insights-ia'
import type { InsightIA } from '@/types/meta-ads-anuncios'

interface Props {
  filtros: FiltrosCampanhas
  onFiltrosChange: (filtros: FiltrosCampanhas) => void
  campanhas: Campanha[]
  resumo: ResumoCampanhas
  insightsIA: InsightIA[]
  workspaceId: string | null
  dataInicio: string
  dataFim: string
  contaIds: string[]
  syncVersion?: string | null
  isLoading?: boolean
  campanhaAtivaId?: string | null
  onSelecionarCampanha?: (campanhaId: string) => void
}

export function AbaCampanhas({
  filtros,
  onFiltrosChange,
  campanhas,
  resumo,
  insightsIA,
  workspaceId,
  dataInicio,
  dataFim,
  contaIds,
  syncVersion = null,
  isLoading,
  campanhaAtivaId,
  onSelecionarCampanha,
}: Props) {
  return (
    <div>
      <FiltrosCampanhasComp filtros={filtros} onChange={onFiltrosChange} />
      <InsightsIA insights={insightsIA} onAbrirAnuncio={() => {}} />
      <ResumoCampanhasComp resumo={resumo} />
      {isLoading && campanhas.length === 0 ? (
        <div style={{
          padding: '18px 20px',
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)',
          color: 'var(--ws-text-3)',
          fontSize: 12,
        }}>
          Carregando campanhas...
        </div>
      ) : (
        <TabelaHierarquica
          campanhas={campanhas}
          campanhaAtivaId={campanhaAtivaId}
          onSelecionarCampanha={onSelecionarCampanha}
          workspaceId={workspaceId}
          dataInicio={dataInicio}
          dataFim={dataFim}
          contaIds={contaIds}
          syncVersion={syncVersion}
        />
      )}
    </div>
  )
}

'use client'

import { useState, type ReactNode } from 'react'
import useSWR from 'swr'
import api from '@/lib/api-client'
import { FiltrosPublicos } from './filtros-publicos'
import { InsightsPublicos } from './insights-publicos'
import { KpiPublicos } from './kpi-publicos'
import { MapaCalorDemografico } from './mapa-calor-demografico'
import { BreakdownPlacements } from './breakdown-placements'
import { BreakdownDispositivos } from './breakdown-dispositivos'
import { HeatmapHorarios } from './heatmap-horarios'
import { GeoPerformance } from './geo-performance'
import { GraficosDemograficos } from './graficos-demograficos'
import { useMetaPublicos } from '@/hooks/use-meta-publicos'
import { useInsightsPublicos } from '@/hooks/use-insights-publicos'
import type { FiltrosPublicos as FiltrosPublicosTipo } from '@/types/meta-ads-publicos'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface CampanhaRow { campaign_id: string; nome: string }
interface Props { workspaceId: string | null; dataInicio: string; dataFim: string; contaIds?: string[] }

function EstadoPublicos({
  titulo,
  descricao,
  icone,
  cor,
}: {
  titulo: string
  descricao: string
  icone: ReactNode
  cor: string
}) {
  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 220,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, width: 'min(560px, 100%)' }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 16,
          background: 'var(--ws-surface-2)',
          border: '1px solid var(--ws-glass-border)',
          color: cor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icone}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)', lineHeight: 1.25, marginBottom: 6 }}>
            {titulo}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ws-text-2)' }}>
            {descricao}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AbaPublicos({ workspaceId, dataInicio, dataFim, contaIds = [] }: Props) {
  const [filtros, setFiltros] = useState<FiltrosPublicosTipo>({
    campanha: 'todas',
    conjunto: 'todos',
    metrica: 'leads',
  })

  const contaIdsParam = contaIds.length ? `&conta_ids=${contaIds.join(',')}` : ''
  const campanhasKey = workspaceId
    ? `/meta/insights/campanhas?workspace_id=${workspaceId}&data_inicio=${dataInicio}&data_fim=${dataFim}${contaIdsParam}`
    : null

  const { data: campanhasData } = useSWR<CampanhaRow[]>(
    campanhasKey,
    () => api.get<CampanhaRow[]>(campanhasKey!),
    { revalidateOnFocus: false }
  )

  const campanhaOptions = [
    { label: 'Todas as campanhas', value: 'todas' },
    ...(campanhasData ?? []).map(c => ({ label: c.nome, value: c.campaign_id })),
  ]

  const {
    demograficos,
    placements,
    dispositivos,
    sistemaOperacional,
    heatmapHoras,
    cidades,
    kpi,
    isLoading,
    error,
  } = useMetaPublicos(filtros, dataInicio, dataFim, contaIds, workspaceId)
  const insights = useInsightsPublicos(
    demograficos,
    placements,
    heatmapHoras
  )
  const temConteudo = Boolean(
    demograficos.length ||
    placements.length ||
    dispositivos.length ||
    sistemaOperacional.length ||
    heatmapHoras.length ||
    cidades.length ||
    kpi.alcanceTotal > 0 ||
    kpi.frequenciaMedia > 0
  )

  return (
    <div className="space-y-8 pb-8">
      <FiltrosPublicos
        filtros={filtros}
        onChange={f => setFiltros({
          ...f,
          campaign_id: f.campanha === 'todas' ? undefined : f.campanha,
        })}
        campanhaOptions={campanhaOptions}
      />
      {isLoading ? (
        <EstadoPublicos
          titulo="Carregando públicos..."
          descricao="Buscando dados segmentados, posicionamentos, dispositivos e geografia para a conta e o período selecionados."
          cor="var(--ws-blue)"
          icone={<Loader2 size={18} className="animate-spin" />}
        />
      ) : error ? (
        <EstadoPublicos
          titulo="Não foi possível carregar Públicos"
          descricao="A API não respondeu com os dados desta conta e período. Ajuste os filtros ou tente novamente mais tarde."
          cor="#a32d2d"
          icone={<AlertTriangle size={18} />}
        />
      ) : !temConteudo ? (
        <EstadoPublicos
          titulo="Nenhum dado de Públicos encontrado"
          descricao="Não há segmentação, posicionamentos, dispositivos ou geografia disponíveis para a conta e o período selecionados."
          cor="var(--ws-gold)"
          icone={<AlertTriangle size={18} />}
        />
      ) : (
        <>
          <InsightsPublicos insights={insights} />
          <KpiPublicos kpi={kpi} />

          <MapaCalorDemografico
            demograficos={demograficos}
            metrica={filtros.metrica}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <BreakdownPlacements placements={placements} />
            <BreakdownDispositivos
              dispositivos={dispositivos}
              sistemasOperacionais={sistemaOperacional}
            />
          </div>

          <HeatmapHorarios heatmap={heatmapHoras} />
          <GeoPerformance cidades={cidades.filter(g => g.nome !== 'Unknown' && g.leads > 0)} />
          <GraficosDemograficos demograficos={demograficos} />
        </>
      )}
    </div>
  )
}

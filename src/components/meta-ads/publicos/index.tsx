'use client'

import { useState } from 'react'
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

interface CampanhaRow { campaign_id: string; nome: string }
interface Props { workspaceId: string | null; dataInicio: string; dataFim: string; contaIds?: string[] }

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

  const dados = useMetaPublicos(filtros, dataInicio, dataFim, contaIds, workspaceId)
  const insights = useInsightsPublicos(
    dados?.demograficos ?? [],
    dados?.placements ?? [],
    dados?.heatmapHoras ?? []
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
      <InsightsPublicos insights={insights} />
      <KpiPublicos kpi={dados.kpi} />

      <MapaCalorDemografico
        demograficos={dados.demograficos}
        metrica={filtros.metrica}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <BreakdownPlacements placements={dados.placements} />
        <BreakdownDispositivos
          dispositivos={dados.dispositivos}
          sistemasOperacionais={dados.sistemaOperacional}
        />
      </div>

      <HeatmapHorarios heatmap={dados.heatmapHoras} />
      <GeoPerformance cidades={dados.cidades.filter(g => g.nome !== 'Unknown' && g.leads > 0)} />
      <GraficosDemograficos demograficos={dados.demograficos} />
    </div>
  )
}

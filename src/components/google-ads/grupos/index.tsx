'use client'

import { useState } from 'react'
import type { FiltrosGruposGoogle } from '@/types/google-ads'
import { useGoogleGrupos } from '@/hooks/use-google-grupos'
import { useInsightsGrupos } from '@/hooks/use-insights-grupos'
import { InsightsGrupos } from './insights-grupos'
import { BarraResumoGrupos } from './barra-resumo-grupos'
import { FiltrosGrupos } from './filtros-grupos'
import { TabelaGrupos } from './tabela-grupos'
import { ModalGrupo } from './modal-grupo'

export function AbaGruposGoogle({ adsAccountId }: { adsAccountId?: string }) {
  const [filtros, setFiltros] = useState<FiltrosGruposGoogle>({
    busca: '',
    campanhaId: 'todas',
    status: 'todos',
    estrategia: 'todas',
    ordenarPor: 'investimento',
    ordem: 'desc',
  })
  const [grupoModalId, setGrupoModalId] = useState<string | null>(null)

  const { grupos, campanhasUnicas } = useGoogleGrupos(filtros, undefined, adsAccountId)
  const insights = useInsightsGrupos(grupos)

  const grupoModal = grupos.find(g => g.id === grupoModalId) ?? null

  return (
    <div>
      <InsightsGrupos insights={insights} onAbrirGrupo={setGrupoModalId} />
      <BarraResumoGrupos grupos={grupos} />
      <FiltrosGrupos filtros={filtros} onChange={setFiltros} campanhasUnicas={campanhasUnicas} />
      <TabelaGrupos grupos={grupos} onAbrirModal={setGrupoModalId} />
      <ModalGrupo grupo={grupoModal} aberto={!!grupoModalId} onFechar={() => setGrupoModalId(null)} />
    </div>
  )
}

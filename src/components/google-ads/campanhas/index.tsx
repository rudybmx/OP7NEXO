'use client'

import { useState } from 'react'
import type { FiltrosCampanhasGoogle } from '@/types/google-ads'
import { useGoogleCampanhas } from '@/hooks/use-google-campanhas'
import { BarraResumo } from './barra-resumo'
import { FiltrosCampanhasGoogle as FiltrosCampanhasGoogleComp } from './filtros-campanhas-google'
import { TabelaCampanhas } from './tabela-campanhas'

export function AbaCampanhasGoogle({ adsAccountId }: { adsAccountId?: string }) {
  const [filtros, setFiltros] = useState<FiltrosCampanhasGoogle>({
    busca: '',
    tipo: 'todos',
    status: 'todos',
    ordenarPor: 'investimento',
    ordem: 'desc',
  })

  const { campanhas, grupos } = useGoogleCampanhas(filtros, undefined, adsAccountId)

  return (
    <div>
      <BarraResumo campanhas={campanhas} />
      <FiltrosCampanhasGoogleComp filtros={filtros} onChange={setFiltros} />
      <TabelaCampanhas campanhas={campanhas} grupos={grupos} />
    </div>
  )
}

'use client'

import { AlertCircle, Clock3 } from 'lucide-react'
import type { CriativoTop } from '@/types/meta-ads'
import { AdCreativeModalOverview } from '@/components/design-system/ad-creative-modal-overview'
import {
  AdCreativeModalShell,
  AdCreativeModalStateCard,
} from '@/components/meta-ads/ad-creative-modal-shell'
import {
  mapDetailOverviewData,
  useAdCreativeDetail,
} from '@/components/meta-ads/ad-creative-detail'

interface Props {
  criativo: CriativoTop | null
  aberto: boolean
  onFechar: () => void
  filtros?: { dataInicio: string; dataFim: string; contaIds: string[] }
  workspaceId?: string | null
}

export function ModalAnaliseCriativoOverview({ criativo, aberto, onFechar, filtros, workspaceId }: Props) {
  const lookupId = criativo?.id ?? null
  const canLoad = aberto && Boolean(lookupId) && Boolean(workspaceId) && Boolean(filtros?.dataInicio) && Boolean(filtros?.dataFim)
  const { detail, error, isLoading } = useAdCreativeDetail({
    workspaceId: workspaceId ?? null,
    lookupId,
    lookupType: 'creative',
    dataInicio: filtros?.dataInicio ?? '',
    dataFim: filtros?.dataFim ?? '',
    contaIds: filtros?.contaIds ?? [],
    enabled: canLoad,
  })
  const data = mapDetailOverviewData(detail)

  if (!aberto || !criativo) return null

  return (
    <AdCreativeModalShell aberto={aberto} onFechar={onFechar}>
      {!canLoad ? (
        <AdCreativeModalStateCard
          title={`Detalhe indisponível para ${criativo.nome}`}
          description="Para abrir este modal, o workspace e o período precisam estar definidos."
          accent="var(--ws-gold)"
          icon={<Clock3 size={18} />}
        />
      ) : error ? (
        <AdCreativeModalStateCard
          title={`Falha ao carregar ${criativo.nome}`}
          description="Não foi possível buscar o detalhe unificado deste criativo agora."
          accent="var(--ws-coral)"
          icon={<AlertCircle size={18} />}
        />
      ) : !data || isLoading ? (
        <AdCreativeModalStateCard
          title={`Carregando detalhe de ${criativo.nome}`}
          description="Buscando score IA, tendência, plataformas e métricas de vídeo no endpoint unificado."
          accent="var(--ws-blue)"
          icon={<Clock3 size={18} />}
        />
      ) : (
        <div key={data.id}>
          <AdCreativeModalOverview data={data} />
        </div>
      )}
    </AdCreativeModalShell>
  )
}

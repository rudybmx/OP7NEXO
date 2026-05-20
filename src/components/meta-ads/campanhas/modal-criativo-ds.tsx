'use client'

import { AlertCircle, Clock3 } from 'lucide-react'
import type { Anuncio, Criativo } from '@/types/meta-ads-campanhas'
import { AdCreativeModalCampaign } from '@/components/design-system/ad-creative-modal-campaign'
import {
  AdCreativeModalShell,
  AdCreativeModalStateCard,
} from '@/components/meta-ads/ad-creative-modal-shell'
import {
  mapDetailCampaignData,
  useAdCreativeDetail,
} from '@/components/meta-ads/ad-creative-detail'

interface Props {
  criativo: Criativo | null
  anuncio: Anuncio | null
  aberto: boolean
  onFechar: () => void
  workspaceId: string | null
  dataInicio: string
  dataFim: string
  contaIds?: string[]
}

export function ModalCriativoDs({
  criativo,
  anuncio,
  aberto,
  onFechar,
  workspaceId,
  dataInicio,
  dataFim,
  contaIds = [],
}: Props) {
  const lookupId = anuncio?.id ?? criativo?.id ?? null
  const canLoad = aberto && Boolean(lookupId) && Boolean(workspaceId) && Boolean(dataInicio) && Boolean(dataFim)
  const { detail, error, isLoading } = useAdCreativeDetail({
    workspaceId,
    lookupId,
    lookupType: 'ad',
    dataInicio,
    dataFim,
    contaIds,
    enabled: canLoad,
  })
  const data = mapDetailCampaignData(detail)

  if (!aberto || !criativo || !anuncio) return null

  return (
    <AdCreativeModalShell aberto={aberto} onFechar={onFechar}>
      {!canLoad ? (
        <AdCreativeModalStateCard
          title={`Detalhe indisponível para ${anuncio.nome}`}
          description="Para abrir este modal, o workspace e o período precisam estar definidos."
          accent="var(--ws-gold)"
          icon={<Clock3 size={18} />}
        />
      ) : error ? (
        <AdCreativeModalStateCard
          title={`Falha ao carregar ${anuncio.nome}`}
          description="Não foi possível buscar o detalhe unificado deste criativo agora."
          accent="var(--ws-coral)"
          icon={<AlertCircle size={18} />}
        />
      ) : !data || isLoading ? (
        <AdCreativeModalStateCard
          title={`Carregando detalhe de ${anuncio.nome}`}
          description="Buscando comparativo, tracking e métricas do conjunto no endpoint unificado."
          accent="var(--ws-blue)"
          icon={<Clock3 size={18} />}
        />
      ) : (
        <div key={data.id}>
          <AdCreativeModalCampaign data={data} />
        </div>
      )}
    </AdCreativeModalShell>
  )
}

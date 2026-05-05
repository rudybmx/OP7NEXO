// CAMPANHAS (L0):
// SELECT campaign.id, campaign.name, campaign.status,
//        campaign.advertising_channel_type,
//        campaign_budget.amount_micros,
//        metrics.cost_micros, metrics.clicks, metrics.impressions,
//        metrics.ctr, metrics.average_cpc, metrics.conversions,
//        metrics.conversions_value, metrics.cost_per_conversion,
//        metrics.all_conversions_from_interactions_rate,
//        metrics.search_impression_share,
//        metrics.search_budget_lost_impression_share,
//        metrics.search_rank_lost_impression_share,
//        metrics.search_absolute_top_impression_share
// FROM campaign
// WHERE segments.date DURING LAST_30_DAYS
//   AND campaign.status != 'REMOVED'
// ORDER BY metrics.cost_micros DESC

// GRUPOS DE ANÚNCIOS (L1):
// SELECT ad_group.id, ad_group.name, ad_group.status,
//        campaign.id, campaign.advertising_channel_type,
//        metrics.cost_micros, metrics.clicks, metrics.impressions,
//        metrics.ctr, metrics.average_cpc, metrics.conversions,
//        metrics.conversions_value, metrics.cost_per_conversion,
//        metrics.all_conversions_from_interactions_rate
// FROM ad_group
// WHERE segments.date DURING LAST_30_DAYS
//   AND ad_group.status != 'REMOVED'

// QUALITY SCORE MÉDIO POR GRUPO (do keyword_view):
// SELECT ad_group.id, AVG(metrics.historical_quality_score) as qs_medio,
//        COUNT(*) as total_keywords
// FROM keyword_view
// WHERE segments.date DURING LAST_7_DAYS
//   AND ad_group_criterion.status = 'ENABLED'
// → Fazer JOIN com grupos pelo ad_group.id
//
// NOTA: cost_micros ÷ 1.000.000 = R$
// NOTA: QS indisponível para PMax, Display, Video → mostrar "—"

import type { CampanhaGoogle, GrupoAnuncios, FiltrosCampanhasGoogle } from '@/types/google-ads'
import { MOCK_CAMPANHAS_GOOGLE, MOCK_GRUPOS_DETALHE_GOOGLE } from '@/lib/mock-google-ads'

export function useGoogleCampanhas(filtros: FiltrosCampanhasGoogle) {
  let campanhas = [...MOCK_CAMPANHAS_GOOGLE]

  if (filtros.busca)
    campanhas = campanhas.filter(c =>
      c.nome.toLowerCase().includes(filtros.busca.toLowerCase())
    )
  if (filtros.tipo !== 'todos')
    campanhas = campanhas.filter(c => c.tipo === filtros.tipo)
  if (filtros.status !== 'todos')
    campanhas = campanhas.filter(c => c.status === filtros.status)

  campanhas.sort((a, b) => {
    const mult = filtros.ordem === 'asc' ? 1 : -1
    switch (filtros.ordenarPor) {
      case 'conversoes':   return (b.conversoes - a.conversoes) * mult
      case 'roas':         return (b.roas - a.roas) * mult
      case 'ctr':          return (b.ctr - a.ctr) * mult
      case 'qualityScore': return (b.qualityScoreMedio - a.qualityScoreMedio) * mult
      default:             return (b.investimento - a.investimento) * mult
    }
  })

  const grupos = (campanhaId: string) =>
    MOCK_GRUPOS_DETALHE_GOOGLE.filter(g => g.campanhaId === campanhaId)

  return { campanhas, grupos }
}

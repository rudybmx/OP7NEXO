// GRUPOS DE ANÚNCIOS com todas as métricas:
// SELECT
//   ad_group.id, ad_group.name, ad_group.status,
//   campaign.id, campaign.name, campaign.advertising_channel_type,
//   ad_group.target_cpa_micros,
//   ad_group.effective_target_cpa_micros,
//   ad_group.effective_target_cpa_source,
//   ad_group.target_roas,
//   ad_group.effective_target_roas,
//   ad_group.effective_target_roas_source,
//   ad_group.cpc_bid_micros,
//   campaign.bidding_strategy_type,
//   metrics.cost_micros, metrics.clicks, metrics.impressions,
//   metrics.ctr, metrics.average_cpc, metrics.conversions,
//   metrics.conversions_value, metrics.cost_per_conversion,
//   metrics.all_conversions_from_interactions_rate,
//   metrics.search_impression_share,
//   metrics.search_budget_lost_impression_share,
//   metrics.search_rank_lost_impression_share
// FROM ad_group
// WHERE segments.date DURING LAST_30_DAYS
//   AND ad_group.status != 'REMOVED'
// ORDER BY metrics.cost_micros DESC

// QUALITY SCORE MÉDIO POR GRUPO (via keyword_view):
// SELECT ad_group.id, metrics.historical_quality_score, metrics.search_impression_share
// FROM keyword_view
// WHERE segments.date DURING LAST_7_DAYS
//   AND ad_group_criterion.status = 'ENABLED'
// → Agregar AVG(historical_quality_score) por ad_group.id no lado do servidor

// KEYWORDS COUNT POR GRUPO:
// SELECT ad_group.id, ad_group_criterion.status, COUNT(*) as total
// FROM ad_group_criterion
// WHERE ad_group_criterion.type = 'KEYWORD'
// GROUP BY ad_group.id, ad_group_criterion.status

// AD STRENGTH para PMax (via asset_group):
// SELECT asset_group.id, asset_group.name, asset_group.ad_strength,
//        campaign.id, metrics.conversions, metrics.cost_micros
// FROM asset_group
// WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'

// FASE DE APRENDIZADO — não há campo direto na API.
// Inferir: se a campanha foi criada ou teve alteração significativa
// nos últimos 7 dias E tem < 30 conversões no período → marcar como em aprendizado
// Estimar dias restantes: max(0, 30 - conversoes) / avg_conversoes_por_dia

// NOTAS IMPORTANTES:
// - cost_micros ÷ 1.000.000 = R$
// - target_cpa_micros e target_roas podem ser null (grupo herda da campanha)
// - effective_target_cpa_source indica se é da campanha ou do grupo
// - Enhanced CPC depreciado em março/2025 — mostrar aviso se detectado
// - IS não disponível para PMax, Display, Video — mostrar "—"
// - Ad Strength só disponível para Performance Max

import type { GrupoAnunciosDetalhe, FiltrosGruposGoogle } from '@/types/google-ads'
import { MOCK_GRUPOS_DETALHE_GOOGLE } from '@/lib/mock-google-ads'

export function useGoogleGrupos(filtros: FiltrosGruposGoogle) {
  let grupos = [...MOCK_GRUPOS_DETALHE_GOOGLE]

  if (filtros.busca)
    grupos = grupos.filter(g =>
      g.nome.toLowerCase().includes(filtros.busca.toLowerCase()) ||
      g.campanhaNome.toLowerCase().includes(filtros.busca.toLowerCase())
    )
  if (filtros.campanhaId !== 'todas')
    grupos = grupos.filter(g => g.campanhaId === filtros.campanhaId)
  if (filtros.status !== 'todos')
    grupos = grupos.filter(g => g.status === filtros.status)
  if (filtros.estrategia !== 'todas')
    grupos = grupos.filter(g => g.estrategiaLance === filtros.estrategia)

  grupos.sort((a, b) => {
    const m = filtros.ordem === 'asc' ? 1 : -1
    switch (filtros.ordenarPor) {
      case 'conversoes':     return (b.conversoes - a.conversoes) * m
      case 'roas':           return (b.roas - a.roas) * m
      case 'ctr':            return (b.ctr - a.ctr) * m
      case 'qualityScore':   return (b.qualityScoreMedio - a.qualityScoreMedio) * m
      case 'custoConversao': return (a.custoConversao - b.custoConversao) * m
      default:               return (b.investimento - a.investimento) * m
    }
  })

  const campanhasUnicas = Array.from(
    new Map(MOCK_GRUPOS_DETALHE_GOOGLE.map(g => [g.campanhaId, { id: g.campanhaId, nome: g.campanhaNome }]))
      .values()
  )

  return { grupos, campanhasUnicas }
}

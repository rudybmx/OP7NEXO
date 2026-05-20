export interface MetaVideoRow {
  video_id: string
  creative_id: string | null
  ad_id: string | null
  campaign_id: string | null
  adset_id: string | null
  thumbnail_url: string | null
  source_url: string | null
  anuncio_nome: string | null
  adset_nome: string | null
  status: string | null
  video_views: number
  video_play_actions: number
  video_p25: number
  video_p50: number
  video_p75: number
  video_p95: number
  video_p100: number
  thruplay: number
  cost_per_thruplay: number | null
}

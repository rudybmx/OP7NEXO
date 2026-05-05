import { MOCK_ADS_GOOGLE } from '@/lib/mock-google-ads'
import type { AdGoogle } from '@/types/google-ads'

export function useGoogleAnuncios() {
  const anuncios = MOCK_ADS_GOOGLE
  return { anuncios, isLoading: false }
}

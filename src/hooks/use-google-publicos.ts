import { MOCK_PUBLICOS_GOOGLE } from '@/lib/mock-google-ads'
import type { PublicoGoogle } from '@/types/google-ads'

export function useGooglePublicos() {
  const publicos = MOCK_PUBLICOS_GOOGLE
  return { publicos, isLoading: false }
}

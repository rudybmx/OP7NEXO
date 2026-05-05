import { MOCK_KEYWORDS_GOOGLE } from '@/lib/mock-google-ads'
import type { KeywordGoogle } from '@/types/google-ads'

export function useGooglePalavras() {
  const palavras = MOCK_KEYWORDS_GOOGLE
  return { palavras, isLoading: false }
}

import type { SWRConfiguration } from 'swr'
import { apiFetch } from './api'
import { getToken } from './auth'

/** Cache key: [endpoint, params?] */
export type FetchKey = readonly [endpoint: string, params?: Record<string, any>]

/**
 * Returns a typed SWR fetcher for a specific row type.
 * Call once at module level per hook: `const fetch = makeFetcher<MyRow>()`
 */
export function makeFetcher<T>() {
  return ([endpoint, params]: FetchKey): Promise<T> =>
    apiFetch<T>(endpoint, params, getToken())
}

/** Shared SWR options: no refetch on focus/reconnect, 5-minute dedup window */
export const SWR_OPTS: SWRConfiguration = {
  revalidateOnFocus:     false,
  revalidateOnReconnect: false,
  dedupingInterval:      300_000,  // 5 min
  keepPreviousData:      true,
}

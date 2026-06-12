"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Estado persistido em localStorage, seguro para SSR.
 *
 * Usa `useSyncExternalStore` porque ele:
 *  - dá um snapshot CONSISTENTE entre renders concorrentes e múltiplas
 *    instâncias do mesmo componente (o restore por `useEffect` perde a corrida
 *    em páginas pesadas que re-renderizam durante o carregamento — ex.: Meta Ads);
 *  - é SSR-safe: `getServerSnapshot` devolve `padrao`, então não há hydration
 *    mismatch (o React re-sincroniza com o valor salvo logo após hidratar);
 *  - sincroniza entre abas via evento `storage` (bônus).
 *
 * Cache por chave mantém a referência do snapshot estável (exigência do
 * useSyncExternalStore — sem isso, parse de objeto a cada chamada gera loop).
 */

type EntradaCache = { bruto: string | null; valor: unknown }
const cache = new Map<string, EntradaCache>()
const EVENTO = "op7-persist"

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(EVENTO, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(EVENTO, callback)
  }
}

function lerSnapshot<T>(chave: string, padrao: T): T {
  let bruto: string | null = null
  try {
    bruto = window.localStorage.getItem(chave)
  } catch {
    bruto = null
  }
  const atual = cache.get(chave)
  if (atual && atual.bruto === bruto) return atual.valor as T
  let valor: T = padrao
  if (bruto !== null) {
    try {
      valor = JSON.parse(bruto) as T
    } catch {
      valor = padrao
    }
  }
  cache.set(chave, { bruto, valor })
  return valor
}

export function usePersistedState<T>(
  chave: string,
  padrao: T,
): [T, (acao: T | ((anterior: T) => T)) => void] {
  const valor = useSyncExternalStore(
    subscribe,
    () => lerSnapshot(chave, padrao),
    () => padrao,
  )

  const setValor = useCallback(
    (acao: T | ((anterior: T) => T)) => {
      const anterior = lerSnapshot(chave, padrao)
      const proximo =
        typeof acao === "function" ? (acao as (a: T) => T)(anterior) : acao
      const bruto = JSON.stringify(proximo)
      try {
        window.localStorage.setItem(chave, bruto)
      } catch {
        // ignora cota / modo privado
      }
      cache.set(chave, { bruto, valor: proximo })
      window.dispatchEvent(new Event(EVENTO))
    },
    [chave, padrao],
  )

  return [valor, setValor]
}

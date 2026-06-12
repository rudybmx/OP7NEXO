"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Estado persistido em localStorage, seguro para SSR.
 *
 * Ordem (evita hydration mismatch — guia preventing-flash-before-hydration do Next.js):
 *   1. Inicia com `padrao` (determinístico; igual no servidor e no cliente).
 *   2. No mount, lê o localStorage e restaura o valor salvo, se houver.
 *   3. A gravação acontece DENTRO do setter (em toda mudança explícita) — não há
 *      effect de escrita, então não existe o risco de o mount sobrescrever o
 *      valor salvo com o `padrao` antes da restauração concluir.
 */
export function usePersistedState<T>(
  chave: string,
  padrao: T,
): [T, (acao: T | ((anterior: T) => T)) => void] {
  const [valor, setValor] = useState<T>(padrao)
  const chaveRef = useRef(chave)
  chaveRef.current = chave

  // Leitura única no mount (e se a chave mudar).
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(chave)
      if (bruto !== null) setValor(JSON.parse(bruto) as T)
    } catch {
      // localStorage indisponível ou JSON inválido — mantém o valor atual
    }
  }, [chave])

  const setValorPersistido = useCallback((acao: T | ((anterior: T) => T)) => {
    setValor((anterior) => {
      const proximo =
        typeof acao === "function" ? (acao as (a: T) => T)(anterior) : acao
      try {
        window.localStorage.setItem(chaveRef.current, JSON.stringify(proximo))
      } catch {
        // ignora cota / modo privado
      }
      return proximo
    })
  }, [])

  return [valor, setValorPersistido]
}

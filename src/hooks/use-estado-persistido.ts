"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Estado persistido em localStorage, seguro para SSR.
 *
 * Ordem (evita hydration mismatch — ver guia preventing-flash-before-hydration do Next.js):
 *   1. Inicia com `padrao` (determinístico; igual no servidor e no cliente).
 *   2. No mount, lê o localStorage e restaura o valor salvo, se houver.
 *   3. Em mudanças posteriores, grava no localStorage.
 *
 * O ref `hidratado` suprime a primeira gravação (que escreveria o `padrao`
 * por cima do valor salvo antes do re-render da restauração).
 */
export function usePersistedState<T>(
  chave: string,
  padrao: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [valor, setValor] = useState<T>(padrao)
  const hidratado = useRef(false)

  // 1 leitura no mount
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(chave)
      if (bruto !== null) setValor(JSON.parse(bruto) as T)
    } catch {
      // localStorage indisponível ou JSON inválido — mantém o padrão
    }
    hidratado.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  // gravação em mudanças (só depois de hidratar)
  useEffect(() => {
    if (!hidratado.current) return
    try {
      window.localStorage.setItem(chave, JSON.stringify(valor))
    } catch {
      // ignora cota/modo privado
    }
  }, [chave, valor])

  return [valor, setValor]
}

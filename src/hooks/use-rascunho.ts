"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/hooks/use-auth"

export type EstadoRascunho = "ocioso" | "salvando" | "salvo"

type Opcoes = {
  /** Debounce do autosave em ms (padrão 500). */
  debounceMs?: number
  /** Desliga a persistência (ex.: form fechado/sem usuário). */
  ativo?: boolean
}

/**
 * Autosave de rascunho de formulário em localStorage.
 *
 * - Chave com escopo de usuário: `rascunho:${userId}:${nomeForm}` — evita vazar
 *   rascunho entre usuários na mesma máquina.
 * - Restaura no mount (uma vez). `clear()` no submit bem-sucedido.
 * - Autosave com debounce. Flush síncrono em `pagehide`/`beforeunload`
 *   (cobre a janela entre a tecla e o debounce) — SEM diálogo bloqueante.
 *
 * Uso:
 *   const { rascunho, salvar, limpar, descartar, estado, temRascunho } =
 *     useRascunho<MeuForm>("estudio-criativos")
 *   // no mount, se temRascunho, ofereça restaurar `rascunho`
 *   // a cada mudança: salvar(valoresAtuais)
 *   // no submit ok: limpar()
 */
export function useRascunho<T>(nomeForm: string, opcoes: Opcoes = {}) {
  const { debounceMs = 500, ativo = true } = opcoes
  const { user } = useAuth()
  const chave = user ? `rascunho:${user.id}:${nomeForm}` : null

  const [rascunho, setRascunho] = useState<T | null>(null)
  const [temRascunho, setTemRascunho] = useState(false)
  const [estado, setEstado] = useState<EstadoRascunho>("ocioso")

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendenteRef = useRef<T | null>(null)
  const chaveRef = useRef<string | null>(null)
  chaveRef.current = chave

  // Restaura uma vez quando a chave fica disponível.
  useEffect(() => {
    if (!chave || !ativo) return
    try {
      const bruto = window.localStorage.getItem(chave)
      if (bruto !== null) {
        setRascunho(JSON.parse(bruto) as T)
        setTemRascunho(true)
      }
    } catch {
      // ignora JSON inválido
    }
  }, [chave, ativo])

  const gravar = useCallback((valor: T) => {
    const k = chaveRef.current
    if (!k) return
    try {
      window.localStorage.setItem(k, JSON.stringify(valor))
      setEstado("salvo")
    } catch {
      // ignora cota / modo privado
    }
  }, [])

  // Salva com debounce.
  const salvar = useCallback(
    (valor: T) => {
      if (!chaveRef.current || !ativo) return
      pendenteRef.current = valor
      setEstado("salvando")
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        gravar(valor)
        pendenteRef.current = null
      }, debounceMs)
    },
    [ativo, debounceMs, gravar],
  )

  // Flush síncrono ao sair (cobre a janela do debounce). Sem diálogo bloqueante.
  useEffect(() => {
    if (!ativo) return
    const flush = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (pendenteRef.current !== null) {
        gravar(pendenteRef.current)
        pendenteRef.current = null
      }
    }
    window.addEventListener("pagehide", flush)
    window.addEventListener("beforeunload", flush)
    return () => {
      flush()
      window.removeEventListener("pagehide", flush)
      window.removeEventListener("beforeunload", flush)
    }
  }, [ativo, gravar])

  const apagarStorage = useCallback(() => {
    const k = chaveRef.current
    if (k) {
      try {
        window.localStorage.removeItem(k)
      } catch {
        /* noop */
      }
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    pendenteRef.current = null
  }, [])

  // Submit bem-sucedido: descarta o rascunho persistido.
  const limpar = useCallback(() => {
    apagarStorage()
    setRascunho(null)
    setTemRascunho(false)
    setEstado("ocioso")
  }, [apagarStorage])

  // Usuário optou por NÃO restaurar: apaga e segue com form em branco.
  const descartar = useCallback(() => {
    apagarStorage()
    setRascunho(null)
    setTemRascunho(false)
    setEstado("ocioso")
  }, [apagarStorage])

  return { rascunho, temRascunho, estado, salvar, limpar, descartar }
}

'use client'

import { useState, useEffect, useRef } from 'react'

export interface ContatoPreview {
  id: string
  nome: string | null
  telefone: string | null
  avatarUrl: string | null
  jid: string
}

interface UseBuscarContatoReturn {
  contato: ContatoPreview | null
  isLoading: boolean
  notFound: boolean
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('op7nexo_token')
}

export function useBuscarContatoPorNumero(numero: string): UseBuscarContatoReturn {
  const [contato, setContato] = useState<ContatoPreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const digits = numero.replace(/\D/g, '')

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (digits.length < 10) {
      setContato(null)
      setNotFound(false)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setNotFound(false)

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const token = getToken()
        const url = new URL('/api/whatsapp/contacts', window.location.origin)
        url.searchParams.set('busca', digits)
        url.searchParams.set('limit', '1')

        const res = await fetch(url.toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        })

        if (!res.ok) throw new Error('Erro na busca')

        const data = await res.json()
        const contacts = (data.contacts ?? []) as Array<{
          id: string
          nome: string | null
          telefone: string | null
          avatar_url: string | null
          jid: string
        }>

        if (contacts.length > 0) {
          const c = contacts[0]
          setContato({ id: c.id, nome: c.nome, telefone: c.telefone, avatarUrl: c.avatar_url, jid: c.jid })
          setNotFound(false)
        } else {
          setContato(null)
          setNotFound(true)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setContato(null)
        setNotFound(true)
      } finally {
        setIsLoading(false)
      }
    }, 500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [digits])

  return { contato, isLoading, notFound }
}

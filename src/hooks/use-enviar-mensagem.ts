'use client'

import { useState, useCallback } from 'react'

interface UseEnviarMensagemReturn {
  enviar: (
    conversaId: string,
    numero: string,
    texto: string,
    workspaceId?: string | null,
    options?: EnviarMensagemOptions,
  ) => Promise<boolean>
  isEnviando: boolean
  error: string | null
}

export interface EnviarMensagemOptions {
  canalId?: string | null
  file?: File | Blob | null
  filename?: string
  tipo?: 'image' | 'audio' | 'video' | 'document'
  caption?: string | null
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('op7nexo_token')
}

export function useEnviarMensagem(): UseEnviarMensagemReturn {
  const [isEnviando, setIsEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = useCallback(async (
    conversaId: string,
    numero: string,
    texto: string,
    workspaceId?: string | null,
    options?: EnviarMensagemOptions,
  ): Promise<boolean> => {
    if (!conversaId || (!texto.trim() && !options?.file)) return false
    try {
      setIsEnviando(true)
      setError(null)
      const token = getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      let mediaUrl: string | null = null
      let tipo = options?.tipo
      let caption = options?.caption ?? null

      if (options?.file) {
        if (!options.canalId) {
          throw new Error('Canal não definido para envio de mídia.')
        }
        const formData = new FormData()
        const filename = options.filename || (options.file instanceof File ? options.file.name : `audio-${Date.now()}.webm`)
        formData.append('arquivo', options.file, filename)
        formData.append('conversa_id', conversaId)
        const uploadHeaders: Record<string, string> = {}
        if (token) uploadHeaders.Authorization = `Bearer ${token}`
        const uploadRes = await fetch(`/api/proxy/canais/${options.canalId}/upload-midia`, {
          method: 'POST',
          headers: uploadHeaders,
          body: formData,
        })
        const uploadData = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok) {
          throw new Error(uploadData.detail || uploadData.error || 'Erro ao enviar anexo')
        }
        mediaUrl = uploadData.media_url
        tipo = uploadData.tipo || tipo || 'document'
      }

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversa_id: conversaId,
          number: numero,
          text: texto.trim(),
          workspace_id: workspaceId || undefined,
          canal_id: options?.canalId || undefined,
          tipo: tipo || undefined,
          media_url: mediaUrl || undefined,
          caption: caption || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao enviar mensagem')
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return false
    } finally {
      setIsEnviando(false)
    }
  }, [])

  return { enviar, isEnviando, error }
}

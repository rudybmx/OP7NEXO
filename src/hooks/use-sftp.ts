'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import api, { getToken } from '@/lib/api-client'

const PROXY_BASE = '/api/proxy/sftp'
const STORAGE_CONNS = 'op7nexo_sftp_conns'
const STORAGE_SESSION = 'op7nexo_sftp_session'

export type SftpStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface SftpCredentials {
  host: string
  port: number
  username: string
  password?: string
  private_key?: string
  private_key_passphrase?: string
}

export interface SftpSavedConnection {
  id: string
  label: string
  host: string
  port: number
  username: string
}

export interface SftpSessionInfo {
  session_id: string
  host: string
  port: number
  username: string
  home: string
}

export interface SftpEntry {
  name: string
  path: string
  type: 'file' | 'dir' | 'link' | 'other'
  size: number
  mtime: number
  perms: string
}

export interface Transfer {
  id: string
  kind: 'upload' | 'download'
  name: string
  total: number
  loaded: number
  status: 'pending' | 'running' | 'done' | 'error'
  error?: string
}

function loadSession(): SftpSessionInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_SESSION)
    return raw ? (JSON.parse(raw) as SftpSessionInfo) : null
  } catch {
    return null
  }
}

function saveSession(s: SftpSessionInfo | null): void {
  if (typeof window === 'undefined') return
  if (s) window.sessionStorage.setItem(STORAGE_SESSION, JSON.stringify(s))
  else window.sessionStorage.removeItem(STORAGE_SESSION)
}

export function loadSavedConnections(): SftpSavedConnection[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_CONNS)
    return raw ? (JSON.parse(raw) as SftpSavedConnection[]) : []
  } catch {
    return []
  }
}

export function saveConnection(conn: SftpSavedConnection): void {
  if (typeof window === 'undefined') return
  const list = loadSavedConnections().filter((c) => c.id !== conn.id)
  list.unshift(conn)
  window.localStorage.setItem(STORAGE_CONNS, JSON.stringify(list.slice(0, 20)))
}

export function removeSavedConnection(id: string): void {
  if (typeof window === 'undefined') return
  const list = loadSavedConnections().filter((c) => c.id !== id)
  window.localStorage.setItem(STORAGE_CONNS, JSON.stringify(list))
}

export function useSftp() {
  const [status, setStatus] = useState<SftpStatus>('idle')
  const [session, setSession] = useState<SftpSessionInfo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const transferIdRef = useRef(0)

  useEffect(() => {
    const cached = loadSession()
    if (cached) {
      setSession(cached)
      setStatus('connected')
    }
  }, [])

  const conectar = useCallback(async (creds: SftpCredentials): Promise<SftpSessionInfo> => {
    setStatus('connecting')
    setErro(null)
    try {
      const info = await api.post<SftpSessionInfo>('/sftp/connect', creds)
      saveSession(info)
      setSession(info)
      setStatus('connected')
      return info
    } catch (e: any) {
      setErro(e?.message || 'Falha ao conectar')
      setStatus('error')
      throw e
    }
  }, [])

  const desconectar = useCallback(async (): Promise<void> => {
    if (!session) return
    try {
      await api.post('/sftp/disconnect', { session_id: session.session_id })
    } catch {
      // ignora — sessão pode já ter expirado
    }
    saveSession(null)
    setSession(null)
    setStatus('idle')
  }, [session])

  const listar = useCallback(
    async (path: string): Promise<SftpEntry[]> => {
      if (!session) throw new Error('Não conectado')
      const q = new URLSearchParams({ session_id: session.session_id, path })
      return api.get<SftpEntry[]>(`/sftp/ls?${q.toString()}`)
    },
    [session],
  )

  const criarPasta = useCallback(
    async (path: string): Promise<void> => {
      if (!session) throw new Error('Não conectado')
      await api.post('/sftp/mkdir', { session_id: session.session_id, path })
    },
    [session],
  )

  const remover = useCallback(
    async (path: string, recursive: boolean): Promise<void> => {
      if (!session) throw new Error('Não conectado')
      const q = new URLSearchParams({
        session_id: session.session_id,
        path,
        recursive: String(recursive),
      })
      await api.delete(`/sftp/rm?${q.toString()}`)
    },
    [session],
  )

  const renomear = useCallback(
    async (oldPath: string, newPath: string): Promise<void> => {
      if (!session) throw new Error('Não conectado')
      await api.post('/sftp/rename', {
        session_id: session.session_id,
        old_path: oldPath,
        new_path: newPath,
      })
    },
    [session],
  )

  const updateTransfer = useCallback((id: string, patch: Partial<Transfer>) => {
    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const enviar = useCallback(
    async (file: File, destDir: string): Promise<void> => {
      if (!session) throw new Error('Não conectado')
      const id = String(++transferIdRef.current)
      const destPath = destDir.endsWith('/') ? destDir + file.name : destDir + '/' + file.name
      const transfer: Transfer = {
        id,
        kind: 'upload',
        name: file.name,
        total: file.size,
        loaded: 0,
        status: 'running',
      }
      setTransfers((prev) => [...prev, transfer])

      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          const q = new URLSearchParams({ session_id: session.session_id, path: destPath })
          xhr.open('POST', `${PROXY_BASE}/upload?${q.toString()}`)
          const token = getToken()
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) updateTransfer(id, { loaded: evt.loaded })
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              updateTransfer(id, { status: 'done', loaded: file.size })
              resolve()
            } else {
              let msg = `Erro ${xhr.status}`
              try {
                const j = JSON.parse(xhr.responseText)
                if (j?.detail) msg = j.detail
              } catch {}
              updateTransfer(id, { status: 'error', error: msg })
              reject(new Error(msg))
            }
          }
          xhr.onerror = () => {
            updateTransfer(id, { status: 'error', error: 'Falha de rede' })
            reject(new Error('Falha de rede'))
          }
          const form = new FormData()
          form.append('file', file)
          xhr.send(form)
        })
      } catch (e) {
        throw e
      }
    },
    [session, updateTransfer],
  )

  const baixar = useCallback(
    async (path: string): Promise<void> => {
      if (!session) throw new Error('Não conectado')
      const id = String(++transferIdRef.current)
      const name = path.split('/').pop() || 'download.bin'
      const transfer: Transfer = {
        id,
        kind: 'download',
        name,
        total: 0,
        loaded: 0,
        status: 'running',
      }
      setTransfers((prev) => [...prev, transfer])

      const token = getToken()
      const q = new URLSearchParams({ session_id: session.session_id, path })
      const resp = await fetch(`${PROXY_BASE}/download?${q.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}))
        const msg = detail?.detail || `Erro ${resp.status}`
        updateTransfer(id, { status: 'error', error: msg })
        throw new Error(msg)
      }

      const totalStr = resp.headers.get('Content-Length')
      const total = totalStr ? Number(totalStr) : 0
      updateTransfer(id, { total })

      const reader = resp.body?.getReader()
      if (!reader) {
        updateTransfer(id, { status: 'error', error: 'Stream indisponível' })
        throw new Error('Stream indisponível')
      }
      const chunks: BlobPart[] = []
      let loaded = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          loaded += value.length
          updateTransfer(id, { loaded })
        }
      }
      const blob = new Blob(chunks, { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      updateTransfer(id, { status: 'done' })
    },
    [session, updateTransfer],
  )

  const limparTransfers = useCallback(() => {
    setTransfers((prev) => prev.filter((t) => t.status === 'running' || t.status === 'pending'))
  }, [])

  return {
    status,
    session,
    erro,
    transfers,
    conectar,
    desconectar,
    listar,
    enviar,
    baixar,
    criarPasta,
    remover,
    renomear,
    limparTransfers,
  }
}

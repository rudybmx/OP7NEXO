'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import api from '@/lib/api-client'
import { useAuth } from '@/hooks/use-auth'

export interface WorkspaceItem {
  workspace_id: string
  workspace_nome: string | null
  role: string
  ativo: boolean
  padrao: boolean
}

interface WorkspaceContextValue {
  workspaceAtivo: string | null
  workspaceAtual: string | null
  workspaces: WorkspaceItem[]
  setWorkspaceAtivo: (id: string) => void
  setWorkspaceAtual: (id: string) => void
  loading: boolean
  canSwitchWorkspace: boolean
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaceAtivo: null,
  workspaceAtual: null,
  workspaces: [],
  setWorkspaceAtivo: () => {},
  setWorkspaceAtual: () => {},
  loading: true,
  canSwitchWorkspace: false,
})

const STORAGE_KEY = 'op7-workspace-id'

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [workspaceAtual, setWorkspaceAtualState] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const canSwitchByRole = user?.role === 'platform_admin' || user?.role === 'network_admin'

  const { data: workspaces = [], isLoading, error } = useSWR<WorkspaceItem[]>(
    user ? '/me/workspaces' : null,
    () => api.get<WorkspaceItem[]>('/me/workspaces'),
    { revalidateOnFocus: false },
  )
  const workspacesAtivos = useMemo(() => workspaces.filter((w) => w.ativo), [workspaces])
  const workspaceFixo = useMemo(
    () => workspacesAtivos.find((w) => w.padrao) ?? workspacesAtivos[0] ?? null,
    [workspacesAtivos],
  )
  const canSwitchWorkspace = useMemo(
    () => canSwitchByRole || (user?.role === 'network_viewer' && workspacesAtivos.length > 1),
    [canSwitchByRole, user?.role, workspacesAtivos.length],
  )
  const workspacesVisiveis = useMemo(
    () => (canSwitchWorkspace ? workspacesAtivos : workspaceFixo ? [workspaceFixo] : []),
    [canSwitchWorkspace, workspacesAtivos, workspaceFixo],
  )

  useEffect(() => {
    if (!user) return
    console.info('[workspace-context] /me/workspaces', {
      email: user.email,
      role: user.role,
      loading: isLoading,
      error: error ? String(error) : null,
      total: workspacesVisiveis.length,
      workspaces: workspacesVisiveis,
    })
  }, [user, isLoading, error, workspacesVisiveis])

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setWorkspaceAtualState(stored)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || authLoading) return
    if (!user) {
      setWorkspaceAtualState(null)
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    if (isLoading) return

    const padrao = workspaceFixo
    const ids = workspacesAtivos.map((w) => w.workspace_id)

    if (!canSwitchWorkspace) {
      const next = padrao?.workspace_id ?? null
      setWorkspaceAtualState(next)
      if (next) localStorage.setItem(STORAGE_KEY, next)
      else localStorage.removeItem(STORAGE_KEY)
      return
    }

    if (!workspaceAtual || !ids.includes(workspaceAtual)) {
      const next = padrao?.workspace_id ?? null
      setWorkspaceAtualState(next)
      if (next) localStorage.setItem(STORAGE_KEY, next)
      else localStorage.removeItem(STORAGE_KEY)
    }
  }, [authLoading, canSwitchWorkspace, hydrated, isLoading, user, workspacesAtivos, workspaceFixo, workspaceAtual])

  const setWorkspaceAtivo = (id: string) => {
    if (!canSwitchWorkspace) return
    setWorkspaceAtualState(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  return (
    <WorkspaceContext.Provider
      value={{
        workspaceAtivo: workspaceAtual,
        workspaceAtual,
        workspaces: workspacesVisiveis,
        setWorkspaceAtivo,
        setWorkspaceAtual: setWorkspaceAtivo,
        loading: !hydrated || authLoading || isLoading,
        canSwitchWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}

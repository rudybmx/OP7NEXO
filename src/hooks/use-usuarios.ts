'use client'

import { useCallback, useEffect, useState } from 'react'

export interface UsuarioItem {
  id: string
  nome: string | null
  email: string
  cargo: string | null
  workspace_id: string | null
}

/** Lista usuários ativos (platform_admin) via proxy `/api/admin/usuarios`. Usado para escolher
 *  o responsável que recebe o handoff do agente (Fase 4). Imperativo + carrega no mount. */
export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([])

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/usuarios?status=ativo')
      if (!res.ok) {
        setUsuarios([])
        return
      }
      const data = await res.json()
      setUsuarios(Array.isArray(data) ? data : [])
    } catch {
      setUsuarios([])
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  return { usuarios, carregar }
}

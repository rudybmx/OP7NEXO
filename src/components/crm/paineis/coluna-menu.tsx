'use client'

import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal, Edit2, Plus, Trash2, Lock } from 'lucide-react'
import type { KanbanColuna } from '@/types/kanban'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

interface ColunaMenuProps {
  coluna: KanbanColuna
  bloqueado?: boolean
  onRenomear: (novoNome: string) => void
  onNovoCard: () => void
  onExcluir: () => void
}

export function ColunaMenu({ coluna, bloqueado, onRenomear, onNovoCard, onExcluir }: ColunaMenuProps) {
  const [renomeando, setRenomeando] = useState(false)
  const [novoNome, setNovoNome] = useState(coluna.nome)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renomeando && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renomeando])

  function confirmarRename() {
    const nome = novoNome.trim()
    if (nome && nome !== coluna.nome) onRenomear(nome)
    setRenomeando(false)
  }

  if (renomeando) {
    return (
      <Input
        ref={inputRef}
        value={novoNome}
        onChange={(e) => setNovoNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmarRename()
          if (e.key === 'Escape') {
            setRenomeando(false)
            setNovoNome(coluna.nome)
          }
        }}
        onBlur={confirmarRename}
        className="h-7 w-32 text-sm font-semibold"
      />
    )
  }

  // Fase fixa: só permite criar card (sem renomear/excluir).
  const podeRenomear = !coluna.fixa
  const podeExcluir = !coluna.fixa && !bloqueado

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center rounded-md p-1 text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground">
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={onNovoCard}>
          <Plus className="size-3.5" /> Novo card
        </DropdownMenuItem>
        {podeRenomear && (
          <DropdownMenuItem onSelect={() => setRenomeando(true)}>
            <Edit2 className="size-3.5" /> Renomear
          </DropdownMenuItem>
        )}
        {coluna.fixa && (
          <DropdownMenuItem disabled>
            <Lock className="size-3.5" /> Fase fixa
          </DropdownMenuItem>
        )}
        {podeExcluir && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onExcluir}>
              <Trash2 className="size-3.5" /> Excluir fase
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

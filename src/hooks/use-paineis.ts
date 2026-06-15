'use client'

import { useCallback, useEffect, useState } from 'react'
import type {
  CampoDef,
  Comentario,
  KanbanBoard,
  KanbanCard,
  KanbanColuna,
  PainelResumo,
  Responsavel,
  TipoCampo,
} from '@/types/kanban'

const BASE = '/api/proxy/paineis'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('op7nexo_token') || sessionStorage.getItem('op7nexo_token')
}

function authHeaders(withJson = false): Record<string, string> {
  const token = getToken()
  return {
    ...(withJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let detail = `Erro ${res.status}`
    try {
      const j = await res.json()
      if (typeof j?.detail === 'string') detail = j.detail
    } catch {}
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ----------------------------------------------------------------- mappers
function initials(nome?: string | null): string | undefined {
  if (!nome) return undefined
  return nome.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

function dateOnly(iso?: string | null): string | undefined {
  return iso ? iso.slice(0, 10) : undefined
}

function mapColuna(f: any): KanbanColuna {
  return {
    id: f.id,
    nome: f.nome,
    cor: f.cor,
    limite: f.limite_wip ?? undefined,
    ordem: f.ordem,
    fixa: f.fixa,
  }
}

function mapCampoDef(c: any): CampoDef {
  return { id: c.id, nome: c.nome, tipo: c.tipo as TipoCampo, opcoes: c.opcoes ?? undefined, ordem: c.ordem }
}

function mapComentario(c: any): Comentario {
  return {
    id: c.id,
    autor: c.autor_nome ?? 'Usuário',
    avatarInitials: initials(c.autor_nome) ?? '??',
    texto: c.texto,
    criadoEm: dateOnly(c.criado_em) ?? '',
  }
}

function mapCard(card: any, campos: CampoDef[]): KanbanCard {
  const valores = card.valores ?? {}
  return {
    id: card.id,
    titulo: card.titulo,
    descricao: card.descricao ?? undefined,
    status: card.fase_id,
    responsavel: card.responsavel_nome ?? undefined,
    responsavelInitials: initials(card.responsavel_nome),
    responsavelUserId: card.responsavel_user_id ?? undefined,
    prioridade: card.prioridade ?? undefined,
    dataVencimento: dateOnly(card.data_vencimento),
    tags: [],
    comentarios: (card.comentarios ?? []).map(mapComentario),
    camposCustom: campos.map(def => ({
      id: def.id,
      nome: def.nome,
      tipo: def.tipo,
      opcoes: def.opcoes,
      valor: valores[def.id],
    })),
    criadoEm: dateOnly(card.criado_em) ?? '',
    atualizadoEm: dateOnly(card.atualizado_em) ?? '',
    ordem: card.ordem,
    nome: card.nome ?? undefined,
    telefone: card.telefone ?? undefined,
    canalEntradaId: card.canal_entrada_id ?? undefined,
    resumoConversa: card.resumo_conversa ?? undefined,
    conversaId: card.conversa_id ?? undefined,
    contatoId: card.contato_id ?? undefined,
    origemAgente: card.origem_agente ?? undefined,
  }
}

function mapBoard(d: any): KanbanBoard {
  const campos = (d.campos ?? []).map(mapCampoDef)
  return {
    id: d.id,
    nome: d.nome,
    tipo: d.tipo,
    sistema: d.sistema,
    automacaoAtiva: d.automacao_ativa,
    bloqueado: d.bloqueado,
    colunas: (d.fases ?? []).map(mapColuna),
    campos,
    cards: (d.cards ?? []).map((c: any) => mapCard(c, campos)),
  }
}

function mapResumo(p: any): PainelResumo {
  return {
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    sistema: p.sistema,
    automacaoAtiva: p.automacao_ativa,
    bloqueado: p.bloqueado,
    ordem: p.ordem,
  }
}

// ----------------------------------------------------------------- hook
export function usePaineis(workspaceId?: string | null) {
  const [boards, setBoards] = useState<PainelResumo[]>([])
  const [boardId, setBoardId] = useState<string | null>(null)
  const [board, setBoard] = useState<KanbanBoard | null>(null)
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const carregarLista = useCallback(async () => {
    if (!workspaceId) return
    try {
      const data = await req<any[]>(`${BASE}?workspace_id=${workspaceId}`, { headers: authHeaders() })
      const resumos = data.map(mapResumo)
      setBoards(resumos)
      setBoardId(prev => (prev && resumos.some(b => b.id === prev) ? prev : resumos[0]?.id ?? null))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar painéis')
    }
  }, [workspaceId])

  const carregarResponsaveis = useCallback(async () => {
    if (!workspaceId) return
    try {
      const data = await req<any[]>(`${BASE}/responsaveis?workspace_id=${workspaceId}`, { headers: authHeaders() })
      setResponsaveis(data.map(u => ({ id: u.id, nome: u.nome, email: u.email })))
    } catch {
      setResponsaveis([])
    }
  }, [workspaceId])

  const carregarBoard = useCallback(async (id: string) => {
    try {
      const d = await req<any>(`${BASE}/${id}`, { headers: authHeaders() })
      setBoard(mapBoard(d))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar painel')
    }
  }, [])

  // Carga inicial por workspace.
  useEffect(() => {
    if (!workspaceId) return
    setIsLoading(true)
    Promise.all([carregarLista(), carregarResponsaveis()]).finally(() => setIsLoading(false))
  }, [workspaceId, carregarLista, carregarResponsaveis])

  // Detalhe do painel ativo.
  useEffect(() => {
    if (boardId) carregarBoard(boardId)
    else setBoard(null)
  }, [boardId, carregarBoard])

  const refresh = useCallback(async () => {
    if (boardId) await carregarBoard(boardId)
  }, [boardId, carregarBoard])

  // -------- painéis
  const criarPainel = useCallback(async (nome: string) => {
    if (!workspaceId) return
    const d = await req<any>(`${BASE}?workspace_id=${workspaceId}`, {
      method: 'POST', headers: authHeaders(true), body: JSON.stringify({ nome }),
    })
    await carregarLista()
    setBoardId(d.id)
  }, [workspaceId, carregarLista])

  const renomearPainel = useCallback(async (id: string, nome: string) => {
    await req(`${BASE}/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ nome }) })
    await carregarLista()
    if (id === boardId) await refresh()
  }, [boardId, carregarLista, refresh])

  const excluirPainel = useCallback(async (id: string) => {
    await req(`${BASE}/${id}`, { method: 'DELETE', headers: authHeaders() })
    await carregarLista()
  }, [carregarLista])

  const toggleAutomacao = useCallback(async (id: string, valor: boolean) => {
    await req(`${BASE}/${id}/automacao`, { method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ valor }) })
    setBoards(bs => bs.map(b => b.id === id ? { ...b, automacaoAtiva: valor } : b))
    setBoard(b => b && b.id === id ? { ...b, automacaoAtiva: valor } : b)
  }, [])

  const toggleBloqueio = useCallback(async (id: string, valor: boolean) => {
    await req(`${BASE}/${id}/bloqueio`, { method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ valor }) })
    setBoards(bs => bs.map(b => b.id === id ? { ...b, bloqueado: valor } : b))
    setBoard(b => b && b.id === id ? { ...b, bloqueado: valor } : b)
  }, [])

  // -------- fases
  const criarFase = useCallback(async (nome: string, cor?: string) => {
    if (!boardId) return
    await req(`${BASE}/${boardId}/fases`, {
      method: 'POST', headers: authHeaders(true), body: JSON.stringify({ nome, cor: cor ?? '#64748b' }),
    })
    await refresh()
  }, [boardId, refresh])

  const atualizarFase = useCallback(async (faseId: string, patch: { nome?: string; cor?: string; limite_wip?: number | null }) => {
    await req(`${BASE}/fases/${faseId}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(patch) })
    await refresh()
  }, [refresh])

  const excluirFase = useCallback(async (faseId: string) => {
    await req(`${BASE}/fases/${faseId}`, { method: 'DELETE', headers: authHeaders() })
    await refresh()
  }, [refresh])

  const reordenarFases = useCallback(async (ordem: string[]) => {
    if (!boardId) return
    await req(`${BASE}/${boardId}/fases/reordenar`, {
      method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ ordem }),
    })
    await refresh()
  }, [boardId, refresh])

  // -------- campos (board-level)
  const criarCampo = useCallback(async (nome: string, tipo: TipoCampo, opcoes?: string[]): Promise<string | null> => {
    if (!boardId) return null
    const c = await req<any>(`${BASE}/${boardId}/campos`, {
      method: 'POST', headers: authHeaders(true), body: JSON.stringify({ nome, tipo, opcoes }),
    })
    await refresh()
    return c.id
  }, [boardId, refresh])

  const excluirCampo = useCallback(async (campoId: string) => {
    await req(`${BASE}/campos/${campoId}`, { method: 'DELETE', headers: authHeaders() })
    await refresh()
  }, [refresh])

  // -------- cards
  const criarCard = useCallback(async (faseId: string, titulo: string): Promise<KanbanCard | null> => {
    if (!boardId) return null
    const c = await req<any>(`${BASE}/${boardId}/cards`, {
      method: 'POST', headers: authHeaders(true), body: JSON.stringify({ titulo, fase_id: faseId }),
    })
    await refresh()
    return mapCard(c, board?.campos ?? [])
  }, [boardId, board, refresh])

  const atualizarCard = useCallback(async (cardId: string, patch: Record<string, unknown>): Promise<KanbanCard | null> => {
    const c = await req<any>(`${BASE}/cards/${cardId}`, {
      method: 'PUT', headers: authHeaders(true), body: JSON.stringify(patch),
    })
    await refresh()
    return mapCard(c, board?.campos ?? [])
  }, [board, refresh])

  const moverCard = useCallback(async (cardId: string, faseId: string, ordem?: number) => {
    // Otimista: move localmente; em erro, recarrega o board.
    setBoard(b => {
      if (!b) return b
      return { ...b, cards: b.cards.map(c => c.id === cardId ? { ...c, status: faseId, ordem: ordem ?? c.ordem } : c) }
    })
    try {
      await req(`${BASE}/cards/${cardId}/mover`, {
        method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ fase_id: faseId, ordem }),
      })
    } catch (e) {
      await refresh()
      throw e
    }
  }, [refresh])

  const excluirCard = useCallback(async (cardId: string) => {
    await req(`${BASE}/cards/${cardId}`, { method: 'DELETE', headers: authHeaders() })
    await refresh()
  }, [refresh])

  const salvarValores = useCallback(async (cardId: string, valores: { campo_id: string; valor: unknown }[]) => {
    await req(`${BASE}/cards/${cardId}/valores`, {
      method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ valores }),
    })
    await refresh()
  }, [refresh])

  const comentar = useCallback(async (cardId: string, texto: string): Promise<KanbanCard | null> => {
    const c = await req<any>(`${BASE}/cards/${cardId}/comentarios`, {
      method: 'POST', headers: authHeaders(true), body: JSON.stringify({ texto }),
    })
    return mapCard(c, board?.campos ?? [])
  }, [board])

  const obterCard = useCallback(async (cardId: string): Promise<KanbanCard | null> => {
    const c = await req<any>(`${BASE}/cards/${cardId}`, { headers: authHeaders() })
    return mapCard(c, board?.campos ?? [])
  }, [board])

  return {
    boards, boardId, setBoardId, board, responsaveis, isLoading, error,
    criarPainel, renomearPainel, excluirPainel, toggleAutomacao, toggleBloqueio,
    criarFase, atualizarFase, excluirFase, reordenarFases,
    criarCampo, excluirCampo,
    criarCard, atualizarCard, moverCard, excluirCard, salvarValores, comentar, obterCard,
  }
}

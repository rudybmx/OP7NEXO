'use client'

import { useCallback, useEffect, useMemo } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import api from '@/lib/api-client'
import { usePersistedState } from '@/hooks/use-estado-persistido'
import type {
  CampoApi,
  CampoCustom,
  CardApi,
  Comentario,
  ComentarioApi,
  FaseApi,
  KanbanBoard,
  KanbanCard,
  KanbanColuna,
  PainelDetalheApi,
  PainelResumoApi,
  Prioridade,
  ResponsavelApi,
  TipoCampo,
} from '@/types/kanban'

// ─── helpers ──────────────────────────────────────────────────────────────────

function extrairMensagem(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

function iniciais(nome?: string | null): string {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/)
  const a = partes[0]?.[0] ?? ''
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase() || '?'
}

const PRIORIDADES: Prioridade[] = ['baixa', 'media', 'alta', 'urgente']
function normPrioridade(p?: string | null): Prioridade | undefined {
  return p && (PRIORIDADES as string[]).includes(p) ? (p as Prioridade) : undefined
}

// ─── mappers (API cru → domínio do front) ─────────────────────────────────────

function mapColuna(f: FaseApi): KanbanColuna {
  return { id: f.id, nome: f.nome, cor: f.cor, limite: f.limite_wip, ordem: f.ordem, fixa: f.fixa }
}

function mapCampoDef(c: CampoApi): CampoCustom {
  return { id: c.id, nome: c.nome, tipo: (c.tipo as TipoCampo) ?? 'texto', opcoes: c.opcoes }
}

function mapComentario(c: ComentarioApi): Comentario {
  return {
    id: c.id,
    autor: c.autor_nome ?? 'Usuário',
    avatarInitials: iniciais(c.autor_nome),
    texto: c.texto,
    criadoEm: c.criado_em,
  }
}

/** Mescla as definições de campo do painel com os valores do card. */
function mapCard(card: CardApi, defs: CampoApi[] = []): KanbanCard {
  const valores = card.valores ?? {}
  const camposCustom: CampoCustom[] = defs.map((d) => {
    const def = mapCampoDef(d)
    const v = valores[d.id]
    return { ...def, valor: v as string | number | boolean | undefined }
  })
  return {
    id: card.id,
    titulo: card.titulo,
    descricao: card.descricao ?? undefined,
    status: card.fase_id,
    responsavel: card.responsavel_nome ?? undefined,
    responsavelUserId: card.responsavel_user_id,
    responsavelInitials: card.responsavel_nome ? iniciais(card.responsavel_nome) : undefined,
    prioridade: normPrioridade(card.prioridade),
    dataVencimento: card.data_vencimento ? card.data_vencimento.slice(0, 10) : undefined,
    tags: [],
    comentarios: (card.comentarios ?? []).map(mapComentario),
    camposCustom,
    criadoEm: card.criado_em,
    atualizadoEm: card.atualizado_em,
    ordem: card.ordem,
    nome: card.nome,
    telefone: card.telefone,
    conversaId: card.conversa_id,
    contatoId: card.contato_id,
    resumoConversa: card.resumo_conversa,
    origemAgente: card.origem_agente,
  }
}

function mapBoard(d: PainelDetalheApi): KanbanBoard {
  return {
    id: d.id,
    nome: d.nome,
    tipo: d.tipo,
    sistema: d.sistema,
    automacaoAtiva: d.automacao_ativa,
    bloqueado: d.bloqueado,
    colunas: [...d.fases].sort((a, b) => a.ordem - b.ordem).map(mapColuna),
    campos: [...d.campos].sort((a, b) => a.ordem - b.ordem).map(mapCampoDef),
    cards: d.cards.map((c) => mapCard(c, d.campos)),
  }
}

// ─── tipos de entrada ─────────────────────────────────────────────────────────

export interface CardPatch {
  titulo?: string
  descricao?: string | null
  prioridade?: string | null
  responsavel_user_id?: string | null
  data_vencimento?: string | null
  fase_id?: string
}

// ─── hook ───────────────────────────────────────────────────────────────────

export function usePaineis(workspaceId?: string | null) {
  const { mutate: globalMutate } = useSWRConfig()

  const listKey = workspaceId ? `/paineis?workspace_id=${workspaceId}` : null
  const respKey = workspaceId ? `/paineis/responsaveis?workspace_id=${workspaceId}` : null

  const {
    data: resumos,
    error: listError,
    isLoading: listLoading,
    mutate: mutateLista,
  } = useSWR<PainelResumoApi[]>(listKey, (k: string) => api.get(k))

  const { data: responsaveis } = useSWR<ResponsavelApi[]>(respKey, (k: string) => api.get(k))

  // Painel ativo — persistido por workspace (Nielsen #6, sobrevive a F5).
  const [boardId, setBoardId] = usePersistedState<string | null>(
    `paineis:boardAtivo:${workspaceId ?? 'none'}`,
    null,
  )

  // Garante boardId válido: se o salvo não existe na lista, cai no primeiro.
  useEffect(() => {
    if (!resumos || resumos.length === 0) return
    if (!boardId || !resumos.some((p) => p.id === boardId)) {
      setBoardId(resumos[0].id)
    }
  }, [resumos, boardId, setBoardId])

  const detailKey = boardId ? `/paineis/${boardId}` : null
  const {
    data: detalhe,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetalhe,
  } = useSWR<PainelDetalheApi>(detailKey, (k: string) => api.get(k))

  const board = useMemo(() => (detalhe ? mapBoard(detalhe) : null), [detalhe])

  // Patch otimista do JSON cru do detalhe (shape idêntico ao servidor).
  const patchDetalhe = useCallback(
    (fn: (d: PainelDetalheApi) => PainelDetalheApi) => {
      if (!detailKey) return
      globalMutate(
        detailKey,
        (cur: PainelDetalheApi | undefined) => (cur ? fn(cur) : cur),
        { revalidate: false },
      )
    },
    [detailKey, globalMutate],
  )

  // ── painéis ──────────────────────────────────────────────────────────────
  const criarPainel = useCallback(
    async (nome: string) => {
      if (!workspaceId) return null
      const novo = await api.post<PainelDetalheApi>(`/paineis?workspace_id=${workspaceId}`, { nome })
      await mutateLista()
      setBoardId(novo.id)
      return novo
    },
    [workspaceId, mutateLista, setBoardId],
  )

  const renomearPainel = useCallback(
    async (id: string, nome: string) => {
      await api.put(`/paineis/${id}`, { nome })
      await mutateLista()
      if (id === boardId) await mutateDetalhe()
    },
    [mutateLista, mutateDetalhe, boardId],
  )

  const excluirPainel = useCallback(
    async (id: string) => {
      await api.delete(`/paineis/${id}`)
      await mutateLista()
    },
    [mutateLista],
  )

  const toggleAutomacao = useCallback(
    async (id: string, valor: boolean) => {
      mutateLista(
        (cur) => cur?.map((p) => (p.id === id ? { ...p, automacao_ativa: valor } : p)),
        { revalidate: false },
      )
      if (id === boardId) patchDetalhe((d) => ({ ...d, automacao_ativa: valor }))
      try {
        await api.patch(`/paineis/${id}/automacao`, { valor })
      } finally {
        await mutateLista()
        if (id === boardId) await mutateDetalhe()
      }
    },
    [mutateLista, patchDetalhe, mutateDetalhe, boardId],
  )

  const toggleBloqueio = useCallback(
    async (id: string, valor: boolean) => {
      mutateLista(
        (cur) => cur?.map((p) => (p.id === id ? { ...p, bloqueado: valor } : p)),
        { revalidate: false },
      )
      if (id === boardId) patchDetalhe((d) => ({ ...d, bloqueado: valor }))
      try {
        await api.patch(`/paineis/${id}/bloqueio`, { valor })
      } finally {
        await mutateLista()
        if (id === boardId) await mutateDetalhe()
      }
    },
    [mutateLista, patchDetalhe, mutateDetalhe, boardId],
  )

  // ── fases ──────────────────────────────────────────────────────────────
  const criarFase = useCallback(
    async (nome: string, cor?: string, limite_wip?: number | null) => {
      if (!boardId) return
      await api.post(`/paineis/${boardId}/fases`, { nome, cor, limite_wip })
      await mutateDetalhe()
    },
    [boardId, mutateDetalhe],
  )

  const atualizarFase = useCallback(
    async (faseId: string, patch: { nome?: string; cor?: string; limite_wip?: number | null }) => {
      await api.put(`/fases/${faseId}`, patch)
      await mutateDetalhe()
    },
    [mutateDetalhe],
  )

  const excluirFase = useCallback(
    async (faseId: string) => {
      await api.delete(`/fases/${faseId}`)
      await mutateDetalhe()
    },
    [mutateDetalhe],
  )

  const reordenarFases = useCallback(
    async (ordem: string[]) => {
      if (!boardId) return
      patchDetalhe((d) => ({
        ...d,
        fases: [...d.fases]
          .map((f) => ({ ...f, ordem: ordem.indexOf(f.id) }))
          .sort((a, b) => a.ordem - b.ordem),
      }))
      try {
        await api.patch(`/paineis/${boardId}/fases/reordenar`, { ordem })
      } finally {
        await mutateDetalhe()
      }
    },
    [boardId, patchDetalhe, mutateDetalhe],
  )

  // ── campos ──────────────────────────────────────────────────────────────
  const criarCampo = useCallback(
    async (nome: string, tipo: string, opcoes?: string[] | null) => {
      if (!boardId) return
      await api.post(`/paineis/${boardId}/campos`, { nome, tipo, opcoes })
      await mutateDetalhe()
    },
    [boardId, mutateDetalhe],
  )

  const atualizarCampo = useCallback(
    async (campoId: string, patch: { nome?: string; tipo?: string; opcoes?: string[] | null }) => {
      await api.put(`/campos/${campoId}`, patch)
      await mutateDetalhe()
    },
    [mutateDetalhe],
  )

  const excluirCampo = useCallback(
    async (campoId: string) => {
      await api.delete(`/campos/${campoId}`)
      await mutateDetalhe()
    },
    [mutateDetalhe],
  )

  // ── cards ──────────────────────────────────────────────────────────────
  const criarCard = useCallback(
    async (faseId: string, titulo: string) => {
      if (!boardId) return null
      const novo = await api.post<CardApi>(`/paineis/${boardId}/cards`, { titulo, fase_id: faseId })
      await mutateDetalhe()
      return novo
    },
    [boardId, mutateDetalhe],
  )

  const atualizarCard = useCallback(
    async (cardId: string, patch: CardPatch) => {
      await api.put(`/cards/${cardId}`, patch)
      await mutateDetalhe()
    },
    [mutateDetalhe],
  )

  const moverCard = useCallback(
    async (cardId: string, faseId: string, ordem?: number) => {
      patchDetalhe((d) => {
        const movido = d.cards.map((c) =>
          c.id === cardId
            ? { ...c, fase_id: faseId, ordem: ordem ?? Number.MAX_SAFE_INTEGER }
            : c,
        )
        // Renormaliza ordem dentro da fase destino p/ o otimista não "pular"
        // (sem mutar refs do cache — só os cards da fase destino viram novos objetos).
        const ordenadosDestino = movido
          .filter((c) => c.fase_id === faseId)
          .sort((a, b) => a.ordem - b.ordem)
        const novaOrdem = new Map(ordenadosDestino.map((c, i) => [c.id, i]))
        const cards = movido.map((c) =>
          novaOrdem.has(c.id) ? { ...c, ordem: novaOrdem.get(c.id)! } : c,
        )
        return { ...d, cards }
      })
      try {
        await api.patch(`/cards/${cardId}/mover`, { fase_id: faseId, ordem })
      } finally {
        await mutateDetalhe()
      }
    },
    [patchDetalhe, mutateDetalhe],
  )

  const excluirCard = useCallback(
    async (cardId: string) => {
      patchDetalhe((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) }))
      try {
        await api.delete(`/cards/${cardId}`)
      } finally {
        await mutateDetalhe()
      }
    },
    [patchDetalhe, mutateDetalhe],
  )

  const salvarValores = useCallback(
    async (cardId: string, valores: { campo_id: string; valor: unknown }[]) => {
      await api.put(`/cards/${cardId}/valores`, { valores })
      await mutateDetalhe()
    },
    [mutateDetalhe],
  )

  const comentar = useCallback(
    async (cardId: string, texto: string) => {
      await api.post(`/cards/${cardId}/comentarios`, { texto })
      await mutateDetalhe()
    },
    [mutateDetalhe],
  )

  const obterCard = useCallback(async (cardId: string) => {
    const card = await api.get<CardApi>(`/cards/${cardId}`)
    return card
  }, [])

  const boards = resumos ?? []

  return {
    boards,
    boardId,
    setBoardId,
    board,
    detalhe,
    responsaveis: responsaveis ?? [],
    isLoading: listLoading || detailLoading,
    error: (listError as Error | undefined) ?? (detailError as Error | undefined) ?? null,
    extrairMensagem,
    refetch: mutateDetalhe,
    // painéis
    criarPainel,
    renomearPainel,
    excluirPainel,
    toggleAutomacao,
    toggleBloqueio,
    // fases
    criarFase,
    atualizarFase,
    excluirFase,
    reordenarFases,
    // campos
    criarCampo,
    atualizarCampo,
    excluirCampo,
    // cards
    criarCard,
    atualizarCard,
    moverCard,
    excluirCard,
    salvarValores,
    comentar,
    obterCard,
    mapCard,
  }
}

export type UsePaineis = ReturnType<typeof usePaineis>

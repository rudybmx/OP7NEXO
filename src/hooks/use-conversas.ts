'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

export type StatusConversa = 'nova' | 'em_atendimento' | 'aguardando' | 'resgate' | 'resolvido' | 'processando'

export interface ContatoApi {
  id: string
  nome: string
  pushName?: string | null
  telefone: string
  remoteJid: string
  numeroEvo?: string | null
  avatarUrl?: string | null
  campanhaOrigem?: string | null
  metaHeadline?: string | null
  metaBody?: string | null
  metaImageUrl?: string | null
  metaSourceUrl?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  primeiraConversaAt?: string | null
  etiquetas?: Array<{ id: string; nome: string; cor: string }>
}

export interface EquipeApi {
  id: string
  nome: string
  membrosCount: number
}

export interface MensagemApi {
  id: string
  direcao: 'entrada' | 'saida'
  conteudo: string
  messageType?: string | null
  mediaUrl?: string | null
  mediaStatus?: string | null
  mediaError?: string | null
  mediaKind?: string | null        // 'image' | 'audio' | 'video' | 'document' | 'sticker'
  mediaMimetype?: string | null
  mediaFilename?: string | null
  mediaCaption?: string | null
  mediaGif?: boolean
  waStatus?: 'pending' | 'sent' | 'delivered' | 'read' | 'played' | 'failed' | string | null
  failedReason?: string | null
  midias?: MensagemMidiaApi[]
  remetenteNome: string | null
  remetenteTipo: 'contato' | 'agente' | 'ia' | 'sistema'
  enviadaEm: string | null
  recebidaEm: string | null
  criadaEm: string | null
  participantJid?: string | null
  participantName?: string | null
  isMentioned?: boolean
  evolutionMsgId?: string | null  // wa-id da própria msg (alvo do scroll ao clicar numa citação)
  mentionedJids?: string[]
  mentionedNames?: Record<string, string>  // { "<dígitos do @lid/número>": "<nome do contato>" }
  quotedText?: string | null
  quotedAuthor?: string | null
  quotedRemoteJid?: string | null
  quotedMessageId?: string | null
  quotedMessageType?: string | null
}

export interface MensagemMidiaApi {
  id: string
  tipo: string
  url: string | null
  minioPath?: string | null
  mimetype?: string | null
  filename?: string | null
  caption?: string | null
  storageStatus?: string | null
  durationSeconds?: number | null
  // Status da transcrição do áudio (camelCase — convertido pelo proxy
  // /api/whatsapp/conversations/[id]/messages): pendente|processando|pronto|sem_fala|erro|nao_transcrito.
  transcricaoStatus?: string | null
}

export interface ConversaApi {
  id: string
  workspaceId?: string
  canalId?: string | null
  instance: string
  remoteJid: string
  status: StatusConversa
  iaAtiva: boolean
  aiEscalado?: boolean
  aiHandoffMotivo?: string | null
  resumoIa?: string | null
  temperatura?: string | null
  temperaturaScore?: number | null
  interesse?: string | null
  observacoes?: string | null
  naoLidas: number
  marcadaNaoLida?: boolean
  ultimaMensagem: string
  ultimaMensagemAt: string | null
  agente: string
  campanha?: string | null
  canal: string
  canalNome?: string | null
  canalNumero?: string | null
  canalTipo?: string | null
  tags: string[]
  responsavelId?: string | null
  leadStatus?: string | null
  followupDueAt?: string | null
  lastInboundAt?: string | null
  lastOutboundAt?: string | null
  badges?: {
    mentioned?: boolean
    hasMedia?: boolean
    overdueFollowup?: boolean
  }
  isGroup?: boolean
  groupName?: string | null
  groupAvatarUrl?: string | null
  favorita?: boolean
  fixada?: boolean
  etiquetas?: Array<{ id: string; nome: string; cor: string }>
  contato: ContatoApi
  equipe: EquipeApi | null
  mensagens: MensagemApi[]
}

interface UseConversasReturn {
  conversas: ConversaApi[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  refetch: () => void
  marcarLidaLocal: (id: string) => void
  loadMore: () => void
  hasMore: boolean
}

/** Filtros V2 (server-side). Quando passado, a query usa o caminho v2 do proxy
 *  (`v2=1`) com paginação real por offset. Ausente => caminho legado intacto. */
export interface V2Filtros {
  escopo?: string          // todas|novas|minhas|equipe
  acompanhamento?: string  // em_atendimento|sem_resposta
  tipo?: string            // todos|grupos|diretas
  arquivadas?: boolean
  naoLidas?: boolean
  responsavelId?: string | null
}

export function useConversas(
  filtro?: string,
  equipeId?: string,
  workspaceId?: string,
  enabled = true,
  canalId?: string,
  etiquetaIds?: string[],
  v2?: V2Filtros | null
): UseConversasReturn {
  // Chave estável para usar nas deps do useCallback (array muda de referência a cada render)
  const etiquetaKey = etiquetaIds?.join(',') ?? ''
  const [conversas, setConversas] = useState<ConversaApi[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const loadedCountRef = useRef(0) // offset acumulado (paginação real no caminho V2)

  // Primitivos derivados de `v2` => deps estáveis no useCallback (sem re-render loop).
  const v2Ativo = !!v2
  const v2Escopo = v2?.escopo
  const v2Acompanhamento = v2?.acompanhamento
  const v2Tipo = v2?.tipo
  const v2Arquivadas = v2?.arquivadas
  const v2NaoLidas = v2?.naoLidas
  const v2Responsavel = v2?.responsavelId

  const fetchConversas = useCallback(async (append = false) => {
    if (!enabled) return
    if (!workspaceId) {
      abortRef.current?.abort()
      if (!append) {
        setConversas([])
        setError(null)
        setHasMore(false)
      }
      setIsLoading(false)
      setIsLoadingMore(false)
      return
    }
    let controller: AbortController | null = null
    try {
      abortRef.current?.abort()
      controller = new AbortController()
      abortRef.current = controller
      if (!append) setIsLoading(true)
      else setIsLoadingMore(true)

      const params = new URLSearchParams()
      params.set('limit', '80')
      if (workspaceId) params.set('workspace_id', workspaceId)
      if (equipeId) params.set('equipe_id', equipeId)
      if (canalId) params.set('canal_id', canalId)
      etiquetaIds?.forEach(id => params.append('etiqueta_ids', id))
      if (v2Ativo) {
        // Caminho V2: backend filtra tudo antes do limit + paginação real por offset.
        params.set('v2', '1')
        params.set('offset', String(append ? loadedCountRef.current : 0))
        if (v2Escopo) params.set('escopo', v2Escopo)
        if (v2Acompanhamento) params.set('acompanhamento', v2Acompanhamento)
        if (v2Tipo) params.set('tipo', v2Tipo)
        if (v2Responsavel) params.set('responsavel_id', v2Responsavel)
        params.set('arquivadas', v2Arquivadas ? 'true' : 'false')
        if (v2NaoLidas) params.set('nao_lidas', 'true')
      } else if (filtro) {
        params.set('filtro', filtro)
      }

      const res = await fetch(`/api/whatsapp/conversations?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('Erro ao carregar conversas')
      if (controller.signal.aborted) return

      const data = await res.json()
      if (controller.signal.aborted) return
      const novas = data.conversations ?? []
      // avança o offset pelo tamanho da página retornada (dedup abaixo é só rede de segurança)
      loadedCountRef.current = (append ? loadedCountRef.current : 0) + novas.length

      if (append) {
        setConversas(prev => {
          const ids = new Set(prev.map(c => c.id))
          const unicas = novas.filter((c: ConversaApi) => !ids.has(c.id))
          return [...prev, ...unicas]
        })
      } else {
        setConversas(novas)
      }

      setHasMore(novas.length === 80)
      setError(null)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      if (!controller || abortRef.current !== controller || controller.signal.aborted) return
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [enabled, filtro, equipeId, workspaceId, canalId, etiquetaKey, v2Ativo, v2Escopo, v2Acompanhamento, v2Tipo, v2Arquivadas, v2NaoLidas, v2Responsavel])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (!enabled) {
        abortRef.current?.abort()
        setConversas([])
        setHasMore(false)
        setError(null)
        setIsLoading(false)
        setIsLoadingMore(false)
        return
      }
      abortRef.current?.abort()
      setConversas([])
      setHasMore(true)
      setError(null)
      void fetchConversas(false)
    })
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
  }, [enabled, fetchConversas])

  const refetch = useCallback(() => {
    fetchConversas(false)
  }, [fetchConversas])

  // Atualização otimista local: ao abrir a conversa, some na hora o badge/selo
  // de não lido (o servidor é limpo em paralelo via marcarLido).
  const marcarLidaLocal = useCallback((id: string) => {
    setConversas(prev => prev.map(c => c.id === id ? { ...c, naoLidas: 0, marcadaNaoLida: false } : c))
  }, [])

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return
    fetchConversas(true)
  }, [fetchConversas, isLoadingMore, hasMore])

  return {
    conversas,
    isLoading: enabled ? isLoading : false,
    isLoadingMore: enabled ? isLoadingMore : false,
    error: enabled ? error : null,
    refetch,
    marcarLidaLocal,
    loadMore,
    hasMore,
  }
}

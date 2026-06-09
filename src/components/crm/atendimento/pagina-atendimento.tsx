'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { MessageCircle } from 'lucide-react'
import { useWorkspace } from '@/lib/workspace-context'
import { useConversas } from '@/hooks/use-conversas'
import { useMensagens } from '@/hooks/use-mensagens'
import { useEnviarMensagem } from '@/hooks/use-enviar-mensagem'
import { useAssumirConversa } from '@/hooks/use-assumir-conversa'
import { useTransferirConversa } from '@/hooks/use-transferir-conversa'
import { useResolverConversa } from '@/hooks/use-resolver-conversa'
import { useAgentesDisponiveis } from '@/hooks/use-agentes-disponiveis'
import { useEquipes } from '@/hooks/use-equipes'
import { useIniciarConversa } from '@/hooks/use-iniciar-conversa'
import { useWhatsappCanais } from '@/hooks/use-whatsapp-canais'
import { useMarcarLido } from '@/hooks/use-marcar-lido'
import { useAtualizarConversa } from '@/hooks/use-atualizar-conversa'
import { useEtiquetas } from '@/hooks/use-etiquetas'
import { PainelInbox } from './painel-inbox'
import { PainelChat } from './painel-chat'
import { PainelContato } from './painel-contato'
import { ModalAssumir } from './modal-assumir'
import { ModalTransferir } from './modal-transferir'
import { ModalResolver } from './modal-resolver'
import { InputMensagem } from './input-mensagem'

const AI_HANDOFF_ENABLED = false

export function PaginaAtendimento() {
  const { workspaceAtual, workspaces, loading: workspaceLoading } = useWorkspace()
  const workspaceResolvido = !workspaceLoading && (workspaceAtual !== null || workspaces.length === 0)
  const [conversaAtivaId, setConversaAtivaId] = useState<string | null>(null)
  const [painelAberto, setPainelAberto] = useState(true)
  const [filtroAtivo, setFiltroAtivo] = useState<string>('todas')
  const [busca, setBusca] = useState('')
  const [mostrarModalAssumir, setMostrarModalAssumir] = useState(false)
  const [mostrarModalTransferir, setMostrarModalTransferir] = useState(false)
  const [mostrarModalResolver, setMostrarModalResolver] = useState(false)
  const [novaConversaAberta, setNovaConversaAberta] = useState(false)
  const [conversaEfemeraId, setConversaEfemeraId] = useState<string | null>(null)
  const [textoMensagem, setTextoMensagem] = useState('')
  const [aoVivo, setAoVivo] = useState(false)
  const [canalSelecionadoId, setCanalSelecionadoId] = useState<string>('todos')

  // Breakpoint (padrão do projeto: window.innerWidth + resize). Default desktop p/ SSR.
  const [larguraTela, setLarguraTela] = useState(1280)
  useEffect(() => {
    const check = () => setLarguraTela(window.innerWidth)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const isMobile = larguraTela < 768
  const isTablet = larguraTela >= 768 && larguraTela < 1024
  const isDesktop = larguraTela >= 1024

  // Painel de Contato: aberto por padrão só no desktop (coluna do grid).
  // Fora do desktop vira overlay e deve iniciar fechado (não herdar o default true).
  useEffect(() => {
    setPainelAberto(isDesktop)
  }, [isDesktop])

  const { canais } = useWhatsappCanais(workspaceAtual, workspaceResolvido)

  const { conversas, isLoading, error, refetch } = useConversas(
    filtroAtivo === 'todas' ? undefined : filtroAtivo,
    undefined,
    workspaceAtual ?? undefined,
    workspaceResolvido,
    canalSelecionadoId === 'todos' ? undefined : canalSelecionadoId
  )
  const { equipes } = useEquipes(workspaceAtual ?? undefined, workspaceResolvido)
  const { agentes } = useAgentesDisponiveis(workspaceAtual ?? undefined, workspaceResolvido)
  const conversaAtiva = useMemo(() => conversas.find(c => c.id === conversaAtivaId), [conversas, conversaAtivaId])
  const { mensagens, refetch: refetchMensagens, addMensagemLocal, removerMensagemLocal } = useMensagens(
    conversaAtivaId ?? undefined,
    workspaceAtual ?? undefined,
    workspaceResolvido
  )
  const { enviar, isEnviando, error: erroEnvio } = useEnviarMensagem()
  const { assumir, isAssumindo, error: erroAssumir } = useAssumirConversa()
  const { transferir, isTransferindo, error: erroTransferir } = useTransferirConversa()
  const { resolver, isResolvendo, error: erroResolver } = useResolverConversa()
  const { iniciar: iniciarConversa, isIniciando, error: erroIniciar } = useIniciarConversa(workspaceAtual)
  const { marcarLido, marcarNaoLido } = useMarcarLido()
  const { atualizar: atualizarConversa } = useAtualizarConversa()
  const { etiquetas, aplicar: aplicarEtiqueta, remover: removerEtiqueta } = useEtiquetas(workspaceAtual)

  const mensagensEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setConversaAtivaId(null)
      setMostrarModalAssumir(false)
      setMostrarModalTransferir(false)
      setMostrarModalResolver(false)
      setNovaConversaAberta(false)
      setConversaEfemeraId(null)
      setTextoMensagem('')
      setCanalSelecionadoId('todos')
    })
    return () => {
      cancelled = true
    }
  }, [workspaceAtual])

  // Auto-scroll para mensagens
  useEffect(() => {
    mensagensEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  // Polling fallback: SSE é o canal primário. Polling a cada 30s cobre desconexões silenciosas.
  useEffect(() => {
    const interval = setInterval(() => {
      if (aoVivo) return
      refetch()
      if (conversaAtivaId) refetchMensagens()
    }, 30000)
    return () => clearInterval(interval)
  }, [refetch, refetchMensagens, conversaAtivaId, aoVivo])

  // Quando a aba volta ao foco, força um refresh imediato para evitar estado travado
  useEffect(() => {
    const refreshAtivo = () => {
      if (document.visibilityState !== 'visible') return
      refetch()
      if (conversaAtivaId) refetchMensagens()
    }

    window.addEventListener('focus', refreshAtivo)
    document.addEventListener('visibilitychange', refreshAtivo)

    return () => {
      window.removeEventListener('focus', refreshAtivo)
      document.removeEventListener('visibilitychange', refreshAtivo)
    }
  }, [refetch, refetchMensagens, conversaAtivaId])

  // SSE: conecta ao stream realtime (otimização quando API Python publicar no Redis)
  useEffect(() => {
    if (!workspaceResolvido || !workspaceAtual) {
      return
    }

    let eventSource: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      const streamUrl = new URL('/api/whatsapp/stream', window.location.origin)
      streamUrl.searchParams.set('workspace_id', workspaceAtual)
      eventSource = new EventSource(streamUrl.toString())

      eventSource.addEventListener('ready', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data)
          setAoVivo(data?.mode === 'sse')
        } catch {
          setAoVivo(false)
        }
      })

      eventSource.addEventListener('whatsapp.refresh', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data)
          // Se o evento é da conversa ativa, recarrega mensagens
          if (!data.conversaId || data.conversaId === conversaAtivaId) {
            refetchMensagens()
          }
          // Sempre recarrega a lista de conversas
          refetch()
        } catch {
          refetch()
          if (conversaAtivaId) refetchMensagens()
        }
      })

      eventSource.addEventListener('error', () => {
        setAoVivo(false)
        eventSource?.close()
        // Tenta reconectar em 5s
        reconnectTimer = setTimeout(connect, 5000)
      })

      eventSource.onerror = () => {
        setAoVivo(false)
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      eventSource?.close()
      setAoVivo(false)
    }
  }, [workspaceAtual, workspaceResolvido, refetch, refetchMensagens, conversaAtivaId])

  const handleSelectConversa = useCallback((id: string) => {
    if (conversaEfemeraId) {
      setConversaEfemeraId(null)
      setNovaConversaAberta(false)
    }
    const conversa = conversas.find(c => c.id === id)
    setConversaAtivaId(id)
    // Marcar como lida ao abrir (fire and forget)
    if (conversa && conversa.naoLidas > 0) {
      marcarLido(id)
    }
    // Mantido atrás de flag local para reativação futura.
    if (AI_HANDOFF_ENABLED && conversa && !conversa.responsavelId && conversa.status === 'nova') {
      setMostrarModalAssumir(true)
    }
  }, [conversas, conversaEfemeraId, marcarLido])

  const handleAbandonarEfemera = useCallback(() => {
    if (!conversaEfemeraId) return
    setConversaEfemeraId(null)
    setNovaConversaAberta(false)
    setConversaAtivaId(null)
  }, [conversaEfemeraId])

  const handleAssumir = useCallback(async () => {
    if (!conversaAtivaId) return
    const ok = await assumir(conversaAtivaId)
    if (ok) {
      setMostrarModalAssumir(false)
      refetch()
      refetchMensagens()
    }
  }, [conversaAtivaId, assumir, refetch, refetchMensagens])

  const handleEnviar = useCallback(async (options?: { file?: File | Blob | null; filename?: string; tipo?: 'image' | 'audio' | 'video' | 'document'; caption?: string | null }) => {
    const draftText = textoMensagem.trim()
    if ((!draftText && !options?.file) || !conversaAtiva) return
    const telefone = conversaAtiva.contato.remoteJid || conversaAtiva.contato.telefone
    const agora = new Date().toISOString()
    const idOtimista = `optimistic-${Date.now()}`
    const mediaKind = options?.file ? (options?.tipo || 'document') : null
    const isAudioMedia = mediaKind === 'audio'
    const textoParaEnvio = isAudioMedia ? '' : draftText
    const captionParaEnvio = isAudioMedia ? null : (options?.caption ?? (options?.file ? draftText : null))
    const conteudoOtimista = options?.file
      ? (isAudioMedia ? '[mídia]' : captionParaEnvio || '[mídia]')
      : draftText

    addMensagemLocal({
      id: idOtimista,
      direcao: 'saida',
      conteudo: conteudoOtimista,
      remetenteNome: 'Você',
      remetenteTipo: 'agente',
      enviadaEm: agora,
      recebidaEm: null,
      criadaEm: agora,
      messageType: mediaKind ? `${mediaKind}Message` : 'conversation',
      mediaUrl: null,
      mediaKind: mediaKind || null,
      mediaFilename: options?.filename || null,
      mediaCaption: captionParaEnvio,
      waStatus: 'pending',
      mediaStatus: options?.file ? 'pending' : null,
    })

    const ok = await enviar(conversaAtiva.id, telefone, textoParaEnvio, workspaceAtual ?? undefined, {
      canalId: conversaAtiva.canalId || (canalSelecionadoId === 'todos' ? undefined : canalSelecionadoId),
      ...options,
      caption: captionParaEnvio,
    })

    if (ok) {
      if (conversaEfemeraId === conversaAtiva?.id) {
        setConversaEfemeraId(null)
      }
      if (!isAudioMedia) {
        setTextoMensagem('')
      }
      refetchMensagens()
      refetch()
    } else {
      removerMensagemLocal(idOtimista)
    }
  }, [textoMensagem, conversaAtiva, conversaEfemeraId, enviar, refetchMensagens, refetch, addMensagemLocal, removerMensagemLocal, workspaceAtual, canalSelecionadoId])

  const handleTransferir = useCallback(async (novoResponsavelId: string, novaEquipeId?: string) => {
    if (!conversaAtivaId) return
    const ok = await transferir(conversaAtivaId, novoResponsavelId, novaEquipeId)
    if (ok) {
      setMostrarModalTransferir(false)
      refetch()
      refetchMensagens()
    }
  }, [conversaAtivaId, transferir, refetch, refetchMensagens])

  const handleResolver = useCallback(async (resolucao: string, observacao?: string) => {
    if (!conversaAtivaId) return
    const ok = await resolver(conversaAtivaId, resolucao, observacao)
    if (ok) {
      setMostrarModalResolver(false)
      refetch()
      refetchMensagens()
    }
  }, [conversaAtivaId, resolver, refetch, refetchMensagens])

  const handleIniciarConversa = useCallback(async (numero: string) => {
    const conversa = await iniciarConversa(numero)
    if (conversa) {
      setNovaConversaAberta(false)
      setConversaAtivaId(conversa.id)
      setConversaEfemeraId(conversa.id)
      refetch()
    }
  }, [iniciarConversa, refetch])

  const handleMarcarNaoLido = useCallback(async (conversaId: string) => {
    await marcarNaoLido(conversaId)
    refetch()
  }, [marcarNaoLido, refetch])

  const handleToggleFavorita = useCallback(async (conversaId: string) => {
    const conversa = conversas.find(c => c.id === conversaId)
    if (!conversa) return
    await atualizarConversa(conversaId, { favorita: !conversa.favorita })
    refetch()
  }, [conversas, atualizarConversa, refetch])

  const handleToggleFixada = useCallback(async (conversaId: string) => {
    const conversa = conversas.find(c => c.id === conversaId)
    if (!conversa) return
    await atualizarConversa(conversaId, { fixada: !conversa.fixada })
    refetch()
  }, [conversas, atualizarConversa, refetch])

  const handleAplicarEtiqueta = useCallback(async (conversaId: string, etiquetaId: string) => {
    await aplicarEtiqueta(conversaId, etiquetaId)
    refetch()
  }, [aplicarEtiqueta, refetch])

  const handleRemoverEtiqueta = useCallback(async (conversaId: string, etiquetaId: string) => {
    await removerEtiqueta(conversaId, etiquetaId)
    refetch()
  }, [removerEtiqueta, refetch])

  const handleResolverPeloMenu = useCallback((conversaId: string) => {
    setConversaAtivaId(conversaId)
    setMostrarModalResolver(true)
  }, [])

  const conversasFiltradas = useMemo(() => {
    if (!busca.trim()) return conversas
    const termo = busca.toLowerCase()
    return conversas.filter(c =>
      (c.contato.nome ?? '').toLowerCase().includes(termo) ||
      (c.contato.telefone ?? '').toLowerCase().includes(termo) ||
      (c.ultimaMensagem ?? '').toLowerCase().includes(termo) ||
      (c.groupName ?? '').toLowerCase().includes(termo)
    )
  }, [conversas, busca])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile
        ? '1fr'
        : isTablet
          ? 'minmax(300px, 360px) minmax(0, 1fr)'
          : painelAberto
            ? 'minmax(320px, 360px) minmax(0, 1fr) minmax(0, 320px)'
            : 'minmax(320px, 360px) minmax(0, 1fr) 0px',
      width: '100%',
      height: '100%',
      minHeight: 0,
      maxWidth: '100%',
      minWidth: 0,
      overflow: 'hidden',
      // Mobile usa a tela inteira (sem "card chrome") p/ não desperdiçar área.
      padding: isMobile ? 0 : 12,
      background: 'radial-gradient(circle at top left, rgba(37, 211, 102, 0.10), transparent 28%), linear-gradient(180deg, rgba(248, 250, 252, 0.98) 0%, rgba(238, 242, 247, 0.98) 100%)',
      backdropFilter: 'blur(18px)',
      boxSizing: 'border-box',
      border: isMobile ? 'none' : '1px solid rgba(15, 23, 42, 0.08)',
      borderRadius: isMobile ? 0 : 28,
      boxShadow: isMobile ? 'none' : '0 24px 80px rgba(15, 23, 42, 0.12)',
      position: 'relative',
      isolation: 'isolate',
    }}>
      {!workspaceResolvido ? (
        <div style={{
          gridColumn: '1 / -1',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ws-text-3)',
          fontSize: 13,
        }}>
          Carregando workspace...
        </div>
      ) : (
        <>
      {/* Coluna 1 — Inbox (mobile: vista "lista". Baseia-se em conversaAtiva resolvida, não no id:
          se a conversa some da lista (mudança de status/filtro) volta p/ a lista, sem dead-end) */}
      {(!isMobile || !conversaAtiva) && (
      <div style={{
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        borderRight: isMobile ? 'none' : '1px solid var(--ws-divider)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <PainelInbox
          conversas={conversasFiltradas}
          conversaAtivaId={conversaAtivaId}
          filtroAtivo={filtroAtivo}
          busca={busca}
          isLoading={isLoading}
          error={error}
          aoVivo={aoVivo}
          onSelectConversa={handleSelectConversa}
          onFiltroChange={setFiltroAtivo}
          onBuscaChange={setBusca}
          onRefetch={refetch}
          novaConversaAberta={novaConversaAberta}
          onToggleNovaConversa={() => setNovaConversaAberta(v => !v)}
          onCriarConversa={handleIniciarConversa}
          isCriandoConversa={isIniciando}
          erroIniciarConversa={erroIniciar}
          onClicarAreaVazia={conversaEfemeraId ? handleAbandonarEfemera : undefined}
          canais={canais}
          canalSelecionadoId={canalSelecionadoId}
          onCanalChange={setCanalSelecionadoId}
          etiquetasWorkspace={etiquetas}
          onMarcarNaoLido={handleMarcarNaoLido}
          onToggleFavorita={handleToggleFavorita}
          onToggleFixada={handleToggleFixada}
          onAplicarEtiqueta={handleAplicarEtiqueta}
          onRemoverEtiqueta={handleRemoverEtiqueta}
          onResolverConversa={handleResolverPeloMenu}
        />
      </div>
      )}

      {/* Coluna 2 — Chat (mobile: vista "chat", só quando há conversa resolvida) */}
      {(!isMobile || !!conversaAtiva) && (
      <div style={{
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {!conversaAtiva ? (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}>
            <MessageCircle size={48} color="var(--ws-text-3)" strokeWidth={1} />
            <span style={{ color: 'var(--ws-text-3)', fontSize: 14 }}>
              Selecione uma conversa para começar
            </span>
          </div>
        ) : (
          <>
            <PainelChat
              conversa={conversaAtiva}
              mensagens={mensagens}
              onTogglePainel={() => setPainelAberto(v => !v)}
              painelAberto={painelAberto}
              onTransferir={() => setMostrarModalTransferir(true)}
              onResolver={() => setMostrarModalResolver(true)}
              mensagensEndRef={mensagensEndRef}
              onVoltar={isMobile ? () => setConversaAtivaId(null) : undefined}
            />
            <InputMensagem
              valor={textoMensagem}
              onChange={setTextoMensagem}
              onEnviar={handleEnviar}
              isEnviando={isEnviando}
              conversa={conversaAtiva}
              erro={erroEnvio}
            />
          </>
        )}
      </div>
      )}

      {/* Coluna 3 — Painel do Contato (desktop: coluna do grid) */}
      {isDesktop && (
      <div style={{
        minWidth: 0,
        minHeight: 0,
        width: painelAberto ? 300 : 0,
        borderLeft: painelAberto ? '1px solid var(--ws-divider)' : 'none',
        overflow: 'hidden',
        opacity: painelAberto ? 1 : 0,
        pointerEvents: painelAberto ? 'auto' : 'none',
        transition: 'width 300ms ease, opacity 180ms ease, border-color 180ms ease',
      }}>
        {conversaAtiva && (
          <div style={{
            minWidth: 300,
            height: '100%',
            minHeight: 0,
            transition: 'transform 300ms ease',
          }}>
            <PainelContato
              conversa={conversaAtiva}
              workspaceId={workspaceAtual ?? undefined}
              onAtualizar={refetch}
              onTogglePainel={() => setPainelAberto(false)}
            />
          </div>
        )}
      </div>
      )}

      {/* Painel do Contato (tablet/mobile: overlay sobre o chat) */}
      {!isDesktop && painelAberto && conversaAtiva && (
        <>
          <div
            onClick={() => setPainelAberto(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 40 }}
          />
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: isMobile ? '100%' : 360,
            maxWidth: '100%',
            zIndex: 41,
            background: 'var(--bg)',
            boxShadow: '-12px 0 40px rgba(15, 23, 42, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          }}>
            <PainelContato
              conversa={conversaAtiva}
              workspaceId={workspaceAtual ?? undefined}
              onAtualizar={refetch}
              onTogglePainel={() => setPainelAberto(false)}
            />
          </div>
        </>
      )}

      {/* Modal Assumir */}
      {AI_HANDOFF_ENABLED && mostrarModalAssumir && conversaAtiva && (
        <ModalAssumir
          conversa={conversaAtiva}
          onConfirmar={handleAssumir}
          onCancelar={() => setMostrarModalAssumir(false)}
          isAssumindo={isAssumindo}
          erro={erroAssumir}
        />
      )}

      {/* Modal Transferir */}
      {mostrarModalTransferir && conversaAtiva && (
        <ModalTransferir
          conversa={conversaAtiva}
          equipes={equipes}
          agentes={agentes}
          onConfirmar={handleTransferir}
          onCancelar={() => setMostrarModalTransferir(false)}
          isTransferindo={isTransferindo}
          erro={erroTransferir}
        />
      )}

      {/* Modal Resolver */}
      {mostrarModalResolver && conversaAtiva && (
        <ModalResolver
          conversa={conversaAtiva}
          onConfirmar={handleResolver}
          onCancelar={() => setMostrarModalResolver(false)}
          isResolvendo={isResolvendo}
          erro={erroResolver}
        />
      )}

        </>
      )}
    </div>
  )
}

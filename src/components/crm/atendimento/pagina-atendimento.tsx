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
import { PainelInbox } from './painel-inbox'
import { PainelChat } from './painel-chat'
import { PainelContato } from './painel-contato'
import { ModalAssumir } from './modal-assumir'
import { ModalTransferir } from './modal-transferir'
import { ModalResolver } from './modal-resolver'
import { ModalIniciarConversa } from './modal-iniciar-conversa'
import { InputMensagem } from './input-mensagem'

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
  const [mostrarModalIniciar, setMostrarModalIniciar] = useState(false)
  const [textoMensagem, setTextoMensagem] = useState('')
  const [aoVivo, setAoVivo] = useState(false)

  const { conversas, isLoading, error, refetch } = useConversas(
    filtroAtivo === 'todas' ? undefined : filtroAtivo,
    undefined,
    workspaceAtual ?? undefined,
    workspaceResolvido
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

  const mensagensEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setConversaAtivaId(null)
      setMostrarModalAssumir(false)
      setMostrarModalTransferir(false)
      setMostrarModalResolver(false)
      setMostrarModalIniciar(false)
      setTextoMensagem('')
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

      eventSource.addEventListener('ready', () => {
        setAoVivo(true)
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
    const conversa = conversas.find(c => c.id === id)
    setConversaAtivaId(id)
    // Se a conversa está sem responsável e ainda está nova, mostra modal para assumir
    if (conversa && !conversa.responsavelId && conversa.status === 'nova') {
      setMostrarModalAssumir(true)
    }
  }, [conversas])

  const handleAssumir = useCallback(async () => {
    if (!conversaAtivaId) return
    const ok = await assumir(conversaAtivaId)
    if (ok) {
      setMostrarModalAssumir(false)
      refetch()
      refetchMensagens()
    }
  }, [conversaAtivaId, assumir, refetch, refetchMensagens])

  const handleEnviar = useCallback(async () => {
    const conteudo = textoMensagem.trim()
    if (!conteudo || !conversaAtiva) return
    const telefone = conversaAtiva.contato.remoteJid || conversaAtiva.contato.telefone
    const agora = new Date().toISOString()
    const idOtimista = `optimistic-${Date.now()}`
    addMensagemLocal({
      id: idOtimista,
      direcao: 'saida',
      conteudo,
      remetenteNome: 'Você',
      remetenteTipo: 'agente',
      enviadaEm: agora,
      recebidaEm: null,
      criadaEm: agora,
      messageType: 'conversation',
      mediaUrl: null,
    })
    setTextoMensagem('')
    const ok = await enviar(conversaAtiva.id, telefone, conteudo, workspaceAtual ?? undefined)
    if (ok) {
      refetchMensagens()
      refetch()
    } else {
      removerMensagemLocal(idOtimista)
      setTextoMensagem(conteudo)
    }
  }, [textoMensagem, conversaAtiva, enviar, refetchMensagens, refetch, addMensagemLocal, removerMensagemLocal, workspaceAtual])

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
    const ok = await resolver(conversaAtivaId, observacao ? `${resolucao}: ${observacao}` : resolucao)
    if (ok) {
      setMostrarModalResolver(false)
      refetch()
      refetchMensagens()
    }
  }, [conversaAtivaId, resolver, refetch, refetchMensagens])

  const handleIniciarConversa = useCallback(async (numero: string) => {
    const conversa = await iniciarConversa(numero)
    if (conversa) {
      setMostrarModalIniciar(false)
      setConversaAtivaId(conversa.id)
      refetch()
    }
  }, [iniciarConversa, refetch])

  const conversasFiltradas = useMemo(() => {
    if (!busca.trim()) return conversas
    const termo = busca.toLowerCase()
    return conversas.filter(c =>
      c.contato.nome.toLowerCase().includes(termo) ||
      c.contato.telefone.toLowerCase().includes(termo) ||
      c.ultimaMensagem.toLowerCase().includes(termo)
    )
  }, [conversas, busca])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: painelAberto ? '320px minmax(0, 1fr) 300px' : '320px minmax(0, 1fr) 0px',
      width: '100%',
      height: '100%',
      minHeight: 0,
      maxWidth: '100%',
      minWidth: 0,
      overflow: 'hidden',
      background: 'var(--ws-glass-bg)',
      backdropFilter: 'blur(16px)',
      boxSizing: 'border-box',
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
      {/* Coluna 1 — Inbox */}
      <div style={{
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        borderRight: '1px solid var(--ws-divider)',
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
          onIniciarConversa={() => setMostrarModalIniciar(true)}
        />
      </div>

      {/* Coluna 2 — Chat */}
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
              onTransferir={() => setMostrarModalTransferir(true)}
              onResolver={() => setMostrarModalResolver(true)}
              mensagensEndRef={mensagensEndRef}
            />
            <InputMensagem
              valor={textoMensagem}
              onChange={setTextoMensagem}
              onEnviar={handleEnviar}
              isEnviando={isEnviando}
              conversa={conversaAtiva}
              onAssumir={() => setMostrarModalAssumir(true)}
              erro={erroEnvio}
            />
          </>
        )}
      </div>

      {/* Coluna 3 — Painel do Contato */}
      <div style={{
        minWidth: 0,
        minHeight: 0,
        width: painelAberto ? 300 : 0,
        borderLeft: '1px solid var(--ws-divider)',
        overflow: 'hidden',
        transition: 'width 300ms ease',
      }}>
        {conversaAtiva && (
          <div style={{ minWidth: 300, height: '100%', minHeight: 0 }}>
            <PainelContato conversa={conversaAtiva} />
          </div>
        )}
      </div>

      {/* Modal Assumir */}
      {mostrarModalAssumir && conversaAtiva && (
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

      {/* Modal Iniciar Conversa */}
      <ModalIniciarConversa
        aberto={mostrarModalIniciar}
        onFechar={() => setMostrarModalIniciar(false)}
        onCriar={handleIniciarConversa}
        isCriando={isIniciando}
        erro={erroIniciar}
      />
        </>
      )}
    </div>
  )
}

'use client'

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { 
  Search, 
  MessageCircle, 
  ArrowRightLeft, 
  X, 
  Check, 
  Send, 
  Smile, 
  Paperclip, 
  Mic, 
  Sparkles,
  Smartphone,
  MessageCircle as Instagram,
  MessageSquare as Facebook,
  Phone,
  Mail,
  Tag,
  User,
  CircleDotDashed,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { apiFetch } from '@/lib/api'
import {
  MENSAGENS_MOCK,
  CONTATOS_MOCK,
  CONVERSAS_MOCK,
} from '@/lib/mock-crm'
import type { 
  CardConversaData, 
  Mensagem as MockMensagem,
  ContatoDetalhes as MockContato
} from '@/components/design-system/sections/glm-crm/types'

// ─── Tipos Internos ───────────────────────────────────────────────────────────

type CanalConversa = 'whatsapp' | 'messenger' | 'instagram_dm'
type StatusConversa = 'nova' | 'em_atendimento' | 'aguardando' | 'resolvida' | 'arquivada'
type RemetenteMsg = 'contato' | 'agente' | 'ia'

interface Contato {
  id: string; 
  nome: string; 
  telefone: string
  remoteJid?: string
  avatarUrl?: string | null
  avatarInitials: string; 
  cor: string
  canal: CanalConversa; 
  online: boolean
}

interface Mensagem {
  id: string; 
  direcao: 'entrada' | 'saida'
  conteudo: string;
  messageType?: string | null
  mediaUrl?: string | null
  remetenteNome: string
  remetenteTipo: RemetenteMsg; 
  hora: string
  data: string // "Hoje", "Ontem" ou "DD/MM" para agrupamento
  timestampAt?: number
  replyTo?: {
    id?: string | null
    text?: string | null
    author?: string | null
    remoteJid?: string | null
    messageType?: string | null
  } | null
}

interface Conversa {
  id: string; 
  contato: Contato
  status: StatusConversa; 
  canal: CanalConversa
  iaAtiva: boolean; 
  naoLidas: number
  ultimaMensagem: string; 
  ultimaMensagemEm: string
  ultimaMensagemAt?: number
  tags: string[]; 
  agente: string
  mensagens: Mensagem[]
  campanha?: string
}

const CANAL_COLORS = {
  whatsapp: '#25D366',
  messenger: '#0084FF',
  instagram_dm: '#E1306C'
}

const CANAL_ICONS = {
  whatsapp: Smartphone,
  messenger: Facebook,
  instagram_dm: Instagram
}

type ApiMensagem = {
  id: string
  direcao: 'entrada' | 'saida'
  conteudo: string
  messageType?: string | null
  mediaUrl?: string | null
  remetenteNome?: string | null
  remetenteTipo?: RemetenteMsg | 'sistema'
  enviadaEm?: string | null
  recebidaEm?: string | null
  criadaEm?: string | null
  quotedText?: string | null
  quotedAuthor?: string | null
  quotedRemoteJid?: string | null
  quotedMessageId?: string | null
  quotedMessageType?: string | null
}

type ApiConversa = {
  id: string
  instance: string
  remoteJid: string
  status: StatusConversa
  iaAtiva: boolean
  naoLidas: number
  ultimaMensagem: string
  ultimaMensagemAt?: string | null
  agente: string
  campanha?: string | null
  canal: CanalConversa
  tags: string[]
  responsavelId?: string | null
  equipe?: {
    id: string
    nome: string
    membrosCount: number
  } | null
  contato: {
    id: string
    nome: string
    telefone: string
    remoteJid: string
    avatarUrl?: string | null
  }
  mensagens: ApiMensagem[]
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'WA'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase()
}

function formatarTelefone(telefone?: string | null) {
  if (!telefone) return '--'
  return telefone
}

function AvatarContato({
  nome,
  avatarUrl,
  tamanho = 36,
  mostrarStatus = false,
  online = false,
}: {
  nome: string
  avatarUrl?: string | null
  tamanho?: number
  mostrarStatus?: boolean
  online?: boolean
}) {
  const iniciaisContato = iniciais(nome)

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <Avatar size={tamanho >= 48 ? 'lg' : 'default'} style={{ width: tamanho, height: tamanho }}>
        <AvatarImage src={avatarUrl || undefined} alt={nome} />
        <AvatarFallback style={{ fontSize: tamanho <= 32 ? 11 : 13, fontWeight: 700, color: 'white', background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)' }}>
          {iniciaisContato}
        </AvatarFallback>
      </Avatar>
      {mostrarStatus && (
        <div style={{
          position: 'absolute', bottom: -1, right: -1,
          width: tamanho <= 32 ? 8 : 10, height: tamanho <= 32 ? 8 : 10, borderRadius: '50%',
          background: online ? '#25D366' : '#8892b0',
          border: '2px solid var(--ws-glass-bg)',
        }} />
      )}
    </div>
  )
}

function LinhaInfoContato({ label, valor, icon }: { label: string; valor?: string | null; icon?: React.ReactNode }) {
  if (!valor) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(62,91,255,0.08)', color: 'var(--ws-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon || <CircleDotDashed size={12} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-1)', wordBreak: 'break-word' }}>{valor}</div>
      </div>
    </div>
  )
}

function PainelContato({ conversa }: { conversa: Conversa }) {
  const { contato, tags, agente, campanha, status, iaAtiva } = conversa

  return (
    <aside style={{
      width: 320,
      flexShrink: 0,
      borderLeft: '1px solid var(--ws-divider)',
      background: 'rgba(255,255,255,0.015)',
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
    }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--ws-divider)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <AvatarContato nome={contato.nome} avatarUrl={contato.avatarUrl} tamanho={52} mostrarStatus online={contato.online} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ws-text-1)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contato.nome}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 3 }}>
              {contato.online ? 'online agora' : 'visto por último hoje'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          <span style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 9999,
            background: 'rgba(37,211,102,0.12)',
            color: '#25D366',
            border: '1px solid rgba(37,211,102,0.18)',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}>WhatsApp</span>
          <span style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 9999,
            background: status === 'em_atendimento' ? 'rgba(62,91,255,0.10)' : 'rgba(255,255,255,0.05)',
            color: status === 'em_atendimento' ? 'var(--ws-blue)' : 'var(--ws-text-3)',
            border: '1px solid var(--ws-glass-border)',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}>{status.replace('_', ' ')}</span>
          {iaAtiva && (
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 9999,
              background: 'rgba(60,52,137,0.12)',
              color: '#8b7ef8',
              border: '1px solid rgba(60,52,137,0.18)',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}>IA ativa</span>
          )}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <LinhaInfoContato label="Telefone" valor={formatarTelefone(contato.telefone)} icon={<Phone size={12} />} />
          <LinhaInfoContato label="Remote JID" valor={contato.remoteJid} icon={<User size={12} />} />
          <LinhaInfoContato label="Agente" valor={agente} icon={<User size={12} />} />
          <LinhaInfoContato label="Campanha" valor={campanha || null} icon={<Tag size={12} />} />
        </div>
      </div>

      <div style={{ padding: 16, borderBottom: '1px solid var(--ws-divider)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.length ? tags.map((tag) => (
            <span key={tag} style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 9999,
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--ws-text-2)',
              border: '1px solid var(--ws-glass-border)',
            }}>{tag}</span>
          )) : (
            <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>Sem tags</span>
          )}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Resumo rápido</div>
        <div style={{
          background: 'rgba(62,91,255,0.08)',
          border: '1px solid rgba(62,91,255,0.15)',
          borderRadius: 12,
          padding: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 6 }}>Informações do contato</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
            Foto, telefone, remote JID, tags e estado da conversa ficam concentrados aqui, no padrão do chat do design system.
          </div>
        </div>
      </div>
    </aside>
  )
}

function formatarHora(valor?: string, timestamp?: number) {
  const data = timestamp
    ? new Date(timestamp * 1000)
    : valor
      ? new Date(valor)
      : new Date()

  if (Number.isNaN(data.getTime())) return '--:--'
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatarData(valor?: string, timestamp?: number) {
  const data = timestamp
    ? new Date(timestamp * 1000)
    : valor
      ? new Date(valor)
      : new Date()

  if (Number.isNaN(data.getTime())) return 'Hoje'

  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)

  if (data.toDateString() === hoje.toDateString()) return 'Hoje'
  if (data.toDateString() === ontem.toDateString()) return 'Ontem'
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function dataMensagemApi(mensagem: ApiMensagem) {
  return mensagem.enviadaEm || mensagem.recebidaEm || mensagem.criadaEm || new Date().toISOString()
}

function rotuloMensagemTipo(tipo?: string | null) {
  switch (tipo) {
    case 'imageMessage':
      return '📷 Imagem'
    case 'audioMessage':
      return '🎵 Áudio'
    case 'videoMessage':
      return '📹 Vídeo'
    case 'documentMessage':
      return '📄 Documento'
    case 'stickerMessage':
      return '🎯 Sticker'
    case 'ptvMessage':
      return '📹 Vídeo'
    default:
      return 'Mensagem'
  }
}

function mensagemApiParaMensagem(mensagem: ApiMensagem, nomeContato: string): Mensagem {
  const quando = dataMensagemApi(mensagem)
  const timestampAt = Date.parse(quando)
  const remetenteTipo = mensagem.remetenteTipo === 'ia'
    ? 'ia'
    : mensagem.direcao === 'saida'
      ? 'agente'
      : 'contato'
  const replyText = mensagem.quotedText || null
  const replyTo = (mensagem.quotedMessageId || replyText)
    ? {
        id: mensagem.quotedMessageId || null,
        text: replyText || rotuloMensagemTipo(mensagem.quotedMessageType || null),
        author: mensagem.quotedAuthor || null,
        remoteJid: mensagem.quotedRemoteJid || null,
        messageType: mensagem.quotedMessageType || null,
      }
    : null

  return {
    id: mensagem.id,
    direcao: mensagem.direcao,
    conteudo: mensagem.conteudo,
    messageType: mensagem.messageType,
    mediaUrl: mensagem.mediaUrl,
    remetenteNome: mensagem.remetenteNome || (mensagem.direcao === 'saida' ? 'Você' : nomeContato),
    remetenteTipo,
    hora: formatarHora(quando),
    data: formatarData(quando),
    timestampAt: Number.isNaN(timestampAt) ? Date.now() : timestampAt,
    replyTo,
  }
}

function apiConversaParaConversa(api: ApiConversa): Conversa {
  const ultimaAt = api.ultimaMensagemAt ? Date.parse(api.ultimaMensagemAt) : undefined
  return {
    id: api.id,
    contato: {
      id: api.contato.id,
      nome: api.contato.nome,
      telefone: api.contato.telefone,
      remoteJid: api.contato.remoteJid || api.remoteJid,
      avatarUrl: api.contato.avatarUrl,
      avatarInitials: iniciais(api.contato.nome),
      cor: '#25D366',
      canal: 'whatsapp',
      online: true,
    },
    status: api.status,
    canal: 'whatsapp',
    iaAtiva: api.iaAtiva,
    naoLidas: api.naoLidas,
    ultimaMensagem: api.ultimaMensagem,
    ultimaMensagemEm: api.ultimaMensagemAt ? formatarHora(api.ultimaMensagemAt) : '',
    ultimaMensagemAt: ultimaAt && !Number.isNaN(ultimaAt) ? ultimaAt : undefined,
    tags: api.tags?.length ? api.tags : ['WhatsApp', 'Evolution'],
    agente: api.agente || 'Odontocompany by Op7',
    campanha: api.campanha || undefined,
    mensagens: (api.mensagens || []).map((msg) => mensagemApiParaMensagem(msg, api.contato.nome)),
  }
}

function agruparMensagensPorData(mensagens: Mensagem[]) {
  return mensagens.reduce<Array<{ data: string; mensagens: Mensagem[] }>>((grupos, mensagem) => {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.data === mensagem.data) {
      ultimo.mensagens.push(mensagem)
    } else {
      grupos.push({ data: mensagem.data, mensagens: [mensagem] })
    }
    return grupos
  }, [])
}

// ─── Mapping Mock Data ───────────────────────────────────────────────────────

function mapMockToConversa(mock: CardConversaData): Conversa {
  const mockContato = CONTATOS_MOCK[mock.id]
  const mockMsgs = MENSAGENS_MOCK[mock.id] || []

  const contato: Contato = {
    id: mock.id,
    nome: mock.nome,
    telefone: mockContato?.telefone || '',
    avatarInitials: mock.iniciais,
    cor: mockContato?.canalColor || '#25D366',
    canal: mock.canal === 'instagram' ? 'instagram_dm' : 'whatsapp',
    online: mockContato?.online || false,
    avatarUrl: null
  }

  const mensagens: Mensagem[] = mockMsgs.map(m => ({
    id: m.id,
    direcao: m.tipo === 'inbound' ? 'entrada' : 'saida',
    conteudo: m.texto,
    remetenteNome: m.remetente || (m.tipo === 'inbound' ? mock.nome : 'Você'),
    remetenteTipo: m.tipo === 'ia' ? 'ia' : (m.tipo === 'humano' ? 'agente' : 'contato'),
    hora: m.hora,
    data: 'Hoje',
    timestampAt: Date.now()
  }))

  return {
    id: mock.id,
    contato,
    status: mock.status === 'em-atendimento' ? 'em_atendimento' : 'nova',
    canal: mock.canal === 'instagram' ? 'instagram_dm' : 'whatsapp',
    iaAtiva: mock.agenteAtual.startsWith('ia'),
    naoLidas: mock.badgeCount || 0,
    ultimaMensagem: mock.preview,
    ultimaMensagemEm: mock.timestamp,
    tags: mock.etiquetas.map(e => e.label),
    agente: mock.agenteLabel || 'OdontoIA',
    mensagens
  }
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function PaginaConversas() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [conversaSelecionadaId, setConversaSelecionadaId] = useState<string | null>(null)
  const [filtroAtivo, setFiltroAtivo] = useState<'todas'|'novos'|'meus'|'outros'>('todas')
  const [filtroPrincipal, setFiltroPrincipal] = useState<'todas'|'nao_lidas'>('todas')
  const [busca, setBusca] = useState('')
  const [textoMensagem, setTextoMensagem] = useState('')
  const [isEnviando, setIsEnviando] = useState(false)
  const [isCarregando, setIsCarregando] = useState(true)
  const [erroIntegracao, setErroIntegracao] = useState<string | null>(null)
  
  const mensagensEndRef = useRef<HTMLDivElement>(null)

  const conversaSelecionada = useMemo(() => 
    conversas.find(c => c.id === conversaSelecionadaId)
  , [conversas, conversaSelecionadaId])

  const gruposMensagens = useMemo(() => 
    agruparMensagensPorData(conversaSelecionada?.mensagens || [])
  , [conversaSelecionada?.mensagens])

  const carregarConversas = useCallback(async (background = false) => {
    try {
      if (!background) setIsCarregando(true)

      const params = new URLSearchParams({ limit: '120' })
      if (filtroAtivo && filtroAtivo !== 'todas') {
        params.set('filtro', filtroAtivo === 'novos' ? 'novos' : filtroAtivo)
      }

      const data = await apiFetch<{ conversations: ApiConversa[] }>(
        'whatsapp/conversations',
        Object.fromEntries(params.entries()) as Record<string, string>,
      )

      if (!data?.conversations || data.conversations.length === 0) {
        // Fallback para mock se a API retornar vazio
        const mockData = CONVERSAS_MOCK.map(mapMockToConversa)
        setConversas(mockData)
        setErroIntegracao(null)
      } else {
        const normalizadas = ((data?.conversations || []) as ApiConversa[]).map(apiConversaParaConversa)
        setConversas(normalizadas)
        setErroIntegracao(null)
      }

      setConversaSelecionadaId((atual) => {
        if (atual && conversas.some((conversa) => conversa.id === atual)) return atual
        // No primeiro carregamento ou se a selecionada sumiu, tenta manter a primeira
        return null 
      })
    } catch (error) {
      // Em caso de erro, usa o mock para o demo não ficar em branco
      console.warn('Erro ao carregar conversas reais, usando mock data:', error)
      const mockData = CONVERSAS_MOCK.map(mapMockToConversa)
      setConversas(mockData)
      setErroIntegracao(error instanceof Error ? error.message : 'Erro inesperado')
    } finally {
      if (!background) setIsCarregando(false)
    }
  }, [filtroAtivo, conversas.length])

  // Carregar conversas reais do Postgres e assinar stream realtime via SSE
  useEffect(() => {
    let cancelado = false
    let refreshTimer: number | null = null
    let eventSource: EventSource | null = null

    async function executarCarga(background = false) {
      if (cancelado) return
      await carregarConversas(background)
    }

    function agendarRefresh(delay = 120) {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer)
      }

      refreshTimer = window.setTimeout(() => {
        void executarCarga(true)
      }, delay)
    }

    void executarCarga(false)

    const fallback = window.setInterval(() => {
      void executarCarga(true)
    }, 45000)

    try {
      eventSource = new EventSource('/api/whatsapp/stream')
      eventSource.addEventListener('whatsapp.refresh', () => agendarRefresh())
      eventSource.onmessage = () => agendarRefresh()
      eventSource.onerror = () => {
        // O EventSource tenta reconectar sozinho; mantemos apenas o fallback.
      }
    } catch (error) {
      console.warn('Realtime indisponível, usando fallback por polling.', error)
    }

    return () => {
      cancelado = true
      window.clearInterval(fallback)
      if (refreshTimer) {
        window.clearTimeout(refreshTimer)
      }
      eventSource?.close()
    }
  }, [carregarConversas])

  // Auto-scroll
  useEffect(() => {
    mensagensEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversaSelecionadaId, conversaSelecionada?.mensagens.length])

  // Handlers
  async function enviarMensagem() {
    if (!textoMensagem.trim() || !conversaSelecionada) return

    const conteudo = textoMensagem.trim()
    const telefoneDestino = conversaSelecionada.contato.remoteJid || conversaSelecionada.contato.telefone

    if (!telefoneDestino) return

    setIsEnviando(true)

    try {
      await apiFetch(
        'whatsapp/send',
        undefined,
        null,
        'POST',
        {
          number: telefoneDestino,
          text: conteudo,
        }
      )

      const nova: Mensagem = {
        id: `msg-${Date.now()}`,
        direcao: 'saida',
        conteudo,
        remetenteNome: 'Você',
        remetenteTipo: 'agente',
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        data: 'Hoje',
        timestampAt: Date.now(),
      }

      setConversas(cs => cs.map(c =>
        c.id === conversaSelecionadaId
          ? {
              ...c,
              mensagens: [...c.mensagens, nova],
              ultimaMensagem: nova.conteudo,
              ultimaMensagemEm: nova.hora,
              naoLidas: 0
            }
          : c
      ))
      setTextoMensagem('')
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
    } finally {
      setIsEnviando(false)
    }
  }

  const handleToggleIA = () => {
    if (!conversaSelecionadaId) return
    setConversas(cs => cs.map(c => 
      c.id === conversaSelecionadaId ? { ...c, iaAtiva: !c.iaAtiva } : c
    ))
  }

  async function transferirConversa(novoResponsavelId: string, novaEquipeId?: string) {
    if (!conversaSelecionadaId) return

try {
      await apiFetch(
        'whatsapp/transfer',
        undefined,
        null,
        'POST',
        {
          conversaId: conversaSelecionadaId,
          novoResponsavelId,
          ...(novaEquipeId ? { novaEquipeId } : {}),
        }
      )

      // Atualiza estado local
      setConversas(cs => cs.map(c =>
        c.id === conversaSelecionadaId
          ? { ...c, agente: `Transferido para ${novoResponsavelId.slice(0, 8)}...` }
          : c
      ))
    } catch (error) {
      console.error('Erro ao transferir:', error)
    }
  }

  const conversasFiltradas = useMemo(() => {
    return conversas.filter(c => {
      const matchBusca = c.contato.nome.toLowerCase().includes(busca.toLowerCase()) || 
                         c.contato.telefone.toLowerCase().includes(busca.toLowerCase()) ||
                         c.ultimaMensagem.toLowerCase().includes(busca.toLowerCase())
      const matchFiltroPrin = filtroPrincipal === 'nao_lidas' ? c.naoLidas > 0 : true
      
      // Aqui poderíamos adicionar lógica para filtroAtivo (novos/meus/outros) baseada no agente logado
      return matchBusca && matchFiltroPrin
    })
  }, [conversas, busca, filtroPrincipal])

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      overflow: 'hidden', 
      background: 'var(--ws-glass-bg)',
      backdropFilter: 'blur(16px)',
    }}>
      
      {/* ━━━━━━━━ PAINEL ESQUERDO ━━━━━━━━ */}
      <aside style={{ 
        width: '300px', 
        flexShrink: 0, 
        background: 'rgba(14,20,42,0.02)',
        borderRight: '1px solid var(--ws-divider)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ws-text-1)', margin: 0 }}>Conversas</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: erroIntegracao ? '#BA7517' : '#25D366' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: erroIntegracao ? '#BA7517' : '#25D366' }} />
            {erroIntegracao ? 'Modo Demonstração (API offline)' : isCarregando ? 'Conectando ao WhatsApp...' : 'WhatsApp conectado em tempo real'}
          </div>
          
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)' }} />
            <input 
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar..."
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--ws-glass-border)',
                color: 'var(--ws-text-1)',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['todas', 'novos', 'meus', 'outros'] as const).map(f => (
              <button 
                key={f}
                onClick={() => setFiltroAtivo(f)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '99px',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: '1px solid var(--ws-glass-border)',
                  background: filtroAtivo === f ? 'var(--ws-blue)' : 'rgba(255,255,255,0.05)',
                  color: filtroAtivo === f ? 'white' : 'var(--ws-text-3)',
                  transition: 'all 0.2s'
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <span 
              onClick={() => setFiltroPrincipal('todas')}
              style={{ 
                fontSize: '11px', 
                fontWeight: filtroPrincipal === 'todas' ? 600 : 400,
                color: filtroPrincipal === 'todas' ? 'var(--ws-blue)' : 'var(--ws-text-3)',
                cursor: 'pointer'
              }}
            >
              Todas
            </span>
            <span 
              onClick={() => setFiltroPrincipal('nao_lidas')}
              style={{ 
                fontSize: '11px', 
                fontWeight: filtroPrincipal === 'nao_lidas' ? 600 : 400,
                color: filtroPrincipal === 'nao_lidas' ? 'var(--ws-blue)' : 'var(--ws-text-3)',
                cursor: 'pointer'
              }}
            >
              Não lidas
            </span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
          {conversasFiltradas.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ws-text-3)', fontSize: 12, lineHeight: 1.5 }}>
              {isCarregando
                ? 'Carregando conversas do WhatsApp...'
                : 'Nenhuma conversa real chegou ainda. Envie uma mensagem para o número conectado e ela aparecerá aqui automaticamente.'}
            </div>
          )}
          {conversasFiltradas.map(conversa => {
            const isAtivo = conversaSelecionadaId === conversa.id
            const CanalIcon = CANAL_ICONS[conversa.canal]
            
            return (
              <div 
                key={conversa.id}
                onClick={() => setConversaSelecionadaId(conversa.id)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: isAtivo ? 'rgba(62,91,255,0.08)' : 'transparent',
                  borderLeft: isAtivo ? '3px solid var(--ws-blue)' : '3px solid transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => { if(!isAtivo) e.currentTarget.style.background = 'rgba(62,91,255,0.04)' }}
                onMouseLeave={e => { if(!isAtivo) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', gap: '12px', marginBottom: '4px' }}>
                  <AvatarContato
                    nome={conversa.contato.nome}
                    avatarUrl={conversa.contato.avatarUrl}
                    tamanho={36}
                    mostrarStatus
                    online={conversa.contato.online}
                  />
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ws-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conversa.contato.nome}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--ws-text-3)' }}>{conversa.ultimaMensagemEm}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <CanalIcon size={8} color={CANAL_COLORS[conversa.canal]} />
                      <span style={{ 
                        fontSize: '12px', color: 'var(--ws-text-3)', 
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontWeight: conversa.naoLidas > 0 ? 600 : 400
                      }}>
                        {conversa.ultimaMensagem}
                      </span>
                    </div>
                  </div>

                  {conversa.naoLidas > 0 && (
                    <div style={{ 
                      background: 'var(--ws-blue)', color: 'white', 
                      fontSize: '9px', fontWeight: 700, 
                      padding: '2px 6px', borderRadius: '99px',
                      height: 'fit-content'
                    }}>
                      {conversa.naoLidas}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginLeft: '48px' }}>
                  {conversa.tags.map(tag => (
                    <span key={tag} style={{ 
                      fontSize: '9px', padding: '1px 6px', borderRadius: '4px',
                      background: 'rgba(255,255,255,0.05)', color: 'var(--ws-text-3)',
                      border: '1px solid var(--ws-glass-border)'
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* ━━━━━━━━ PAINEL CENTRAL ━━━━━━━━ */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        {!conversaSelecionada ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <MessageCircle size={48} color="var(--ws-text-3)" strokeWidth={1} />
            <span style={{ color: 'var(--ws-text-3)', fontSize: '14px' }}>Selecione uma conversa para começar</span>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Header do Chat */}
            <header style={{ 
              padding: '12px 20px', 
              borderBottom: '1px solid var(--ws-divider)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <AvatarContato
                  nome={conversaSelecionada.contato.nome}
                  avatarUrl={conversaSelecionada.contato.avatarUrl}
                  tamanho={36}
                  mostrarStatus
                  online={conversaSelecionada.contato.online}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ws-text-1)' }}>{conversaSelecionada.contato.nome}</span>
                    <div style={{ 
                      fontSize: '9px', padding: '1px 6px', borderRadius: '4px',
                      background: `${CANAL_COLORS[conversaSelecionada.canal]}15`, 
                      color: CANAL_COLORS[conversaSelecionada.canal],
                      border: `1px solid ${CANAL_COLORS[conversaSelecionada.canal]}33`,
                      fontWeight: 600, textTransform: 'uppercase'
                    }}>
                      {conversaSelecionada.canal.replace('_dm', '')}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: conversaSelecionada.contato.online ? '#25D366' : 'var(--ws-text-3)' }}>
                    {conversaSelecionada.contato.online ? 'online' : 'visto por último hoje'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ 
                  background: 'none', border: 'none', color: 'var(--ws-text-3)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 10px', borderRadius: '6px'
                }} title="Transferir">
                  <ArrowRightLeft size={14} />
                  <span style={{ display: isMobile ? 'none' : 'inline' }}>Transferir</span>
                </button>
                <button style={{ 
                  background: 'none', border: 'none', color: '#FF5C8D', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 10px', borderRadius: '6px'
                }} title="Fechar">
                  <X size={14} />
                  <span style={{ display: isMobile ? 'none' : 'inline' }}>Fechar</span>
                </button>
                <button style={{ 
                  background: 'linear-gradient(135deg, var(--ws-blue) 0%, var(--ws-purple) 100%)', 
                  border: 'none', color: 'white', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 14px', borderRadius: '6px',
                  fontWeight: 600
                }}>
                  <Check size={14} />
                  Resolver
                </button>
              </div>
            </header>

            {/* Área de Mensagens */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              background: 'linear-gradient(to bottom, transparent, rgba(62,91,255,0.02))',
              scrollbarWidth: 'thin'
            }}>
              {gruposMensagens.map((grupo) => (
                <React.Fragment key={grupo.data}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ 
                      fontSize: '11px', color: 'var(--ws-text-3)', background: 'rgba(255,255,255,0.05)', 
                      padding: '4px 12px', borderRadius: '99px', border: '1px solid var(--ws-glass-border)'
                    }}>
                      {grupo.data}
                    </span>
                  </div>

                  {grupo.mensagens.map(msg => {
                    const isEntrada = msg.direcao === 'entrada'
                    const isIA = msg.remetenteTipo === 'ia'

                    return (
                      <div key={msg.id} style={{ 
                        alignSelf: isEntrada ? 'flex-start' : 'flex-end', 
                        maxWidth: '70%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}>
                        {/* Nome do Remetente */}
                        <div style={{ 
                          fontSize: '9px', color: 'var(--ws-text-3)', 
                          display: 'flex', alignItems: 'center', gap: '4px',
                          justifyContent: isEntrada ? 'flex-start' : 'flex-end'
                        }}>
                          {isIA && <Sparkles size={8} />}
                          {isEntrada ? msg.remetenteNome : (isIA ? 'IA Agente' : 'Atendente')}
                        </div>

                        {/* Balão */}
                        <div style={{
                          padding: '10px 14px',
                          borderRadius: isEntrada ? '0 12px 12px 12px' : '12px 0 12px 12px',
                          fontSize: '13px',
                          lineHeight: '1.5',
                          background: isEntrada 
                            ? 'rgba(255,255,255,0.85)' 
                            : (isIA ? 'linear-gradient(135deg, #0f2744, #1a3a6b)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)'),
                          color: isEntrada ? '#0f2744' : '#ffffff',
                          border: isEntrada ? '1px solid var(--ws-glass-border)' : 'none',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                          position: 'relative',
                          wordBreak: 'break-word',
                          whiteSpace: 'pre-wrap',
                          overflow: 'hidden',
                        }}>
                          {msg.replyTo && (
                            <div style={{
                              marginBottom: '8px',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              background: isEntrada ? 'rgba(15,39,68,0.06)' : 'rgba(255,255,255,0.14)',
                              borderLeft: `3px solid ${isEntrada ? 'rgba(15,39,68,0.35)' : 'rgba(255,255,255,0.35)'}`,
                              opacity: 0.95,
                            }}>
                              <div style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                color: isEntrada ? '#0f2744' : '#ffffff',
                                marginBottom: '2px',
                                opacity: 0.9,
                              }}>
                                Respondendo{msg.replyTo.author ? ` a ${msg.replyTo.author}` : ''}
                              </div>
                              <div style={{
                                fontSize: '11px',
                                lineHeight: 1.35,
                                color: isEntrada ? '#1e3a5f' : 'rgba(255,255,255,0.92)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}>
                                {msg.replyTo.text || 'Mensagem citada'}
                              </div>
                            </div>
                          )}

                          {/* Imagem/Vídeo inline estilo WhatsApp */}
                          {msg.mediaUrl && (msg.messageType === 'imageMessage' || msg.messageType === 'stickerMessage') ? (
                            <div style={{ marginBottom: msg.conteudo && !msg.conteudo.startsWith('📷') && !msg.conteudo.startsWith('🎯') ? '6px' : '0' }}>
                              <img 
                                src={msg.mediaUrl}
                                alt={msg.conteudo}
                                style={{
                                  maxWidth: '280px',
                                  maxHeight: '280px',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  display: 'block',
                                }}
                                onClick={() => window.open(msg.mediaUrl!, '_blank')}
                              />
                            </div>
                          ) : msg.messageType === 'audioMessage' || msg.messageType === 'pttMessage' ? (
                            <div style={{ marginBottom: '4px' }}>
                              <audio controls style={{ maxWidth: '250px', height: '36px' }}>
                                <source src={msg.mediaUrl || ''} />
                              </audio>
                            </div>
                          ) : null}
                          {msg.conteudo || '(sem conteúdo)'}
                          <div style={{ 
                            fontSize: '9px', color: isEntrada ? '#64748b' : 'rgba(255,255,255,0.7)', 
                            textAlign: 'right', marginTop: '4px'
                          }}>
                            {msg.hora}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </React.Fragment>
              ))}
              <div ref={mensagensEndRef} />
            </div>

            {/* Footer do Chat */}
            <footer style={{ 
              padding: '16px 20px', 
              borderTop: '1px solid var(--ws-divider)',
              background: 'rgba(255,255,255,0.01)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div 
                    onClick={handleToggleIA}
                    style={{
                      width: '32px',
                      height: '18px',
                      borderRadius: '18px',
                      background: conversaSelecionada.iaAtiva ? '#25D366' : 'rgba(255,255,255,0.1)',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background 0.3s ease',
                      border: '1px solid var(--ws-glass-border)'
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      top: '2px',
                      left: conversaSelecionada.iaAtiva ? '16px' : '2px',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: 'white',
                      transition: 'left 0.3s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--ws-text-2)', fontWeight: 500 }}>IA Agente</span>
                </div>
                
                {conversaSelecionada.campanha && (
                  <span style={{ fontSize: '10px', color: 'var(--ws-text-3)', fontStyle: 'italic' }}>
                    Campanha: {conversaSelecionada.campanha}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                <div style={{ 
                  flex: 1, display: 'flex', alignItems: 'flex-end', gap: '8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--ws-glass-border)',
                  borderRadius: '12px',
                  padding: '8px 12px'
                }}>
                  <div style={{ display: 'flex', gap: '8px', paddingBottom: '6px' }}>
                    <button style={iconBtnStyle}><Smile size={18} /></button>
                    <button style={iconBtnStyle}><Paperclip size={18} /></button>
                    <button style={iconBtnStyle}><Mic size={18} /></button>
                  </div>
                  
                  <textarea 
                    value={textoMensagem}
                    onChange={e => setTextoMensagem(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        enviarMensagem()
                      }
                    }}
                    placeholder={conversaSelecionada.iaAtiva ? "IA está respondendo automaticamente..." : "Digite uma mensagem..."}
                    style={{
                      flex: 1,
                      background: 'none',
                      border: 'none',
                      color: 'var(--ws-text-1)',
                      fontSize: '13px',
                      outline: 'none',
                      resize: 'none',
                      padding: '4px 0',
                      minHeight: '20px',
                      maxHeight: '100px'
                    }}
                    rows={1}
                  />
                </div>

                <button 
                  onClick={enviarMensagem}
                  disabled={isEnviando || !textoMensagem.trim()}
                  style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: isEnviando || !textoMensagem.trim()
                      ? 'rgba(62,91,255,0.45)'
                      : 'linear-gradient(135deg, var(--ws-blue) 0%, var(--ws-purple) 100%)',
                    border: 'none', color: 'white', cursor: isEnviando ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(62, 91, 255, 0.2)',
                    opacity: isEnviando ? 0.8 : 1
                  }}
                >
                  <Send size={18} />
                </button>
              </div>
            </footer>
            </div>
          </div>
        )}
      </main>

      {/* PAINEL DIREITO */}
      {conversaSelecionada ? (
        <PainelContato conversa={conversaSelecionada} />
      ) : (
        <aside style={{ 
          width: 320,
          flexShrink: 0,
          borderLeft: '1px solid var(--ws-divider)',
          background: 'rgba(255,255,255,0.015)',
        }} />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        textarea::-webkit-scrollbar { width: 4px; }
        textarea::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); borderRadius: 10px; }
      `}} />
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--ws-text-3)',
  cursor: 'pointer',
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.2s'
}

const isMobile = false // Simulação para controle de exibição de nomes em botões

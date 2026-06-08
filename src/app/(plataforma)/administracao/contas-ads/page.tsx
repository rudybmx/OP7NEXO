'use client'

import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2, Plus, Search, CreditCard, RefreshCw, CheckCircle2, XCircle, Clock3, AlertTriangle, Clock, Pencil, Power, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { EditarContaDialog } from '@/components/administracao/contas-ads/editar-conta-dialog'
import { NovaContaDialog } from '@/components/administracao/contas-ads/nova-conta-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, TableScrollContainer, TableContent, Chip, Button as HeroButton } from '@heroui/react'
import { useAuth } from '@/hooks/use-auth'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import api from '@/lib/api-client'

interface Workspace {
  id: string
  nome: string
}

interface WorkspaceResumo {
  id: string
  nome: string
}

interface SyncState {
  last_run_at?: string | null
  last_run_mode?: string | null
  last_run_status?: string | null
  last_success_at?: string | null
  last_error_at?: string | null
  last_error_stage?: string | null
  last_error_message?: string | null
  last_error_code?: number | null
  last_error_http_status?: number | null
  last_rate_limit_usage_percent?: number | null
  cooldown_until?: string | null
  last_totals?: Record<string, unknown>
  watermarks?: Record<string, unknown>
  last_error_meta?: Record<string, unknown>
}

interface AdsAccount {
  id: string
  workspace_id: string
  workspace_nome: string
  workspace_acessos?: WorkspaceResumo[]
  plataforma: 'meta' | 'google' | 'linkedin' | 'tiktok'
  account_id: string
  nome: string
  bm_id?: string | null
  token?: string | null
  status: 'ativo' | 'expirado' | 'erro'
  ativo: boolean
  sync_paused: boolean
  sincronizado_em?: string | null
  periodo_sync_inicio?: string | null
  agrupamento?: string | null
  sync_state?: SyncState | null
}

interface SyncJobState {
  jobId: string
  status: 'pending' | 'running' | 'done' | 'error'
  progresso: number
  etapa: string | null
  erro: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

interface SyncJobAPI {
  id: string
  ads_account_id: string
  status: 'pending' | 'running' | 'done' | 'error'
  etapa_atual: string | null
  progresso: number
  totais: Record<string, number> | null
  erro: string | null
  created_at: string
  updated_at: string
}

interface SyncStartAPI {
  job_id: string | null
  status: 'pending' | 'running' | 'skipped'
  reason?: string | null
}

interface SyncSchedulerJobAPI {
  id: string
  trigger: string
  next_run_time: string | null
  timezone: string | null
}

interface SyncSchedulerAPI {
  running: boolean
  jobs: SyncSchedulerJobAPI[]
}

type Plataforma = 'todas' | 'meta' | 'google' | 'linkedin' | 'tiktok'

const SYNC_JOBS_STORAGE_KEY = 'op7nexo-meta-sync-jobs'

const PLATAFORMAS: { id: Plataforma; label: string; cor: string }[] = [
  { id: 'todas', label: 'Todas', cor: 'var(--ws-blue)' },
  { id: 'meta', label: 'Meta', cor: '#0081FB' },
  { id: 'google', label: 'Google', cor: '#EA4335' },
  { id: 'linkedin', label: 'LinkedIn', cor: '#0A66C2' },
  { id: 'tiktok', label: 'TikTok', cor: '#69C9D0' },
]

const PLATFORM_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  meta: { label: 'Meta', bg: 'rgba(0,129,251,0.15)', color: '#0081FB' },
  google: { label: 'Google', bg: 'rgba(234,67,53,0.15)', color: '#EA4335' },
  linkedin: { label: 'LinkedIn', bg: 'rgba(10,102,194,0.15)', color: '#0A66C2' },
  tiktok: { label: 'TikTok', bg: 'rgba(105,201,208,0.15)', color: '#69C9D0' },
}

const INSIGHTS_BADGE = {
  com_dados:      { label: 'Com dados',    bg: 'rgba(15,168,86,0.15)',   color: 'var(--ws-green)' },
  dados_com_erro: { label: 'Erro no sync', bg: 'rgba(201,168,76,0.15)', color: '#c9a84c' },
  aguardando:     { label: 'Aguardando',   bg: 'rgba(201,168,76,0.15)', color: '#c9a84c' },
  erro:           { label: 'Erro',         bg: 'rgba(255,92,141,0.15)', color: 'var(--ws-coral)' },
  cooldown:       { label: 'Cooldown',     bg: 'rgba(201,168,76,0.15)', color: '#c9a84c' },
  executando:     { label: 'Executando',   bg: 'rgba(62,91,255,0.15)',  color: 'var(--ws-blue)' },
  pausado:        { label: 'Pausado',      bg: 'rgba(255,92,141,0.15)', color: 'var(--ws-coral)' },
}

function isFutureIso(iso?: string | null): boolean {
  if (!iso) return false
  const time = new Date(iso).getTime()
  return Number.isFinite(time) && time > Date.now()
}

function insightsBadge(c: AdsAccount) {
  const state = c.sync_state
  if (c.sync_paused) return INSIGHTS_BADGE.pausado
  if (state?.cooldown_until && isFutureIso(state.cooldown_until)) return INSIGHTS_BADGE.cooldown
  if (state?.last_run_status === 'running') return INSIGHTS_BADGE.executando
  if (state?.last_run_status === 'error') {
    if (state?.last_success_at || c.sincronizado_em) return INSIGHTS_BADGE.dados_com_erro
    return INSIGHTS_BADGE.erro
  }
  if (state?.last_success_at || c.sincronizado_em) return INSIGHTS_BADGE.com_dados
  return INSIGHTS_BADGE.aguardando
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatarPeriodo(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `desde ${dia}/${mes}/${ano}`
}

const META_ACCOUNT_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Ativa', color: 'var(--ws-green)' },
  2: { label: 'Desativada', color: 'var(--ws-text-3)' },
  3: { label: 'Suspenso', color: 'var(--ws-coral)' },
}

const PERIODOS = [
  { id: 'mes_atual', label: 'Mês atual' },
  { id: '1_mes', label: '1 mês atrás' },
  { id: '2_meses', label: '2 meses atrás' },
  { id: '3_meses', label: '3 meses atrás' },
]

function isSyncJobAtivo(job?: SyncJobState | null): boolean {
  return job?.status === 'pending' || job?.status === 'running'
}

function syncJobFromApi(job: SyncJobAPI): SyncJobState {
  return {
    jobId: job.id,
    status: job.status,
    progresso: job.progresso,
    etapa: job.etapa_atual,
    erro: job.erro,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  }
}

function loadPersistedSyncJobs(): Record<string, SyncJobState> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(SYNC_JOBS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const entries = Object.entries(parsed as Record<string, SyncJobState>)
    return Object.fromEntries(
      entries.filter(([, job]) => isSyncJobAtivo(job) && !!job?.jobId),
    )
  } catch {
    return {}
  }
}

function savePersistedSyncJobs(jobs: Record<string, SyncJobState>) {
  if (typeof window === 'undefined') return
  try {
    const ativos = Object.fromEntries(
      Object.entries(jobs).filter(([, job]) => isSyncJobAtivo(job) && !!job?.jobId),
    )
    if (Object.keys(ativos).length === 0) {
      localStorage.removeItem(SYNC_JOBS_STORAGE_KEY)
      return
    }
    localStorage.setItem(SYNC_JOBS_STORAGE_KEY, JSON.stringify(ativos))
  } catch {
  }
}

function jobSemHeartbeatRecente(job: SyncJobState): boolean {
  if (!isSyncJobAtivo(job) || !job.updatedAt) return false
  const atualizadoEm = new Date(job.updatedAt).getTime()
  if (!Number.isFinite(atualizadoEm)) return false
  return Date.now() - atualizadoEm > 5 * 60 * 1000
}

function formatarTooltipSyncJob(job: SyncJobState): string {
  const partes = [
    `Job ${job.jobId}`,
    `Status: ${job.status}`,
    `Progresso: ${job.progresso}%`,
  ]
  if (job.etapa) partes.push(`Etapa: ${job.etapa}`)
  if (job.createdAt) partes.push(`Iniciado: ${formatarDataHora(job.createdAt)}`)
  if (job.updatedAt) partes.push(`Atualizado: ${formatarDataHora(job.updatedAt)}`)
  if (job.erro) partes.push(`Erro: ${job.erro}`)
  return partes.join(' | ')
}

export default function ContasAdsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [contas, setContas] = useState<AdsAccount[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroPlataforma, setFiltroPlataforma] = useState<Plataforma>('todas')
  const [drawerAberto, setDrawerAberto] = useState(false)

  // Sync jobs
  const [syncJobs, setSyncJobs] = useState<Record<string, SyncJobState>>(() => loadPersistedSyncJobs())
  const syncJobsRef = React.useRef<Record<string, SyncJobState>>({})
  const syncJobCleanupTimeoutsRef = React.useRef<number[]>([])
  const [syncScheduler, setSyncScheduler] = useState<SyncSchedulerAPI | null>(null)
  const [carregandoScheduler, setCarregandoScheduler] = useState(false)
  useLayoutEffect(() => { syncJobsRef.current = syncJobs }, [syncJobs])
  const atualizarSyncJobs = useCallback((updater: (current: Record<string, SyncJobState>) => Record<string, SyncJobState>) => {
    setSyncJobs(prev => {
      const next = updater(prev)
      savePersistedSyncJobs(next)
      return next
    })
  }, [])
  const agendarRemocaoSyncJob = (contaId: string, delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      atualizarSyncJobs(prev => {
        const next = { ...prev }
        delete next[contaId]
        return next
      })
      syncJobCleanupTimeoutsRef.current = syncJobCleanupTimeoutsRef.current.filter(id => id !== timeoutId)
    }, delayMs)
    syncJobCleanupTimeoutsRef.current.push(timeoutId)
  }

  useEffect(() => () => {
    syncJobCleanupTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId))
    syncJobCleanupTimeoutsRef.current = []
  }, [])

  // Confirm toggle
  const [confirmToggle, setConfirmToggle] = useState<AdsAccount | null>(null)
  const [toggling, setToggling] = useState(false)

  const [editandoConta, setEditandoConta] = useState<AdsAccount | null>(null)

  useEffect(() => {
    if (!authLoading && user && user.role !== 'platform_admin') router.push('/')
  }, [authLoading, user, router])

  const loadContas = useCallback(async () => {
    setCarregando(true)
    try {
      const data = await api.get<AdsAccount[]>('/ads-accounts')
      setContas(data)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar contas')
    } finally {
      setCarregando(false)
    }
  }, [])

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await api.get<Workspace[]>('/workspaces')
      setWorkspaces(data)
    } catch {
      // non-blocking
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'platform_admin') {
      loadContas()
      loadWorkspaces()
    }
  }, [user, loadContas, loadWorkspaces])

  const loadSyncScheduler = useCallback(async () => {
    setCarregandoScheduler(true)
    try {
      const data = await api.get<SyncSchedulerAPI>('/meta/sync/scheduler')
      setSyncScheduler(data)
    } catch {
      setSyncScheduler(null)
    } finally {
      setCarregandoScheduler(false)
    }
  }, [])

  const loadActiveSyncJobs = useCallback(async () => {
    try {
      const ativos = await api.get<SyncJobAPI[]>('/meta/sync/ativos')
      atualizarSyncJobs(() => {
        const next: Record<string, SyncJobState> = {}
        for (const job of ativos) {
          next[job.ads_account_id] = syncJobFromApi(job)
        }
        return next
      })
    } catch {
      // se a API não responder, mantemos o estado persistido localmente
    }
  }, [atualizarSyncJobs])

  useEffect(() => {
    if (authLoading || user?.role !== 'platform_admin') return

    void loadActiveSyncJobs()
  }, [authLoading, user?.role, loadActiveSyncJobs])

  useEffect(() => {
    if (authLoading || user?.role !== 'platform_admin') return

    void loadSyncScheduler()
    const interval = window.setInterval(() => {
      void loadSyncScheduler()
    }, 60000)

    return () => window.clearInterval(interval)
  }, [authLoading, user?.role, loadSyncScheduler])

  useEffect(() => {
    if (authLoading || user?.role !== 'platform_admin') return

    const interval = setInterval(async () => {
      const current = syncJobsRef.current
      const entries = Object.entries(current).filter(
        ([, j]) => isSyncJobAtivo(j)
      )
      for (const [contaId, job] of entries) {
        try {
          const conta = contas.find(c => c.id === contaId)
          const jobEndpoint = conta?.plataforma === 'google'
            ? `/google-ads/sync/job/${job.jobId}`
            : `/meta/sync/job/${job.jobId}`
          const data = await api.get<SyncJobAPI>(jobEndpoint)

          atualizarSyncJobs(prev => ({
            ...prev,
            [contaId]: {
              ...prev[contaId],
              jobId: data.id,
              status: data.status,
              progresso: data.progresso,
              etapa: data.etapa_atual,
              erro: data.erro,
              createdAt: data.created_at,
              updatedAt: data.updated_at,
            },
          }))

          if (data.status === 'done') {
            setContas(prev => prev.map(c =>
              c.id === contaId
                ? { ...c, sincronizado_em: new Date().toISOString() }
                : c
            ))
            agendarRemocaoSyncJob(contaId, 3000)
          }

          if (data.status === 'error') {
            agendarRemocaoSyncJob(contaId, 5000)
          }
        } catch (err: any) {
          const msg = String(err?.message ?? '')
          if (msg.includes('404') || msg.includes('Job não encontrado')) {
            atualizarSyncJobs(prev => {
              const next = { ...prev }
              delete next[contaId]
              return next
            })
            continue
          }
          // ignore transient errors
        }
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [authLoading, user?.role])

  async function handleSync(conta: AdsAccount) {
    if (syncJobs[conta.id]) return
    if (conta.sync_paused) {
      toast.warning('Sync pausado. Despause a conta para tentar novamente.')
      return
    }
    try {
      const endpoint = conta.plataforma === 'google'
        ? `/google-ads/sync/${conta.id}`
        : `/meta/sync/${conta.id}`
      const data = await api.post<SyncStartAPI>(endpoint)
      if (data.status === 'skipped') {
        toast.warning(data.reason ? `Sync pausado: ${data.reason}` : 'Sync pausado')
        return
      }
      const now = new Date().toISOString()
      atualizarSyncJobs(prev => ({
        ...prev,
        [conta.id]: {
          jobId: data.job_id,
          status: (data.status as SyncJobState['status']) || 'pending',
          progresso: 0,
          etapa: null,
          erro: null,
          createdAt: now,
          updatedAt: now,
        },
      }))
      if (data.status === 'running') {
        toast.info('Sincronização já estava em andamento')
      } else {
        toast.success('Sincronização iniciada')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao iniciar sync')
    }
  }

  async function handleToggleConta() {
    if (!confirmToggle) return
    setToggling(true)
    try {
      await api.patch(`/meta/ads-accounts/${confirmToggle.id}/toggle`)
      toast.success(confirmToggle.ativo ? 'Conta desativada' : 'Conta ativada')
      setConfirmToggle(null)
      await loadContas()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar conta')
    } finally {
      setToggling(false)
    }
  }

  function abrirEdicaoConta(conta: AdsAccount) {
    setEditandoConta(conta)
  }

  function fecharEdicaoConta() {
    setEditandoConta(null)
  }

  const filtradas = contas.filter(c => {
    const t = busca.toLowerCase()
    const matchBusca =
      c.nome.toLowerCase().includes(t) ||
      c.account_id.toLowerCase().includes(t) ||
      (c.workspace_nome?.toLowerCase() || '').includes(t)
    const matchPlat = filtroPlataforma === 'todas' || c.plataforma === filtroPlataforma
    return matchBusca && matchPlat
  })

  function renderSyncCell(c: AdsAccount) {
    const job = syncJobs[c.id]
    const jobTooltip = job ? formatarTooltipSyncJob(job) : undefined
    const state = c.sync_state
    const cooldownUntil = state?.cooldown_until && isFutureIso(state.cooldown_until) ? state.cooldown_until : null
    if (job?.status === 'done') {
      return (
        <Chip size="sm" variant="soft" color="success" title={jobTooltip}>
          <CheckCircle2 size={11} className="mr-0.5" />
          Concluído
        </Chip>
      )
    }
    if (job?.status === 'error') {
      return (
        <Chip size="sm" variant="soft" color="danger" title={jobTooltip} className="cursor-help">
          <XCircle size={11} className="mr-0.5" />
          Erro
        </Chip>
      )
    }
    if (job?.status === 'pending' || job?.status === 'running') {
      const semHeartbeat = jobSemHeartbeatRecente(job)
      return (
        <div title={jobTooltip} style={{ minWidth: 110 }}>
          <Progress
            value={job.progresso}
            className="h-1.5 mb-1"
            indicatorClassName="bg-[var(--ws-blue)]"
          />
          <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>
            {job.etapa ?? 'iniciando...'} {job.progresso}%{semHeartbeat ? ' • sem atualização recente' : ''}
          </span>
        </div>
      )
    }
    if (c.sync_paused) {
      return (
        <Chip size="sm" variant="soft" color="danger" title="Sync pausado. Despausar a conta antes de tentar novamente." className="cursor-help">
          <XCircle size={11} className="mr-0.5" />
          Pausado
        </Chip>
      )
    }
    if (cooldownUntil) {
      return (
        <Chip size="sm" variant="soft" title={`Cooldown até ${formatarDataHora(cooldownUntil)}`} className="cursor-help" style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c' }}>
          <Clock3 size={11} className="mr-0.5" />
          Cooldown
        </Chip>
      )
    }
    if (state?.last_run_status === 'running') {
      return (
        <Chip size="sm" variant="soft" color="accent" title={state.last_run_at ? `Última execução iniciada em ${formatarDataHora(state.last_run_at)}` : 'Sync em execução'} className="cursor-help">
          <Loader2 size={11} className="animate-spin mr-0.5" />
          Executando
        </Chip>
      )
    }
    if (state?.last_run_status === 'error') {
      return (
        <div className="flex items-center gap-1">
          <Chip size="sm" variant="soft" color="danger" title={state.last_error_message || state.last_error_stage || 'Erro no último sync'} className="cursor-help">
            <XCircle size={11} className="mr-0.5" />
            Erro
          </Chip>
          <HeroButton isIconOnly size="sm" variant="ghost" onClick={() => handleSync(c)} aria-label="Tentar sync novamente">
            <RotateCcw size={13} />
          </HeroButton>
        </div>
      )
    }
    return (
      <HeroButton isIconOnly size="sm" variant="ghost" onPress={() => handleSync(c)} aria-label="Sincronizar conta">
        <RotateCcw size={14} />
      </HeroButton>
    )
  }

  if (authLoading || !user || user.role !== 'platform_admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
      </div>
    )
  }

  const schedulerJob = syncScheduler?.jobs?.[0] ?? null
  const schedulerStatusLabel = syncScheduler?.running ? 'Ativo' : 'Parado'
  const schedulerStatusColor = syncScheduler?.running ? 'var(--ws-green)' : 'var(--ws-coral)'
  const schedulerStatusBg = syncScheduler?.running ? 'rgba(15,168,86,0.12)' : 'rgba(255,92,141,0.12)'

  return (
    <div style={{ padding: '32px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            Contas Ads
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
            Gerencie as contas de anúncios vinculadas aos clientes
          </p>
        </div>
        <button
          onClick={() => setDrawerAberto(true)}
          style={{
            background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            border: 'none', padding: '0 20px', height: 42, borderRadius: 10,
            fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(62,91,255,0.30)',
          }}
        >
          <Plus size={16} />
          Nova Conta
        </button>
      </div>

      {/* Filtro plataforma */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {PLATAFORMAS.map(p => (
          <button
            key={p.id}
            onClick={() => setFiltroPlataforma(p.id)}
            style={{
              padding: '6px 16px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
              border: filtroPlataforma === p.id ? `0.5px solid ${p.cor}` : '1px solid var(--ws-glass-border)',
              background: filtroPlataforma === p.id ? `rgba(${hexToRgb(p.cor)},0.12)` : 'var(--ws-glass-bg)',
              color: filtroPlataforma === p.id ? p.cor : 'var(--ws-text-2)',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Busca */}
      <div style={{
        background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
        borderRadius: 12, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 24,
      }}>
        <Search size={16} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Buscar por nome, account ID ou cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: 'var(--ws-text-1)', outline: 'none' }}
        />
        <span style={{ fontSize: 12, color: 'var(--ws-text-3)', flexShrink: 0 }}>
          {filtradas.length} conta{filtradas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Scheduler status */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 16,
          padding: '16px 18px 18px',
          marginBottom: 24,
          boxShadow: 'var(--ws-glass-shadow-sm)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 14,
            right: 14,
            top: 10,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.78), transparent)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ws-text-2)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Clock3 size={14} />
              Scheduler Meta Ads
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: schedulerStatusBg,
                  color: schedulerStatusColor,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: schedulerStatusColor, flexShrink: 0 }} />
                {carregandoScheduler ? 'Atualizando' : schedulerStatusLabel}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>
                Sync automático às 06:00, 12:00 e 18:00 de Brasília
              </span>
            </div>
          </div>
          <button
            onClick={() => { void loadSyncScheduler() }}
            disabled={carregandoScheduler}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid var(--ws-glass-border)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--ws-text-2)',
              fontSize: 13,
              fontWeight: 600,
              cursor: carregandoScheduler ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={14} className={carregandoScheduler ? 'animate-spin' : ''} />
            Recarregar
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ws-glass-border)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ws-text-3)', fontWeight: 600 }}>Próxima execução</div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ws-text-1)', fontWeight: 600 }}>
              {schedulerJob?.next_run_time ? formatarDataHora(schedulerJob.next_run_time) : 'Sem agendamento carregado'}
            </div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ws-glass-border)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ws-text-3)', fontWeight: 600 }}>Timezone</div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ws-text-1)', fontWeight: 600 }}>
              {schedulerJob?.timezone || 'America/Sao_Paulo'}
            </div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ws-glass-border)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ws-text-3)', fontWeight: 600 }}>Job</div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ws-text-1)', fontWeight: 600 }}>
              {schedulerJob ? schedulerJob.trigger : 'meta_sync'}
            </div>
          </div>
        </div>

        {schedulerJob && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ws-text-2)' }}>
            O job <strong style={{ fontWeight: 600, color: 'var(--ws-text-1)' }}>{schedulerJob.id}</strong> é o responsável pelo sync automático das contas Meta.
          </div>
        )}
      </div>

      {/* Tabela */}
      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', borderRadius: 14, boxShadow: 'var(--ws-glass-shadow)' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando contas...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', borderRadius: 14, boxShadow: 'var(--ws-glass-shadow)' }}>
          <CreditCard size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>
            {busca || filtroPlataforma !== 'todas' ? 'Nenhuma conta encontrada' : 'Nenhuma conta cadastrada'}
          </p>
          {!busca && filtroPlataforma === 'todas' && (
            <p style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 4 }}>
              Clique em "Nova Conta" para começar
            </p>
          )}
        </div>
      ) : (
        <Table variant="primary" aria-label="Contas Ads" className="w-full">
          <TableScrollContainer>
            <TableContent aria-label="Contas Ads" className="min-w-[900px]">
              <TableHeader>
                <TableColumn isRowHeader id="plataforma">Plataforma</TableColumn>
                <TableColumn id="account_id">Account ID</TableColumn>
                <TableColumn id="nome">Nome</TableColumn>
                <TableColumn id="cliente">Cliente</TableColumn>
                <TableColumn id="periodo">Período</TableColumn>
                <TableColumn id="insights">Insights</TableColumn>
                <TableColumn id="atualizado" className="min-w-[160px]">Última Atualização</TableColumn>
                <TableColumn id="acoes" className="text-end">Ações</TableColumn>
              </TableHeader>
              <TableBody>
                {filtradas.map(c => {
                  const plat = PLATFORM_BADGE[c.plataforma]
                  const insights = insightsBadge(c)
                  return (
                    <TableRow key={c.id} id={c.id}>
                      {/* Plataforma */}
                      <TableCell>
                        <Chip
                          size="sm"
                          className="font-semibold"
                          style={{ background: plat.bg, color: plat.color }}
                        >
                          {plat.label}
                        </Chip>
                      </TableCell>
                      {/* Account ID */}
                      <TableCell>
                        <code className="font-mono text-[11px]" style={{ color: 'var(--ws-text-3)' }}>
                          {c.account_id}
                        </code>
                      </TableCell>
                      {/* Nome */}
                      <TableCell className="max-w-[180px]">
                        <span className="block truncate text-[13px] font-medium" style={{ color: 'var(--ws-text-1)' }}>
                          {c.nome}
                        </span>
                      </TableCell>
                      {/* Cliente */}
                      <TableCell className="max-w-[140px]">
                        <span className="block truncate text-[13px]" style={{ color: 'var(--ws-text-2)' }}>
                          {c.workspace_nome || '—'}
                        </span>
                      </TableCell>
                      {/* Período */}
                      <TableCell className="text-[13px] whitespace-nowrap" style={{ color: 'var(--ws-text-3)' }}>
                        {c.periodo_sync_inicio ? formatarPeriodo(c.periodo_sync_inicio) : '—'}
                      </TableCell>
                      {/* Insights */}
                      <TableCell>
                        <Chip
                          size="sm"
                          className="font-semibold"
                          style={{ background: insights.bg, color: insights.color }}
                        >
                          <span className="size-1.5 rounded-full flex-shrink-0 mr-1" style={{ background: insights.color }} />
                          {insights.label}
                        </Chip>
                      </TableCell>
                      {/* Última Atualização */}
                      <TableCell className="text-[13px]" style={{ color: 'var(--ws-text-3)' }}>
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1.5">
                            {(() => {
                              const status = c.sync_state?.last_run_status
                              const hasCooldown = c.sync_state?.cooldown_until && isFutureIso(c.sync_state.cooldown_until)
                              const isRunning = syncJobs[c.id]?.status === 'running' || syncJobs[c.id]?.status === 'pending'
                              if (isRunning) return <Loader2 size={13} style={{ color: 'var(--ws-blue)', flexShrink: 0 }} className="animate-spin" />
                              if (hasCooldown) return <Clock size={13} style={{ color: '#c9a84c', flexShrink: 0 }} />
                              if (status === 'error') return <AlertTriangle size={13} style={{ color: 'var(--ws-coral)', flexShrink: 0 }} />
                              if (status === 'success') return <CheckCircle2 size={13} style={{ color: 'var(--ws-green)', flexShrink: 0 }} />
                              return null
                            })()}
                            {c.sincronizado_em ? formatarDataHora(c.sincronizado_em) : 'Nunca sincronizado'}
                          </span>
                          {c.sync_state?.last_success_at && c.sync_state.last_success_at !== c.sincronizado_em && (
                            <span className="text-[11px]" style={{ color: 'var(--ws-text-2)' }}>
                              Último sucesso: {formatarDataHora(c.sync_state.last_success_at)}
                            </span>
                          )}
                          {c.sync_state?.last_run_status === 'error' && c.sync_state.last_error_stage && (
                            <span className="text-[11px]" style={{ color: 'var(--ws-coral)' }}>
                              Falha em {c.sync_state.last_error_stage}
                              {c.sync_state.last_error_message ? `: ${c.sync_state.last_error_message}` : ''}
                            </span>
                          )}
                          {c.sync_state?.cooldown_until && isFutureIso(c.sync_state.cooldown_until) && (
                            <span className="text-[11px]" style={{ color: '#c9a84c' }}>
                              Cooldown até {formatarDataHora(c.sync_state.cooldown_until)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {/* Ações */}
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <HeroButton
                            isIconOnly size="sm" variant="ghost"
                            onPress={() => abrirEdicaoConta(c)}
                            aria-label="Editar conta"
                          >
                            <Pencil size={14} />
                          </HeroButton>
                          {renderSyncCell(c)}
                          <HeroButton
                            isIconOnly size="sm" variant="ghost"
                            onPress={() => setConfirmToggle(c)}
                            aria-label={c.ativo ? 'Desativar conta' : 'Ativar conta'}
                            className={c.ativo
                              ? 'text-[var(--ws-coral)] hover:bg-[var(--ws-coral-soft)]'
                              : 'text-[var(--ws-green)] hover:bg-[var(--ws-green-soft)]'
                            }
                          >
                            <Power size={14} />
                          </HeroButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>
      )}

      <NovaContaDialog
        open={drawerAberto}
        onOpenChange={open => { if (!open) setDrawerAberto(false) }}
        workspaces={workspaces}
        onSaved={async () => {
          await loadContas()
          await loadActiveSyncJobs()
        }}
      />

      <EditarContaDialog
        conta={editandoConta}
        workspaces={workspaces}
        onClose={fecharEdicaoConta}
        onSaved={(atualizada) => {
          setContas(prev => prev.map(c => c.id === atualizada.id ? atualizada : c))
        }}
      />


      {/* Confirm Toggle Modal */}
      {confirmToggle && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
            borderRadius: 16, padding: '28px 32px', maxWidth: 400, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 8px' }}>
              {confirmToggle.ativo ? 'Desativar conta?' : 'Ativar conta?'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 6px', lineHeight: 1.6 }}>
              {confirmToggle.ativo
                ? 'Deseja desativar esta conta? Ela não aparecerá mais nos relatórios.'
                : `Deseja reativar "${confirmToggle.nome}"?`}
            </p>
            {confirmToggle.ativo && (
              <p style={{ fontSize: 12, color: 'var(--ws-text-3)', margin: '0 0 20px' }}>
                <strong style={{ color: 'var(--ws-text-2)' }}>{confirmToggle.nome}</strong>
              </p>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button
                onClick={() => setConfirmToggle(null)}
                style={{
                  flex: 1, height: 40, borderRadius: 10,
                  background: 'transparent', border: '1px solid var(--ws-glass-border)',
                  fontSize: 13, fontWeight: 500, color: 'var(--ws-text-2)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleToggleConta}
                disabled={toggling}
                style={{
                  flex: 1, height: 40, borderRadius: 10,
                  background: confirmToggle.ativo
                    ? (toggling ? 'rgba(255,92,141,0.4)' : 'linear-gradient(135deg, #FF5C8D, #c9447a)')
                    : (toggling ? 'rgba(15,168,86,0.4)' : 'linear-gradient(135deg, #0fa856, #0d8a46)'),
                  border: 'none', fontSize: 13, fontWeight: 600,
                  color: 'white', cursor: toggling ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {toggling && <Loader2 size={14} className="animate-spin" />}
                {confirmToggle.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function hexToRgb(hex: string): string {
  const clean = hex.startsWith('var(') ? '' : hex.replace('#', '')
  if (clean.length !== 6) return '62,91,255'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r},${g},${b}`
}

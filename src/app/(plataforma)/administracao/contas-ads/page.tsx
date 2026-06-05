'use client'

import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2, Plus, Search, X, CreditCard, RefreshCw, Check, CheckCircle2, XCircle, Clock3, ChevronLeft, AlertTriangle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { EditarContaDialog } from '@/components/administracao/contas-ads/editar-conta-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, TableScrollContainer, TableContent, Chip, Button as HeroButton } from '@heroui/react'
import { wsSheetCreamCloseButtonStyle, wsSheetCreamInputStyle, wsSheetCreamStyle, wsSheetCreamTokens } from '@/components/ui/ws-sheet'
import { useAuth } from '@/hooks/use-auth'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import api from '@/lib/api-client'

interface MetaToken {
  id: string
  nome: string
  token: string
  valido_ate: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

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

interface MetaContaAPI {
  account_id: string
  account_name: string
  account_status: number
  currency: string
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

interface EditContaForm {
  account_name: string
  bm_id: string
  token_acesso: string
  agrupamento: string
  sync_paused: boolean
  workspace_ids_acesso: string[]
}

function emptyEditForm(): EditContaForm {
  return {
    account_name: '',
    bm_id: '',
    token_acesso: '',
    agrupamento: '',
    sync_paused: false,
    workspace_ids_acesso: [],
  }
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
  com_dados: { label: 'Com dados', bg: 'rgba(15,168,86,0.15)', color: 'var(--ws-green)' },
  aguardando: { label: 'Aguardando', bg: 'rgba(201,168,76,0.15)', color: '#c9a84c' },
  erro: { label: 'Erro', bg: 'rgba(255,92,141,0.15)', color: 'var(--ws-coral)' },
  cooldown: { label: 'Cooldown', bg: 'rgba(201,168,76,0.15)', color: '#c9a84c' },
  executando: { label: 'Executando', bg: 'rgba(62,91,255,0.15)', color: 'var(--ws-blue)' },
  pausado: { label: 'Pausado', bg: 'rgba(255,92,141,0.15)', color: 'var(--ws-coral)' },
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
  if (state?.last_run_status === 'error') return INSIGHTS_BADGE.erro
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  ...wsSheetCreamInputStyle,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ws-text-2)',
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

function emptyForm() {
  return {
    workspace_id: '',
    plataforma: 'meta' as 'meta' | 'google' | 'linkedin' | 'tiktok',
    account_id: '',
    nome: '',
    bm_id: '',
    token: '',
    agrupamento: '',
  }
}

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
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(emptyForm())

  // Meta flow
  const [metaStep, setMetaStep] = useState<1 | 2 | 3>(1)
  const [metaBmToken, setMetaBmToken] = useState('')
  const [metaTokenExpira, setMetaTokenExpira] = useState('')
  const [metaContas, setMetaContas] = useState<MetaContaAPI[]>([])
  const [metaSelecionadas, setMetaSelecionadas] = useState<string[]>([])
  const [metaPeriodo, setMetaPeriodo] = useState('mes_atual')
  const [metaErro, setMetaErro] = useState('')
  const [buscandoMeta, setBuscandoMeta] = useState(false)
  const [metaFiltro, setMetaFiltro] = useState('')

  // Meta tokens (step 1 selector)
  const [metaTokens, setMetaTokens] = useState<MetaToken[]>([])
  const [carregandoTokens, setCarregandoTokens] = useState(false)
  const [tokenSelecionadoId, setTokenSelecionadoId] = useState('')

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

  // Estado edição de agrupamento
  const [editandoConta, setEditandoConta] = useState<AdsAccount | null>(null)
  const [editForm, setEditForm] = useState<EditContaForm>(emptyEditForm())
  const [editWorkspaceBusca, setEditWorkspaceBusca] = useState('')
  const [salvandoEdit, setSalvandoEdit] = useState(false)

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

  const loadMetaTokens = useCallback(async () => {
    setCarregandoTokens(true)
    try {
      const data = await api.get<MetaToken[]>('/meta/tokens')
      setMetaTokens(data)
    } catch {
      setMetaTokens([])
    } finally {
      setCarregandoTokens(false)
    }
  }, [])

  useEffect(() => {
    if (drawerAberto && metaTokens.length === 0 && !carregandoTokens) {
      loadMetaTokens()
    }
  }, [drawerAberto, metaTokens.length, carregandoTokens, loadMetaTokens])

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
          const data = await api.get<SyncJobAPI>(`/meta/sync/job/${job.jobId}`)

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
      const data = await api.post<SyncStartAPI>(`/meta/sync/${conta.id}`)
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

  async function buscarContasMeta() {
    if (!form.workspace_id) { setMetaErro('Selecione um cliente primeiro'); return }
    if (!metaBmToken.trim()) { setMetaErro('Selecione um token de acesso'); return }
    setMetaErro('')
    setBuscandoMeta(true)
    try {
      const data = await api.get<MetaContaAPI[]>(`/meta/contas?token=${encodeURIComponent(metaBmToken.trim())}`)
      setMetaContas(data)
      setMetaSelecionadas([])
      setMetaStep(2)
    } catch (err: any) {
      setMetaErro(err.message || 'Erro ao buscar contas Meta')
    } finally {
      setBuscandoMeta(false)
    }
  }

  function toggleMetaConta(accountId: string) {
    setMetaSelecionadas(prev =>
      prev.includes(accountId) ? prev.filter(id => id !== accountId) : [...prev, accountId]
    )
  }

  async function importarContas() {
    console.log('importar:', { workspace_id: form.workspace_id, contas: metaSelecionadas.length, periodo: metaPeriodo })
    if (!form.workspace_id) { toast.error('Selecione um cliente'); return }
    if (metaSelecionadas.length === 0) { toast.error('Selecione ao menos uma conta'); return }
    setSalvando(true)
    try {
      const contasPayload = metaSelecionadas.map(id => {
        const c = metaContas.find(x => x.account_id === id)
        return { account_id: id, nome: c?.account_name || '' }
      })
      const result = await api.post<{
        criadas: number
        atualizadas: number
        jobs_iniciados?: number
        jobs_reutilizados?: number
      }>('/meta/importar-contas', {
        workspace_id: form.workspace_id,
        token: metaBmToken,
        token_expira_em: metaTokenExpira
          ? new Date(metaTokenExpira + 'T23:00:00Z').toISOString()
          : null,
        periodo_sync: metaPeriodo,
        contas: contasPayload,
        agrupamento: form.agrupamento || null,
      })
      fecharDrawer()
      await loadContas()
      await loadActiveSyncJobs()
      const total = result.criadas + result.atualizadas
      const jobsIniciados = result.jobs_iniciados ?? 0
      const jobsReutilizados = result.jobs_reutilizados ?? 0
      if (jobsIniciados > 0) {
        toast.success(`${total} conta${total !== 1 ? 's' : ''} importada${total !== 1 ? 's' : ''} e sincronização iniciada`)
      } else if (jobsReutilizados > 0) {
        toast.success(`${total} conta${total !== 1 ? 's' : ''} importada${total !== 1 ? 's' : ''}. Sincronização já estava em andamento`)
      } else {
        toast.success(`${total} conta${total !== 1 ? 's' : ''} importada${total !== 1 ? 's' : ''} com sucesso`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar contas')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarManual() {
    if (!form.workspace_id) { toast.error('Selecione um cliente'); return }
    if (!form.account_id.trim()) { toast.error('Account ID é obrigatório'); return }
    if (!form.nome.trim()) { toast.error('Nome da conta é obrigatório'); return }
    setSalvando(true)
    try {
      const criada = await api.post<AdsAccount>(`/workspaces/${form.workspace_id}/ads-accounts`, {
        plataforma: form.plataforma,
        account_id: form.account_id.trim(),
        nome: form.nome.trim(),
        bm_id: form.bm_id.trim() || null,
        token: form.token.trim() || null,
        agrupamento: form.agrupamento || null,
      })
      setContas(prev => [criada, ...prev])
      fecharDrawer()
      toast.success('Conta criada com sucesso!')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar conta')
    } finally {
      setSalvando(false)
    }
  }

  function fecharDrawer() {
    setDrawerAberto(false)
    setForm(emptyForm())
    setMetaStep(1)
    setMetaBmToken('')
    setMetaTokenExpira('')
    setMetaContas([])
    setMetaSelecionadas([])
    setMetaPeriodo('mes_atual')
    setMetaErro('')
    setMetaFiltro('')
    setMetaTokens([])
    setTokenSelecionadoId('')
  }

  function abrirEdicaoConta(conta: AdsAccount) {
    const workspaceIdsAcesso = (conta.workspace_acessos ?? [])
      .map(ws => ws.id)
      .filter(id => id !== conta.workspace_id)

    setEditandoConta(conta)
    setEditForm({
      account_name: conta.nome || '',
      bm_id: conta.bm_id || '',
      token_acesso: '',
      agrupamento: conta.agrupamento || '',
      sync_paused: conta.sync_paused,
      workspace_ids_acesso: workspaceIdsAcesso,
    })
    setEditWorkspaceBusca('')
  }

  function fecharEdicaoConta() {
    setEditandoConta(null)
    setEditForm(emptyEditForm())
    setEditWorkspaceBusca('')
  }

  async function salvarEdicaoConta() {
    if (!editandoConta) return
    if (!editForm.account_name.trim()) {
      toast.error('Nome da conta é obrigatório')
      return
    }
    setSalvandoEdit(true)
    try {
      const tokenAcesso = editForm.token_acesso.trim()
      const payload: {
        account_name: string
        bm_id: string | null
        agrupamento: string | null
        sync_paused: boolean
        workspace_ids_acesso: string[]
        token_acesso?: string
      } = {
        account_name: editForm.account_name.trim(),
        bm_id: editForm.bm_id.trim() || null,
        agrupamento: editForm.agrupamento.trim() || null,
        sync_paused: editForm.sync_paused,
        workspace_ids_acesso: editForm.workspace_ids_acesso.filter(id => id && id !== editandoConta.workspace_id),
      }
      if (tokenAcesso) {
        payload.token_acesso = tokenAcesso
      }
      const atualizada = await api.put<AdsAccount>(`/ads-accounts/${editandoConta.id}`, payload)
      setContas(prev => prev.map(c => (c.id === atualizada.id ? atualizada : c)))
      fecharEdicaoConta()
      toast.success('Conta atualizada com sucesso!')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar conta')
    } finally {
      setSalvandoEdit(false)
    }
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
    if (c.plataforma !== 'meta') return null
    const job = syncJobs[c.id]
    const jobTooltip = job ? formatarTooltipSyncJob(job) : undefined
    const state = c.sync_state
    const cooldownUntil = state?.cooldown_until && isFutureIso(state.cooldown_until) ? state.cooldown_until : null
    if (job?.status === 'done') {
      return (
        <span
          title={jobTooltip}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, color: 'var(--ws-green)' }}
        >
          <CheckCircle2 size={13} />
          Concluído
        </span>
      )
    }
    if (job?.status === 'error') {
      return (
        <span
          title={jobTooltip}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, color: 'var(--ws-coral)', cursor: 'help' }}
        >
          <XCircle size={13} />
          Erro
        </span>
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
        <span
          title="Sync pausado. Despausar a conta antes de tentar novamente."
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, color: 'var(--ws-coral)', cursor: 'help' }}
        >
          <XCircle size={13} />
          Pausado
        </span>
      )
    }
    if (cooldownUntil) {
      return (
        <span
          title={`Cooldown até ${formatarDataHora(cooldownUntil)}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, color: '#c9a84c', cursor: 'help' }}
        >
          <Clock3 size={13} />
          Cooldown
        </span>
      )
    }
    if (state?.last_run_status === 'running') {
      return (
        <span
          title={state.last_run_at ? `Última execução iniciada em ${formatarDataHora(state.last_run_at)}` : 'Sync em execução'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, color: 'var(--ws-blue)', cursor: 'help' }}
        >
          <Loader2 size={13} className="animate-spin" />
          Executando
        </span>
      )
    }
    if (state?.last_run_status === 'error') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 110 }}>
          <span
            title={state.last_error_message || state.last_error_stage || 'Erro no último sync'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, color: 'var(--ws-coral)', cursor: 'help' }}
          >
            <XCircle size={13} />
            Erro
          </span>
          <button
            style={{
              background: 'transparent',
              border: '1px solid rgba(62,91,255,0.35)',
              borderRadius: 6, padding: '4px 10px',
              fontSize: 12, color: 'var(--ws-blue)',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
            onClick={() => handleSync(c)}
          >
            <RefreshCw size={11} />
            Sync
          </button>
        </div>
      )
    }
    return (
      <button
        style={{
          background: 'transparent',
          border: '1px solid rgba(62,91,255,0.35)',
          borderRadius: 6, padding: '4px 10px',
          fontSize: 12, color: 'var(--ws-blue)',
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}
        onClick={() => handleSync(c)}
      >
        <RefreshCw size={11} />
        Sync
      </button>
    )
  }

  if (authLoading || !user || user.role !== 'platform_admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
      </div>
    )
  }

  const isMeta = form.plataforma === 'meta'
  const selectedToken = metaTokens.find(x => x.token === tokenSelecionadoId) ?? null
  const schedulerJob = syncScheduler?.jobs?.[0] ?? null
  const schedulerStatusLabel = syncScheduler?.running ? 'Ativo' : 'Parado'
  const schedulerStatusColor = syncScheduler?.running ? 'var(--ws-green)' : 'var(--ws-coral)'
  const schedulerStatusBg = syncScheduler?.running ? 'rgba(15,168,86,0.12)' : 'rgba(255,92,141,0.12)'
  const editWorkspaceTermo = editWorkspaceBusca.trim().toLowerCase()
  const editWorkspaceOptions = editandoConta
    ? workspaces.filter(ws =>
        ws.id !== editandoConta.workspace_id &&
        (!editWorkspaceTermo || ws.nome.toLowerCase().includes(editWorkspaceTermo)),
      )
    : []
  const editPlatformBadge = editandoConta ? PLATFORM_BADGE[editandoConta.plataforma] : PLATFORM_BADGE.meta

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
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
        marginBottom: 24, backdropFilter: 'blur(10px)',
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
      <div
        style={{
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.06)',
          borderRadius: 14,
          overflow: 'hidden',
          backdropFilter: 'blur(16px)',
        }}
      >
        {carregando ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando contas...</p>
          </div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
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
          <Table variant="secondary" aria-label="Contas Ads" className="w-full">
            <TableScrollContainer className="overflow-x-auto">
              <TableContent aria-label="Contas Ads" className="w-full border-separate border-spacing-0">
                <TableHeader className="sticky top-0 z-10">
                  {(['Plataforma', 'Account ID', 'Nome', 'Cliente', 'Período', 'Insights', 'Última Atualização', 'Ações'] as const).map(h => (
                    <TableColumn
                      key={h}
                      className="px-3.5 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap border-b"
                      style={{
                        color: 'var(--ws-text-3)',
                        background: 'rgba(62,91,255,0.04)',
                        borderColor: 'var(--ws-divider)',
                      }}
                    >
                      {h}
                    </TableColumn>
                  ))}
                </TableHeader>
                <TableBody>
                  {filtradas.map(c => {
                    const plat = PLATFORM_BADGE[c.plataforma]
                    const insights = insightsBadge(c)
                    return (
                      <TableRow
                        key={c.id}
                        id={c.id}
                        className="border-b transition-colors hover:bg-[rgba(62,91,255,0.03)]"
                        style={{ borderColor: 'var(--ws-divider)' }}
                      >
                        {/* Plataforma */}
                        <TableCell className="px-3.5 py-2.5 whitespace-nowrap">
                          <Chip
                            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
                            style={{ background: plat.bg, color: plat.color }}
                          >
                            {plat.label}
                          </Chip>
                        </TableCell>
                        {/* Account ID */}
                        <TableCell className="px-3.5 py-2.5 whitespace-nowrap">
                          <code className="font-mono text-[11px]" style={{ color: 'var(--ws-text-3)' }}>
                            {c.account_id}
                          </code>
                        </TableCell>
                        {/* Nome */}
                        <TableCell className="px-3.5 py-2.5 max-w-[180px]">
                          <span className="block truncate text-[13px] font-medium" style={{ color: 'var(--ws-text-1)' }}>
                            {c.nome}
                          </span>
                        </TableCell>
                        {/* Cliente */}
                        <TableCell className="px-3.5 py-2.5 max-w-[140px]">
                          <span className="block truncate text-[13px]" style={{ color: 'var(--ws-text-2)' }}>
                            {c.workspace_nome || '—'}
                          </span>
                        </TableCell>
                        {/* Período */}
                        <TableCell className="px-3.5 py-2.5 whitespace-nowrap text-[13px]" style={{ color: 'var(--ws-text-3)' }}>
                          {c.periodo_sync_inicio ? formatarPeriodo(c.periodo_sync_inicio) : '—'}
                        </TableCell>
                        {/* Insights */}
                        <TableCell className="px-3.5 py-2.5 whitespace-nowrap">
                          <Chip
                            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
                            style={{ background: insights.bg, color: insights.color }}
                          >
                            <span className="size-1.5 rounded-full flex-shrink-0" style={{ background: insights.color }} />
                            {insights.label}
                          </Chip>
                        </TableCell>
                        {/* Última Atualização */}
                        <TableCell className="px-3.5 py-2.5 min-w-[160px] text-[13px]" style={{ color: 'var(--ws-text-3)' }}>
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
                        <TableCell className="px-3.5 py-2.5 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <HeroButton
                              onPress={() => abrirEdicaoConta(c)}
                              className="rounded-md border px-3 py-1 text-xs cursor-pointer bg-transparent transition-colors hover:bg-[rgba(62,91,255,0.06)] outline-none"
                              style={{ borderColor: 'var(--ws-glass-border)', color: 'var(--ws-text-2)' }}
                            >
                              Editar
                            </HeroButton>
                            {renderSyncCell(c)}
                            <HeroButton
                              onPress={() => setConfirmToggle(c)}
                              className="rounded-md border px-3 py-1 text-xs cursor-pointer bg-transparent transition-colors outline-none"
                              style={{
                                borderColor: c.ativo ? 'rgba(255,92,141,0.35)' : 'rgba(15,168,86,0.35)',
                                color: c.ativo ? 'var(--ws-coral)' : 'var(--ws-green)',
                              }}
                            >
                              {c.ativo ? 'Desativar' : 'Ativar'}
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
      </div>

      {/* Drawer Nova Conta */}
      <Sheet open={drawerAberto} onOpenChange={open => !open && fecharDrawer()}>
        <SheetContent
          side="right"
          style={{
            width: isMeta ? 520 : 480,
            ...wsSheetCreamStyle,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
          >
          <SheetTitle className="sr-only">Nova Conta Ads</SheetTitle>
          <SheetDescription className="sr-only">
            {isMeta
              ? `Importar via Meta — passo ${metaStep} de 3`
              : 'Vincule uma conta de anúncios a um cliente'}
          </SheetDescription>
          {/* Drawer header */}
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: '1px solid var(--ws-glass-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
                Nova Conta Ads
              </h2>
              <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
                {isMeta
                  ? `Importar via Meta — passo ${metaStep} de 3`
                  : 'Vincule uma conta de anúncios a um cliente'}
              </p>
            </div>
            <button
              onClick={fecharDrawer}
              style={{
                ...wsSheetCreamCloseButtonStyle,
                borderRadius: 8, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--ws-text-2)',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Drawer body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Plataforma selector */}
              <div>
                <label style={labelStyle}>Plataforma *</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['meta', 'google', 'linkedin', 'tiktok'] as const).map(p => {
                    const badge = PLATFORM_BADGE[p]
                    const selected = form.plataforma === p
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          setForm(prev => ({ ...prev, plataforma: p }))
                          setMetaStep(1)
                        }}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 8, fontSize: 13, fontWeight: 500,
                          cursor: 'pointer', transition: 'all 0.15s',
                          border: selected ? `1px solid ${badge.color}` : '1px solid var(--ws-glass-border)',
                          background: selected ? badge.bg : 'transparent',
                          color: selected ? badge.color : 'var(--ws-text-2)',
                        }}
                      >
                        {badge.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {isMeta ? (
                <>
                  {/* Step indicator */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {[1, 2, 3].map(s => (
                      <React.Fragment key={s}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                          background: metaStep > s ? 'var(--ws-green)' : metaStep === s ? 'var(--ws-blue)' : wsSheetCreamTokens.surfaceHover,
                          color: metaStep >= s ? 'white' : 'var(--ws-text-3)',
                          border: metaStep === s ? '2px solid rgba(62,91,255,0.4)' : `1px solid ${wsSheetCreamTokens.border}`,
                          flexShrink: 0,
                        }}>
                          {metaStep > s ? <Check size={12} /> : s}
                        </div>
                        {s < 3 && (
                          <div style={{
                            flex: 1, height: 1,
                            background: metaStep > s ? 'var(--ws-green)' : wsSheetCreamTokens.borderStrong,
                          }} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Step 1: Cliente + Token */}
                  {metaStep === 1 && (
                    <>
                      <div>
                        <label style={labelStyle}>Cliente *</label>
                        <select
                          value={form.workspace_id}
                          onChange={e => {
                            const wsId = e.target.value
                            setForm(prev => ({ ...prev, workspace_id: wsId }))
                            setTokenSelecionadoId('')
                            setMetaBmToken('')
                            setMetaTokenExpira('')
                          }}
                          style={{ ...inputStyle, cursor: 'pointer' }}
                        >
                          <option value="">Selecione um cliente...</option>
                          {workspaces.map(w => (
                            <option key={w.id} value={w.id}>{w.nome}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={labelStyle}>Token de Acesso Meta *</label>
                        {carregandoTokens ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
                            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
                            <span style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>Carregando tokens...</span>
                          </div>
                        ) : metaTokens.length === 0 ? (
                          <p style={{ fontSize: 12, color: 'var(--ws-text-3)', padding: '8px 0' }}>
                            Nenhum token cadastrado.{' '}
                            <a href="/admin/tokens" target="_blank" style={{ color: 'var(--ws-blue)', textDecoration: 'underline' }}>
                              Cadastrar token
                            </a>
                          </p>
                        ) : (
                          <Select
                            value={tokenSelecionadoId}
                            onValueChange={v => {
                              setTokenSelecionadoId(v)
                              const t = metaTokens.find(x => x.token === v)
                              if (t) {
                                setMetaBmToken(t.token)
                                setMetaTokenExpira(t.valido_ate ?? '')
                                setMetaErro('')
                              }
                            }}
                          >
                            <SelectTrigger
                              className="w-full h-10 text-sm border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] backdrop-blur-md"
                            >
                              <SelectValue placeholder="Selecione um token..." />
                            </SelectTrigger>
                            <SelectContent position="popper" className="z-[200]">
                              {metaTokens.map(t => (
                                <SelectItem key={t.id} value={t.token} className="text-sm">
                                  {t.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {metaErro && (
                          <p style={{ fontSize: 12, color: 'var(--ws-coral)', marginTop: 6 }}>{metaErro}</p>
                        )}
                        {tokenSelecionadoId && selectedToken && (
                          <div style={{ marginTop: 10 }}>
                            <label style={labelStyle}>Válido até</label>
                            <input
                              type="date"
                              value={selectedToken.valido_ate ?? ''}
                              readOnly
                              style={{
                                ...inputStyle,
                                cursor: 'not-allowed',
                                background: wsSheetCreamTokens.surface,
                                opacity: 0.9,
                              }}
                            />
                            <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 6 }}>
                              {selectedToken.valido_ate
                                ? `Validade do token selecionado: ${new Date(selectedToken.valido_ate + 'T00:00:00').toLocaleDateString('pt-BR')}`
                                : 'Token sem data de validade definida'}
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Step 2: Selecionar contas */}
                  {metaStep === 2 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>
                          Contas encontradas ({metaContas.length})
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => setMetaSelecionadas(metaContas.map(c => c.account_id))}
                            style={{
                              background: 'transparent', border: 'none',
                              fontSize: 11, color: 'var(--ws-blue)',
                              cursor: 'pointer', fontWeight: 600,
                            }}
                          >
                            Selecionar todas
                          </button>
                          <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>·</span>
                          <button
                            onClick={() => setMetaSelecionadas([])}
                            style={{
                              background: 'transparent', border: 'none',
                              fontSize: 11, color: 'var(--ws-text-3)',
                              cursor: 'pointer', fontWeight: 600,
                            }}
                          >
                            Limpar seleção
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Filtrar contas..."
                        value={metaFiltro}
                        onChange={e => setMetaFiltro(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                        {[...metaContas]
                          .sort((a, b) => (a.account_name || '').localeCompare(b.account_name || ''))
                          .filter(c => !metaFiltro.trim() || (c.account_name || c.account_id).toLowerCase().includes(metaFiltro.toLowerCase()))
                          .map(conta => {
                          const selected = metaSelecionadas.includes(conta.account_id)
                          const statusInfo = META_ACCOUNT_STATUS[conta.account_status] || { label: `Status ${conta.account_status}`, color: 'var(--ws-text-3)' }
                          return (
                            <button
                              key={conta.account_id}
                              onClick={() => toggleMetaConta(conta.account_id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '12px 14px', borderRadius: 10,
                                background: selected ? 'rgba(0,129,251,0.08)' : wsSheetCreamTokens.surface,
                                border: selected ? '1px solid rgba(0,129,251,0.35)' : `1px solid ${wsSheetCreamTokens.border}`,
                                cursor: 'pointer', textAlign: 'left', width: '100%',
                                transition: 'all 0.15s', flexShrink: 0,
                              }}
                            >
                              <div style={{
                                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                background: selected ? '#0081FB' : wsSheetCreamTokens.checkboxUncheckedBg,
                                border: selected ? '1px solid #0081FB' : `1px solid ${wsSheetCreamTokens.checkboxUncheckedBorder}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {selected && <Check size={11} color="white" />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', marginBottom: 2 }}>
                                  {conta.account_name || conta.account_id}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <code style={{ fontSize: 11, color: 'var(--ws-text-3)', fontFamily: 'monospace' }}>
                                    {conta.account_id}
                                  </code>
                                  <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>·</span>
                                  <span style={{ fontSize: 11, color: statusInfo.color, fontWeight: 600 }}>
                                    {statusInfo.label}
                                  </span>
                                  <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>·</span>
                                  <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{conta.currency}</span>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                        {metaContas.length === 0 && (
                          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', textAlign: 'center', padding: '32px 0' }}>
                            Nenhuma conta encontrada
                          </p>
                        )}
                      </div>
                      {metaSelecionadas.length > 0 && (
                        <div style={{
                          marginTop: 12, padding: '8px 14px', borderRadius: 8,
                          background: 'rgba(0,129,251,0.08)',
                          border: '1px solid rgba(0,129,251,0.2)',
                          fontSize: 12, color: '#0081FB', fontWeight: 600,
                        }}>
                          {metaSelecionadas.length} selecionada{metaSelecionadas.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 3: Período + Cliente */}
                  {metaStep === 3 && (
                    <>
                      <div>
                        <label style={labelStyle}>Período de sincronização *</label>
                        <p style={{ fontSize: 12, color: 'var(--ws-text-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
                          A partir de quando buscar dados históricos de campanhas
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {PERIODOS.map(p => (
                            <button
                              key={p.id}
                              onClick={() => setMetaPeriodo(p.id)}
                              style={{
                                padding: '8px 16px', borderRadius: 8,
                                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                transition: 'all 0.15s',
                                border: metaPeriodo === p.id ? '1px solid #0081FB' : '1px solid var(--ws-glass-border)',
                                background: metaPeriodo === p.id ? 'rgba(0,129,251,0.12)' : 'transparent',
                                color: metaPeriodo === p.id ? '#0081FB' : 'var(--ws-text-2)',
                              }}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label style={labelStyle}>Cliente *</label>
                        <select
                          value={form.workspace_id}
                          onChange={e => setForm(prev => ({ ...prev, workspace_id: e.target.value }))}
                          style={{ ...inputStyle, cursor: 'pointer' }}
                        >
                          <option value="">Selecione um cliente...</option>
                          {workspaces.map(w => (
                            <option key={w.id} value={w.id}>{w.nome}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={labelStyle}>Agrupamento <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                        <input
                          type="text"
                          placeholder="ex: Franquias SP, Zona Sul"
                          value={form.agrupamento}
                          onChange={e => setForm(prev => ({ ...prev, agrupamento: e.target.value }))}
                          style={inputStyle}
                        />
                      </div>

                      {form.workspace_id && (
                        <div style={{
                          padding: '12px 14px', borderRadius: 10,
                          background: wsSheetCreamTokens.surface,
                          border: `1px solid ${wsSheetCreamTokens.border}`,
                          fontSize: 13, color: 'var(--ws-text-2)', lineHeight: 1.6,
                        }}>
                          <strong style={{ color: 'var(--ws-text-1)' }}>{metaSelecionadas.length}</strong> conta{metaSelecionadas.length !== 1 ? 's' : ''} ser{metaSelecionadas.length !== 1 ? 'ão' : 'á'} importada{metaSelecionadas.length !== 1 ? 's' : ''} para{' '}
                          <strong style={{ color: 'var(--ws-text-1)' }}>
                            {workspaces.find(w => w.id === form.workspace_id)?.nome || '—'}
                          </strong>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                /* Manual form for non-Meta platforms */
                <>
                  <div>
                    <label style={labelStyle}>Cliente *</label>
                    <select
                      value={form.workspace_id}
                      onChange={e => setForm(prev => ({ ...prev, workspace_id: e.target.value }))}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="">Selecione um cliente...</option>
                      {workspaces.map(w => (
                        <option key={w.id} value={w.id}>{w.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Account ID *</label>
                    <input
                      type="text"
                      placeholder="ex: act_123456789"
                      value={form.account_id}
                      onChange={e => setForm(prev => ({ ...prev, account_id: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Nome da Conta *</label>
                    <input
                      type="text"
                      placeholder="Nome identificador da conta"
                      value={form.nome}
                      onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Token de Acesso <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                    <textarea
                      placeholder="Cole o token de acesso da conta..."
                      value={form.token}
                      onChange={e => setForm(prev => ({ ...prev, token: e.target.value }))}
                      rows={4}
                      style={{
                        ...inputStyle,
                        resize: 'vertical',
                        fontFamily: 'monospace',
                        fontSize: 12,
                      }}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Agrupamento <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                    <input
                      type="text"
                      placeholder="ex: Franquias SP, Zona Sul"
                      value={form.agrupamento}
                      onChange={e => setForm(prev => ({ ...prev, agrupamento: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Drawer footer */}
          <div style={{
            padding: '20px 28px',
            borderTop: '1px solid var(--ws-glass-border)',
            display: 'flex', gap: 12,
          }}>
            {isMeta && metaStep > 1 ? (
              <button
                onClick={() => setMetaStep(prev => (prev - 1) as 1 | 2 | 3)}
                style={{
                  height: 42, borderRadius: 10, paddingInline: 16,
                  background: 'transparent',
                  border: '1px solid var(--ws-glass-border)',
                  fontSize: 14, fontWeight: 500,
                  color: 'var(--ws-text-2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <ChevronLeft size={16} />
                Voltar
              </button>
            ) : (
              <button
                onClick={fecharDrawer}
                style={{
                  flex: 1, height: 42, borderRadius: 10,
                  background: 'transparent',
                  border: '1px solid var(--ws-glass-border)',
                  fontSize: 14, fontWeight: 500,
                  color: 'var(--ws-text-2)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            )}

            {isMeta ? (
              metaStep === 1 ? (
                <button
                  onClick={buscarContasMeta}
                  disabled={buscandoMeta}
                  style={{
                    flex: 2, height: 42, borderRadius: 10,
                    background: buscandoMeta ? 'rgba(0,129,251,0.4)' : 'linear-gradient(135deg, #0081FB, #0060C0)',
                    border: 'none', fontSize: 14, fontWeight: 600,
                    color: 'white', cursor: buscandoMeta ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: buscandoMeta ? 'none' : '0 4px 12px rgba(0,129,251,0.30)',
                  }}
                >
                  {buscandoMeta ? <Loader2 size={16} className="animate-spin" /> : null}
                  {buscandoMeta ? 'Buscando suas contas...' : 'Buscar Contas →'}
                </button>
              ) : metaStep === 2 ? (
                <button
                  onClick={() => {
                    if (metaSelecionadas.length === 0) { toast.error('Selecione ao menos uma conta'); return }
                    setMetaStep(3)
                  }}
                  style={{
                    flex: 2, height: 42, borderRadius: 10,
                    background: 'linear-gradient(135deg, #0081FB, #0060C0)',
                    border: 'none', fontSize: 14, fontWeight: 600,
                    color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 4px 12px rgba(0,129,251,0.30)',
                    opacity: metaSelecionadas.length === 0 ? 0.5 : 1,
                  }}
                >
                  Próximo ({metaSelecionadas.length})
                </button>
              ) : (
                <button
                  onClick={importarContas}
                  disabled={salvando}
                  style={{
                    flex: 2, height: 42, borderRadius: 10,
                    background: salvando ? 'rgba(0,129,251,0.4)' : 'linear-gradient(135deg, #0081FB, #0060C0)',
                    border: 'none', fontSize: 14, fontWeight: 600,
                    color: 'white', cursor: salvando ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: salvando ? 'none' : '0 4px 12px rgba(0,129,251,0.30)',
                  }}
                >
                  {salvando ? <Loader2 size={16} className="animate-spin" /> : null}
                  {salvando ? 'Importando...' : 'Importar Contas'}
                </button>
              )
            ) : (
              <button
                onClick={salvarManual}
                disabled={salvando}
                style={{
                  flex: 2, height: 42, borderRadius: 10,
                  background: salvando ? 'rgba(62,91,255,0.5)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
                  border: 'none', fontSize: 14, fontWeight: 600,
                  color: 'white', cursor: salvando ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: salvando ? 'none' : '0 4px 12px rgba(62,91,255,0.30)',
                }}
              >
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {salvando ? 'Salvando...' : 'Salvar Conta'}
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <EditarContaDialog
        conta={editandoConta}
        workspaces={workspaces}
        onClose={fecharEdicaoConta}
        onSaved={(atualizada) => {
          setContas(prev => prev.map(c => c.id === atualizada.id ? atualizada : c))
        }}
      />

      {/* LEGACY Sheet placeholder — kept for future use */}
      <Sheet open={false} onOpenChange={() => {}}>
        <SheetContent side="right" showCloseButton={false} style={{ display: 'none' }}>
          <SheetTitle className="sr-only">Editar Conta Ads</SheetTitle>
          <SheetDescription className="sr-only">
            Atualize os dados da conta, os clientes com acesso e a pausa de sincronização
          </SheetDescription>
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: '1px solid var(--ws-glass-border)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
                  Editar Conta
                </h2>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: editPlatformBadge.bg,
                  color: editPlatformBadge.color,
                  fontSize: 11,
                  fontWeight: 600,
                }}>
                  {editandoConta?.plataforma ?? 'meta'}
                </span>
                {editForm.sync_paused && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: 'rgba(255,92,141,0.12)',
                    color: 'var(--ws-coral)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    Pausada
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0', lineHeight: 1.5 }}>
                {editandoConta?.nome}
                {editandoConta?.account_id ? ` · ${editandoConta.account_id}` : ''}
              </p>
            </div>
            <button
              onClick={fecharEdicaoConta}
              style={{
                ...wsSheetCreamCloseButtonStyle,
                borderRadius: 8,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--ws-text-2)',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: wsSheetCreamTokens.surface,
                border: `1px solid ${wsSheetCreamTokens.border}`,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 12,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={labelStyle}>Cliente principal</div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 0,
                  }}>
                    <Building2 size={13} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--ws-text-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {editandoConta?.workspace_nome || '—'}
                    </span>
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={labelStyle}>Account ID</div>
                  <code style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--ws-text-2)',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {editandoConta?.account_id || '—'}
                  </code>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={labelStyle}>Acessos adicionais</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                    {editForm.workspace_ids_acesso.length} selecionado{editForm.workspace_ids_acesso.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Nome da conta</label>
                <input
                  type="text"
                  value={editForm.account_name}
                  onChange={e => setEditForm(prev => ({ ...prev, account_name: e.target.value }))}
                  placeholder="Nome interno da conta"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>BM ID <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                <input
                  type="text"
                  value={editForm.bm_id}
                  onChange={e => setEditForm(prev => ({ ...prev, bm_id: e.target.value }))}
                  placeholder="ID do Business Manager"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Agrupamento <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                <input
                  type="text"
                  placeholder="ex: Franquias SP, Zona Sul"
                  value={editForm.agrupamento}
                  onChange={e => setEditForm(prev => ({ ...prev, agrupamento: e.target.value }))}
                  style={inputStyle}
                />
                <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 6 }}>
                  Agrupa contas para filtros no dashboard
                </p>
              </div>

              <div>
                <label style={labelStyle}>Token de acesso <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                <input
                  type="password"
                  value={editForm.token_acesso}
                  onChange={e => setEditForm(prev => ({ ...prev, token_acesso: e.target.value }))}
                  placeholder="Deixe vazio para manter o token atual"
                  style={inputStyle}
                />
                <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 6 }}>
                  Preencha apenas para substituir o token salvo.
                </p>
              </div>

              <div style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: wsSheetCreamTokens.surface,
                border: `1px solid ${wsSheetCreamTokens.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                    Pausar sincronização
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0', lineHeight: 1.5 }}>
                    Enquanto pausada, a conta não entra no scheduler e o sync manual responde como pausado.
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <Switch
                    checked={editForm.sync_paused}
                    onCheckedChange={checked => setEditForm(prev => ({ ...prev, sync_paused: checked }))}
                  />
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: editForm.sync_paused ? 'var(--ws-coral)' : 'var(--ws-green)',
                  }}>
                    {editForm.sync_paused ? 'Pausada' : 'Ativa'}
                  </span>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Clientes com acesso adicional</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setEditForm(prev => ({
                        ...prev,
                        workspace_ids_acesso: workspaces
                          .filter(ws => !editandoConta || ws.id !== editandoConta.workspace_id)
                          .map(ws => ws.id),
                      }))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        fontSize: 11,
                        color: 'var(--ws-blue)',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Selecionar todas
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>·</span>
                    <button
                      type="button"
                      onClick={() => setEditForm(prev => ({ ...prev, workspace_ids_acesso: [] }))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        fontSize: 11,
                        color: 'var(--ws-text-3)',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Limpar seleção
                    </button>
                  </div>
                </div>

                {workspaces.length > 1 && (
                  <input
                    type="text"
                    placeholder="Filtrar cliente..."
                    value={editWorkspaceBusca}
                    onChange={e => setEditWorkspaceBusca(e.target.value)}
                    style={{ ...inputStyle, marginBottom: 10 }}
                  />
                )}

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: 240,
                  overflowY: 'auto',
                }}>
                  {editWorkspaceOptions.length > 0 ? editWorkspaceOptions.map(ws => {
                    const checked = editForm.workspace_ids_acesso.includes(ws.id)
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => setEditForm(prev => ({
                          ...prev,
                          workspace_ids_acesso: checked
                            ? prev.workspace_ids_acesso.filter(id => id !== ws.id)
                            : [...prev.workspace_ids_acesso, ws.id],
                        }))}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          borderRadius: 10,
                          background: checked ? 'rgba(62,91,255,0.08)' : 'rgba(15,23,42,0.02)',
                          border: checked ? '1px solid rgba(62,91,255,0.28)' : `1px solid ${wsSheetCreamTokens.border}`,
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'all 0.15s',
                          flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          flexShrink: 0,
                          background: checked ? '#3E5BFF' : wsSheetCreamTokens.checkboxUncheckedBg,
                          border: checked ? '1px solid #3E5BFF' : `1px solid ${wsSheetCreamTokens.checkboxUncheckedBorder}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {checked && <Check size={11} color="white" />}
                        </div>
                        <Building2 size={13} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ws.nome}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>
                            Cliente com acesso adicional à conta
                          </div>
                        </div>
                        <span style={{
                          fontSize: 10,
                          color: checked ? 'var(--ws-blue)' : 'var(--ws-text-3)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}>
                          {checked ? 'Com acesso' : 'Sem acesso'}
                        </span>
                      </button>
                    )
                  }) : (
                    <div style={{
                      padding: '18px 14px',
                      borderRadius: 10,
                      border: `1px dashed ${wsSheetCreamTokens.border}`,
                      color: 'var(--ws-text-3)',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}>
                      {workspaces.length <= 1
                        ? 'Não há outros clientes disponíveis para acesso adicional.'
                        : 'Nenhum cliente encontrado com esse filtro.'}
                    </div>
                  )}
                </div>

                <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 8, lineHeight: 1.5 }}>
                  O cliente principal da conta é fixo e sempre mantém acesso. Esta seção controla apenas acessos adicionais.
                </p>
              </div>
            </div>
          </div>

          <div style={{
            padding: '20px 28px',
            borderTop: '1px solid var(--ws-glass-border)',
            display: 'flex',
            gap: 12,
          }}>
            <button
              onClick={fecharEdicaoConta}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 10,
                background: 'transparent',
                border: '1px solid var(--ws-glass-border)',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--ws-text-2)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={salvarEdicaoConta}
              disabled={salvandoEdit}
              style={{
                flex: 2,
                height: 42,
                borderRadius: 10,
                background: salvandoEdit ? 'rgba(62,91,255,0.5)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                color: 'white',
                cursor: salvandoEdit ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: salvandoEdit ? 'none' : '0 4px 12px rgba(62,91,255,0.30)',
              }}
            >
              {salvandoEdit ? <Loader2 size={16} className="animate-spin" /> : null}
              {salvandoEdit ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </SheetContent>
      </Sheet>

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

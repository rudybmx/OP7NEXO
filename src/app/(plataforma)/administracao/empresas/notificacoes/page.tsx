'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Bell, CheckCheck, Inbox, Loader2, MessageSquare, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api-client'
import { useAuth } from '@/hooks/use-auth'
import { useWorkspace } from '@/lib/workspace-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { Notificacao } from '@/hooks/use-notificacoes'

interface ConfigItem {
  tipo: string
  label: string
  ativo: boolean
  audiencia_papeis: string[]
}

const ADMIN_ROLES = ['platform_admin', 'network_admin', 'company_admin']
const ROLES_ADMIN_UI = ADMIN_ROLES // quem enxerga a seção de configuração

function getErro(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function tempoRelativo(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return 'agora'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function IconeTipo({ tipo, severidade }: { tipo: string; severidade: string }) {
  const Icon =
    tipo === 'canal_offline' ? WifiOff : tipo === 'canal_online' ? Wifi : tipo === 'mensagem_nova' ? MessageSquare : Bell
  const cor =
    severidade === 'critico' ? 'text-destructive' : severidade === 'aviso' ? 'text-primary' : 'text-muted-foreground'
  return <Icon className={cn('size-4 shrink-0', cor)} aria-hidden />
}

export default function NotificacoesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { workspaceAtual } = useWorkspace()
  const isAdmin = !!user && ROLES_ADMIN_UI.includes(String(user.role))

  const wsParam = workspaceAtual ? `workspace_id=${workspaceAtual}` : ''
  const listaKey = `/notificacoes?${wsParam ? wsParam + '&' : ''}limit=100`
  const configKey = isAdmin ? `/notificacoes/config${workspaceAtual ? `?${wsParam}` : ''}` : null
  const qs = workspaceAtual ? `?${wsParam}` : ''

  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroStatus, setFiltroStatus] = useState<'todas' | 'nao_lidas'>('todas')
  const [salvando, setSalvando] = useState<string | null>(null)

  const { data: lista = [], isLoading, mutate } = useSWR<Notificacao[]>(
    listaKey,
    (p: string) => api.get(p),
    { revalidateOnFocus: true, shouldRetryOnError: false },
  )
  const { data: configs = [], mutate: mutateConfig } = useSWR<ConfigItem[]>(
    configKey,
    (p: string) => api.get(p),
    { shouldRetryOnError: false },
  )

  const naoLidas = useMemo(() => lista.filter((n) => !n.lida).length, [lista])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return lista.filter((n) => {
      const okBusca = !termo || n.titulo.toLowerCase().includes(termo) || (n.mensagem ?? '').toLowerCase().includes(termo)
      const okTipo = filtroTipo === 'todos' || n.tipo === filtroTipo
      const okStatus = filtroStatus === 'todas' || !n.lida
      return okBusca && okTipo && okStatus
    })
  }, [lista, busca, filtroTipo, filtroStatus])

  async function marcarLida(id: string) {
    void mutate((cur = []) => cur.map((n) => (n.id === id ? { ...n, lida: true } : n)), false)
    try {
      await api.post(`/notificacoes/${id}/lida${qs}`)
    } catch (err) {
      toast.error(getErro(err, 'Erro ao marcar como lida'))
    } finally {
      void mutate()
    }
  }

  async function marcarTodas() {
    void mutate((cur = []) => cur.map((n) => ({ ...n, lida: true })), false)
    try {
      await api.post(`/notificacoes/marcar-todas-lidas${qs}`)
      toast.success('Todas marcadas como lidas')
    } catch (err) {
      toast.error(getErro(err, 'Erro ao marcar todas'))
    } finally {
      void mutate()
    }
  }

  function abrir(n: Notificacao) {
    if (!n.lida) void marcarLida(n.id)
    if (n.link) router.push(n.link)
  }

  async function salvarConfig(tipo: string, ativo: boolean, adminOn: boolean, atendenteOn: boolean) {
    const roles = [...(adminOn ? ADMIN_ROLES : []), ...(atendenteOn ? ['company_agent'] : [])]
    setSalvando(tipo)
    void mutateConfig(
      (cur = []) => cur.map((c) => (c.tipo === tipo ? { ...c, ativo, audiencia_papeis: roles } : c)),
      false,
    )
    try {
      await api.put(`/notificacoes/config/${tipo}${qs}`, { ativo, audiencia_papeis: roles })
      toast.success('Configuração atualizada')
    } catch (err) {
      toast.error(getErro(err, 'Erro ao salvar'))
    } finally {
      setSalvando(null)
      void mutateConfig()
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="ds-page-title">Notificações</h1>
          <p className="text-sm text-muted-foreground">Central de alertas do sistema — canais e mensagens.</p>
        </div>
        {naoLidas > 0 && (
          <button
            onClick={() => marcarTodas()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-primary/10"
          >
            <CheckCheck className="size-4" /> Marcar todas
          </button>
        )}
      </div>

      {/* Quem vê cada tipo (audiência) — admin */}
      {isAdmin && configs.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="ds-section-title">Tipos de notificação</CardTitle>
            <p className="text-sm text-muted-foreground">Ligue/desligue cada tipo e escolha quais perfis recebem no sino.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {configs.map((c) => {
              const adminOn = c.audiencia_papeis.some((r) => ADMIN_ROLES.includes(r))
              const atendenteOn = c.audiencia_papeis.includes('company_agent')
              return (
                <div key={c.tipo} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex cursor-pointer items-center gap-3">
                    <Switch
                      checked={c.ativo}
                      disabled={salvando === c.tipo}
                      onCheckedChange={(v) => salvarConfig(c.tipo, v, adminOn, atendenteOn)}
                    />
                    <span className="flex items-center gap-2">
                      <IconeTipo tipo={c.tipo} severidade={c.tipo === 'canal_offline' ? 'critico' : 'info'} />
                      <span className="text-sm font-medium text-foreground">{c.label}</span>
                    </span>
                  </label>
                  <div className={cn('flex items-center gap-6', !c.ativo && 'pointer-events-none opacity-40')}>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Switch
                        checked={adminOn}
                        disabled={salvando === c.tipo || !c.ativo}
                        onCheckedChange={(v) => salvarConfig(c.tipo, c.ativo, v, atendenteOn)}
                      />
                      <span className="text-sm text-muted-foreground">Administradores</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Switch
                        checked={atendenteOn}
                        disabled={salvando === c.tipo || !c.ativo}
                        onCheckedChange={(v) => salvarConfig(c.tipo, c.ativo, adminOn, v)}
                      />
                      <span className="text-sm text-muted-foreground">Atendentes</span>
                    </label>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar notificações…"
          className="h-9 flex-1 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="h-9 cursor-pointer rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none"
        >
          <option value="todos">Todos os tipos</option>
          <option value="canal_offline">Canal caiu</option>
          <option value="mensagem_nova">Mensagem nova</option>
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as 'todas' | 'nao_lidas')}
          className="h-9 cursor-pointer rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none"
        >
          <option value="todas">Todas</option>
          <option value="nao_lidas">Não lidas</option>
        </select>
      </div>

      {/* Feed */}
      <Card>
        <CardContent className="p-0">
          {isLoading && lista.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </div>
          ) : filtradas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Inbox className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {lista.length === 0 ? 'Nenhuma notificação ainda' : 'Nada encontrado com esses filtros'}
              </p>
            </div>
          ) : (
            filtradas.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'flex items-start gap-3 border-b border-border px-4 py-3 last:border-0',
                  !n.lida && 'bg-primary/5',
                )}
              >
                <span className="mt-0.5">
                  <IconeTipo tipo={n.tipo} severidade={n.severidade} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{n.titulo}</span>
                    {!n.lida && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="não lida" />}
                  </div>
                  {n.mensagem && <p className="mt-0.5 text-sm text-muted-foreground">{n.mensagem}</p>}
                  <span className="ds-micro mt-1 block text-muted-foreground">{tempoRelativo(n.criado_em)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {n.link && (
                    <button
                      onClick={() => abrir(n)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      Abrir
                    </button>
                  )}
                  {!n.lida && (
                    <button
                      onClick={() => marcarLida(n.id)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10"
                    >
                      Marcar lida
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

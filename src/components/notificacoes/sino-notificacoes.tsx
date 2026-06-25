'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Inbox, MessageSquare, WifiOff } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/hooks/use-auth'
import { useNotificacoes, type Notificacao } from '@/hooks/use-notificacoes'
import { cn } from '@/lib/utils'

// Tokens do sidebar (dark navy) — o trigger vive lá, então casa com o AI Assistant ao lado.
const W06 = 'rgba(255,255,255,0.06)'
const W08 = 'rgba(255,255,255,0.08)'
const ROLES_ADMIN = ['platform_admin', 'network_admin', 'company_admin']

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
  const Icon = tipo === 'canal_offline' ? WifiOff : tipo === 'mensagem_nova' ? MessageSquare : Bell
  const cor =
    severidade === 'critico' ? 'text-destructive' : severidade === 'aviso' ? 'text-primary' : 'text-muted-foreground'
  return <Icon className={cn('size-4 shrink-0', cor)} aria-hidden />
}

export function SinoNotificacoes({ variante = 'rodape' }: { variante?: 'rodape' | 'mobile' }) {
  const router = useRouter()
  const { user } = useAuth()
  const [aberto, setAberto] = useState(false)
  const { notificacoes, naoLidas, isLoading, marcarLida, marcarTodas } = useNotificacoes()

  const podeVerTodas = !!user && ROLES_ADMIN.includes(String(user.role))
  const badge = naoLidas > 9 ? '9+' : String(naoLidas)
  const badgeEl =
    naoLidas > 0 ? (
      <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-micro font-semibold leading-none text-white tabular-nums">
        {badge}
      </span>
    ) : null

  async function abrir(n: Notificacao) {
    setAberto(false)
    if (!n.lida) await marcarLida(n.id)
    if (n.link) router.push(n.link)
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        {variante === 'mobile' ? (
          <button
            aria-label="Notificações"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minWidth: 60, padding: '8px 4px', gap: 4, cursor: 'pointer', flex: '0 0 auto',
              background: 'transparent', border: 'none',
            }}
          >
            <span style={{ position: 'relative', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={18} style={{ color: 'rgba(255,255,255,0.50)' }} />
              {badgeEl}
            </span>
            <span style={{ fontSize: 9, fontWeight: 400, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
              Alertas
            </span>
          </button>
        ) : (
          <button
            aria-label="Notificações"
            style={{
              position: 'relative', width: 40, height: 40, flexShrink: 0,
              background: W06, border: `1px solid ${W08}`, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 150ms ease',
            }}
          >
            <Bell size={18} color="#ffffff" />
            {badgeEl}
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent side="top" align="end" sideOffset={8} className="w-80 bg-card p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold text-foreground">Notificações</span>
          {naoLidas > 0 && (
            <button
              onClick={() => marcarTodas()}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <CheckCheck className="size-3.5" /> Marcar todas
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading && notificacoes.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : notificacoes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
              <Inbox className="size-7 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
            </div>
          ) : (
            notificacoes.map((n) => (
              <button
                key={n.id}
                onClick={() => abrir(n)}
                className={cn(
                  'flex w-full items-start gap-3 border-b border-border/50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-primary/10',
                  !n.lida && 'bg-primary/5',
                )}
              >
                <span className="mt-0.5">
                  <IconeTipo tipo={n.tipo} severidade={n.severidade} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{n.titulo}</span>
                  {n.mensagem && (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.mensagem}</span>
                  )}
                  <span className="ds-micro mt-1 block text-muted-foreground">{tempoRelativo(n.criado_em)}</span>
                </span>
                {!n.lida && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="não lida" />}
              </button>
            ))
          )}
        </div>

        {podeVerTodas && (
          <div className="border-t border-border px-3 py-2 text-center">
            <button
              onClick={() => {
                setAberto(false)
                router.push('/administracao/empresas/notificacoes')
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver todas
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

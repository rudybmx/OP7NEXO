'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Loader2, CheckCircle2, CalendarX2 } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api-client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface ServicoPub {
  id: string
  nome: string
  duracao_minutos: number
  preco: number | null
}
interface InfoPub {
  agenda_nome: string
  agenda_cor: string
  clinica_nome: string | null
  fuso_horario: string
  pode_agendar: boolean
  servicos: ServicoPub[]
}
interface Slot {
  inicio: string
  fim: string
}
interface Resultado {
  status: string
  pendente: boolean
  data_hora_inicio: string
  agenda_nome: string
  servico: string | null
}

function fmtHora(iso: string, fuso: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso }).format(new Date(iso))
}
function fmtDataHora(iso: string, fuso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: fuso,
  }).format(new Date(iso))
}
function hojeNoFuso(fuso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date()) // yyyy-mm-dd
}

export function AgendarCliente({ token }: { token: string }) {
  const [info, setInfo] = useState<InfoPub | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [servicoId, setServicoId] = useState<string>('')
  const [data, setData] = useState<string>('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [carregandoSlots, setCarregandoSlots] = useState(false)
  const [slotSel, setSlotSel] = useState<string>('')

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  // Carrega info do link
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const i = await api.get<InfoPub>(`/public/agendar/${token}`)
        if (!vivo) return
        setInfo(i)
        setData(hojeNoFuso(i.fuso_horario))
      } catch {
        if (vivo) setErro('Este link de agendamento é inválido ou foi desativado.')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [token])

  // Busca horários quando data/serviço mudam
  const buscarSlots = useCallback(async () => {
    if (!info || !data) return
    setCarregandoSlots(true)
    setSlotSel('')
    try {
      const params = new URLSearchParams({ data })
      if (servicoId) params.set('servico_id', servicoId)
      const r = await api.get<{ slots: Slot[] }>(`/public/agendar/${token}/disponibilidade?${params.toString()}`)
      setSlots(r.slots || [])
    } catch {
      setSlots([])
    } finally {
      setCarregandoSlots(false)
    }
  }, [info, data, servicoId, token])

  useEffect(() => { void buscarSlots() }, [buscarSlots])

  const handleTelefone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '')
    if (v.length <= 13) setTelefone(v)
  }

  const confirmar = async () => {
    if (nome.trim().length < 2) { toast.error('Informe seu nome.'); return }
    if (telefone.length < 10) { toast.error('Informe um WhatsApp válido (com DDD).'); return }
    if (!slotSel) { toast.error('Escolha um horário.'); return }
    setEnviando(true)
    try {
      const r = await api.post<Resultado>(`/public/agendar/${token}`, {
        nome: nome.trim(),
        telefone,
        data_hora_inicio: slotSel,
        servico_id: servicoId || undefined,
        observacoes: obs.trim() || undefined,
      })
      setResultado(r)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível concluir. Tente outro horário.')
      void buscarSlots()
    } finally {
      setEnviando(false)
    }
  }

  const accent = useMemo(() => (info?.agenda_cor && info.agenda_cor.startsWith('#') ? info.agenda_cor : '#006EFF'), [info])

  // ── Estados de borda ──
  if (carregando) {
    return <Tela><Loader2 className="size-6 animate-spin text-muted-foreground" /></Tela>
  }
  if (erro || !info) {
    return (
      <Tela>
        <CalendarX2 className="size-10 text-muted-foreground" />
        <p className="text-center text-sm text-muted-foreground">{erro || 'Link indisponível.'}</p>
      </Tela>
    )
  }

  // ── Sucesso ──
  if (resultado) {
    return (
      <Tela>
        <CheckCircle2 className="size-12 text-emerald-500" />
        <h1 className="text-center text-lg font-semibold text-foreground">
          {resultado.pendente ? 'Pedido recebido!' : 'Agendamento confirmado!'}
        </h1>
        <p className="text-center text-sm text-muted-foreground">
          {resultado.pendente
            ? 'Recebemos seu pedido. A clínica vai confirmar e entrar em contato pelo WhatsApp.'
            : 'Seu horário está reservado. Você receberá um lembrete no WhatsApp.'}
        </p>
        <div className="w-full rounded-lg border border-border bg-muted/40 p-3 text-center">
          <div className="text-sm font-medium capitalize text-foreground">
            {fmtDataHora(resultado.data_hora_inicio, info.fuso_horario)}
          </div>
          <div className="text-xs text-muted-foreground">
            {resultado.servico ? `${resultado.servico} · ` : ''}{resultado.agenda_nome}
          </div>
        </div>
      </Tela>
    )
  }

  // ── Fluxo ──
  return (
    <Tela larga>
      {/* Cabeçalho */}
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="size-2.5 rounded-full" style={{ background: accent }} />
        {info.clinica_nome && <p className="text-xs uppercase tracking-wide text-muted-foreground">{info.clinica_nome}</p>}
        <h1 className="text-lg font-semibold text-foreground">Agendar com {info.agenda_nome}</h1>
      </div>

      {!info.pode_agendar ? (
        <p className="text-center text-sm text-muted-foreground">
          O agendamento online está indisponível no momento. Entre em contato com a clínica.
        </p>
      ) : (
        <div className="flex w-full flex-col gap-5">
          {/* Serviço */}
          {info.servicos.length > 0 && (
            <div className="space-y-2">
              <label className="ds-label">Serviço</label>
              <div className="flex flex-wrap gap-2">
                {info.servicos.map((s) => {
                  const ativo = servicoId === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => setServicoId(ativo ? '' : s.id)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                        ativo ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40'
                      }`}
                    >
                      <div className="font-medium">{s.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.duracao_minutos} min{s.preco != null ? ` · R$ ${s.preco.toFixed(2)}` : ''}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Data */}
          <div className="space-y-2">
            <label className="ds-label flex items-center gap-1.5"><Calendar size={12} /> Data</label>
            <Input type="date" value={data} min={hojeNoFuso(info.fuso_horario)} onChange={(e) => setData(e.target.value)} className="w-full" />
          </div>

          {/* Horários */}
          <div className="space-y-2">
            <label className="ds-label flex items-center gap-1.5"><Clock size={12} /> Horários disponíveis</label>
            {carregandoSlots ? (
              <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : slots.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum horário livre neste dia. Tente outra data.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {slots.map((s) => {
                  const ativo = slotSel === s.inicio
                  return (
                    <button
                      key={s.inicio}
                      onClick={() => setSlotSel(s.inicio)}
                      className={`rounded-lg border py-2 text-sm font-medium transition-all ${
                        ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/50'
                      }`}
                    >
                      {fmtHora(s.inicio, info.fuso_horario)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Dados do paciente (só após escolher horário) */}
          {slotSel && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="space-y-1.5">
                <label className="ds-label">Seu nome *</label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="space-y-1.5">
                <label className="ds-label">WhatsApp (com DDD) *</label>
                <Input type="tel" value={telefone} onChange={handleTelefone} placeholder="47999990000" />
              </div>
              <div className="space-y-1.5">
                <label className="ds-label">Observação (opcional)</label>
                <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Algo que devemos saber?" />
              </div>
              <Button onClick={confirmar} disabled={enviando} className="mt-1">
                {enviando ? <><Loader2 className="size-4 animate-spin" /> Confirmando…</> : 'Confirmar agendamento'}
              </Button>
            </div>
          )}
        </div>
      )}
    </Tela>
  )
}

function Tela({ children, larga }: { children: React.ReactNode; larga?: boolean }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className={`flex w-full flex-col items-center gap-5 rounded-xl border border-border bg-card p-6 shadow-sm ${larga ? 'max-w-md' : 'max-w-sm'}`}>
        {children}
      </div>
    </div>
  )
}

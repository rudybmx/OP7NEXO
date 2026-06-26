'use client'

import React, { useState, useEffect } from 'react'
import { Check, Info, Save, Globe } from 'lucide-react'
import { HorarioAgenda, DiaSemana, DIAS_SEMANA_LABELS } from '@/types/agenda'
import { useAgendas } from '@/hooks/use-agendas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

const DURACAO_OPTIONS = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1h' },
  { value: '90', label: '1h 30min' },
  { value: '120', label: '2h' },
]

// Padrão de um dia ainda não configurado (fonte única — render + upsert dos handlers).
const configPadrao = (dia: DiaSemana): HorarioAgenda =>
  ({
    dia_semana: dia,
    ativo: false,
    hora_inicio: '08:00',
    hora_fim: '18:00',
    duracao_slot_minutos: 60,
    tem_almoco: false,
  } as HorarioAgenda)

export function ConfigHorarios() {
  const { agendas, getHorariosAgenda, salvarHorarios, editarAgenda } = useAgendas()

  const [selectedAgendaId, setSelectedAgendaId] = useState<string>('')
  const [horariosLocal, setHorariosLocal] = useState<HorarioAgenda[]>([])
  const [webhookUrl, setWebhookUrl] = useState('')
  const [capacidade, setCapacidade] = useState(1)
  const [isSaving, setIsSaving] = useState(false)

  // Inicializar com a primeira agenda
  useEffect(() => {
    if (agendas.length > 0 && !selectedAgendaId) {
      const first = agendas[0]
      setSelectedAgendaId(first.id)
      setWebhookUrl(first.webhook_url || '')
      setCapacidade(first.capacidade_simultanea || 1)
    }
  }, [agendas, selectedAgendaId])

  // Carregar horários quando a agenda muda
  useEffect(() => {
    if (selectedAgendaId) {
      const h = getHorariosAgenda(selectedAgendaId)
      setHorariosLocal(h)

      const agenda = agendas.find((a) => a.id === selectedAgendaId)
      if (agenda) {
        setWebhookUrl(agenda.webhook_url || '')
        setCapacidade(agenda.capacidade_simultanea || 1)
      }
    }
  }, [selectedAgendaId, getHorariosAgenda, agendas])

  // Upsert: aplica `updates` ao dia; se o dia ainda não está na lista (agenda nova,
  // horariosLocal vazio), ADICIONA semeado pelo padrão — senão o map ignorava o dia
  // e o Switch nunca ligava (o dia "não abria").
  const upsertDia = (dia: DiaSemana, updates: Partial<HorarioAgenda>) => {
    setHorariosLocal((prev) => {
      const existe = prev.some((h) => h.dia_semana === dia)
      if (existe) return prev.map((h) => (h.dia_semana === dia ? { ...h, ...updates } : h))
      return [...prev, { ...configPadrao(dia), ...updates }]
    })
  }

  const handleToggleDia = (dia: DiaSemana) => {
    const atual = horariosLocal.find((h) => h.dia_semana === dia)
    upsertDia(dia, { ativo: !(atual?.ativo ?? false) })
  }

  const handleUpdateHorario = (dia: DiaSemana, updates: Partial<HorarioAgenda>) => {
    upsertDia(dia, updates)
  }

  const handleSave = async () => {
    setIsSaving(true)
    await salvarHorarios(selectedAgendaId, horariosLocal)
    await editarAgenda(selectedAgendaId, {
      webhook_url: webhookUrl,
      capacidade_simultanea: capacidade,
    })
    setIsSaving(false)
  }

  return (
    <div className="space-y-8">
      {/* Top Bar: Selector & Save */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm">
        <Select value={selectedAgendaId} onValueChange={setSelectedAgendaId}>
          <SelectTrigger className="h-8 w-[300px] text-sm">
            <SelectValue placeholder="Selecione uma agenda" />
          </SelectTrigger>
          <SelectContent>
            {agendas.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: a.cor }} />
                  {a.nome}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          ) : (
            <Save size={16} />
          )}
          Salvar alterações
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* Lista de dias */}
        {(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as DiaSemana[]).map((dia) => {
          const config = horariosLocal.find((h) => h.dia_semana === dia) || configPadrao(dia)

          return (
            <div
              key={dia}
              className={`rounded-lg border border-border bg-card p-4 shadow-sm transition-all ${!config.ativo ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-6">
                <Switch checked={config.ativo} onCheckedChange={() => handleToggleDia(dia)} />

                <div className="w-24">
                  <span className="text-sm font-semibold uppercase tracking-wider text-foreground">
                    {DIAS_SEMANA_LABELS[dia]}
                  </span>
                </div>

                {!config.ativo ? (
                  <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Fechado</span>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Input
                        type="time"
                        value={config.hora_inicio}
                        onChange={(e) => handleUpdateHorario(dia, { hora_inicio: e.target.value })}
                        className="w-28"
                      />
                      <span className="text-xs text-muted-foreground">até</span>
                      <Input
                        type="time"
                        value={config.hora_fim}
                        onChange={(e) => handleUpdateHorario(dia, { hora_fim: e.target.value })}
                        className="w-28"
                      />
                    </div>

                    <div className="ml-4 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">Duração:</span>
                      <Select
                        value={String(config.duracao_slot_minutos)}
                        onValueChange={(val) => handleUpdateHorario(dia, { duracao_slot_minutos: Number(val) })}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DURACAO_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Almoço</span>
                        <Switch
                          checked={config.tem_almoco}
                          onCheckedChange={() => handleUpdateHorario(dia, { tem_almoco: !config.tem_almoco })}
                        />
                      </div>

                      {config.tem_almoco && (
                        <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                          <Input
                            type="time"
                            value={config.almoco_inicio || ''}
                            onChange={(e) => handleUpdateHorario(dia, { almoco_inicio: e.target.value })}
                            className="w-24"
                          />
                          <span className="text-[10px] text-muted-foreground">—</span>
                          <Input
                            type="time"
                            value={config.almoco_fim || ''}
                            onChange={(e) => handleUpdateHorario(dia, { almoco_fim: e.target.value })}
                            className="w-24"
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Capacidade e Webhook */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Capacidade */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              Capacidade de atendimento simultâneo
              <Info size={14} className="cursor-help text-muted-foreground" />
            </h3>
            <Badge variant="secondary">Por horário</Badge>
          </div>

          <Select value={String(capacidade)} onValueChange={(val) => setCapacidade(Number(val))}>
            <SelectTrigger className="h-8 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} {n === 1 ? 'cliente' : 'clientes'} simultâneos
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="mt-3 text-[11px] italic leading-relaxed text-muted-foreground">
            Define quantos agendamentos podem ocorrer no mesmo slot de tempo para esta agenda.
          </p>
        </div>

        {/* Webhook */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              Webhook de agendamento
              <Globe size={14} className="text-muted-foreground" />
            </h3>
            {webhookUrl && (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                Configurado
              </Badge>
            )}
          </div>

          <Input
            placeholder="https://sua-api.com/agendamento"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Disparado automaticamente a cada novo agendamento ou atualização.
          </p>

          {webhookUrl && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check size={12} />
              Será disparado em novos agendamentos
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

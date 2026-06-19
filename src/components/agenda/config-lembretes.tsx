'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { 
  Bell, 
  Plus, 
  Trash2, 
  Edit2, 
  MessageSquare, 
  Mail, 
  Smartphone, 
  BellRing, 
  X, 
  ChevronDown, 
  Image as ImageIcon, 
  Video, 
  FileText,
  Clock,
  Calendar,
  Check,
  CheckCheck
} from 'lucide-react'
import { toast } from 'sonner'
import { Agenda, LembreteConfig, LembreteCanal } from '@/types/agenda'
import { useAgendas } from '@/hooks/use-agendas'
import { useLembretes } from '@/hooks/use-lembretes'

// ─── COMPONENTE: PREVIEW WHATSAPP ─────────────────────────────────────────────
function WhatsAppPreview({ template }: { template: string }) {
  const previewText = useMemo(() => {
    return template
      .replace(/{{nome}}/g, 'Maria Silva')
      .replace(/{{data}}/g, '19/04/2026')
      .replace(/{{hora}}/g, '14:32')
      .replace(/{{servico}}/g, 'Avaliação Odontológica')
      .replace(/{{profissional}}/g, 'Dr. Rafael')
      .replace(/{{link_confirmacao}}/g, 'wer.sun/c/123') || 'Sua mensagem aparecerá aqui...'
  }, [template])

  return (
    <div className="mt-4 p-4 rounded-xl bg-[#0b141a] border border-white/5 overflow-hidden">
      <div className="text-[10px] uppercase font-bold text-white/20 mb-3 tracking-widest flex items-center gap-2">
        <MessageSquare size={10} className="text-[#25D366]" />
        Preview WhatsApp
      </div>
      
      <div className="flex flex-col gap-2">
        <div className="self-end max-w-[85%] bg-[#005c4b] text-white p-3 rounded-t-lg rounded-bl-lg text-sm relative shadow-sm">
          <p className="whitespace-pre-wrap leading-relaxed">{previewText}</p>
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[9px] text-white/50">14:32</span>
            <CheckCheck size={12} className="text-[#53bdeb]" />
          </div>
          {/* Triângulo da bolha */}
          <div className="absolute top-0 -right-2 w-0 h-0 border-t-[10px] border-t-[#005c4b] border-r-[10px] border-r-transparent" />
        </div>
      </div>
    </div>
  )
}

// ─── COMPONENTE: CARD DE LEMBRETE ─────────────────────────────────────────────
function ReminderCard({ 
  lembrete, 
  onEdit, 
  onDelete, 
  onToggle 
}: { 
  lembrete: LembreteConfig, 
  onEdit: () => void, 
  onDelete: () => void,
  onToggle: () => void
}) {
  const canalIcon = () => {
    switch (lembrete.canal) {
      case 'whatsapp': return <MessageSquare size={14} className="text-[#25D366]" />
      case 'email': return <Mail size={14} className="text-[#3E5BFF]" />
      case 'sms': return <Smartphone size={14} className="text-[#7A5AF8]" />
      case 'push': return <BellRing size={14} className="text-[#FF5C8D]" />
      default: return <Bell size={14} />
    }
  }

  const timingText = () => {
    if (lembrete.dias_antes === 0) {
      return `No dia · ${lembrete.horas_antes}h antes`
    }
    return `${lembrete.dias_antes} ${lembrete.dias_antes === 1 ? 'dia' : 'dias'} antes · ${lembrete.hora_envio}`
  }

  return (
    <div 
      className="relative p-5 flex items-center gap-4 transition-all hover:translate-x-1"
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)'
      }}
    >
      {/* Linha de brilho lateral */}
      {lembrete.ativo && (
        <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-[var(--ws-gold)]" />
      )}

      {/* Toggle Ativo */}
      <button 
        onClick={onToggle}
        className={`w-10 h-5 rounded-full flex items-center px-1 transition-colors ${lembrete.ativo ? 'bg-[var(--ws-gold)]' : 'bg-white/10'}`}
      >
        <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${lembrete.ativo ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>

      {/* Info */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60">
            {timingText()}
          </span>
          <div className="flex items-center gap-1 text-[10px] font-medium text-white/40">
            {canalIcon()}
            <span className="capitalize">{lembrete.canal}</span>
          </div>
          {lembrete.tem_midia && (
            <ImageIcon size={12} className="text-[var(--ws-gold)] opacity-60" />
          )}
        </div>
        <p className="text-sm text-white/70 line-clamp-1 italic">
          "{lembrete.mensagem_template}"
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button 
          onClick={onEdit}
          className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all"
        >
          <Edit2 size={16} />
        </button>
        <button 
          onClick={onDelete}
          className="p-2 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export function ConfigLembretes() {
  const { agendas } = useAgendas()
  const { listarLembretes, salvarLembrete, excluirLembrete, alternarStatus } = useLembretes()
  
  const [agendaId, setAgendaId] = useState<string | null>(null) // null = Padrão (todas)
  const [panelAberto, setPanelAberto] = useState(false)
  const [lembreteEditando, setLembreteEditando] = useState<Partial<LembreteConfig> | null>(null)

  // Lista filtrada
  const lembretesFiltrados = useMemo(() => listarLembretes(agendaId), [agendaId, listarLembretes])

  // Handlers
  const handleNovo = () => {
    setLembreteEditando({
      agenda_id: agendaId,
      ativo: true,
      canal: 'whatsapp',
      dias_antes: 1,
      hora_envio: '09:00',
      mensagem_template: '',
      tem_midia: false
    })
    setPanelAberto(true)
  }

  const handleEdit = (lem: LembreteConfig) => {
    setLembreteEditando(lem)
    setPanelAberto(true)
  }

  const handleSalvar = async (data: Partial<LembreteConfig>) => {
    const success = await salvarLembrete(data)
    if (success) setPanelAberto(false)
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header com select */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bell size={20} className="text-[var(--ws-gold)]" />
            Lembretes Automáticos
          </h2>
          <p className="text-sm text-white/50">
            Configure mensagens de confirmação e lembretes para seus pacientes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <select 
              value={agendaId || ''} 
              onChange={(e) => setAgendaId(e.target.value || null)}
              className="appearance-none bg-white/5 border border-white/10 rounded-lg px-4 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[var(--ws-gold)] transition-all min-w-[200px]"
            >
              <option value="" className="bg-[#0E142A]">Padrão (todas as agendas)</option>
              {agendas.map(a => (
                <option key={a.id} value={a.id} className="bg-[#0E142A]">{a.nome}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 group-hover:text-[var(--ws-gold)] transition-colors" />
          </div>

          <button 
            onClick={handleNovo}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))' }}
          >
            <Plus size={18} />
            Novo Lembrete
          </button>
        </div>
      </div>

      {/* Lista de cards */}
      <div className="grid gap-3">
        {lembretesFiltrados.length > 0 ? (
          lembretesFiltrados.map(lem => (
            <ReminderCard 
              key={lem.id} 
              lembrete={lem} 
              onEdit={() => handleEdit(lem)}
              onDelete={() => {
                if(confirm('Deseja realmente excluir este lembrete?')) {
                  excluirLembrete(lem.id)
                }
              }}
              onToggle={() => alternarStatus(lem.id)}
            />
          ))
        ) : (
          <div 
            className="p-12 text-center flex flex-col items-center justify-center gap-3 opacity-60"
            style={{
              background: 'var(--ws-glass-bg)',
              border: '1px dashed var(--ws-glass-border)',
              borderRadius: 'var(--ws-radius-lg)',
            }}
          >
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
              <BellRing size={24} className="text-white/20" />
            </div>
            <p className="text-sm text-white/40">Nenhum lembrete configurado para esta agenda.</p>
            <button onClick={handleNovo} className="text-[var(--ws-gold)] text-xs font-bold uppercase hover:underline">
              Criar o primeiro
            </button>
          </div>
        )}
      </div>

      {/* Painel de Edição (Custom Drawer) */}
      <PanelEdicao 
        aberto={panelAberto} 
        onFechar={() => setPanelAberto(false)}
        lembrete={lembreteEditando}
        onSalvar={handleSalvar}
      />
    </div>
  )
}

// ─── COMPONENTE: PAINEL DE EDIÇÃO ─────────────────────────────────────────────
function PanelEdicao({ 
  aberto, 
  onFechar, 
  lembrete, 
  onSalvar 
}: { 
  aberto: boolean, 
  onFechar: () => void, 
  lembrete: Partial<LembreteConfig> | null,
  onSalvar: (data: Partial<LembreteConfig>) => void
}) {
  const [localData, setLocalData] = useState<Partial<LembreteConfig>>({})
  const [mostraMidia, setMostraMidia] = useState(false)

  useEffect(() => {
    if (lembrete) {
      setLocalData(lembrete)
      setMostraMidia(lembrete.tem_midia || false)
    }
  }, [lembrete, aberto])

  const variables = [
    { label: 'Nome', value: '{{nome}}' },
    { label: 'Data', value: '{{data}}' },
    { label: 'Hora', value: '{{hora}}' },
    { label: 'Serviço', value: '{{servico}}' },
    { label: 'Profissional', value: '{{profissional}}' },
    { label: 'Link Confirmação', value: '{{link_confirmacao}}' },
  ]

  const insertVar = (v: string) => {
    setLocalData(prev => ({
      ...prev,
      mensagem_template: (prev.mensagem_template || '') + v
    }))
  }

  if (!lembrete && !aberto) return null

  return (
    <div 
      className={`fixed inset-0 z-[100] flex transition-opacity duration-300 ${aberto ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onFechar}
      />

      {/* Slide Panel (Left to Right) */}
      <div 
        className={`relative w-full max-w-[520px] h-[100dvh] flex flex-col bg-[#0E142A]/90 backdrop-blur-2xl border-r border-white/10 shadow-2xl transition-transform duration-500 ease-out ${aberto ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ fontFamily: 'var(--font-sans-base), sans-serif' }}
      >
        {/* Linha de brilho no topo */}
        <div style={{ position:'absolute',top:0,left:0,right:0,height:1, background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)', pointerEvents:'none' }} />

        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <div>
            <h3 className="text-xl font-bold text-white">
              {lembrete?.id ? 'Editar Lembrete' : 'Novo Lembrete'}
            </h3>
            <p className="text-xs text-white/40 uppercase tracking-widest mt-1">Configuração de Sequência</p>
          </div>
          <button 
            onClick={onFechar}
            className="p-2 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
          
          {/* SEÇÃO: QUANDO ENVIAR */}
          <section className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase text-[var(--ws-gold)] tracking-[0.2em] flex items-center gap-2">
               <Clock size={12} /> Quando Enviar
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50">Dias antes</label>
                <select 
                  value={localData.dias_antes}
                  onChange={(e) => setLocalData({...localData, dias_antes: Number(e.target.value)})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ws-gold)]"
                >
                  <option value={0} className="bg-[#0E142A]">No mesmo dia</option>
                  {[1, 2, 3, 5, 7, 10].map(d => (
                    <option key={d} value={d} className="bg-[#0E142A]">{d} {d === 1 ? 'dia' : 'dias'} antes</option>
                  ))}
                </select>
              </div>

              {localData.dias_antes === 0 ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/50">Horas antes</label>
                  <select 
                    value={localData.horas_antes}
                    onChange={(e) => setLocalData({...localData, horas_antes: Number(e.target.value)})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ws-gold)]"
                  >
                    {[1, 2, 3, 4, 6, 12].map(h => (
                      <option key={h} value={h} className="bg-[#0E142A]">{h}h antes</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/50">Horário de envio</label>
                  <input 
                    type="time"
                    value={localData.hora_envio || '09:00'}
                    onChange={(e) => setLocalData({...localData, hora_envio: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ws-gold)] [color-scheme:dark]"
                  />
                </div>
              )}
            </div>
          </section>

          {/* SEÇÃO: CANAL */}
          <section className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase text-[var(--ws-gold)] tracking-[0.2em] flex items-center gap-2">
               <Smartphone size={12} /> Canal de Comunicação
            </h4>
            
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: '#25D366' },
                { id: 'email', label: 'E-mail', icon: Mail, color: '#3E5BFF' },
                { id: 'sms', label: 'SMS', icon: Smartphone, color: '#7A5AF8' },
                { id: 'push', label: 'Push App', icon: BellRing, color: '#FF5C8D' },
              ].map(canal => (
                <button
                  key={canal.id}
                  onClick={() => setLocalData({...localData, canal: canal.id as LembreteCanal})}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${
                    localData.canal === canal.id 
                    ? 'bg-white/10 border-[var(--ws-gold)] scale-[1.02]' 
                    : 'bg-white/5 border-white/5 hover:border-white/20'
                  }`}
                >
                  <canal.icon 
                    size={24} 
                    style={{ color: localData.canal === canal.id ? canal.color : 'white', opacity: localData.canal === canal.id ? 1 : 0.4 }} 
                    className="mb-2"
                  />
                  <span className={`text-xs font-semibold ${localData.canal === canal.id ? 'text-white' : 'text-white/40'}`}>
                    {canal.label}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* SEÇÃO: MENSAGEM */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase text-[var(--ws-gold)] tracking-[0.2em] flex items-center gap-2">
                 <FileText size={12} /> Conteúdo da Mensagem
              </h4>
              <span className="text-[10px] font-bold text-white/20 uppercase">
                {localData.mensagem_template?.length || 0} caracteres
              </span>
            </div>

            <div className="space-y-3">
              <textarea 
                value={localData.mensagem_template || ''}
                onChange={(e) => setLocalData({...localData, mensagem_template: e.target.value})}
                placeholder="Escreva sua mensagem aqui..."
                rows={5}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-[var(--ws-gold)] resize-none leading-relaxed"
              />

              <div className="flex flex-wrap gap-2">
                {variables.map(v => (
                  <button
                    key={v.value}
                    onClick={() => insertVar(v.value)}
                    className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 hover:text-white hover:border-[var(--ws-gold)] transition-all"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* PREVIEW */}
            {localData.canal === 'whatsapp' && (
              <WhatsAppPreview template={localData.mensagem_template || ''} />
            )}
          </section>

          {/* SEÇÃO: MÍDIA */}
          <section className="space-y-4">
             <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold uppercase text-[var(--ws-gold)] tracking-[0.2em] flex items-center gap-2">
                  <ImageIcon size={12} /> Mídia Opcional
                </h4>
                <button 
                  onClick={() => setMostraMidia(!mostraMidia)}
                  className={`w-10 h-5 rounded-full flex items-center px-1 transition-colors ${mostraMidia ? 'bg-[var(--ws-gold)]' : 'bg-white/10'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${mostraMidia ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
             </div>

             {mostraMidia && (
               <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex gap-4">
                    {[
                      { id: 'imagem', icon: ImageIcon, label: 'Imagem' },
                      { id: 'video', icon: Video, label: 'Vídeo' },
                      { id: 'documento', icon: FileText, label: 'Documento' },
                    ].map(tipo => (
                      <button
                        key={tipo.id}
                        onClick={() => setLocalData({...localData, midia_tipo: tipo.id as any})}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-bold transition-all ${
                          localData.midia_tipo === tipo.id 
                          ? 'border-[var(--ws-gold)] text-white bg-[var(--ws-gold)]/10' 
                          : 'border-white/5 text-white/30 hover:bg-white/5'
                        }`}
                      >
                        <tipo.icon size={14} />
                        {tipo.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/50">URL da Mídia</label>
                    <input 
                      type="text"
                      placeholder="https://sua-midia.com/arquivo.jpg"
                      value={localData.midia_url || ''}
                      onChange={(e) => setLocalData({...localData, midia_url: e.target.value, tem_midia: true})}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ws-gold)]"
                    />
                  </div>

                  {localData.midia_url && localData.midia_tipo === 'imagem' && (
                    <div className="mt-2 w-full aspect-video rounded-lg overflow-hidden border border-white/10 bg-black/40 relative group">
                       <img src={localData.midia_url} alt="Preview" className="w-full h-full object-contain" />
                       <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Preview da Imagem</span>
                       </div>
                    </div>
                  )}
               </div>
             )}
          </section>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-black/20 flex items-center justify-end gap-3">
          <button 
            onClick={onFechar}
            className="px-6 py-2 rounded-lg text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all"
          >
            Cancelar
          </button>
          <button 
            onClick={() => onSalvar({...localData, tem_midia: mostraMidia})}
            disabled={!localData.mensagem_template}
            className="px-8 py-2 rounded-lg text-sm font-bold text-white shadow-xl transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            style={{ background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))' }}
          >
            Salvar Configuração
          </button>
        </div>
      </div>
    </div>
  )
}

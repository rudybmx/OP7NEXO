'use client'

import React, { useState } from 'react'
import { X, Save, Calendar, Info, Globe, Smartphone, Megaphone, Search, Briefcase, Music, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from '@/components/ui/switch'

interface CampanhasModalCadastroProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any) => void
}

export function CampanhasModalCadastro({ isOpen, onClose, onSave }: CampanhasModalCadastroProps) {
  const [form, setForm] = useState({
    nome: '',
    plataforma: 'meta',
    utm_source: 'facebook',
    utm_medium: 'cpc',
    utm_campaign: '',
    utm_content: '',
    custo_total: '',
    data_inicio: new Date().toISOString().split('T')[0],
    data_fim: '',
    ativo: true
  })

  if (!isOpen) return null

  const plataformas = [
    { id: 'meta', label: 'Meta (FB/IG)', icon: Globe, color: '#1877F2' },
    { id: 'google', label: 'Google Ads', icon: Search, color: '#4285F4' },
    { id: 'linkedin', label: 'LinkedIn', icon: Briefcase, color: '#0A66C2' },
    { id: 'tiktok', label: 'TikTok', icon: Music, color: '#000000' },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: '#25D366' },
    { id: 'offline', label: 'Offline', icon: Smartphone, color: '#64748b' }
  ]

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div 
        className="w-full max-w-[480px] bg-[var(--ws-navy)] border border-[var(--ws-glass-border)] rounded-2xl shadow-2xl relative overflow-hidden"
        style={{ background: 'var(--ws-navy)' }}
      >
        {/* Top light line */}
        <div style={{ position:'absolute',top:0,left:0,right:0,height:1,
          background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)',
          pointerEvents:'none' }} />

        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--ws-blue-soft)] text-[var(--ws-blue)]">
              <Megaphone size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Nova Campanha</h2>
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium">Rastreamento e ROI</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50">
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Identificação</label>
              <Input 
                placeholder="Nome amigável da Campanha *"
                className="bg-white/5 border-white/10 text-white"
                value={form.nome}
                onChange={e => setForm({...form, nome: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Plataforma *</label>
                <Select value={form.plataforma} onValueChange={val => setForm({...form, plataforma: val})}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plataformas.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <p.icon size={12} style={{ color: p.color }} />
                          {p.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 pt-6">
                <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg border border-white/10 h-10">
                  <span className="text-[11px] font-bold text-white/80">Ativo</span>
                  <Switch checked={form.ativo} onCheckedChange={val => setForm({...form, ativo: val})} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--ws-glass-border)', margin: '4px 0' }} />

          <div className="space-y-4">
            <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider flex items-center gap-2">
              <Globe size={12} /> Parâmetros UTM (Tracking)
            </label>
            
            <div className="grid grid-cols-2 gap-4">
              <Input placeholder="UTM Source" className="bg-white/5 border-white/10 text-white" value={form.utm_source} onChange={e => setForm({...form, utm_source: e.target.value})} />
              <Input placeholder="UTM Medium" className="bg-white/5 border-white/10 text-white" value={form.utm_medium} onChange={e => setForm({...form, utm_medium: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Input placeholder="UTM Campaign (ID Único) *" className="bg-white/5 border-white/10 text-white" value={form.utm_campaign} onChange={e => setForm({...form, utm_campaign: e.target.value})} />
              <p className="text-[9px] text-white/30 px-1">Identificador principal para cruzar com os leads recebidos.</p>
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--ws-glass-border)', margin: '4px 0' }} />

          <div className="space-y-4">
            <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider flex items-center gap-2">
              <Calendar size={12} /> Período e Investimento
            </label>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-white/30 uppercase pl-1">Data Início *</span>
                <Input type="date" className="bg-white/5 border-white/10 text-white" value={form.data_inicio} onChange={e => setForm({...form, data_inicio: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-white/30 uppercase pl-1">Custo Total (R$)</span>
                <Input type="number" placeholder="0.00" className="bg-white/5 border-white/10 text-white" value={form.custo_total} onChange={e => setForm({...form, custo_total: e.target.value})} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-4">
          <Button variant="ghost" onClick={onClose} className="text-white hover:bg-white/5">
            Cancelar
          </Button>
          <Button 
            className="px-10 shadow-[0_4px_16px_rgba(62,91,255,0.35)]"
            style={{ background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))', border: 'none' }}
            onClick={() => {
              onSave(form)
              onClose()
            }}
          >
            <Save size={18} className="mr-2" /> Criar Campanha
          </Button>
        </div>
      </div>
    </div>
  )
}

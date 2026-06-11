'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Palette, Upload, Trash2, Save, ImageOff, ShieldCheck, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { getToken } from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

interface BrandKitData {
  primary_color: string | null
  secondary_color: string | null
  font_family: string | null
  tone_of_voice: string | null
  visual_rules: string | null
  forbidden_rules: string | null
  logo_url: string | null
}

const VAZIO: BrandKitData = {
  primary_color: null, secondary_color: null, font_family: null,
  tone_of_voice: null, visual_rules: null, forbidden_rules: null, logo_url: null,
}

export function BrandKit() {
  const { workspaceAtual: wsId } = useWorkspace()
  const [kit, setKit] = useState<BrandKitData>(VAZIO)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const auth = () => ({ Authorization: `Bearer ${getToken() ?? ''}` })
  const set = (campo: keyof BrandKitData, valor: string) =>
    setKit(k => ({ ...k, [campo]: valor }))

  const carregar = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/proxy/design/brand-kit?workspace_id=${wsId}`, { headers: auth() })
      const d = await r.json()
      setKit({ ...VAZIO, ...d })
    } catch {
      toast.error('Erro ao carregar o brand kit.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() /* eslint-disable-next-line */ }, [wsId])

  const salvar = async () => {
    if (!wsId) return
    setSaving(true)
    try {
      const r = await fetch('/api/proxy/design/brand-kit', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ workspace_id: wsId, ...kit, logo_url: undefined }),
      })
      if (!r.ok) throw new Error()
      const d = await r.json()
      setKit({ ...VAZIO, ...d })
      toast.success('Brand kit salvo — vai entrar em toda geração.')
    } catch {
      toast.error('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const enviarLogo = async (file: File) => {
    if (!wsId) return
    if (!file.type.startsWith('image/')) { toast.error('Envie uma imagem (PNG com fundo transparente é ideal).'); return }
    setUploading(true)
    try {
      const base64: string = await new Promise((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(String(fr.result))
        fr.onerror = rej
        fr.readAsDataURL(file)
      })
      const r = await fetch('/api/proxy/design/brand-kit/logo', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ workspace_id: wsId, image_base64: base64, nome: file.name.slice(0, 120) }),
      })
      if (!r.ok) throw new Error()
      const d = await r.json()
      setKit(k => ({ ...k, logo_url: d?.logo_url ?? null }))
      toast.success('Logo salva.')
    } catch {
      toast.error('Erro ao enviar a logo.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removerLogo = async () => {
    if (!wsId) return
    try {
      const r = await fetch(`/api/proxy/design/brand-kit/logo?workspace_id=${wsId}`, { method: 'DELETE', headers: auth() })
      if (!r.ok) throw new Error()
      setKit(k => ({ ...k, logo_url: null }))
      toast.success('Logo removida.')
    } catch {
      toast.error('Erro ao remover a logo.')
    }
  }

  const cardCls = 'rounded-[var(--ws-radius-xl)] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] backdrop-blur-md p-5'
  const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-[var(--ws-text-3)]'
  const inputCls = 'w-full h-9 px-3 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-sm text-[var(--ws-text-1)] focus:outline-none focus:border-[var(--ws-blue)]'

  const corField = (campo: 'primary_color' | 'secondary_color', titulo: string) => {
    const v = kit[campo] || ''
    return (
      <div className="flex-1">
        <div className={labelCls}>{titulo}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000'}
            onChange={e => set(campo, e.target.value)}
            className="w-9 h-9 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent cursor-pointer shrink-0" />
          <input value={v} onChange={e => set(campo, e.target.value)} placeholder="#000000"
            className={inputCls} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6 scrollbar-hide animate-in fade-in duration-500">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-lg font-bold text-[var(--ws-text-1)] flex items-center gap-2"><Palette size={20} className="text-[var(--ws-blue)]" /> Brand Kit</h1>
          <p className="text-[12px] text-[var(--ws-text-3)]">A identidade da marca deste workspace. Configure uma vez — entra automaticamente em todo criativo gerado.</p>
        </div>

        {/* Logo */}
        <div className={cardCls}>
          <div className={`${labelCls} mb-3`}>Logo</div>
          <div className="flex items-center gap-4">
            <div className="w-32 h-20 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-[rgba(255,255,255,0.04)] flex items-center justify-center overflow-hidden shrink-0"
              style={{ backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, transparent 0% 50%)', backgroundSize: '16px 16px' }}>
              {kit.logo_url
                ? <img src={kit.logo_url} alt="logo" className="max-w-full max-h-full object-contain" />
                : <ImageOff size={22} className="text-[var(--ws-text-3)] opacity-50" />}
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) enviarLogo(f) }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="h-9 px-4 rounded-[var(--ws-radius-lg)] bg-[var(--ws-blue)] text-white font-bold uppercase tracking-wider text-[11px] hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {uploading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload size={14} />}
                {kit.logo_url ? 'Trocar logo' : 'Enviar logo'}
              </button>
              {kit.logo_url && (
                <button onClick={removerLogo}
                  className="h-8 px-3 rounded-[var(--ws-radius-lg)] text-[10px] font-bold uppercase tracking-wider text-[#a32d2d] border border-[var(--ws-glass-border)] hover:border-[#a32d2d] flex items-center justify-center gap-2">
                  <Trash2 size={13} /> Remover
                </button>
              )}
              <span className="text-[10px] text-[var(--ws-text-3)]">PNG com fundo transparente fica melhor na composição.</span>
            </div>
          </div>
        </div>

        {/* Cores + Fonte + Tom */}
        <div className={cardCls}>
          <div className={`${labelCls} mb-3`}>Cores da marca</div>
          <div className="flex gap-4">
            {corField('primary_color', 'Primária (dominante ~60%)')}
            {corField('secondary_color', 'Secundária (~30%)')}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <div className={labelCls}>Fonte (família)</div>
              <input value={kit.font_family || ''} onChange={e => set('font_family', e.target.value)} placeholder="ex.: Inter, Poppins" className={`${inputCls} mt-1.5`} />
            </div>
            <div>
              <div className={labelCls}>Tom de voz</div>
              <input value={kit.tone_of_voice || ''} onChange={e => set('tone_of_voice', e.target.value)} placeholder="ex.: profissional e acolhedor" className={`${inputCls} mt-1.5`} />
            </div>
          </div>
        </div>

        {/* Regras */}
        <div className={cardCls}>
          <div className={`${labelCls} mb-3`}>Regras de marca (entram no prompt da IA)</div>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-bold text-[var(--ws-green)] flex items-center gap-1.5 mb-1.5"><ShieldCheck size={13} /> Sempre faça</div>
              <textarea value={kit.visual_rules || ''} onChange={e => set('visual_rules', e.target.value)} rows={2}
                placeholder="ex.: fundo claro, fotos reais de pacientes, muito respiro" maxLength={2000}
                className={`${inputCls} h-auto py-2 resize-none`} />
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#a32d2d] flex items-center gap-1.5 mb-1.5"><Ban size={13} /> Nunca faça</div>
              <textarea value={kit.forbidden_rules || ''} onChange={e => set('forbidden_rules', e.target.value)} rows={2}
                placeholder="ex.: nada de clipart, sem texto pequeno demais, sem fundo escuro" maxLength={2000}
                className={`${inputCls} h-auto py-2 resize-none`} />
            </div>
          </div>
        </div>

        <button onClick={salvar} disabled={saving || loading}
          className="w-full h-11 rounded-[var(--ws-radius-lg)] bg-[var(--ws-gold)] text-white font-bold uppercase tracking-wider text-xs hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando...</> : <><Save size={16} /> Salvar Brand Kit</>}
        </button>
      </div>
    </div>
  )
}

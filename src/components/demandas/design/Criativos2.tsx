'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Sparkles, Wand2, RefreshCw, Loader2, AlertCircle, ArrowRight, ArrowLeft, Download, Image as ImageIcon,
} from 'lucide-react'
import { useWorkspace } from '@/lib/workspace-context'
import { usePersistedState } from '@/hooks/use-estado-persistido'
import api from '@/lib/api-client'

// Tela Criativos 2.0 — carrossel newsjacking. Fluxo: config -> roteiro (aprovacao,
// custo zero) -> galeria (geracao em background, polling). Backend: /design/carrossel/*.
// Texto e QUEIMADO pelo modelo (gpt-image-2); aqui so orquestramos o fluxo.

type SlideCopy = { contexto?: string; palavra_bomba?: string; selo?: string; texto?: string; cta_continuacao?: string }
type SlideRoteiro = { index: number; intensidade?: string; copy?: SlideCopy; direcao_imagem?: string }
type Roteiro = {
  molde?: string; tensao?: string; payload?: string; gatilhos?: string[]
  paleta?: { tensao?: string; resolucao?: string; pivo?: string }
  slides?: SlideRoteiro[]; ctas?: { engajamento?: string; conversao?: string }; legenda?: string
}
type SlideEstado = { slide_index: number; status: string; base_image_url?: string | null; copy?: SlideCopy }
type CarrosselEstado = {
  carrossel: { id: string; status: string; error_code?: string | null; error_message?: string | null; master_format?: string }
  slides: SlideEstado[]
}

type Pauta = { titulo: string; assunto: string; personagens?: string[]; linha_criativa?: string; fonte_url?: string | null }

const MASTERS = [{ id: '9x16', label: '9:16 · stories/reels' }, { id: '4x3', label: '4:3 · landscape' }]
const QUALITIES = [{ id: 'low', label: 'Rascunho' }, { id: 'medium', label: 'Médio' }, { id: 'high', label: 'Alta' }]
const TERMINAIS = ['done', 'error', 'parcial']

export function Criativos2() {
  const { workspaceAtual } = useWorkspace()
  const [etapa, setEtapa] = useState<'config' | 'roteiro' | 'galeria'>('config')
  const [tema, setTema] = usePersistedState<string>('op7-c2-tema', '')
  const [nSlides, setNSlides] = usePersistedState<number>('op7-c2-nslides', 5)
  const [master, setMaster] = usePersistedState<string>('op7-c2-master', '9x16')
  const [quality, setQuality] = usePersistedState<string>('op7-c2-quality', 'low')
  const [origem, setOrigem] = usePersistedState<'manual' | 'referencia' | 'noticia'>('op7-c2-origem', 'manual')
  const [refImg, setRefImg] = useState<string | null>(null)
  const [assuntoNoticia, setAssuntoNoticia] = useState('')
  const [pautas, setPautas] = useState<Pauta[] | null>(null)
  const [buscandoPautas, setBuscandoPautas] = useState(false)
  const [carrosselId, setCarrosselId] = usePersistedState<string | null>('op7-c2-carrossel', null)
  const [roteiro, setRoteiro] = useState<Roteiro | null>(null)
  const [estado, setEstado] = useState<CarrosselEstado | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onRefFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => setRefImg(String(r.result))
    r.readAsDataURL(f)
  }

  // ───── Origin A: buscar pautas de notícia (Firecrawl) ─────
  const buscarPautas = useCallback(async () => {
    if (!workspaceAtual || !assuntoNoticia.trim()) { setErro('Informe um assunto.'); return }
    setBuscandoPautas(true); setErro(null); setPautas(null)
    try {
      const r = await api.post<{ pautas: Pauta[] }>('/design/carrossel/pautas', {
        workspace_id: workspaceAtual, assunto: assuntoNoticia.trim(),
      })
      setPautas(r.pautas || [])
    } catch (e: any) { setErro(e?.message || 'Falha ao buscar pautas.') }
    finally { setBuscandoPautas(false) }
  }, [workspaceAtual, assuntoNoticia])

  // ───── Diretor: tema/referência/pauta -> roteiro (custo zero) ─────
  const gerarRoteiro = useCallback(async () => {
    if (!workspaceAtual) return
    if (origem !== 'referencia' && !tema.trim()) { setErro('Escolha um tema ou uma pauta.'); return }
    if (origem === 'referencia' && !refImg) { setErro('Suba uma imagem de referência.'); return }
    setCarregando(true); setErro(null)
    try {
      const r = await api.post<{ carrossel_id: string; director_json: Roteiro }>('/design/carrossel/diretor', {
        workspace_id: workspaceAtual, origem,
        tema: origem === 'referencia' ? undefined : tema.trim(),
        referencia_base64: origem === 'referencia' ? refImg : undefined,
        n_slides: nSlides, master_format: master,
      })
      setCarrosselId(r.carrossel_id); setRoteiro(r.director_json); setEtapa('roteiro')
    } catch (e: any) { setErro(e?.message || 'Falha ao gerar o roteiro.') }
    finally { setCarregando(false) }
  }, [workspaceAtual, origem, tema, refImg, nSlides, master, setCarrosselId])

  const editarCopy = (idx: number, campo: keyof SlideCopy, valor: string) => {
    setRoteiro(prev => {
      if (!prev) return prev
      const slides = (prev.slides || []).map(s =>
        s.index === idx ? { ...s, copy: { ...(s.copy || {}), [campo]: valor } } : s)
      return { ...prev, slides }
    })
  }

  // ───── Gerar: salva roteiro editado e dispara a geracao ─────
  const gerar = useCallback(async () => {
    if (!carrosselId || !roteiro) return
    setCarregando(true); setErro(null)
    try {
      await api.put(`/design/carrossel/${carrosselId}/roteiro`, { director_json: roteiro })
      await api.post(`/design/carrossel/${carrosselId}/gerar`, { quality })
      setEtapa('galeria')
    } catch (e: any) { setErro(e?.message || 'Falha ao iniciar a geração.') }
    finally { setCarregando(false) }
  }, [carrosselId, roteiro, quality])

  // ───── Polling do estado na galeria ─────
  const carregarEstado = useCallback(async (id: string) => {
    try {
      const d = await api.get<CarrosselEstado>(`/design/carrossel/${id}`)
      setEstado(d)
      const st = d.carrossel.status
      if (!TERMINAIS.includes(st)) {
        pollRef.current = setTimeout(() => carregarEstado(id), 2500)
      } else if (st === 'error') {
        setErro(d.carrossel.error_message || 'A geração falhou.')
      }
    } catch (e: any) { setErro(e?.message || 'Falha ao consultar o carrossel.') }
  }, [])

  useEffect(() => {
    if (etapa === 'galeria' && carrosselId) {
      if (pollRef.current) clearTimeout(pollRef.current)
      carregarEstado(carrosselId)
    }
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [etapa, carrosselId, carregarEstado])

  const regenerarSlide = useCallback(async (idx: number) => {
    if (!carrosselId) return
    try {
      await api.post(`/design/carrossel/${carrosselId}/slides/${idx}/regenerar`, { quality })
      if (pollRef.current) clearTimeout(pollRef.current)
      carregarEstado(carrosselId)
    } catch (e: any) { setErro(e?.message || 'Falha ao regenerar o slide.') }
  }, [carrosselId, quality, carregarEstado])

  const reset = () => {
    if (pollRef.current) clearTimeout(pollRef.current)
    setEtapa('config'); setRoteiro(null); setEstado(null); setErro(null); setCarrosselId(null)
  }

  const card = 'rounded-[14px] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] backdrop-blur-md'
  const botaoPrimario = 'inline-flex items-center justify-center gap-2 h-10 px-5 rounded-[var(--ws-radius-lg)] text-sm font-medium bg-[var(--ws-blue)] text-white disabled:opacity-50 hover:opacity-90 transition'

  return (
    <div className="flex flex-col h-full overflow-auto px-6 py-5 gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="ds-page-title flex items-center gap-2"><Sparkles size={18} className="text-[var(--ws-blue)]" /> Criativos 2.0</h1>
          <p className="ds-help">Carrossel editorial newsjacking · texto integrado por IA</p>
        </div>
        {etapa !== 'config' && (
          <button onClick={reset} className="ds-help inline-flex items-center gap-1 hover:text-[var(--ws-text-1)]">
            <ArrowLeft size={14} /> Novo carrossel
          </button>
        )}
      </header>

      {erro && (
        <div className="flex items-start gap-2 p-3 rounded-[var(--ws-radius-lg)] border border-[#a32d2d]/40 bg-[#a32d2d]/10 text-[#a32d2d] text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      {/* ETAPA 1 — CONFIG */}
      {etapa === 'config' && (
        <div className={`${card} p-5 flex flex-col gap-4 max-w-2xl`}>
          {/* Origem: tema manual | referência de estilo | pesquisar notícia (abas) */}
          <div className="flex gap-2 flex-wrap">
            {([['manual', 'Tema manual'], ['referencia', 'Referência de estilo'], ['noticia', '🔥 Pesquisar notícia']] as const).map(([id, lbl]) => (
              <button key={id} onClick={() => setOrigem(id)}
                className={`h-9 px-4 rounded-[var(--ws-radius-lg)] text-sm border transition ${origem === id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-transparent text-[var(--ws-text-2)] border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)]'}`}>
                {lbl}
              </button>
            ))}
          </div>
          {origem === 'manual' && (
            <label className="flex flex-col gap-1.5">
              <span className="ds-label">Assunto / tema</span>
              <textarea value={tema} onChange={e => setTema(e.target.value)} rows={3}
                placeholder="Ex.: o maior erro de quem faz tráfego pago para clínicas"
                className="w-full p-3 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-[var(--ws-input-bg,transparent)] text-sm resize-none focus:border-[var(--ws-blue)] outline-none" />
            </label>
          )}
          {origem === 'referencia' && (
            <label className="flex flex-col gap-1.5">
              <span className="ds-label">Imagem de referência (estilo)</span>
              <div className="flex items-center gap-3">
                <span className="h-10 px-4 inline-flex items-center gap-2 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] text-sm cursor-pointer hover:border-[var(--ws-blue)]">
                  <ImageIcon size={15} /> Escolher imagem
                  <input type="file" accept="image/*" onChange={onRefFile} className="hidden" />
                </span>
                {refImg && <img src={refImg} alt="referência" className="h-16 w-16 object-cover rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)]" />}
              </div>
              <span className="ds-help">A IA lê o estilo (cores, composição, clima) e monta o roteiro nesse visual.</span>
            </label>
          )}
          {origem === 'noticia' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input value={assuntoNoticia} onChange={e => setAssuntoNoticia(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') buscarPautas() }}
                  placeholder="Assunto de interesse (ex.: tráfego pago para clínicas)"
                  className="flex-1 h-10 px-3 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm outline-none focus:border-[var(--ws-blue)]" />
                <button onClick={buscarPautas} disabled={buscandoPautas || !assuntoNoticia.trim()} className={botaoPrimario}>
                  {buscandoPautas ? <><Loader2 size={16} className="animate-spin" /> Buscando…</> : 'Buscar pautas'}
                </button>
              </div>
              {pautas && pautas.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="ds-help">Escolha uma pauta (vira o tema do carrossel):</span>
                  {pautas.map((p, i) => (
                    <button key={i} onClick={() => setTema(p.assunto)}
                      className={`text-left p-3 rounded-[var(--ws-radius-lg)] border transition ${tema === p.assunto ? 'border-[var(--ws-blue)] bg-[rgba(62,91,255,0.06)]' : 'border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)]'}`}>
                      <div className="text-sm font-medium text-[var(--ws-text-1)]">{p.titulo}</div>
                      <div className="ds-help mt-0.5">{p.assunto}</div>
                      {p.personagens && p.personagens.length > 0 && (
                        <div className="ds-help mt-1">👤 {p.personagens.join(', ')}{p.linha_criativa ? ` · ${p.linha_criativa}` : ''}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {pautas && pautas.length === 0 && <span className="ds-help">Nenhuma pauta encontrada. Tente outro assunto.</span>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="ds-label">Slides</span>
              <input type="number" min={2} max={10} value={nSlides}
                onChange={e => setNSlides(Math.max(2, Math.min(10, Number(e.target.value) || 5)))}
                className="h-10 px-3 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm outline-none focus:border-[var(--ws-blue)]" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="ds-label">Formato mestre</span>
              <select value={master} onChange={e => setMaster(e.target.value)}
                className="h-10 px-3 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm outline-none focus:border-[var(--ws-blue)]">
                {MASTERS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="ds-label">Qualidade</span>
              <select value={quality} onChange={e => setQuality(e.target.value)}
                className="h-10 px-3 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm outline-none focus:border-[var(--ws-blue)]">
                {QUALITIES.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
              </select>
            </label>
          </div>
          <button onClick={gerarRoteiro} disabled={carregando || (origem === 'referencia' ? !refImg : !tema.trim())} className={botaoPrimario}>
            {carregando ? <><Loader2 size={16} className="animate-spin" /> Gerando roteiro…</> : <><Wand2 size={16} /> Gerar roteiro</>}
          </button>
        </div>
      )}

      {/* ETAPA 2 — ROTEIRO (aprovacao, custo zero) */}
      {etapa === 'roteiro' && roteiro && (
        <div className="flex flex-col gap-3 max-w-3xl">
          <div className={`${card} p-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm`}>
            <span className="ds-label">Molde <b className="text-[var(--ws-text-1)] ml-1">{roteiro.molde}</b></span>
            <span className="ds-label">Tensão <b className="text-[var(--ws-text-1)] ml-1">{roteiro.tensao}</b></span>
            <span className="ds-label flex gap-1 items-center">Paleta
              {[roteiro.paleta?.tensao, roteiro.paleta?.resolucao, roteiro.paleta?.pivo].filter(Boolean).map((c, i) =>
                <span key={i} className="px-1.5 py-0.5 rounded text-[11px] bg-[var(--ws-glass-border)] text-[var(--ws-text-1)]">{c}</span>)}
            </span>
          </div>
          <p className="ds-help">Revise e ajuste a copy antes de gerar (não custa tokens). O texto será desenhado pela IA na arte.</p>
          {(roteiro.slides || []).map(s => (
            <div key={s.index} className={`${card} p-4 flex flex-col gap-2`}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[var(--ws-blue)] text-white text-xs flex items-center justify-center font-medium">{s.index}</span>
                <span className="ds-label">{s.intensidade}</span>
                <span className="ds-help ml-auto truncate max-w-[55%]" title={s.direcao_imagem}>{s.direcao_imagem}</span>
              </div>
              <input value={s.copy?.palavra_bomba || ''} onChange={e => editarCopy(s.index, 'palavra_bomba', e.target.value)}
                placeholder="Palavra-bomba" className="w-full px-3 h-10 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-base font-semibold outline-none focus:border-[var(--ws-blue)]" />
              <div className="grid grid-cols-2 gap-2">
                <input value={s.copy?.contexto || ''} onChange={e => editarCopy(s.index, 'contexto', e.target.value)}
                  placeholder="Contexto (topo)" className="px-3 h-9 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm outline-none focus:border-[var(--ws-blue)]" />
                <input value={s.copy?.selo || ''} onChange={e => editarCopy(s.index, 'selo', e.target.value)}
                  placeholder="Selo" className="px-3 h-9 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm outline-none focus:border-[var(--ws-blue)]" />
              </div>
              <input value={s.copy?.texto || ''} onChange={e => editarCopy(s.index, 'texto', e.target.value)}
                placeholder="Texto de apoio" className="px-3 h-9 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm outline-none focus:border-[var(--ws-blue)]" />
            </div>
          ))}
          <button onClick={gerar} disabled={carregando} className={botaoPrimario + ' self-start'}>
            {carregando ? <><Loader2 size={16} className="animate-spin" /> Iniciando…</> : <>Gerar carrossel ({nSlides} slides) <ArrowRight size={16} /></>}
          </button>
        </div>
      )}

      {/* ETAPA 3 — GALERIA (polling) */}
      {etapa === 'galeria' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            {estado && !TERMINAIS.includes(estado.carrossel.status)
              ? <><Loader2 size={16} className="animate-spin text-[var(--ws-blue)]" /> Gerando… ({estado.slides.filter(s => s.status === 'done').length}/{estado.slides.length})</>
              : <span className="ds-label">Status <b className="text-[var(--ws-text-1)] ml-1">{estado?.carrossel.status}</b></span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {(estado?.slides || []).map(s => (
              <div key={s.slide_index} className={`${card} overflow-hidden flex flex-col`}>
                <div className="relative aspect-[9/16] bg-[var(--ws-glass-border)] flex items-center justify-center">
                  {s.base_image_url
                    ? <img src={s.base_image_url} alt={`Slide ${s.slide_index}`} className="w-full h-full object-cover" />
                    : s.status === 'error'
                      ? <AlertCircle size={20} className="text-[#a32d2d]" />
                      : <Loader2 size={20} className="animate-spin text-[var(--ws-text-3)]" />}
                  <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 text-white text-[11px] flex items-center justify-center">{s.slide_index}</span>
                </div>
                <div className="flex items-center justify-between p-2">
                  <button onClick={() => regenerarSlide(s.slide_index)} title="Regenerar" className="ds-help inline-flex items-center gap-1 hover:text-[var(--ws-text-1)]">
                    <RefreshCw size={12} /> Regenerar
                  </button>
                  {s.base_image_url && (
                    <a href={s.base_image_url} target="_blank" rel="noreferrer" download title="Baixar" className="ds-help hover:text-[var(--ws-text-1)]"><Download size={13} /></a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

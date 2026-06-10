'use client'

import React, { useState } from 'react'
import { Sparkles, Image as ImageIcon, Type, Palette, Layout, History, Send, AlertCircle, Download } from 'lucide-react'
import { toast } from 'sonner'
import { getToken } from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

const COM_TONES = [
  'Sofisticado', 'Urgência', 'Confiança', 'Aspiracional', 
  'Humano', 'Exclusividade', 'Direto', 'Emocional'
]

const STYLES = [
  { id: 'premium', title: 'Premium', desc: 'Limpo, sofisticado, cores neutras, tipografia refinada' },
  { id: 'bold', title: 'Bold Editorial', desc: 'Contraste alto, tipografia forte, impacto visual' },
  { id: 'lifestyle', title: 'Lifestyle', desc: 'Natural, humano, aspiracional, luz suave' },
  { id: 'minimalist', title: 'Minimalista', desc: 'Espaço negativo, detalhe único, elegância discreta' },
]

const FORMATS = [
  { id: '45', title: '4:5', sub: 'Feed' },
  { id: '11', title: '1:1', sub: 'Quadrado' },
  { id: '916', title: '9:16', sub: 'Stories/Reel' },
]

// Mapeia o formato da UI para o creative_format que a API entende.
const FORMAT_TO_CREATIVE: Record<string, string> = {
  '45': 'feed_4x5',
  '11': 'feed_1x1',
  '916': 'story',
}

const QUALITIES = [
  { id: 'low', title: 'Rápida' },
  { id: 'medium', title: 'Equilibrada' },
  { id: 'high', title: 'Alta' },
]

interface HistItem { id: string; url: string; briefing: string; at: number }

export function GeradorCriativos() {
  const [prompt, setPrompt] = useState('')
  const [selectedStyle, setSelectedStyle] = useState('premium')
  const [selectedTones, setSelectedTones] = useState<string[]>(['Sofisticado'])
  const [selectedFormat, setSelectedFormat] = useState('45')
  const [selectedQuality, setSelectedQuality] = useState('medium')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistItem[]>([])
  const { workspaceAtual: wsId } = useWorkspace()

  const toggleTone = (tone: string) => {
    setSelectedTones(prev =>
      prev.includes(tone) ? prev.filter(t => t !== tone) : [...prev, tone]
    )
  }

  // Junta briefing + estilo + tom num único texto (a IA gera só a base visual).
  const montarBriefing = () => {
    const style = STYLES.find(s => s.id === selectedStyle)
    const partes = [prompt.trim()]
    if (style) partes.push(`Estilo ${style.title}: ${style.desc}`)
    if (selectedTones.length) partes.push(`Tom: ${selectedTones.join(', ')}`)
    return partes.filter(Boolean).join('. ')
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('Escreva um briefing para o criativo.'); return }
    if (!wsId) { toast.error('Selecione um workspace antes de gerar.'); return }

    setIsGenerating(true)
    setResultImage(null)
    setError(null)

    try {
      const res = await fetch('/api/proxy/design/gerar-base', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken() ?? ''}`,
        },
        body: JSON.stringify({
          workspace_id: wsId,
          briefing: montarBriefing(),
          creative_format: FORMAT_TO_CREATIVE[selectedFormat] ?? 'feed_1x1',
          quality: selectedQuality,
        }),
      })
      if (!res.ok || !res.body) throw new Error(`Falha ao gerar (HTTP ${res.status})`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let done = false
      while (!done) {
        const { done: d, value } = await reader.read()
        done = d
        if (value) buffer += decoder.decode(value, { stream: true })
        let sep
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const bloco = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const linhas = bloco.split('\n')
          const ev = linhas.find(l => l.startsWith('event:'))?.slice(6).trim()
          const dataLine = linhas.find(l => l.startsWith('data:'))?.slice(5).trim()
          const data = dataLine ? JSON.parse(dataLine) : null
          if (ev === 'generation.completed' && data?.base_image_url) {
            setResultImage(data.base_image_url)
            setHistory(prev => [
              { id: data.generation_id, url: data.base_image_url, briefing: prompt.trim() || 'Criativo', at: Date.now() },
              ...prev,
            ].slice(0, 12))
            toast.success('Base visual gerada!')
          } else if (ev === 'generation.failed') {
            const msg = data?.error_message || 'Falha na geração.'
            setError(msg)
            toast.error(msg)
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar o criativo.'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsGenerating(false)
    }
  }

  const getFormatStyles = () => {
    switch (selectedFormat) {
      case '11': return { aspectRatio: '1/1', maxHeight: '100%', maxWidth: '100%', height: 'auto', width: '100%' }
      case '45': return { aspectRatio: '4/5', maxHeight: '100%', maxWidth: '100%', height: '100%', width: 'auto' }
      case '916': return { aspectRatio: '9/16', maxHeight: '100%', maxWidth: '100%', height: '100%', width: 'auto' }
      default: return { aspectRatio: '4/5', maxHeight: '100%', maxWidth: '100%', height: '100%', width: 'auto' }
    }
  }

  return (
    <div className="flex h-full gap-6 p-6 animate-in fade-in duration-500 overflow-hidden">
      {/* Left Column: Configuration */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-4 scrollbar-hide">
        
        {/* Section: Prompt */}
        <div className="space-y-3">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--ws-blue)]" />
            Briefing do Criativo
          </label>
          <div className="relative group">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Descreva o criativo: produto, público, mensagem principal, contexto da campanha..."
              className="w-full h-28 p-4 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-sm text-[var(--ws-text-1)] placeholder:text-[var(--ws-text-3)] focus:outline-none focus:border-[var(--ws-blue)] transition-all resize-none shadow-sm"
            />
            <div className="absolute bottom-3 right-3 text-[10px] text-[var(--ws-text-3)]">
              {prompt.length} / 4000
            </div>
          </div>
        </div>

        {/* Section: Estilo Visual */}
        <div className="space-y-3">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] flex items-center gap-2">
            <Palette size={14} className="text-[var(--ws-blue)]" />
            Estilo Visual
          </label>
          <div className="grid grid-cols-2 gap-3">
            {STYLES.map(style => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                className={`text-left p-4 rounded-[var(--ws-radius-lg)] border transition-all ${
                  selectedStyle === style.id 
                  ? 'bg-[rgba(0,74,140,0.08)] border-[var(--ws-blue)] shadow-sm' 
                  : 'bg-[var(--ws-glass-bg)] border-[var(--ws-glass-border)] hover:bg-[var(--ws-glass-bg-hover)]'
                }`}
              >
                <div className={`font-semibold text-sm ${selectedStyle === style.id ? 'text-[var(--ws-blue)]' : 'text-[var(--ws-text-1)]'}`}>
                  {style.title}
                </div>
                <div className="text-[11px] text-[var(--ws-text-3)] mt-1 line-clamp-1">{style.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Section: Tom da Comunicação */}
        <div className="space-y-3">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] flex items-center gap-2">
            <Type size={14} className="text-[var(--ws-blue)]" />
            Tom da Comunicação
          </label>
          <div className="flex flex-wrap gap-2">
            {COM_TONES.map(tone => {
              const isActive = selectedTones.includes(tone)
              return (
                <button
                  key={tone}
                  onClick={() => toggleTone(tone)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${
                    isActive 
                    ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' 
                    : 'bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] border-[var(--ws-glass-border)] hover:border-[var(--ws-text-3)]'
                  }`}
                >
                  {tone}
                </button>
              )
            })}
          </div>
        </div>

        {/* Section: Formato */}
        <div className="space-y-3">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] flex items-center gap-2">
            <Layout size={14} className="text-[var(--ws-blue)]" />
            Formato / Proporção
          </label>
          <div className="grid grid-cols-3 gap-3">
            {FORMATS.map(format => (
              <button
                key={format.id}
                onClick={() => setSelectedFormat(format.id)}
                className={`flex flex-col items-center justify-center p-4 rounded-[var(--ws-radius-lg)] border transition-all ${
                  selectedFormat === format.id 
                  ? 'bg-[rgba(0,74,140,0.08)] border-[var(--ws-blue)]' 
                  : 'bg-[var(--ws-glass-bg)] border-[var(--ws-glass-border)] hover:bg-[var(--ws-glass-bg-hover)]'
                }`}
              >
                <div className={`text-lg font-bold ${selectedFormat === format.id ? 'text-[var(--ws-blue)]' : 'text-[var(--ws-text-1)]'}`}>
                  {format.title}
                </div>
                <div className="text-[10px] uppercase tracking-tighter text-[var(--ws-text-3)] font-medium">{format.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="pt-2">
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] hover:text-[var(--ws-text-2)] flex items-center gap-1 transition-colors"
          >
            <span className={`transform transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▶</span>
            Configurações avançadas
          </button>
          
          {showAdvanced && (
            <div className="mt-4 p-4 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-[rgba(14,20,42,0.02)] space-y-4 animate-in slide-in-from-top-2 duration-300">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-[var(--ws-text-3)]">Qualidade</label>
                <div className="grid grid-cols-3 gap-2">
                  {QUALITIES.map(q => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setSelectedQuality(q.id)}
                      className={`h-8 rounded-md text-[11px] font-medium border transition-all ${
                        selectedQuality === q.id
                        ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]'
                        : 'bg-white text-[var(--ws-text-2)] border-[var(--ws-glass-border)] hover:border-[var(--ws-text-3)]'
                      }`}
                    >
                      {q.title}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--ws-text-3)]">
                  Maior qualidade consome mais tokens. Modelo: gpt-image-2 (OpenAI).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="mt-2 w-full py-4 bg-[var(--ws-gold)] hover:bg-[var(--ws-gold-light)] disabled:opacity-50 text-white font-bold rounded-[var(--ws-radius-lg)] shadow-lg shadow-[rgba(242,101,34,0.2)] transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Gerando criativo...
            </>
          ) : (
            <>
              <Send size={16} />
              Gerar Criativo
            </>
          )}
        </button>
      </div>

      {/* Right Column: Results & History */}
      <div className="w-[320px] flex flex-col gap-6">
        <div className="flex-1 flex flex-col bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-xl)] backdrop-blur-md overflow-hidden shadow-xl">
          <div className="p-4 border-b border-[var(--ws-glass-border)] flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-1)]">Resultado</span>
            {isGenerating && <div className="w-2 h-2 rounded-full bg-[var(--ws-blue)] animate-pulse" />}
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center overflow-hidden">
            {resultImage ? (
              <div 
                className="relative rounded-[var(--ws-radius-lg)] overflow-hidden shadow-inner animate-in zoom-in duration-500 bg-[rgba(15,39,68,0.05)] mx-auto flex flex-col justify-center items-center"
                style={getFormatStyles()}
              >
                <img 
                  src={resultImage} 
                  alt="Criativo Gerado" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-4">
                  <a
                    href={resultImage}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="w-full py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-[10px] font-bold uppercase rounded-md transition-all border border-white/20 shadow-sm flex items-center justify-center gap-2"
                  >
                    <Download size={12} /> Baixar base
                  </a>
                </div>
              </div>
            ) : error ? (
              <>
                <div className="w-16 h-16 rounded-full bg-[rgba(163,45,45,0.10)] flex items-center justify-center mb-4">
                  <AlertCircle size={32} className="text-[#a32d2d] opacity-70" />
                </div>
                <div className="text-sm font-medium text-[#a32d2d] mb-1">Não foi possível gerar</div>
                <div className="text-[11px] text-[var(--ws-text-3)] max-w-[220px]">{error}</div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-[var(--ws-blue-soft)] flex items-center justify-center mb-4">
                  <ImageIcon size={32} className="text-[var(--ws-blue)] opacity-40" />
                </div>
                <div className="text-sm font-medium text-[var(--ws-text-2)] mb-1">
                  {isGenerating ? 'Processando...' : 'Aguardando geração...'}
                </div>
                <div className="text-[11px] text-[var(--ws-text-3)] max-w-[200px]">
                  {isGenerating
                    ? 'A IA está gerando a base visual (10–30s). Os textos e a logo entram na montagem.'
                    : 'A base gerada aparecerá aqui. Ela é a matéria-prima; o criativo final é montado por cima.'}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="h-[200px] flex flex-col bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-xl)] backdrop-blur-md overflow-hidden shadow-lg">
          <div className="p-4 border-b border-[var(--ws-glass-border)] flex items-center gap-2">
            <History size={14} className="text-[var(--ws-text-3)]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-1)]">Histórico</span>
          </div>
          <div className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto scrollbar-hide">
            {history.length > 0 ? (
              history.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setResultImage(item.url); setError(null) }}
                  className="flex items-center gap-3 p-2 rounded-lg bg-white/40 border border-white/60 hover:bg-white/60 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded bg-gray-200 overflow-hidden shrink-0">
                    <img src={item.url} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-[var(--ws-text-1)] truncate">{item.briefing}</div>
                    <div className="text-[9px] text-[var(--ws-text-3)]">
                      {new Date(item.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[10px] text-[var(--ws-text-3)] font-medium italic opacity-60">Nenhuma geração ainda</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

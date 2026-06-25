'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { FileAudio, FileText, Image, Mic, Pause, Play, Plus, Send, Video, X } from 'lucide-react'
import type { ConversaApi } from '@/hooks/use-conversas'
import { Switch } from '@/components/ui/switch'
import { useAtualizarConversa } from '@/hooks/use-atualizar-conversa'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type AttachmentKind = 'document' | 'audio' | 'video' | 'image'

interface DraftAttachment {
  kind: AttachmentKind
  file: File
  filename: string
}

interface InputMensagemProps {
  valor: string
  onChange: (v: string) => void
  onEnviar: (options?: { file?: File | Blob | null; filename?: string; tipo?: 'image' | 'audio' | 'video' | 'document'; caption?: string | null }) => void
  isEnviando: boolean
  conversa: ConversaApi
  erro?: string | null
  isMobile?: boolean
}

const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const AUDIO_ACCEPT = 'audio/*'
const VIDEO_ACCEPT = 'video/*'

export function InputMensagem({ valor, onChange, onEnviar, isEnviando, conversa, erro, isMobile = false }: InputMensagemProps) {
  const documentInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const pausedStartedAtRef = useRef<number | null>(null)
  const pausedAccumulatedRef = useRef(0)
  const sendAfterStopRef = useRef(false)
  const recordingMimeTypeRef = useRef('audio/webm')
  const recordingLockRef = useRef(false)

  const [attachment, setAttachment] = useState<DraftAttachment | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [recordingError, setRecordingError] = useState<string | null>(null)

  const { atualizar: atualizarConversa } = useAtualizarConversa()
  const [agenteAtivo, setAgenteAtivo] = useState(conversa.iaAtiva)
  const [agenteTogglando, setAgenteTogglando] = useState(false)
  useEffect(() => {
    setAgenteAtivo(conversa.iaAtiva)
  }, [conversa.id, conversa.iaAtiva])
  const handleToggleAgente = async (next: boolean) => {
    setAgenteAtivo(next) // otimista (Nielsen #1)
    setAgenteTogglando(true)
    const ok = await atualizarConversa(conversa.id, { iaAtiva: next })
    setAgenteTogglando(false)
    if (!ok) setAgenteAtivo(!next) // reverte em falha (Nielsen #9)
  }

  const draftText = valor.trim()
  const hasText = draftText.length > 0
  const hasAttachment = attachment !== null
  const hasPrimaryContent = hasText || hasAttachment
  const primaryAction = hasPrimaryContent ? 'send' : 'record'
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || isRecording) return

    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 40), 108)}px`
  }, [valor, isRecording])

  useEffect(() => {
    return () => {
      clearRecordingTimer()
      stopMediaStream()
    }
  }, [])

  function clearRecordingTimer() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  function stopMediaStream() {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null
  }

  function resetRecordingRefs() {
    audioChunksRef.current = []
    recordingStartedAtRef.current = null
    pausedStartedAtRef.current = null
    pausedAccumulatedRef.current = 0
    sendAfterStopRef.current = false
    recordingMimeTypeRef.current = 'audio/webm'
    mediaRecorderRef.current = null
    recordingLockRef.current = false
  }

  function getElapsedMs(now = Date.now()) {
    const startedAt = recordingStartedAtRef.current
    if (!startedAt) return 0
    const pausedDuringCurrentSession = pausedStartedAtRef.current ? now - pausedStartedAtRef.current : 0
    return Math.max(0, now - startedAt - pausedAccumulatedRef.current - pausedDuringCurrentSession)
  }

  function formatDuration(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  function inferAttachmentKind(file: File, fallback: AttachmentKind): AttachmentKind {
    const mime = (file.type || '').toLowerCase()
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('application/') || mime.startsWith('text/')) return 'document'
    return fallback
  }

  function openPicker(kind: AttachmentKind) {
    if (isEnviando || isRecording || agenteAtivo) return
    if (kind === 'document') documentInputRef.current?.click()
    if (kind === 'audio') audioInputRef.current?.click()
    if (kind === 'video') videoInputRef.current?.click()
    if (kind === 'image') imageInputRef.current?.click()
  }

  function handlePickedFile(kind: AttachmentKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null
    event.currentTarget.value = ''
    if (!file) return

    const resolvedKind = inferAttachmentKind(file, kind)
    setRecordingError(null)
    setAttachment({
      kind: resolvedKind,
      file,
      filename: file.name || `${resolvedKind}-${Date.now()}`,
    })
  }

  function clearAttachment() {
    setAttachment(null)
  }

  function startTimer() {
    clearRecordingTimer()
    recordingTimerRef.current = setInterval(() => {
      setRecordingElapsedMs(getElapsedMs())
    }, 250)
  }

  async function startRecording() {
    if (isEnviando || isRecording || recordingLockRef.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError('Seu navegador não suporta gravação de áudio.')
      return
    }

    recordingLockRef.current = true
    setRecordingError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredMimeType = typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '')
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream)

      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      recordingStartedAtRef.current = Date.now()
      pausedStartedAtRef.current = null
      pausedAccumulatedRef.current = 0
      sendAfterStopRef.current = false
      recordingMimeTypeRef.current = recorder.mimeType || preferredMimeType || 'audio/webm'
      setAttachment(null)
      setIsRecording(true)
      setIsPaused(false)
      setRecordingElapsedMs(0)
      startTimer()

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        clearRecordingTimer()
        const blob = new Blob(audioChunksRef.current, { type: recordingMimeTypeRef.current || 'audio/webm' })
        const shouldSend = sendAfterStopRef.current
        const filename = `audio-${Date.now()}.webm`

        stopMediaStream()
        resetRecordingRefs()
        setIsRecording(false)
        setIsPaused(false)
        setRecordingElapsedMs(0)

        if (shouldSend) {
          onEnviar({ file: blob, filename, tipo: 'audio', caption: null })
        }
      }

      recorder.start()
    } catch (error) {
      stopMediaStream()
      resetRecordingRefs()
      setIsRecording(false)
      setIsPaused(false)
      setRecordingElapsedMs(0)
      setRecordingError(error instanceof Error ? error.message : 'Não foi possível iniciar a gravação.')
    } finally {
      recordingLockRef.current = false
    }
  }

  function stopRecording(send: boolean) {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    sendAfterStopRef.current = send
    try {
      recorder.stop()
    } catch {
      clearRecordingTimer()
      stopMediaStream()
      resetRecordingRefs()
      setIsRecording(false)
      setIsPaused(false)
    }
  }

  function togglePauseResume() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    if (recorder.state === 'recording') {
      pausedStartedAtRef.current = Date.now()
      recorder.pause()
      setIsPaused(true)
      setRecordingElapsedMs(getElapsedMs())
      return
    }

    if (recorder.state === 'paused') {
      if (pausedStartedAtRef.current) {
        pausedAccumulatedRef.current += Date.now() - pausedStartedAtRef.current
        pausedStartedAtRef.current = null
      }
      recorder.resume()
      setIsPaused(false)
      setRecordingElapsedMs(getElapsedMs())
    }
  }

  function handlePrimaryAction() {
    if (isEnviando || isRecording || agenteAtivo) return
    if (hasPrimaryContent) {
      handleSendTextOrAttachment()
      return
    }

    void startRecording()
  }

  function handleSendTextOrAttachment() {
    if (isEnviando || isRecording || agenteAtivo) return
    if (!hasPrimaryContent) return

    const tipo = attachment?.kind ?? undefined
    const caption = tipo === 'audio' ? null : (hasText ? draftText : null)

    if (attachment) {
      onEnviar({
        file: attachment.file,
        filename: attachment.filename,
        tipo,
        caption,
      })
      clearAttachment()
      return
    }

    onEnviar()
  }

  function renderAttachmentLabel() {
    if (!attachment) return ''
    const prefix = attachment.kind === 'document'
      ? 'Documento'
      : attachment.kind === 'audio'
        ? 'Áudio'
        : attachment.kind === 'video'
          ? 'Vídeo'
          : 'Imagem'
    return `${prefix}: ${attachment.filename}`
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(item => item.kind === 'file' && item.type.startsWith('image/'))
    if (!imageItem) return
    const file = imageItem.getAsFile()
    if (!file) return
    e.preventDefault()
    setRecordingError(null)
    setAttachment({
      kind: 'image',
      file,
      filename: `imagem-${Date.now()}.${file.type.split('/')[1] || 'png'}`,
    })
  }

  const imagePreviewUrl = useMemo(() => {
    if (!attachment || attachment.kind !== 'image') return null
    const url = URL.createObjectURL(attachment.file)
    return url
  }, [attachment])

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  const attachmentTone = useMemo(() => {
    if (!attachment) return {
      background: 'rgba(15, 23, 42, 0.04)',
      color: 'var(--ws-text-2)',
      border: '1px solid rgba(15, 23, 42, 0.08)',
    }

    if (attachment.kind === 'audio') {
      return {
        background: 'rgba(37, 211, 102, 0.10)',
        color: '#1D9E75',
        border: '1px solid rgba(29, 158, 117, 0.18)',
      }
    }

    if (attachment.kind === 'video') {
      return {
        background: 'rgba(24, 95, 165, 0.10)',
        color: '#185FA5',
        border: '1px solid rgba(24, 95, 165, 0.18)',
      }
    }

    if (attachment.kind === 'image') {
      return {
        background: 'rgba(122, 90, 248, 0.10)',
        color: '#7A5AF8',
        border: '1px solid rgba(122, 90, 248, 0.18)',
      }
    }

    return {
      background: 'rgba(15, 23, 42, 0.04)',
      color: 'var(--ws-text-2)',
      border: '1px solid rgba(15, 23, 42, 0.08)',
    }
  }, [attachment])

  const recordingButtonStyle = {
    width: 42,
    height: 42,
    borderRadius: '50%',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: isEnviando ? 'wait' : 'pointer',
    transition: 'transform 120ms ease, opacity 120ms ease, background 120ms ease',
  } as const

  return (
    <div
      style={isMobile
        ? { ...composerShellStyle, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }
        : composerShellStyle}
      className="atd-composer-bg"
    >
      {conversa.campanha && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: 'var(--ws-text-3)', fontStyle: 'italic' }}>
            Campanha: {conversa.campanha}
          </span>
        </div>
      )}

      {erro && (
        <div style={errorBannerStyle}>
          {erro}
        </div>
      )}

      {recordingError && (
        <div style={errorBannerStyle}>
          {recordingError}
        </div>
      )}

      {attachment && !isRecording && (
        <div style={{ ...attachmentPreviewStyle, ...attachmentTone }}>
          <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 8, flex: 1 }}>
            {attachment.kind === 'image' && imagePreviewUrl ? (
              <img
                src={imagePreviewUrl}
                alt={attachment.filename}
                style={{ maxWidth: 80, maxHeight: 56, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
              />
            ) : attachment.kind === 'audio' ? <FileAudio size={16} /> : attachment.kind === 'video' ? <Video size={16} /> : <FileText size={16} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {renderAttachmentLabel()}
            </span>
          </div>
          <button
            type="button"
            onClick={clearAttachment}
            style={iconButtonStyle}
            title="Remover anexo"
            disabled={isEnviando}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {isRecording ? (
        <div style={recordingBarStyle}>
          <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 10 }}>
            <span style={recordingPulseStyle} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#b42318', lineHeight: 1.2 }}>
                Gravando áudio
              </div>
              <div style={{ fontSize: 11, color: '#b42318', opacity: 0.88, fontVariantNumeric: 'tabular-nums' }}>
                {isPaused ? 'Pausado' : formatDuration(recordingElapsedMs)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => stopRecording(false)}
              style={{ ...recordingButtonStyle, background: 'rgba(239, 68, 68, 0.10)', color: '#dc2626' }}
              title="Cancelar gravação"
              aria-label="Cancelar gravação"
            >
              <X size={18} />
            </button>

            <button
              type="button"
              onClick={togglePauseResume}
              style={{ ...recordingButtonStyle, background: 'rgba(15, 23, 42, 0.06)', color: '#0f172a' }}
              title={isPaused ? 'Retomar gravação' : 'Pausar gravação'}
              aria-label={isPaused ? 'Retomar gravação' : 'Pausar gravação'}
            >
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
            </button>

            <button
              type="button"
              onClick={() => stopRecording(true)}
              style={{ ...recordingButtonStyle, background: 'linear-gradient(135deg, #25D366 0%, #1D9E75 100%)', color: 'white' }}
              title="Enviar áudio"
              aria-label="Enviar áudio"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      ) : (
        <>
        <div style={agenteSwitchRowStyle}>
          <Switch
            checked={agenteAtivo}
            onCheckedChange={handleToggleAgente}
            disabled={agenteTogglando}
            aria-label="Alternar agente IA"
          />
          <span className="ds-help">
            {agenteAtivo ? 'Agente IA respondendo' : 'Agente IA desligado'}
          </span>
        </div>
        <div style={composerRowStyle}>
          <input
            ref={documentInputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            style={hiddenInputStyle}
            onChange={event => handlePickedFile('document', event)}
          />
          <input
            ref={audioInputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            style={hiddenInputStyle}
            onChange={event => handlePickedFile('audio', event)}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept={VIDEO_ACCEPT}
            style={hiddenInputStyle}
            onChange={event => handlePickedFile('video', event)}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={hiddenInputStyle}
            onChange={event => handlePickedFile('image', event)}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={isEnviando || agenteAtivo}
                style={iconCircleButtonStyle}
                title="Anexar"
                aria-label="Anexar"
              >
                <Plus size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="w-52">
              <DropdownMenuItem onSelect={() => openPicker('image')}>
                <Image size={16} />
                <span>Imagem</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openPicker('document')}>
                <FileText size={16} />
                <span>Documento</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openPicker('audio')}>
                <FileAudio size={16} />
                <span>Áudio</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openPicker('video')}>
                <Video size={16} />
                <span>Vídeo</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div style={inputShellStyle} className="atd-input-bg">
            <textarea
              ref={textareaRef}
              value={valor}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (hasPrimaryContent) {
                    handleSendTextOrAttachment()
                  }
                }
              }}
              onPaste={handlePaste}
              placeholder={agenteAtivo ? 'Agente IA respondendo — desligue o agente para digitar' : 'Digite uma mensagem...'}
              disabled={isEnviando || agenteAtivo}
              rows={1}
              style={isMobile ? { ...textareaStyle, fontSize: 16 } : textareaStyle}
            />
          </div>

          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isEnviando || agenteAtivo}
            style={{
              ...primaryActionButtonStyle,
              opacity: isEnviando || agenteAtivo ? 0.72 : 1,
            }}
            title={primaryAction === 'send' ? 'Enviar mensagem' : 'Gravar áudio'}
            aria-label={primaryAction === 'send' ? 'Enviar mensagem' : 'Gravar áudio'}
          >
            {primaryAction === 'send' ? <Send size={18} /> : <Mic size={18} />}
          </button>
        </div>
        </>
      )}
    </div>
  )
}

const composerShellStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--ws-divider)',
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  boxShadow: '0 -10px 24px rgba(15, 23, 42, 0.04)',
}

const composerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 10,
}

const agenteSwitchRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
  paddingLeft: 2,
}

const inputShellStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  border: '1px solid var(--ws-glass-border)',
  borderRadius: 18,
  padding: '9px 12px',
  boxShadow: '0 8px 18px rgba(15, 23, 42, 0.05)',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--ws-text-1)',
  fontSize: 13,
  outline: 'none',
  resize: 'none',
  minWidth: 0,
  padding: 0,
  lineHeight: 1.45,
  minHeight: 20,
  maxHeight: 108,
}

const hiddenInputStyle: CSSProperties = {
  display: 'none',
}

const iconCircleButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: '50%',
  background: 'rgba(15, 23, 42, 0.05)',
  border: '1px solid rgba(15, 23, 42, 0.08)',
  color: 'var(--ws-text-2)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: 'transform 120ms ease, background 120ms ease, opacity 120ms ease',
}

const primaryActionButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: '50%',
  background: 'linear-gradient(135deg, #25D366 0%, #1D9E75 100%)',
  border: 'none',
  color: 'white',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  boxShadow: '0 8px 18px rgba(29, 158, 117, 0.22)',
  transition: 'transform 120ms ease, opacity 120ms ease',
}

const attachmentPreviewStyle: CSSProperties = {
  marginBottom: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 12,
  fontSize: 12,
}

const recordingBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 14px',
  borderRadius: 16,
  border: '1px solid rgba(220, 38, 38, 0.18)',
  background: 'var(--ws-glass-bg)',
  boxShadow: '0 10px 22px rgba(220, 38, 38, 0.08)',
}

const recordingPulseStyle: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: '#dc2626',
  boxShadow: '0 0 0 0 rgba(220, 38, 38, 0.38)',
}

const errorBannerStyle: CSSProperties = {
  marginBottom: 12,
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid rgba(239,68,68,0.25)',
  background: 'rgba(239,68,68,0.08)',
  color: '#ef4444',
  fontSize: 12,
  lineHeight: 1.4,
}

const iconButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.2s',
}

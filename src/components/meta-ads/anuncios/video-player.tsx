'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Play, Video } from 'lucide-react'
import { proxyImagem } from '@/lib/imagem-proxy'

interface Props {
  title: string
  sourceUrl?: string | null
  posterUrl?: string | null
  permalinkUrl?: string | null
}

function EmptyMedia({ title }: { title: string }) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: 16,
      color: 'var(--ws-text-3)',
      background: 'linear-gradient(180deg, rgba(14,20,42,0.03), rgba(14,20,42,0.06))',
    }}>
      <div style={{
        width: 54,
        height: 54,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.72)',
        border: '1px solid var(--ws-divider)',
        boxShadow: 'var(--ws-glass-shadow-sm)',
      }}>
        <Video size={22} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>{title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          Vídeo indisponível para reprodução neste momento.
        </div>
      </div>
    </div>
  )
}

export function VideoPlayer({ title, sourceUrl, posterUrl, permalinkUrl: _permalinkUrl }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [started, setStarted] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)
  const hasSource = Boolean(sourceUrl)
  const hasPoster = Boolean(posterUrl)

  useEffect(() => {
    setStarted(false)
    setMediaReady(false)
  }, [sourceUrl, posterUrl])

  const handleStart = async () => {
    if (!sourceUrl) return
    setStarted(true)
    try {
      await videoRef.current?.play()
    } catch {
      // O browser pode bloquear playback em alguns cenários; o controle continua disponível.
    }
  }

  return (
    <div style={{
      background: 'var(--ws-surface-2)',
      border: '1px solid var(--ws-divider)',
      borderRadius: 'var(--ws-radius-lg)',
      padding: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        margin: '0 auto',
        aspectRatio: '9 / 16',
        minHeight: '320px',
        maxHeight: '72vh',
        borderRadius: 'var(--ws-radius-md)',
        overflow: 'hidden',
        background: 'rgba(14,20,42,0.04)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {started && hasSource ? (
          <video
            ref={videoRef}
            src={sourceUrl ?? undefined}
            poster={posterUrl ? proxyImagem(posterUrl) : undefined}
            controls
            playsInline
            preload="metadata"
            disablePictureInPicture
            controlsList="nodownload noplaybackrate"
            loop={false}
            onLoadedMetadata={() => setMediaReady(true)}
            onCanPlay={() => setMediaReady(true)}
            onWaiting={() => setMediaReady(false)}
            onPlaying={() => setMediaReady(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: 'rgba(14,20,42,0.88)',
            }}
          />
        ) : hasPoster ? (
          <img
            src={proxyImagem(posterUrl)}
            alt={title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: 'rgba(14,20,42,0.88)',
            }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <EmptyMedia title={title} />
        )}

        {hasSource && !started && (
          <button
            type="button"
            onClick={handleStart}
            style={{
              position: 'absolute',
              inset: 0,
              border: 'none',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.24))',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'white',
            }}
          >
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.94)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--ws-glass-shadow-md)',
            }}>
              <Play size={20} style={{ color: 'var(--ws-text-1)', marginLeft: 2 }} />
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 9999,
              background: 'rgba(0,0,0,0.48)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}>
              Clique para reproduzir
            </div>
          </button>
        )}

        {!hasSource && hasPoster && (
          <div style={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 9999,
            background: 'rgba(0,0,0,0.52)',
            color: 'white',
            fontSize: 11,
            fontWeight: 600,
            backdropFilter: 'blur(8px)',
          }}>
            Sem URL direta do vídeo
          </div>
        )}

        {!mediaReady && started && hasSource && (
          <div style={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 9999,
            background: 'rgba(0,0,0,0.52)',
            color: 'white',
            fontSize: 11,
            fontWeight: 600,
            backdropFilter: 'blur(8px)',
          }}>
            <Loader2 size={12} className="animate-spin" />
            Carregando vídeo
          </div>
        )}
      </div>
    </div>
  )
}

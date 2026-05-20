'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

interface ChartSurfaceProps {
  children: ReactNode
  height: number | string
  className?: string
  style?: CSSProperties
  fallback?: ReactNode
}

interface MeasuredSize {
  width: number
  height: number
}

export function ChartSurface({ children, height, className, style, fallback }: ChartSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null)
  const readyRef = useRef(false)
  const lastSizeRef = useRef<MeasuredSize | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    let raf = 0

    const commitReady = (nextReady: boolean) => {
      if (readyRef.current === nextReady) return
      readyRef.current = nextReady
      setReady(nextReady)
    }

    const measure = () => {
      raf = 0

      const current = ref.current
      if (!current || !current.isConnected) {
        lastSizeRef.current = null
        commitReady(false)
        return
      }

      const rect = current.getBoundingClientRect()
      const nextSize: MeasuredSize = {
        width: rect.width,
        height: rect.height,
      }

      if (nextSize.width <= 0 || nextSize.height <= 0) {
        lastSizeRef.current = null
        commitReady(false)
        return
      }

      if (readyRef.current) return

      const previous = lastSizeRef.current
      // Wait for two matching non-zero measurements so Recharts mounts after the layout settles.
      if (
        previous
        && Math.abs(previous.width - nextSize.width) < 1
        && Math.abs(previous.height - nextSize.height) < 1
      ) {
        commitReady(true)
        return
      }

      lastSizeRef.current = nextSize
      if (raf === 0) {
        raf = window.requestAnimationFrame(measure)
      }
    }

    const scheduleMeasure = () => {
      if (raf !== 0) return
      raf = window.requestAnimationFrame(measure)
    }

    scheduleMeasure()

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null
    observer?.observe(node)
    window.addEventListener('resize', scheduleMeasure)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      if (raf !== 0) window.cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        height,
        ...style,
      }}
    >
      {ready ? children : (fallback ?? <div style={{ width: '100%', height: '100%', minHeight: 0 }} />)}
    </div>
  )
}

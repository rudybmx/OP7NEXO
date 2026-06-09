import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

const TABLET_BREAKPOINT = 1024

export interface BreakpointState {
  largura: number
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

/**
 * Breakpoint compartilhado (mobile <768 / tablet 768–1023 / desktop ≥1024).
 * SSR-safe: assume desktop no primeiro paint (mesmo trade-off do resto do projeto).
 * Use 1x no topo da árvore e repasse isMobile/isTablet por prop para evitar
 * múltiplos listeners e flashes dessincronizados entre componentes.
 */
export function useBreakpoint(): BreakpointState {
  const [largura, setLargura] = React.useState<number>(1280)

  React.useEffect(() => {
    const onChange = () => setLargura(window.innerWidth)
    onChange()
    window.addEventListener("resize", onChange)
    return () => window.removeEventListener("resize", onChange)
  }, [])

  return {
    largura,
    isMobile: largura < MOBILE_BREAKPOINT,
    isTablet: largura >= MOBILE_BREAKPOINT && largura < TABLET_BREAKPOINT,
    isDesktop: largura >= TABLET_BREAKPOINT,
  }
}

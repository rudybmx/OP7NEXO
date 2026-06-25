"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  BarChart2,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Code2,
  Cpu,
  CreditCard,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  KeyRound,
  LogOut,
  Mail,
  MessageCircle,
  MessageSquare,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings,
  Sparkles,
  Sun,
  User,
  UserCog,
  Users,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { secoesNavegacao, useLayout } from "@/lib/contexto-layout"
import { useTheme } from "@/components/provedores/provedor-tema"
import { useAuth } from "@/hooks/use-auth"
import { usePersistedState } from "@/hooks/use-estado-persistido"
import { useWorkspace } from "@/lib/workspace-context"
import { ModalMeuPerfil } from "@/components/layout/modal-meu-perfil"
import { ModalConfigEmpresa } from "@/components/layout/modal-config-empresa"

// Tokens de Design (Visual Parity with Design System)
const W04 = "rgba(255,255,255,0.04)"
const W06 = "rgba(255,255,255,0.06)"
const W08 = "rgba(255,255,255,0.08)"
const W10 = "rgba(255,255,255,0.10)"
const W12 = "rgba(255,255,255,0.12)"
const W14 = "rgba(255,255,255,0.14)"
const W22 = "rgba(255,255,255,0.22)"
const W25 = "rgba(255,255,255,0.25)"
const W30 = "rgba(255,255,255,0.30)"
const W40 = "rgba(255,255,255,0.40)"
const W45 = "rgba(255,255,255,0.45)"
const W50 = "rgba(255,255,255,0.50)"
const W60 = "rgba(255,255,255,0.60)"
const W70 = "rgba(255,255,255,0.70)"
const W75 = "rgba(255,255,255,0.75)"
const W80 = "rgba(255,255,255,0.80)"
const W85 = "rgba(255,255,255,0.85)"
const BRAND_PRIMARY = "#006EFF"
const BRAND_SECONDARY = "#0047cc"
const CORAL = "#ff6332"

const mapaIcones: Record<string, any> = {
  Activity,
  ClipboardCheck,
  BarChart2,
  Calendar,
  Sparkles,
  CreditCard,
  Image: ImageIcon,
  Palette,
  Code2,
  Users,
  MessageSquare,
  Send: Mail,
  LayoutGrid,
  Settings2: LayoutDashboard,
  Briefcase,
  UserCog,
  KeyRound,
  Server,
}

// SubItem Component (Produção)
const SubItem = ({
  label,
  rota,
  isActive = false,
  iconKey,
}: {
  label: string
  rota?: string
  isActive?: boolean
  iconKey?: string
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const ItemIcon = iconKey ? mapaIcones[iconKey] : null

  const content = (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: "relative",
        padding: "5px 8px",
        borderRadius: 6,
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        transition: "all 150ms ease",
        color: isActive ? "#ffffff" : isHovered ? W75 : W45,
        fontWeight: isActive ? 500 : 400,
        background: isActive ? "rgba(0,110,255,0.08)" : isHovered ? W04 : "transparent",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -12,
          top: "50%",
          transform: "translateY(-50%)",
          width: 8,
          height: 1,
          background: isActive ? "rgba(0,110,255,0.60)" : W10,
        }}
      />
      {isActive && (
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: BRAND_PRIMARY,
            boxShadow: "0 0 6px rgba(0,110,255,0.8)",
            flexShrink: 0,
          }}
        />
      )}
      {ItemIcon && <ItemIcon size={12} style={{ color: isActive ? "#ffffff" : W45, flexShrink: 0 }} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {!isActive && <span style={{ paddingLeft: 11 }} />}
    </div>
  )

  return rota ? (
    <Link href={rota} style={{ textDecoration: "none" }}>
      {content}
    </Link>
  ) : (
    content
  )
}

// NavItem Component (Produção)
const NavItem = ({
  icon: Icon,
  label,
  isActive = false, // Em rota
  isExpanded = false, // Aberto (com filhos visíveis)
  hasChevron = true,
  badge = null,
  isCollapsed = false,
  subItems = [],
  onClick,
  onMouseEnter,
  onMouseLeave,
  showFlyout = false,
}: any) => {
  const [isHovered, setIsHovered] = useState(false)
  
  const activeBg = "linear-gradient(135deg, rgba(0,110,255,0.18) 0%, rgba(0,110,255,0.10) 100%)"
  const expandedBg = "rgba(255,255,255,0.06)"
  const hoverBg = "rgba(255,255,255,0.06)"

  if (isCollapsed) {
    return (
      <div
        onMouseEnter={() => {
          setIsHovered(true)
          onMouseEnter?.()
        }}
        onMouseLeave={() => {
          setIsHovered(false)
          onMouseLeave?.()
        }}
        onClick={onClick}
        style={{
          position: "relative",
          width: 40,
          height: 40,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 150ms ease",
          background: isActive || isHovered ? (isActive ? activeBg : hoverBg) : "transparent",
          border: `1px solid ${isActive ? "rgba(0,110,255,0.25)" : isHovered ? "rgba(255,255,255,0.08)" : "transparent"}`,
          marginTop: 0,
          marginRight: "auto",
          marginBottom: 4,
          marginLeft: "auto",
          zIndex: showFlyout ? 100 : "auto",
        }}
      >
        <Icon
          size={18}
          style={{
            color: isActive || isExpanded || isHovered ? "#ffffff" : "rgba(255,255,255,0.50)",
            transition: "color 150ms ease",
          }}
        />

        {showFlyout && (
          <div
            style={{
              position: "absolute",
              left: "calc(100% + 8px)",
              top: 0,
              zIndex: 50,
              minWidth: 180,
              background: "rgba(0, 33, 77, 0.97)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              padding: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
              backdropFilter: "blur(20px)",
              cursor: "default",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,0.90)",
                padding: "4px 8px 8px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                marginBottom: 4,
                textTransform: "none",
              }}
            >
              {label}
            </div>

            {subItems.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  marginTop: 4,
                }}
              >
                {subItems.map((sub: any, i: number) => (
                  <SubItem key={i} label={sub.nome} rota={sub.rota} isActive={sub.isActive} iconKey={sub.chaveIcone} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        height: 36,
        padding: "0 10px",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        transition: "all 150ms ease",
        cursor: "pointer",
        background: isActive ? activeBg : isExpanded ? expandedBg : isHovered ? hoverBg : "transparent",
        border: `1px solid ${isActive ? "rgba(0,110,255,0.25)" : isExpanded || isHovered ? "rgba(255,255,255,0.08)" : "transparent"}`,
        color: isActive || isExpanded || isHovered ? "#ffffff" : "rgba(255,255,255,0.60)",
        fontWeight: isActive || isExpanded ? 500 : 400,
        marginBottom: 2
      }}
    >
      <Icon
        size={15}
        style={{
          color: isActive || isExpanded || isHovered ? "#ffffff" : "rgba(255,255,255,0.50)",
          transition: "all 150ms ease",
        }}
      />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {badge && (
        <span
          style={{
            background: "#ff6332",
            color: "#ffffff",
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 9999,
            marginLeft: "auto",
          }}
        >
          {badge}
        </span>
      )}
      {hasChevron && !badge && (
        isExpanded ? <ChevronDown size={14} style={{ color: "rgba(255,255,255,0.30)" }} /> : <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.30)" }} />
      )}
    </div>
  )
}

export function BarraLateral() {
  const { isCollapsed, toggleCollapse, setChatAberto, mobile: isMobile } = useLayout()
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const { user, logout } = useAuth()
  const { workspaceAtual, workspaces, setWorkspaceAtual, canSwitchWorkspace } = useWorkspace()
  const workspacesAtivos = workspaces.filter((w) => w.ativo)
  const workspaceAtualItem = workspacesAtivos.find((w) => w.workspace_id === workspaceAtual) ?? workspacesAtivos[0] ?? null

  const [perfilAberto, setPerfilAberto] = useState(false)
  const [configEmpresaAberta, setConfigEmpresaAberta] = useState(false)

  const ROLE_LABEL: Record<string, string> = {
    platform_admin: 'Admin Plataforma',
    network_admin: 'Admin da Rede',
    network_viewer: 'Visualizador',
    company_admin: 'Admin',
    company_agent: 'Agente',
  }

  const role = user?.role ?? ''
  const iniciais = user?.nome
    ? user.nome.trim().split(' ').filter(Boolean).map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  const roleLabel = ROLE_LABEL[role] ?? role

  const gruposPermitidos = (secao: any) => {
    if (secao.administrativa) {
      return role === 'platform_admin' ? secao.grupos : []
    }

    if (role === 'platform_admin' || role === 'network_admin' || role === 'network_viewer') {
      return secao.grupos
    }

    if (role === 'company_admin') {
      if (secao.nome === 'Marketing') return secao.grupos
      if (secao.nome === 'CRM') {
        return secao.grupos.filter((grupo) => ['Atendimento', 'Campanhas', 'Gestão'].includes(grupo.nome))
      }
      return []
    }

    if (role === 'company_agent' && secao.nome === 'CRM') {
      return secao.grupos.filter((grupo) => ['Atendimento', 'Campanhas', 'Gestão'].includes(grupo.nome))
    }

    return []
  }

  const secoesFiltradas = secoesNavegacao
    .map((secao) => ({ ...secao, grupos: gruposPermitidos(secao) }))
    .filter((secao) => secao.grupos.length > 0)

  // Persistimos APENAS os toggles explícitos do usuário (não o estado calculado).
  // A abertura efetiva é derivada da rota + abertoPadrao no render (ver linha do `aberto`).
  const [gruposAbertos, setGruposAbertos] = usePersistedState<Record<string, boolean>>(
    "oc-grupos-abertos",
    {},
  )
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)
  const hoverTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  // isMobile vem do contexto de layout (fonte única de breakpoint).

  const [flyupAberto, setFlyupAberto] = useState<string | null>(null)
  const [hoveredBottomItem, setHoveredBottomItem] = useState<string | null>(null)

  const alternarGrupo = (chave: string) => {
    setGruposAbertos((prev) => ({ ...prev, [chave]: !prev[chave] }))
  }

  const handleMouseEnter = (itemId: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setHoveredItemId(itemId)
  }

  const handleMouseLeave = () => {
    hoverTimerRef.current = setTimeout(() => {
      setHoveredItemId(null)
    }, 150)
  }

  const handleBottomItemClick = (grupo: any, chaveGrupo: string) => {
    const itensComRota = grupo.itens.filter((item: any) => item.rota)
    if (itensComRota.length === 1) {
      // navegar direto
      window.location.href = itensComRota[0].rota
    } else {
      setFlyupAberto((prev) => (prev === chaveGrupo ? null : chaveGrupo))
    }
  }

  // Largura anterior do estado aberto: 220px
  const currentWidth = isCollapsed ? 64 : 270

  if (isMobile) {
    return (
      <>
        {/* Backdrop para fechar flyup */}
        {flyupAberto && (
          <div
            onClick={() => setFlyupAberto(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 98 }}
          />
        )}

        {/* Flyup menu */}
        {flyupAberto && (() => {
          let grupoFlyup: any = null
          for (const secao of secoesFiltradas) {
            for (const grupo of secao.grupos) {
              if (`${secao.nome}-${grupo.nome}` === flyupAberto) {
                grupoFlyup = grupo
                break
              }
            }
            if (grupoFlyup) break
          }
          if (!grupoFlyup) return null
          return (
            <div style={{
              position: 'fixed',
              bottom: 68, left: 0, right: 0,
              zIndex: 99,
              display: 'flex',
              justifyContent: 'center',
              padding: '0 16px',
            }}>
              <div style={{
                background: 'rgba(0,33,77,0.97)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 16,
                padding: 12,
                minWidth: 200,
                maxWidth: 320,
                width: '100%',
                boxShadow: '0 -8px 32px rgba(0,0,0,0.40)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 600,
                  color: 'rgba(255,255,255,0.90)',
                  padding: '0 8px 8px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  marginBottom: 8,
                }}>
                  {grupoFlyup.nome}
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: grupoFlyup.itens.length > 3 ? '1fr 1fr' : '1fr',
                  gap: 4,
                }}>
                  {grupoFlyup.itens.filter((item: any) => item.rota).map((item: any) => (
                    <Link key={item.nome} href={item.rota} onClick={() => setFlyupAberto(null)}>
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        fontSize: 13,
                        color: pathname === item.rota ? '#ffffff' : 'rgba(255,255,255,0.60)',
                        background: pathname === item.rota ? 'rgba(0,110,255,0.12)' : 'transparent',
                        fontWeight: pathname === item.rota ? 500 : 400,
                        display: 'flex', alignItems: 'center', gap: 8,
                        transition: 'all 150ms ease',
                      }}>
                        {pathname === item.rota && (
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: '#006EFF',
                            boxShadow: '0 0 6px rgba(0,110,255,0.8)',
                            flexShrink: 0,
                          }} />
                        )}
                        {item.chaveIcone && (() => {
                          const IconeItem = mapaIcones[item.chaveIcone] || Activity
                          return <IconeItem size={12} style={{ color: pathname === item.rota ? '#ffffff' : 'rgba(255,255,255,0.55)' }} />
                        })()}
                        {item.nome}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Bottom Nav */}
        <nav style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          height: 'calc(64px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxSizing: 'border-box',
          background: 'linear-gradient(160deg, #00214d 0%, #000533 100%)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          zIndex: 100,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          gap: 0,
        }}>
          {secoesFiltradas.map((secao) =>
            secao.grupos.map((grupo) => {
              const chaveGrupo = `${secao.nome}-${grupo.nome}`
              const Icone = mapaIcones[grupo.chaveIcone] || Activity
              const grupoAtivo = grupo.itens.some((item) => item.rota && pathname.startsWith(item.rota))
              const isItemHovered = hoveredBottomItem === chaveGrupo

              return (
                <div
                  key={chaveGrupo}
                  onClick={() => handleBottomItemClick(grupo, chaveGrupo)}
                  onMouseEnter={() => setHoveredBottomItem(chaveGrupo)}
                  onMouseLeave={() => setHoveredBottomItem(null)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 60,
                    padding: '8px 4px',
                    gap: 4,
                    cursor: 'pointer',
                    position: 'relative',
                    flex: '0 0 auto',
                  }}
                >
                  <div style={{
                    width: 36, height: 36,
                    borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: grupoAtivo
                      ? 'linear-gradient(135deg, rgba(0,110,255,0.22), rgba(0,110,255,0.14))'
                      : isItemHovered ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: `1px solid ${grupoAtivo ? 'rgba(0,110,255,0.30)' : 'transparent'}`,
                    transition: 'all 150ms ease',
                  }}>
                    <Icone size={18} style={{ color: grupoAtivo ? '#ffffff' : 'rgba(255,255,255,0.50)' }} />
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: grupoAtivo ? 600 : 400,
                    color: grupoAtivo ? '#ffffff' : 'rgba(255,255,255,0.45)',
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.02em',
                  }}>
                    {grupo.nome}
                  </span>
                </div>
              )
            })
          )}

          {/* AI Chat */}
          <div
            onClick={() => setChatAberto(true)}
            onMouseEnter={() => setHoveredBottomItem('__chat__')}
            onMouseLeave={() => setHoveredBottomItem(null)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 60,
              padding: '8px 4px',
              gap: 4,
              cursor: 'pointer',
              flex: '0 0 auto',
            }}
          >
            <div style={{
              width: 36, height: 36,
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: hoveredBottomItem === '__chat__' ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: '1px solid transparent',
              transition: 'all 150ms ease',
            }}>
              <MessageCircle size={18} style={{ color: 'rgba(255,255,255,0.50)' }} />
            </div>
            <span style={{
              fontSize: 9, fontWeight: 400,
              color: 'rgba(255,255,255,0.45)',
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}>
              Chat AI
            </span>
          </div>

          {/* Avatar / User */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                onMouseEnter={() => setHoveredBottomItem('__user__')}
                onMouseLeave={() => setHoveredBottomItem(null)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 60,
                  padding: '8px 4px',
                  gap: 4,
                  cursor: 'pointer',
                  flex: '0 0 auto',
                }}
              >
                <div style={{
                  width: 36, height: 36,
                  borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: hoveredBottomItem === '__user__'
                    ? 'rgba(255,255,255,0.06)'
                    : 'linear-gradient(135deg, rgba(0,110,255,0.14), rgba(0,110,255,0.10))',
                  border: '1px solid rgba(0,110,255,0.18)',
                  transition: 'all 150ms ease',
                  fontSize: 11, fontWeight: 600, color: '#fff',
                }}>
                  {iniciais}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 400,
                  color: 'rgba(255,255,255,0.45)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.02em',
                }}>
                  Conta
                </span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-56 rounded-md border border-white/12 bg-[#0d2240] p-1 text-[rgba(255,255,255,0.75)]">
              <DropdownMenuLabel className="px-2 py-1 text-[10px] uppercase tracking-[0.06em] text-[rgba(255,255,255,0.3)]">Conta</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setPerfilAberto(true)} className="gap-2 rounded-md text-xs focus:bg-white/8 focus:text-white">
                  <User className="h-[13px] w-[13px]" />
                  Meu perfil
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 rounded-md text-xs focus:bg-white/8 focus:text-white">
                  <Settings className="h-[13px] w-[13px]" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="gap-2 rounded-md text-xs focus:bg-white/8 focus:text-white">
                  {resolvedTheme === "dark" ? <Sun className="h-[13px] w-[13px]" /> : <Moon className="h-[13px] w-[13px]" />}
                  Modo {resolvedTheme === "dark" ? "Claro" : "Escuro"}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="bg-white/8" />
              <DropdownMenuLabel className="px-2 py-1 text-[10px] uppercase tracking-[0.06em] text-[rgba(255,255,255,0.3)]">Empresa</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setConfigEmpresaAberta(true)} className="gap-2 rounded-md text-xs focus:bg-white/8 focus:text-white">
                  <Monitor className="h-[13px] w-[13px]" />
                  Config. da empresa
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="bg-white/8" />
              <DropdownMenuItem onClick={() => logout()} variant="destructive" className="gap-2 rounded-md text-xs !text-[rgba(255,90,90,0.85)]">
                <LogOut className="h-[13px] w-[13px]" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </>
    )
  }

  return (
      <aside
        style={{
          position: "relative",
          width: currentWidth,
          height: "100dvh",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          // Cor anterior antes da volta ao CRM navy:
          // linear-gradient(160deg, rgba(10, 10, 10, 0.98) 0%, rgba(5, 5, 5, 0.995) 46%, rgba(18, 18, 18, 1) 100%)
          background: "linear-gradient(160deg, #00214d 0%, #001a3d 45%, #000533 100%)",
          borderRight: `1px solid ${W08}`,
          boxShadow: `inset -1px 0 0 ${W04}, 4px 0 24px rgba(0,0,0,0.25)`,
          padding: isCollapsed ? "0 0 16px" : "0 12px 16px",
          color: "#ffffff",
          transition: "width 250ms cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 50
        }}
    >
      {/* Top highlight line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${W12} 30%, ${W06} 70%, transparent 100%)`,
        }}
      />

      {/* Toggle Button */}
      <div
        onClick={toggleCollapse}
        style={{
          position: "absolute",
          right: -14,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 10,
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "rgba(0, 33, 77, 0.95)",
          border: `1px solid ${W14}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 150ms ease",
        }}
      >
        {isCollapsed ? (
          <PanelLeftOpen size={15} style={{ color: W70 }} />
        ) : (
          <PanelLeftClose size={15} style={{ color: W70 }} />
        )}
      </div>

      {/* Logo Section */}
      <div
        style={{
          padding: isCollapsed ? "25px 0" : "20px 14px 16px",
          borderBottom: `1px solid ${W08}`,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 120, // Doubled from 72 to accommodate larger logo
          transition: "padding 250ms",
        }}
      >
        {isCollapsed ? (
          <img
            src="https://pub-db8ed4fb33634589a6ce5fb07e85cb46.r2.dev/logo/op7_dash_odc/logo_op7nexo.svg"
            alt="Op7 Nexo"
            style={{ height: 56, width: 'auto', objectFit: 'contain' }} // Doubled from 28
          />
        ) : (
          <img
            src="https://pub-db8ed4fb33634589a6ce5fb07e85cb46.r2.dev/logo/op7_dash_odc/logo_op7nexo.svg"
            alt="Op7 Nexo"
            style={{ height: 100, width: 'auto', objectFit: 'contain' }} // Doubled from 50
          />
        )}
      </div>

      {/* Navigation */}
      <div style={{ 
        flex: 1, 
        overflowY: isCollapsed ? "visible" : "auto", 
        scrollbarWidth: "none", 
        display: "flex", 
        flexDirection: "column", 
        paddingRight: isCollapsed ? 0 : 4 
      }}>
        {secoesFiltradas.map((secao) => {
          const isMarketing = secao.nome === "Marketing"
          return (
            <div key={secao.nome}>
              {/* Secao Label */}
              {!isCollapsed ? (
                <div style={{ display: "flex", alignItems: "center", padding: "0 10px", marginTop: 16, marginBottom: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: W25 }}>
                    {secao.nome}
                  </div>
                  {secao.administrativa && (
                    <span style={{ background: CORAL, color: "#ffffff", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 9999, marginLeft: "auto" }}>
                      Admin
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ height: 1, background: W08, marginTop: 16, marginRight: 10, marginBottom: 8, marginLeft: 10 }} />
              )}

              {/* Grupos */}
              {secao.grupos.map((grupo) => {
                const chaveGrupo = `${secao.nome}-${grupo.nome}`
                const Icone = mapaIcones[grupo.chaveIcone] || Activity
                const grupoAtivo = grupo.itens.some((item) => item.rota && pathname.startsWith(item.rota))
                // Rota atual SEMPRE vence (abre o grupo onde o usuário está).
                // Senão: toggle explícito do usuário; senão: abertoPadrao.
                const aberto = grupoAtivo ? true : (gruposAbertos[chaveGrupo] ?? grupo.abertoPadrao)

                return (
                  <div key={chaveGrupo}>
                    <NavItem
                      icon={Icone}
                      label={grupo.nome}
                      isExpanded={aberto}
                      isCollapsed={isCollapsed}
                      isActive={grupoAtivo}
                      onClick={() => alternarGrupo(chaveGrupo)}
                      onMouseEnter={() => handleMouseEnter(chaveGrupo)}
                      onMouseLeave={handleMouseLeave}
                      showFlyout={isCollapsed && hoveredItemId === chaveGrupo}
                      subItems={grupo.itens.map((item) => ({ ...item, isActive: pathname === item.rota }))}
                    />
                    {aberto && !isCollapsed && (
                      <div style={{ marginLeft: 26, paddingLeft: 12, borderLeft: `1px solid ${W08}`, marginTop: 2, marginBottom: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                        {grupo.itens.map((item) => (
                          <SubItem
                            key={item.nome}
                            label={item.nome}
                            rota={item.rota}
                            isActive={pathname === item.rota}
                            iconKey={item.chaveIcone}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Footer Cards */}
      <div style={{ borderTop: `1px solid ${W08}`, paddingTop: 14, marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        {/* Workspace Selector */}
        {canSwitchWorkspace && workspacesAtivos.length > 1 ? (
          <div style={{ width: isCollapsed ? 40 : "100%" }}>
            {isCollapsed ? (
              <div style={{ position: "relative", width: 40, height: 40 }}>
                <div
                  title={workspaceAtualItem?.workspace_nome ?? "Workspace"}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: W06,
                    border: `1px solid ${W08}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    fontSize: 11,
                    fontWeight: 700,
                    color: W70,
                  }}
                >
                  {(workspaceAtualItem?.workspace_nome ?? "W").charAt(0).toUpperCase()}
                </div>
                <select
                  aria-label="Selecionar workspace"
                  title={workspaceAtualItem?.workspace_nome ?? "Workspace"}
                  value={workspaceAtual ?? ""}
                  onChange={(e) => {
                    setWorkspaceAtual(e.target.value)
                    window.location.reload()
                  }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: 40,
                    height: 40,
                    opacity: 0,
                    cursor: "pointer",
                  }}
                >
                  {workspacesAtivos.map((w) => (
                    <option key={w.workspace_id} value={w.workspace_id} style={{ color: "#111827", background: "#ffffff" }}>
                      {w.workspace_nome ?? w.workspace_id}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <select
                value={workspaceAtual ?? ""}
                onChange={(e) => {
                  setWorkspaceAtual(e.target.value)
                  window.location.reload()
                }}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: 8,
                  background: "rgba(0,33,77,0.80)",
                  border: `1px solid ${W08}`,
                  color: W80,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {workspacesAtivos.map((w) => (
                  <option key={w.workspace_id} value={w.workspace_id}>
                    {w.workspace_nome ?? w.workspace_id}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div
            title={workspaceAtualItem?.workspace_nome ?? "Workspace"}
            style={{
              width: isCollapsed ? 40 : "100%",
              minHeight: isCollapsed ? 40 : 44,
              borderRadius: 8,
              background: W06,
              border: `1px solid ${W08}`,
              display: "flex",
              alignItems: "center",
              justifyContent: isCollapsed ? "center" : "flex-start",
              gap: 8,
              padding: isCollapsed ? 0 : "7px 10px",
              color: W80,
            }}
          >
            {isCollapsed ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: W70 }}>
                {(workspaceAtualItem?.workspace_nome ?? "W").charAt(0).toUpperCase()}
              </span>
            ) : (
              <>
                <div style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, rgba(0,110,255,0.22), rgba(0,110,255,0.14))",
                  border: `1px solid rgba(0,110,255,0.20)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {(workspaceAtualItem?.workspace_nome ?? "W").charAt(0).toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: W45, lineHeight: 1.1 }}>Workspace</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#ffffff", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {workspaceAtualItem?.workspace_nome ?? "Workspace"}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
        {/* AI Assistant */}
        <div
          onClick={() => setChatAberto(true)}
          style={{
            width: isCollapsed ? 40 : "100%",
            height: isCollapsed ? 40 : "auto",
            background: W06,
            border: `1px solid ${W08}`,
            borderRadius: 10,
            padding: isCollapsed ? 0 : "8px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "flex-start",
            gap: 8,
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
        >
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, #0047cc, #006EFF)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
            <MessageCircle size={15} color="#ffffff" />
          </div>
          {!isCollapsed && (
            <>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "#ffffff", lineHeight: 1.2 }}>Assistente AI</span>
                <span style={{ fontSize: 10, color: W40, lineHeight: 1.2 }}>Pergunte qualquer coisa</span>
              </div>
              <Sparkles size={14} style={{ marginLeft: "auto", color: W30 }} />
            </>
          )}
        </div>

        {/* User Profile Dropdown with Theme Toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div style={{ width: isCollapsed ? 30 : "100%", height: isCollapsed ? 30 : "auto", background: isCollapsed ? "transparent" : W06, border: isCollapsed ? "none" : `1px solid ${W08}`, borderRadius: isCollapsed ? "50%" : 10, padding: isCollapsed ? 0 : "8px 10px", display: "flex", alignItems: "center", justifyContent: isCollapsed ? "center" : "flex-start", gap: 8, cursor: "pointer", transition: "all 250ms ease" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_SECONDARY})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                {iniciais}
              </div>
              {!isCollapsed && (
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#ffffff", lineHeight: 1.2 }}>{user?.nome ?? '—'}</span>
                  <span style={{ fontSize: 10, color: W40, lineHeight: 1.2 }}>{roleLabel}</span>
                </div>
              )}
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56 rounded-md border border-white/12 bg-[#0d2240] p-1 text-[rgba(255,255,255,0.75)]">
            <DropdownMenuLabel className="px-2 py-1 text-[10px] uppercase tracking-[0.06em] text-[rgba(255,255,255,0.3)]">Conta</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setPerfilAberto(true)} className="gap-2 rounded-md text-xs focus:bg-white/8 focus:text-white">
                <User className="h-[13px] w-[13px]" />
                Meu perfil
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-md text-xs focus:bg-white/8 focus:text-white">
                <Settings className="h-[13px] w-[13px]" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="gap-2 rounded-md text-xs focus:bg-white/8 focus:text-white">
                {resolvedTheme === "dark" ? <Sun className="h-[13px] w-[13px]" /> : <Moon className="h-[13px] w-[13px]" />}
                Modo {resolvedTheme === "dark" ? "Claro" : "Escuro"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-white/8" />
            <DropdownMenuLabel className="px-2 py-1 text-[10px] uppercase tracking-[0.06em] text-[rgba(255,255,255,0.3)]">Empresa</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setConfigEmpresaAberta(true)} className="gap-2 rounded-md text-xs focus:bg-white/8 focus:text-white">
                <Monitor className="h-[13px] w-[13px]" />
                Config. da empresa
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-white/8" />
            <DropdownMenuItem onClick={() => logout()} variant="destructive" className="gap-2 rounded-md text-xs !text-[rgba(255,90,90,0.85)]">
              <LogOut className="h-[13px] w-[13px]" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ModalMeuPerfil aberto={perfilAberto} onFechar={() => setPerfilAberto(false)} />
        <ModalConfigEmpresa aberto={configEmpresaAberta} onFechar={() => setConfigEmpresaAberta(false)} />
      </div>
    </aside>
  )
}

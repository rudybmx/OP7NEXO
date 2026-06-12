"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useBreakpoint } from "@/hooks/use-mobile"

type ItemNavegacao = {
  nome: string
  rota?: string
  chaveIcone?: string
}

type GrupoNavegacao = {
  nome: string
  secao: string
  chaveIcone: string
  abertoPadrao: boolean
  administrativo?: boolean
  itens: ItemNavegacao[]
}

type SecaoNavegacao = {
  nome: string
  administrativa?: boolean
  grupos: GrupoNavegacao[]
}

type ContextoLayoutValor = {
  mobile: boolean
  isCollapsed: boolean
  chatAberto: boolean
  itemAtivo: string
  breadcrumb: string
  setChatAberto: (aberto: boolean) => void
  setItemAtivo: (item: string) => void
  toggleCollapse: () => void
}

export const secoesNavegacao: SecaoNavegacao[] = [
  {
    nome: "Marketing",
    grupos: [
      {
        nome: "Campanhas",
        secao: "Marketing",
        chaveIcone: "Activity",
        abertoPadrao: true,
        itens: [
          { nome: "Meta Ads",    rota: "/marketing/campanhas/meta-ads" },
          { nome: "Google Ads",  rota: "/marketing/campanhas/google-ads" },
          { nome: "LinkedIn Ads" },
          { nome: "TikTok Ads" },
          { nome: "WhatsApp" },
        ],
      },
      {
        nome: "Estúdio AI",
        secao: "Marketing",
        chaveIcone: "Sparkles",
        abertoPadrao: false,
        itens: [
          { nome: "Criativos", rota: "/marketing/estudio-ai/criativos", chaveIcone: "Image" },
          { nome: "Vídeos" },
          { nome: "Brand Kit", rota: "/marketing/estudio-ai/brand-kit", chaveIcone: "Palette" },
          { nome: "Carregar Tokens", rota: "/marketing/estudio-ai/carregar-tokens", chaveIcone: "CreditCard" },
        ],
      },
      {
        nome: "Demandas",
        secao: "Marketing",
        chaveIcone: "ClipboardCheck",
        abertoPadrao: false,
        itens: [
          { nome: "PMP",                    rota: "/marketing/demandas/pmp" },
          { nome: "Estratégia" },
          { nome: "Matriz de Investimento", rota: "/marketing/demandas/matriz-investimento" },
          { nome: "Mapa Mental",            rota: "/marketing/demandas/mapa-mental" },
          { nome: "Planejamento" },
        ],
      },
      {
        nome: "Performance",
        secao: "Marketing",
        chaveIcone: "BarChart2",
        abertoPadrao: false,
        itens: [
          { nome: "Visão Geral Campanhas" },
          { nome: "Acomp. de Demandas" },
        ],
      },
    ],
  },
  {
    nome: "CRM",
    grupos: [
      {
        nome: "Atendimento",
        secao: "CRM",
        chaveIcone: "MessageSquare",
        abertoPadrao: false,
        itens: [
          { nome: "Conversas",     rota: "/crm/atendimento/conversas" },
          { nome: "Contatos",      rota: "/crm/atendimento/contatos" },
          { nome: "Agentes",       rota: "/crm/atendimento/agentes" },
          { nome: "Arquivado",     rota: "/crm/atendimento/arquivado" },
          { nome: "Buscador CNPJ", rota: "/crm/atendimento/buscador-cnpj" },
        ],
      },
      {
        nome: "Campanhas",
        secao: "CRM",
        chaveIcone: "Send",
        abertoPadrao: false,
        itens: [
          { nome: "Disparador",          rota: "/crm/campanhas/disparador" },
          { nome: "Modelos de Mensagens", rota: "/crm/campanhas/modelos-mensagens" },
        ],
      },
      {
        nome: "Gestão",
        secao: "CRM",
        chaveIcone: "LayoutGrid",
        abertoPadrao: false,
        itens: [
          { nome: "Painéis",               rota: "/crm/paineis" },
          { nome: "Agenda",                 rota: "/crm/agenda" },
          { nome: "NPS",                    rota: "/crm/nps" },
          { nome: "Follow-up / Resgate",    rota: "/crm/followup" },
          { nome: "Recorrência",            rota: "/crm/recorrencia" },
          { nome: "Conversão Campanhas",    rota: "/crm/campanhas-conversao" },
        ],
      },
      {
        nome: "Cadastros",
        secao: "CRM",
        chaveIcone: "Settings2",
        abertoPadrao: false,
        itens: [
          { nome: "Equipes" },
          { nome: "Usuários" },
          { nome: "Geral" },
        ],
      },
    ],
  },
  {
    nome: "Administração",
    administrativa: true,
    grupos: [
      {
        nome: "Empresas",
        secao: "Administração",
        chaveIcone: "Briefcase",
        administrativo: true,
        abertoPadrao: false,
        itens: [
          { nome: "Clientes", rota: "/administracao/empresas/contas" },
          { nome: "Contas Ads", rota: "/administracao/contas-ads" },
          { nome: "Gestão de Tokens", rota: "/admin/tokens" },
          { nome: "Central de IA", rota: "/admin/ia" },
          { nome: "Análises de IA", rota: "/admin/analises-ia" },
          { nome: "Canais", rota: "/administracao/canais-omnichannel" },
          { nome: "Planos" },
          { nome: "Financeiro" },
          { nome: "Avisos Personalizados" },
          { nome: "Auditoria" },
          { nome: "Integrações" },
          { nome: "Relatórios Faturamento" },
          { nome: "Relatório Clientes" },
        ],
      },
      {
        nome: "Usuários",
        secao: "Administração",
        chaveIcone: "UserCog",
        administrativo: true,
        abertoPadrao: false,
        itens: [
          { nome: "Lista Usuários", rota: "/administracao/usuarios" },
        ],
      },
      {
        nome: "Infra",
        secao: "Administração",
        chaveIcone: "Server",
        administrativo: true,
        abertoPadrao: false,
        itens: [
          { nome: "Arquivos (SFTP)", rota: "/administracao/arquivos" },
        ],
      },
    ],
  },
]

export const mapaRotas = secoesNavegacao.reduce<Record<string, string>>(
  (acumulador, secao) => {
    secao.grupos.forEach((grupo) => {
      grupo.itens.forEach((item) => {
        if (item.rota) acumulador[item.nome] = item.rota
      })
    })
    return acumulador
  },
  {}
)

export const mapaBreadcrumbs = secoesNavegacao.reduce<Record<string, string>>(
  (acumulador, secao) => {
    secao.grupos.forEach((grupo) => {
      grupo.itens.forEach((item) => {
        acumulador[item.nome] = `${secao.nome} / ${grupo.nome} / ${item.nome}`
      })
    })
    return acumulador
  },
  {}
)

export const gruposPorItem = secoesNavegacao.reduce<
  Record<string, { secao: string; grupo: string; administrativa?: boolean }>
>((acumulador, secao) => {
  secao.grupos.forEach((grupo) => {
    grupo.itens.forEach((item) => {
      acumulador[item.nome] = {
        secao: secao.nome,
        grupo: grupo.nome,
        administrativa: secao.administrativa,
      }
    })
  })
  return acumulador
}, {})

const ContextoLayout = createContext<ContextoLayoutValor | null>(null)

export function ProvedorLayout({ children }: { children: React.ReactNode }) {
  // Fonte única de breakpoint (mesmo hook usado em toda a casca e nas páginas).
  const { isMobile: mobile } = useBreakpoint()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [chatAberto, setChatAberto] = useState(false)
  const [itemAtivo, setItemAtivo] = useState("Meta Ads")

  const breadcrumb = mapaBreadcrumbs[itemAtivo] ?? itemAtivo

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev)
  }, [])

  useEffect(() => {
    // Restaurar estado do localStorage inicialmente
    const saved = localStorage.getItem("oc-sidebar-collapsed")
    if (saved === "true") setIsCollapsed(true)
  }, [])

  useEffect(() => {
    // Salvar estado em localStorage
    localStorage.setItem("oc-sidebar-collapsed", String(isCollapsed))
  }, [isCollapsed])

  useEffect(() => {
    // No mobile, a sidebar entra colapsada (vira bottom-nav).
    if (mobile) setIsCollapsed(true)
  }, [mobile])

  const valor = useMemo(
    () => ({
      mobile,
      isCollapsed,
      chatAberto,
      itemAtivo,
      breadcrumb,
      setChatAberto,
      setItemAtivo,
      toggleCollapse,
    }),
    [
      mobile,
      isCollapsed,
      chatAberto,
      itemAtivo,
      breadcrumb,
      toggleCollapse,
    ]
  )

  return (
    <ContextoLayout.Provider value={valor}>{children}</ContextoLayout.Provider>
  )
}

export function useLayout() {
  const contexto = useContext(ContextoLayout)

  if (!contexto) {
    throw new Error("useLayout deve ser usado dentro de ProvedorLayout")
  }

  return contexto
}

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

type ItemNavegacao = {
  nome: string
  rota?: string
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
          { nome: "LinkedIn Ads",rota: "/marketing/campanhas/linkedin-ads" },
          { nome: "TikTok Ads",  rota: "/marketing/campanhas/tiktok-ads" },
          { nome: "WhatsApp",    rota: "/marketing/campanhas/whatsapp" },
        ],
      },
      {
        nome: "Demandas",
        secao: "Marketing",
        chaveIcone: "ClipboardCheck",
        abertoPadrao: false,
        itens: [
          { nome: "PMP",                    rota: "/marketing/demandas/pmp" },
          { nome: "Design",                 rota: "/marketing/demandas/design" },
          { nome: "Estratégia",             rota: "/marketing/demandas/estrategia" },
          { nome: "Matriz de Investimento", rota: "/marketing/demandas/matriz-investimento" },
          { nome: "Mapa Mental",            rota: "/marketing/demandas/mapa-mental" },
          { nome: "Planejamento",           rota: "/marketing/demandas/planejamento" },
        ],
      },
      {
        nome: "Performance",
        secao: "Marketing",
        chaveIcone: "BarChart2",
        abertoPadrao: false,
        itens: [
          { nome: "Visão Geral Campanhas", rota: "/marketing/performance/visao-geral" },
          { nome: "Acomp. de Demandas",    rota: "/marketing/performance/demandas" },
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
          { nome: "Prompt IA",     rota: "/crm/atendimento/prompt-ia" },
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
          { nome: "Equipes",   rota: "/crm/cadastros/equipes" },
          { nome: "Usuários",  rota: "/crm/cadastros/usuarios" },
          { nome: "Canais",    rota: "/crm/cadastros/canais" },
          { nome: "Geral",     rota: "/crm/cadastros/geral" },
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
          { nome: "Contas",                 rota: "/administracao/empresas/contas" },
          { nome: "Planos",                 rota: "/administracao/empresas/planos" },
          { nome: "Financeiro",             rota: "/administracao/empresas/financeiro" },
          { nome: "Avisos Personalizados",  rota: "/administracao/empresas/avisos-personalizados" },
          { nome: "Auditoria",              rota: "/administracao/empresas/auditoria" },
          { nome: "Integrações",            rota: "/administracao/empresas/integracoes" },
          { nome: "Relatórios Faturamento", rota: "/administracao/empresas/relatorios-faturamento" },
          { nome: "Relatório Clientes",     rota: "/administracao/empresas/relatorio-clientes" },
        ],
      },
      {
        nome: "Usuarios",
        secao: "Administracao",
        chaveIcone: "UserCog",
        administrativo: true,
        abertoPadrao: false,
        itens: [
          { nome: "Lista Usuarios", rota: "/admin/usuarios" },
          { nome: "Novo Usuario",   rota: "/admin/usuarios/novo" },
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
  const [mobile, setMobile] = useState(false)
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
    const mediaQuery = window.matchMedia("(max-width: 768px)")

    const atualizarTela = () => {
      const emMobile = window.innerWidth <= 768
      setMobile(emMobile)
      if (emMobile) {
        setIsCollapsed(true)
      }
    }

    atualizarTela()
    mediaQuery.addEventListener("change", atualizarTela)
    return () => mediaQuery.removeEventListener("change", atualizarTela)
  }, [])

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

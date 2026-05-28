# ARCHITECTURE — op7nexo-front

## Stack e versões

| Componente | Versão |
|---|---|
| Next.js | 16.2.3 (App Router) |
| React | 19.2.4 |
| TypeScript | 5.x |
| Tailwind CSS | 4.x |
| shadcn/ui | 4.2.0 |
| Recharts | 3.8.1 |
| SWR | 2.4.1 |
| ReactFlow | 11.11.4 |
| lucide-react | 1.7.0 |
| date-fns | 4.1.0 |
| next-themes | 0.4.6 |
| sonner | 2.0.7 |

## Estrutura de pastas

```
src/
├── app/
│   ├── (auth)/                         # Layout sem sidebar
│   │   └── login/page.tsx              # Página de login
   │   ├── (plataforma)/                   # Layout autenticado (sidebar + chat)
   │   │   ├── layout.tsx                  # BarraLateral + PainelChat + ProvedorLayout
   │   │   ├── page.tsx                    # Dashboard principal
   │   │   ├── admin/
   │   │   │   └── tokens/page.tsx         # Gestão de tokens Meta + banner de health
   │   │   ├── administracao/
   │   │   │   ├── contas-ads/page.tsx     # Gerenciamento de contas de anúncios
   │   │   │   ├── canais-omnichannel/     # Canais de comunicação
   │   │   │   ├── empresas/               # Gestão de empresas
│   │   │   └── usuarios/               # Gestão de usuários
│   │   ├── marketing/
│   │   │   ├── campanhas/
│   │   │   │   ├── meta-ads/page.tsx   # Dashboard Meta Ads (visão geral, campanhas, públicos, criativos)
│   │   │   │   ├── google-ads/         # Dashboard Google Ads
│   │   │   │   ├── linkedin-ads/       # Placeholder
│   │   │   │   └── tiktok-ads/         # Placeholder
│   │   │   ├── demandas/               # Gestão de demandas (design, estratégia, mapa mental, etc.)
│   │   │   ├── performance/            # Performance e visão geral
│   │   │   ├── central-ai/             # Central de IA (agentes, criativos, visões)
│   │   │   ├── automacao/              # Landing pages, automações
│   │   │   ├── eventos/                # Cursos, jornadas, eventos
│   │   │   └── estrategistas/          # Atendimento, estratégia, suporte
│   │   └── crm/                        # CRM (atendimento, campanhas, cadastros, NPS, etc.)
│   └── api/                            # Route handlers Next.js (server-side)
│       ├── proxy/[...path]/route.ts    # Proxy reverso → op7nexo-api
│       ├── auth/
│       │   ├── login/route.ts          # Login alternativo via Supabase GoTrue (legado)
│       │   ├── me/route.ts             # Dados do usuário
│       │   ├── refresh/route.ts        # Refresh token
│       │   └── register/route.ts       # Registro
│       ├── cnpj/[cnpj]/route.ts        # Proxy para API de CNPJ (ReceitaWS)
│       ├── meta/                       # Endpoints Meta (campanhas, anúncios, overview)
│       ├── whatsapp/                   # Endpoints WhatsApp (conversas, mensagens, stream)
│       └── equipes/                    # CRUD de equipes
├── components/
│   ├── ui/                             # Primitivos shadcn/ui
│   ├── layout/
│   │   ├── BarraLateral.tsx            # Sidebar colapsável com navegação
│   │   └── PainelChat.tsx              # Painel flutuante de chat IA
│   ├── meta-ads/
│   │   ├── visao-geral/                # KPI cards, gráfico, filtros, insights IA
│   │   ├── campanhas/                  # Tabela hierárquica campanha→adset→anúncio
│   │   ├── publicos/                   # Demographics, placement, heatmap
│   │   └── criativos/                  # Grid de criativos com métricas
│   ├── google-ads/                     # Componentes Google Ads
│   ├── crm/                            # Componentes CRM
│   ├── demandas/                       # Mapa mental, matriz, Gantt, PMP
│   └── design-system/                  # Guia de design e componentes de referência
├── hooks/                              # Hooks de dados (SWR)
├── lib/
│   ├── api-client.ts                   # Cliente HTTP (fetch → /api/proxy)
│   ├── auth.ts                         # signIn, getMe, logout
│   ├── auth-provider.tsx               # AuthContext React
│   ├── swr.ts                          # Helpers SWR (makeFetcher, SWR_OPTS)
│   ├── contexto-layout.tsx             # Navegação, breadcrumb, estado sidebar
│   ├── formatar.ts                     # Formatação de moeda, datas, etc.
│   ├── utils.ts                        # cn() e utilitários
│   └── mock-meta-ads.ts                # Dados mock Meta Ads (usado quando API retorna vazio)
└── types/
    ├── meta-ads.ts                     # Tipos da visão geral Meta
    ├── meta-ads-campanhas.ts           # Tipos hierarquia campanha/adset/anúncio
    ├── meta-ads-anuncios.ts            # Tipo Anuncio flat
    ├── meta-ads-publicos.ts            # Tipos demográficos e placement
    ├── meta-ads-criativos.ts           # Tipo Criativo
    └── google-ads.ts                   # Tipos Google Ads
```

## Como o proxy `/api/proxy` funciona

**Arquivo:** `src/app/api/proxy/[...path]/route.ts`

Todas as chamadas de dados da plataforma passam por este proxy reverso, que:

1. Recebe qualquer método HTTP (`GET`, `POST`, `PUT`, `DELETE`, etc.)
2. Remove o header `host` para não vazar o host do Next.js
3. Encaminha a requisição para `http://op7nexo-api:8000/<path>` (nome Docker interno)
4. Retorna a resposta upstream sem reprocessar (streaming direto)

```
Browser → /api/proxy/workspaces → http://op7nexo-api:8000/workspaces
```

**Por que proxy e não chamada direta?**
- O backend (`op7nexo-api`) não está exposto publicamente — só acessível internamente na rede Docker
- O proxy repassa o `Authorization: Bearer <token>` que o cliente inclui no header

**`src/lib/api-client.ts`** é o cliente que faz as chamadas:
- `BASE_URL = '/api/proxy'`
- Token lido do `localStorage` com chave `op7nexo_token`
- Se resposta 401: limpa token e redireciona para `/login`
- Métodos: `api.get<T>(path)`, `api.post<T>(path, body)`, `api.put<T>(path, body)`, `api.delete<T>(path)`

## Como o auth funciona

### Fluxo de login

```
1. Usuário preenche email/senha na página /login
2. Front chama api.post('/auth/login', { email, senha })
   → proxy → POST http://op7nexo-api:8000/auth/login
3. API retorna { access_token: "eyJ..." }
4. api-client.ts salva token em:
   - localStorage['op7nexo_token']
   - cookie 'ws-session' (max-age 86400, SameSite=Lax)
5. Todas as requisições subsequentes incluem Authorization: Bearer <token>
```

### Verificação de sessão

`src/lib/auth-provider.tsx` (AuthContext):
- Ao montar, chama `GET /auth/me` para verificar se o token ainda é válido
- Expõe `{ usuario, loading, signIn, logout }` via contexto React
- Hook `useAuth()` em `src/hooks/use-auth.ts` consome o contexto

### JWT
- Algoritmo: `HS256`
- Expiração: 1440 minutos (24h) por padrão
- Payload: `{ sub: user_id, role: "platform_admin", workspace_id: "uuid", exp: timestamp }`

### Nota sobre `/app/api/auth/login/route.ts`
Existe um route handler de login legado que se conecta diretamente ao banco via Supabase GoTrue (`auth.users`). Este path foi parte de uma versão anterior; o fluxo atual usa o proxy para `/auth/login` do FastAPI.

## Padrão de design

O projeto usa dois sistemas visuais coexistentes:

**Glassmorphism v2.0** (novos componentes):
```css
background: var(--ws-glass-bg);
border: 1px solid var(--ws-glass-border);
border-radius: 14px;
backdrop-filter: blur(16px);
```

**Classic** (tabelas e KPI cards):
```
Primary: #0f2744 (navy)
Accent: #c9a84c (gold)
```

Tokens CSS: `var(--ws-blue)`, `var(--ws-cyan)`, `var(--ws-coral)`, `var(--ws-green)`, `var(--ws-text-1/2/3)`, `var(--ws-divider)`.

Dark mode via `next-themes` + classes `.dark` em `globals.css`.

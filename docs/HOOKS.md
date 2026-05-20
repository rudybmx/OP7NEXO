# HOOKS — op7nexo-front

Todos os hooks de dados usam **SWR 2.4.1**. Configuração padrão (`SWR_OPTS`):
- `revalidateOnFocus: false`
- `revalidateOnReconnect: false`
- `dedupingInterval: 300_000` (5 minutos)

Token JWT lido do `localStorage['op7nexo_token']` via `api-client.ts`.

---

## Hooks Meta Ads — Visão Geral

Os três hooks abaixo chamam o mesmo endpoint `/meta/insights/visao-geral` com parâmetros diferentes. Todos fazem fetch encadeado: primeiro buscam o workspace (`/workspaces`), depois chamam o endpoint de insights com `workspace_id = workspaces[0].id`.

---

### `useMetaInsights(filtros: FiltrosMeta)`

**Arquivo:** `src/hooks/use-meta-insights.ts`

**Entrada:**
```typescript
interface FiltrosMeta {
  dataInicio: string    // YYYY-MM-DD
  dataFim: string       // YYYY-MM-DD
  contaIds: string[]    // account_id externos (ex: ["act_123"])
  agrupamento: string   // "Todos os agrupamentos" ou nome do agrupamento
}
```

**O que faz:**
1. SWR `GET /workspaces` → obtém `wsId = workspaces[0].id`
2. Constrói query string com `workspace_id`, `data_inicio`, `data_fim` e opcionalmente `conta_ids` (join com vírgula)
3. SWR `GET /meta/insights/visao-geral?{params}`
4. SWR `GET /meta/insights/ia?workspace_id=&data_inicio=&data_fim=` (paralelo ao step 3)
5. Mapeia resposta para tipos TypeScript

**Retorno:**
```typescript
{
  data: MetaInsightsVisaoGeral | null,
  isLoading: boolean,
  error: any
}

interface MetaInsightsVisaoGeral {
  contas: ContaAnuncio[]       // por conta, com KPIs individuais
  dadosDiarios: DadosDiarios[] // série temporal
  topCriativos: []             // sempre vazio (não implementado)
  insightsIA: any[]            // insights do /meta/insights/ia
  periodo: { inicio: string; fim: string }
}
```

**Endpoint chamado:** `GET /meta/insights/visao-geral` + `GET /meta/insights/ia`

**Mapeamento `ContaAnuncio`:**
- `id` ← `c.id`
- `nome` ← `c.account_name || c.account_id`
- `investimento` ← `c.spend`
- `leads` ← `c.leads`
- `leadsMensagem`, `leadsCadastro`, `leadsCompra` ← `0` (não disponível neste endpoint)
- `leadsPorPlataforma` ← primeiros 5 registros de `raw.leads_por_canal` (breakdown placement)

---

### `useMetaOverview()`

**Arquivo:** `src/hooks/use-meta-overview.ts`

**Entrada:** Nenhuma. Usa mês atual calculado internamente.

**O que faz:**
1. SWR `GET /workspaces` → `wsId`
2. Calcula mês atual: `inicio = YYYY-MM-01`, `fim = YYYY-MM-DD` (hoje)
3. SWR `GET /meta/insights/visao-geral?workspace_id=&data_inicio=&data_fim=`
4. Retorna `raw.kpis` diretamente

**Retorno:**
```typescript
interface MetaOverview {
  kpis: {
    spend: number
    leads: number
    impressions: number
    reach: number
    clicks: number
    ctr: number
    cpc: number
    cpm: number
    cpl: number
  }
  financeiro: {
    saldo: 0           // não implementado
    limite: 0          // não implementado
    formaPagamento: '-'
    nomeBm: '-'
  }
  isLoading: boolean
  error: any
}
```

**Endpoint chamado:** `GET /meta/insights/visao-geral`

**Usado em:** Cards de KPI do dashboard Meta Ads.

---

### `useMetaGrafico()`

**Arquivo:** `src/hooks/use-meta-grafico.ts`

**Entrada:** Nenhuma. Usa mês atual calculado internamente.

**O que faz:**
1. SWR `GET /workspaces` → `wsId`
2. Calcula mês atual: mesmo que `useMetaOverview`
3. SWR `GET /meta/insights/visao-geral?workspace_id=&data_inicio=&data_fim=`
4. Mapeia `raw.dados_diarios` para o formato do gráfico

**Retorno:**
```typescript
{
  dados: Array<{
    data: string        // YYYY-MM-DD
    investimento: number // d.spend
    leads: number
    impressoes: number   // d.impressions ?? 0
    cliques: number      // d.clicks ?? 0
  }>,
  isLoading: boolean,
  error: any
}
```

**Endpoint chamado:** `GET /meta/insights/visao-geral`

**Usado em:** Gráfico de linha do dashboard Meta Ads.

---

## Hooks Meta Ads — Campanhas / Anúncios / Públicos / Criativos

Os hooks abaixo ainda usam Supabase RPC (legado) e fazem fallback para dados mock quando a API retorna vazio.

---

### `useMetaCampanhas(filtros, dataInicio, dataFim)`

**Arquivo:** `src/hooks/use-meta-campanhas.ts`

**Entrada:**
```typescript
interface FiltrosCampanhas {
  busca: string
  objetivo: string       // 'todos' | ObjetivoCampanha
  status: string         // 'todos' | 'ativa' | 'pausada'
  contaIds?: string[]
}
dataInicio: string  // YYYY-MM-DD
dataFim: string     // YYYY-MM-DD
```

**O que faz:**
1. SWR `rpc/get_anuncios_periodo` com `p_inicio` e `p_fim`
2. Se retorno vazio, usa `MOCK_AD_ROWS` de `lib/mock-meta-ads.ts`
3. Constrói hierarquia: linhas planas → `Campanha[]` → `ConjuntoAnuncios[]` → `Anuncio[]`
4. Aplica filtros (busca, objetivo, status)
5. Computa `ResumoCampanhas`

**Retorno:**
```typescript
{
  campanhas: Campanha[],
  resumo: ResumoCampanhas,
  insightsIA: any[],     // mock estático de lib/mock-meta-ads.ts
  isLoading: boolean,
  error: any
}
```

**Endpoint chamado:** `rpc/get_anuncios_periodo` (Supabase RPC — legado).

---

### `useMetaAnuncios(filtros, dataInicio, dataFim)`

**Arquivo:** `src/hooks/use-meta-anuncios.ts`

**Entrada:**
```typescript
interface FiltrosAnuncios {
  campanha: string        // 'todas' | nome da campanha
  status: string          // 'todos' | 'ACTIVE' | 'PAUSED'
  tipo: string            // 'todos' | 'IMAGE' | 'VIDEO' | 'CAROUSEL'
  ordenarPor: string      // 'campanha' | 'conjunto' | 'anuncio' | 'score' | 'leads' | 'cpl' | 'ctr' | 'frequencia'
  contaIds?: string[]
}
```

**O que faz:**
1. SWR `GET /meta/insights/anuncios-performance`
2. Fallback para mock se vazio
3. Mapeia a resposta paginada → `Anuncio[]`
4. Aplica filtros e ordena, incluindo a cascata `Campanha -> Conjunto -> Anúncio`

**Retorno:**
```typescript
{ anuncios: Anuncio[], total: number, isLoading: boolean, error: any }
```

**Endpoint chamado:** `GET /meta/insights/anuncios-performance`.

---

### `useMetaPublicos(filtros, dataInicio, dataFim)`

**Arquivo:** `src/hooks/use-meta-publicos.ts`

**Entrada:** `FiltrosPublicos` (não aplicado internamente — passado mas ignorado).

**O que faz:**
1. SWR `rpc/get_demograficos_periodo` → dados demográficos
2. SWR `rpc/get_geo_periodo` → dados geográficos
3. SWR `vw_meta_account_summary` → alcance e frequência média
4. Fallback para dados mock se qualquer uma retornar vazia
5. Calcula `KpiPublicos` (melhor faixa, melhor cidade, etc.)

**Retorno:**
```typescript
{
  demograficos: DadosDemograficos[],
  placements: DadosPlacement[],
  dispositivos: DadosDispositivo[],
  sistemaOperacional: DadosSO[],
  heatmapHoras: DadosHora[],
  cidades: DadosCidade[],
  kpi: KpiPublicos,
  isLoading: boolean,
  error: any
}
```

**Nota:** `placements`, `dispositivos`, `sistemaOperacional` e `heatmapHoras` são mock ou arrays vazios — os endpoints reais para esses dados não existem ainda.

**Endpoints chamados:** `rpc/get_demograficos_periodo`, `rpc/get_geo_periodo`, `vw_meta_account_summary` (todos Supabase RPC — legado).

---

### `useMetaCriativos(filtros, dataInicio, dataFim)`

**Arquivo:** `src/hooks/use-meta-criativos.ts`

**Entrada:**
```typescript
interface FiltrosCriativos {
  tipo: string         // 'todos' | 'IMAGE' | 'VIDEO' | 'CAROUSEL'
  status: string       // 'todos' | StatusCriativo
  ordenarPor: string   // 'score' | 'leads' | 'cpl' | 'hookRate' | 'holdRate' | 'diasAtivo'
  contaIds?: string[]
}
```

**O que faz:**
1. SWR `rpc/get_criativos_periodo`
2. Fallback para mock se vazio
3. Mapeia → `Criativo[]`
4. Filtra e ordena

**Retorno:**
```typescript
{ criativos: Criativo[], total: number, isLoading: boolean, error: any }
```

**Endpoint chamado:** `rpc/get_criativos_periodo` (Supabase RPC — legado).

---

## Outros hooks relevantes

### `useAuth()`

**Arquivo:** `src/hooks/use-auth.ts`

Consome `AuthContext` de `src/lib/auth-provider.tsx`.

**Retorno:**
```typescript
{
  usuario: { id, nome, email, role } | null,
  loading: boolean,
  signIn: (email, senha) => Promise<void>,
  logout: () => void
}
```

---

### Hooks legados (ainda em uso em outras seções)

| Hook | Arquivo | Fonte de dados |
|---|---|---|
| `useMetaGoogleVisaoGeral` | `use-google-visao-geral.ts` | Supabase RPC (mock fallback) |
| `useGoogleCampanhas` | `use-google-campanhas.ts` | Supabase RPC (mock fallback) |
| `useGoogleAnuncios` | `use-google-anuncios.ts` | Supabase RPC (mock fallback) |
| `useInsightsIA` | `use-insights-ia.ts` | Supabase RPC (mock fallback) |
| `useCrmConversas` | `use-crm-conversas.ts` | Supabase RPC |
| `useNps` | `use-nps.ts` | Supabase RPC |

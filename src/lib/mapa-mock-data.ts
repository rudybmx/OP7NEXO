import { createChildNode, createRootNode, generateEdgeId } from '@/lib/mapa-utils'
import type { MindMap, MapaEdge, MapaNode } from '@/types/mapa'

interface TreeItem {
  label: string
  children?: TreeItem[]
}

function buildMapNodes(rootLabel: string, tree: TreeItem[]): { nodes: MapaNode[]; edges: MapaEdge[] } {
  const root = createRootNode(rootLabel)
  const nodes: MapaNode[] = [root]
  const edges: MapaEdge[] = []

  const walk = (parentNode: MapaNode, items: TreeItem[]) => {
    items.forEach((item) => {
      const child = createChildNode(parentNode.id, parentNode.data.level, item.label)
      nodes.push(child)
      edges.push({
        id: generateEdgeId(parentNode.id, child.id),
        source: parentNode.id,
        target: child.id,
        type: 'smoothstep',
        animated: false,
      })

      if (item.children?.length) {
        walk(child, item.children)
      }
    })
  }

  walk(root, tree)

  return { nodes, edges }
}

function buildMap(
  clientId: string,
  clientName: string,
  title: string,
  createdAt: string,
  createdBy: string,
  rootLabel: string,
  tree: TreeItem[],
  description?: string
): MindMap {
  const { nodes, edges } = buildMapNodes(rootLabel, tree)
  return {
    id: `${clientId}-${title.toLowerCase().replace(/\s+/g, '-')}`,
    clientId,
    clientName,
    title,
    description,
    createdAt,
    updatedAt: createdAt,
    createdBy,
    nodes,
    edges,
  }
}

export const mindMaps: MindMap[] = [
  buildMap(
    'oc-rj-barra',
    'ODC RJ BARRA DA TIJUCA',
    'Estratégia Q2 2026',
    '2026-04-10',
    'Fernanda Reis',
    'Estratégia Q2',
    [
      {
        label: 'Meta Ads',
        children: [
          { label: 'Awareness', children: [{ label: 'Reels 15s' }, { label: 'Stories carousel' }] },
          { label: 'Conversão', children: [{ label: 'Lead form' }, { label: 'WhatsApp CTA' }] },
        ],
      },
      { label: 'Google Ads', children: [{ label: 'Search branded' }, { label: 'Display retargeting' }] },
      {
        label: 'Conteúdo Orgânico',
        children: [
          { label: 'Instagram', children: [{ label: 'Feed 3x/semana' }, { label: 'Stories diário' }] },
          { label: 'TikTok', children: [{ label: '2 vídeos/semana' }] },
        ],
      },
    ]
  ),
  buildMap(
    'oc-rj-barra',
    'ODC RJ BARRA DA TIJUCA',
    'Posicionamento de Marca',
    '2026-03-02',
    'Ana Lima',
    'OdontoCompany Barra',
    [
      { label: 'Pilares', children: [{ label: 'Confiança' }, { label: 'Resultados' }, { label: 'Experiência' }] },
      {
        label: 'Tom de Voz',
        children: [{ label: 'Acolhedor' }, { label: 'Técnico mas acessível' }, { label: 'Aspiracional' }],
      },
      { label: 'Público-Alvo', children: [{ label: 'Mulheres 28-45' }, { label: 'Classe A/B' }, { label: 'Interesse em bem-estar' }] },
    ]
  ),
  buildMap(
    'oc-ribeirao',
    'ODC RIBEIRÃO PRETO',
    'Campanhas de Giro Rápido',
    '2026-04-05',
    'Marcos Dutra',
    'Giro Rápido 2026',
    [
      { label: 'Meta Ads', children: [{ label: 'Ofertas semanais' }, { label: 'Catálogo dinâmico' }] },
      { label: 'Google Ads', children: [{ label: 'Search peças urgentes' }, { label: 'Performance Max oficinas' }] },
      { label: 'CRM', children: [{ label: 'WhatsApp reativação' }, { label: 'Lista VIP lojistas' }] },
    ]
  ),
  buildMap(
    'oc-ararangua',
    'ODC ARARANGUÁ',
    'Calendário de Captação',
    '2026-04-08',
    'Ana Lima',
    'Captação 2026',
    [
      { label: 'Matrículas', children: [{ label: 'Open Day' }, { label: 'Bolsas' }, { label: 'Retargeting visitas' }] },
      { label: 'Conteúdo', children: [{ label: 'Vida escolar' }, { label: 'Resultados pedagógicos' }] },
      { label: 'Relacionamento', children: [{ label: 'Pais atuais' }, { label: 'Leads frios' }] },
    ]
  ),
  buildMap(
    'oc-jaguare',
    'ODC JAGUARÉ',
    'Lançamentos Premium',
    '2026-04-10',
    'Juliana Park',
    'Lançamentos Jaguare',
    [
      { label: 'Meta Ads', children: [{ label: 'Vídeo tour' }, { label: 'Lead form' }, { label: 'Remarketing' }] },
      { label: 'LinkedIn Ads', children: [{ label: 'Investidores' }, { label: 'Executivos relocation' }] },
      { label: 'Corretoria', children: [{ label: 'Script comercial' }, { label: 'Follow-up WhatsApp' }] },
    ]
  ),
  buildMap(
    'oc-rio-negrinho',
    'ODC RIO NEGRINHO - SC',
    'Análise de Concorrência',
    '2026-02-26',
    'Fernanda Reis',
    'Concorrência Regional',
    [
      { label: 'Preço', children: [{ label: 'Compactos' }, { label: 'Premium' }] },
      { label: 'Posicionamento', children: [{ label: 'Luxo' }, { label: 'Investimento' }, { label: 'Família' }] },
      { label: 'Canais', children: [{ label: 'Portais' }, { label: 'Meta Ads' }, { label: 'Google' }] },
    ]
  ),
]

export const mapaClients = Array.from(
  new Map(mindMaps.map((map) => [map.clientId, { id: map.clientId, name: map.clientName }])).values()
)

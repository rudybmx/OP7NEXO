'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import MapaHeader from '@/components/demandas/mapa/MapaHeader'
import MapaMapList from '@/components/demandas/mapa/MapaMapList'
import { Toaster } from '@/components/ui/sonner'
import { mapaClients, mindMaps } from '@/lib/mapa-mock-data'
import { createRootNode } from '@/lib/mapa-utils'
import type { MindMap, MapaState } from '@/types/mapa'

const ReactFlowCanvas = dynamic(() => import('@/components/demandas/mapa/MapaCanvas'), {
  ssr: false,
  loading: () => <div className="flex-1 bg-muted/20 animate-pulse" />,
})

export default function Page() {
  const [maps, setMaps] = useState<MindMap[]>(mindMaps)
  const [selectedClientId, setSelectedClientId] = useState<string>(mapaClients[0]?.id ?? '')
  const [selectedMapId, setSelectedMapId] = useState<string>(mindMaps[0]?.id ?? '')
  const [isMapListOpen, setIsMapListOpen] = useState(false)
  const [exportRequestId, setExportRequestId] = useState(0)

  const clientMaps = useMemo(
    () => maps.filter((map) => map.clientId === selectedClientId),
    [maps, selectedClientId]
  )

  const selectedMap = useMemo(
    () => clientMaps.find((map) => map.id === selectedMapId) ?? clientMaps[0],
    [clientMaps, selectedMapId]
  )

  useEffect(() => {
    if (!clientMaps.some((map) => map.id === selectedMapId) && clientMaps[0]) {
      setSelectedMapId(clientMaps[0].id)
    }
  }, [clientMaps, selectedMapId])

  function handleClientChange(clientId: string) {
    const nextClientMaps = maps.filter((map) => map.clientId === clientId)
    setSelectedClientId(clientId)
    setSelectedMapId(nextClientMaps[0]?.id ?? '')
  }

  function handleNewMap() {
    const title = window.prompt('Nome do novo mapa', 'Novo mapa estratégico')
    if (!title) return
    const root = createRootNode(title)
    const newMap: MindMap = {
      id: `${selectedClientId}-${Date.now()}`,
      clientId: selectedClientId,
      clientName: mapaClients.find((client) => client.id === selectedClientId)?.name ?? '',
      title,
      description: '',
      createdAt: '2026-05-07',
      updatedAt: '2026-05-07',
      createdBy: 'Ana Lima',
      nodes: [root],
      edges: [],
    }
    setMaps((current) => [...current, newMap])
    setSelectedMapId(newMap.id)
  }

  function handleDeleteMap(mapId: string) {
    const shouldDelete = window.confirm('Excluir este mapa?')
    if (!shouldDelete) return

    setMaps((current) => current.filter((map) => map.id !== mapId))
    if (selectedMapId === mapId) {
      const nextMaps = clientMaps.filter((map) => map.id !== mapId)
      setSelectedMapId(nextMaps[0]?.id ?? '')
    }
  }

  function handleRenameMap(mapId: string) {
    const target = maps.find((map) => map.id === mapId)
    if (!target) return
    const title = window.prompt('Renomear mapa', target.title)
    if (!title) return
    setMaps((current) =>
      current.map((map) =>
        map.id === mapId
          ? {
              ...map,
              title,
              updatedAt: '2026-05-07',
            }
          : map
      )
    )
  }

  function handleSaveMap(mapId: string, state: MapaState) {
    setMaps((current) =>
      current.map((map) =>
        map.id === mapId
          ? {
              ...map,
              nodes: state.nodes,
              edges: state.edges,
              updatedAt: '2026-05-07',
            }
          : map
      )
    )
  }

  if (!selectedMap) {
    return null
  }

  return (
    <div className="flex h-[calc(100vh-var(--header-height))] flex-col">
      <Toaster />

      <MapaHeader
        clients={mapaClients}
        selectedClientId={selectedClientId}
        onClientChange={handleClientChange}
        maps={clientMaps}
        selectedMapId={selectedMapId}
        onMapChange={setSelectedMapId}
        onNewMap={handleNewMap}
        onExportPNG={() => setExportRequestId((current) => current + 1)}
        onOpenMapList={() => setIsMapListOpen(true)}
      />

      <ReactFlowCanvas
        key={selectedMap.id}
        selectedMap={selectedMap}
        exportRequestId={exportRequestId}
        onSaveMap={handleSaveMap}
      />

      <MapaMapList
        open={isMapListOpen}
        onClose={() => setIsMapListOpen(false)}
        maps={clientMaps}
        clientName={selectedMap.clientName}
        selectedMapId={selectedMapId}
        onSelectMap={setSelectedMapId}
        onNewMap={handleNewMap}
        onDeleteMap={handleDeleteMap}
        onRenameMap={handleRenameMap}
      />
    </div>
  )
}

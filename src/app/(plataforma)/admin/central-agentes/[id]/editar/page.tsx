import { AgenteForm } from '@/components/admin/central-agentes/agente-form'

export default async function EditarAgenteRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ws?: string | string[] }>
}) {
  const { id } = await params
  const sp = await searchParams
  const ws = typeof sp.ws === 'string' ? sp.ws : undefined
  return <AgenteForm agenteId={id} wsParam={ws} />
}

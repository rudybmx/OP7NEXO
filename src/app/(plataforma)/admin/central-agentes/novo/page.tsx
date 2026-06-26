import { AgenteForm } from '@/components/admin/central-agentes/agente-form'

export default async function NovoAgenteRoute({ searchParams }: { searchParams: Promise<{ ws?: string | string[] }> }) {
  const sp = await searchParams
  const ws = typeof sp.ws === 'string' ? sp.ws : undefined
  return <AgenteForm wsParam={ws} />
}

import { AgendarCliente } from '@/components/agendar/agendar-cliente'

export const metadata = {
  title: 'Agendar horário',
}

export default async function AgendarRoute({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <AgendarCliente token={token} />
}

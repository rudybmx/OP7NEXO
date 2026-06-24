import { ConectarCliente } from '@/components/conectar/conectar-cliente'

export const metadata = {
  title: 'Conectar WhatsApp',
}

export default async function ConectarRoute({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ConectarCliente token={token} />
}

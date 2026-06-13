import { ClienteForm } from '@/components/administracao/clientes/cliente-form'

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ClienteForm clienteId={id} />
}

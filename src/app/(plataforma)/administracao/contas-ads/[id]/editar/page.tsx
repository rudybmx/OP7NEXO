import { EditarContaPage } from '@/components/administracao/contas-ads/editar-conta-page'

export default async function EditarContaRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <EditarContaPage contaId={id} />
}

import { EditarUsuarioForm } from '@/components/administracao/usuarios/editar-usuario-form'

export default async function EditarUsuarioRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <EditarUsuarioForm userId={id} />
}

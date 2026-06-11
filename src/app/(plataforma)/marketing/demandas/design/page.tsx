import { redirect } from 'next/navigation'

// Estúdio de Criativos migrou para Marketing › Estúdio AI › Criativos.
// Mantém a URL antiga funcionando (bookmarks) redirecionando para o novo lar.
export default function Page() {
  redirect('/marketing/estudio-ai/criativos')
}

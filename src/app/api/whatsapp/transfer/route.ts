import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(req)
    if (access instanceof Response) return access

    // 2. Parse e validacao do body
    const body = await req.json()
    const conversaId = body?.conversaId
    const novoResponsavelId = body?.novoResponsavelId
    const novaEquipeId = body?.novaEquipeId || null

    if (!conversaId || !novoResponsavelId) {
      return NextResponse.json(
        { error: 'conversaId e novoResponsavelId sao obrigatorios' },
        { status: 400 }
      )
    }

    const db = getSql()

    // 3. Buscar conversa atual para obter dados anteriores e verificar existencia
    const conversas = await db`
      SELECT id, workspace_id, equipe_id, responsavel_id, historico_transferencias
      FROM public.crm_whatsapp_conversas
      WHERE id = ${conversaId}::uuid
    `

    if (conversas.length === 0) {
      return NextResponse.json(
        { error: 'Conversa nao encontrada' },
        { status: 404 }
      )
    }

    const conversa = conversas[0]
    const oldResponsavelId = conversa.responsavel_id
    const oldEquipeId = conversa.equipe_id
    const workspaceId = conversa.workspace_id

    if (!access.allowedWorkspaceIds.has(workspaceId)) {
      return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
    }

    const responsavel = await db`
      SELECT 1
      FROM public.users
      WHERE id = ${novoResponsavelId}::uuid
        AND workspace_id = ${workspaceId}::uuid
        AND ativo = true
      LIMIT 1
    `
    if (responsavel.length === 0) {
      return NextResponse.json({ error: 'Novo responsavel nao pertence ao workspace da conversa' }, { status: 400 })
    }

    if (novaEquipeId) {
      const equipeDestino = await db`
        SELECT 1 FROM public.crm_whatsapp_equipes
        WHERE id = ${novaEquipeId}::uuid
          AND workspace_id = ${workspaceId}::uuid
        LIMIT 1
      `
      if (equipeDestino.length === 0) {
        return NextResponse.json({ error: 'Equipe destino nao pertence ao workspace da conversa' }, { status: 400 })
      }
    }

    // Nao transferir para o mesmo responsavel se nada mais mudar
    if (oldResponsavelId === novoResponsavelId && (!novaEquipeId || oldEquipeId === novaEquipeId)) {
      return NextResponse.json(
        { error: 'Transferencia sem alteracoes: mesmo responsavel e mesma equipe' },
        { status: 400 }
      )
    }

    // 4. Permissao (Fase 1): atendente (company_agent) só transfere as DELE;
    //    todos os outros papéis transferem qualquer uma. Substitui o gating antigo
    //    por admin-de-equipe, que travava TODOS (há 0 equipes cadastradas).
    if (access.user.role === 'company_agent' && oldResponsavelId !== access.user.id) {
      return NextResponse.json(
        { error: 'Sem permissao para transferir esta conversa' },
        { status: 403 }
      )
    }

    // 5. Montar entrada do historico
    const entradaTransferencia = {
      de: oldResponsavelId,
      para: novoResponsavelId,
      de_equipe: oldEquipeId,
      para_equipe: novaEquipeId,
      quando: new Date().toISOString(),
      transferido_por: access.user.id,
    }

    // 6. Atualizar conversa (query condicional para novaEquipeId opcional)
    const jsonTransferencia = JSON.stringify(entradaTransferencia)

    const updated = novaEquipeId
      ? await db`
          UPDATE public.crm_whatsapp_conversas
          SET
            responsavel_id = ${novoResponsavelId}::uuid,
            ai_ativo = false,
            equipe_id = ${novaEquipeId}::uuid,
            historico_transferencias = historico_transferencias || ${jsonTransferencia}::jsonb,
            updated_at = NOW()
          WHERE id = ${conversaId}::uuid
          RETURNING
            id::text,
            equipe_id::text,
            responsavel_id::text,
            historico_transferencias,
            updated_at
        `
      : await db`
          UPDATE public.crm_whatsapp_conversas
          SET
            responsavel_id = ${novoResponsavelId}::uuid,
            ai_ativo = false,
            historico_transferencias = historico_transferencias || ${jsonTransferencia}::jsonb,
            updated_at = NOW()
          WHERE id = ${conversaId}::uuid
          RETURNING
            id::text,
            equipe_id::text,
            responsavel_id::text,
            historico_transferencias,
            updated_at
        `

    if (updated.length === 0) {
      return NextResponse.json(
        { error: 'Falha ao atualizar conversa' },
        { status: 500 }
      )
    }

    const resultado = updated[0]

    return NextResponse.json({
      ok: true,
      conversa: {
        id: resultado.id,
        equipe_id: resultado.equipe_id,
        responsavel_id: resultado.responsavel_id,
        historico_transferencias: resultado.historico_transferencias,
      },
      transferencia: entradaTransferencia,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/transfer] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

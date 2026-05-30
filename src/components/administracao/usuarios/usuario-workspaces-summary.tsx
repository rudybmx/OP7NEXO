'use client'

import { Building2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { WorkspaceAccessApiRow } from '@/lib/admin-users-edit'

interface UsuarioWorkspacesSummaryProps {
  workspaces: WorkspaceAccessApiRow[]
}

const WORKSPACE_ROLE_LABELS: Record<string, string> = {
  viewer: 'Viewer',
  editor: 'Editor',
  admin: 'Admin',
}

function formatWorkspaceRole(role: string): string {
  return WORKSPACE_ROLE_LABELS[role.toLowerCase()] ?? role
}

export function UsuarioWorkspacesSummary({ workspaces }: UsuarioWorkspacesSummaryProps) {
  const total = workspaces.length

  if (total === 0) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ws-text-2)' }}>
        <Building2 size={13} style={{ color: 'var(--ws-text-3)' }} />
        Sem workspace
      </span>
    )
  }

  const summary = total === 1 ? '1 workspace' : `${total} workspaces`

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: 999,
              border: '1px solid rgba(62,91,255,0.18)',
              background: 'rgba(62,91,255,0.10)',
              color: 'var(--ws-blue)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Building2 size={13} />
            {summary}
          </button>
        </TooltipTrigger>
        <TooltipContent
          sideOffset={8}
          align="start"
          style={{
            display: 'block',
            minWidth: 280,
            maxWidth: 380,
            padding: 12,
            borderRadius: 10,
            background: 'rgba(14,20,42,0.96)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#ffffff',
            boxShadow: '0 12px 32px rgba(14,20,42,0.28)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {workspaces.map((workspace, index) => (
              <div
                key={workspace.workspace_id}
                style={{
                  paddingBottom: index === workspaces.length - 1 ? 0 : 10,
                  borderBottom: index === workspaces.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
                  {workspace.workspace_nome || workspace.workspace_id}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.10)',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {formatWorkspaceRole(workspace.role)}
                  </span>
                  {workspace.padrao && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: 'rgba(201,168,76,0.20)',
                        color: '#f5d27b',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      Padrão
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

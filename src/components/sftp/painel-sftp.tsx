'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSftp, type SftpCredentials, type SftpEntry } from '@/hooks/use-sftp'
import { FormConexao } from './form-conexao'
import { BrowserLocal } from './browser-local'
import { BrowserRemoto } from './browser-remoto'
import { FilaTransferencias } from './fila-transferencias'
import { LogOut, Server } from 'lucide-react'

export function PainelSftp() {
  const {
    status,
    session,
    erro,
    transfers,
    conectar,
    desconectar,
    listar,
    enviar,
    baixar,
    criarPasta,
    remover,
    renomear,
    limparTransfers,
  } = useSftp()

  const [path, setPath] = useState<string>('/')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [erroList, setErroList] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    if (!session) return
    setLoadingList(true)
    setErroList(null)
    try {
      const list = await listar(path)
      setEntries(list)
    } catch (e: any) {
      setErroList(e?.message || 'Erro ao listar')
      setEntries([])
    } finally {
      setLoadingList(false)
    }
  }, [session, path, listar])

  useEffect(() => {
    if (session && path === '/') {
      setPath(session.home || '/')
    }
  }, [session])

  useEffect(() => {
    if (session) recarregar()
  }, [session, path, recarregar])

  const handleConectar = async (creds: SftpCredentials) => {
    const info = await conectar(creds)
    setPath(info.home || '/')
  }

  const handleEnviar = async (files: File[]) => {
    for (const f of files) {
      try {
        await enviar(f, path)
      } catch {
        // erro já capturado no transfer
      }
    }
    recarregar()
  }

  const handleRemover = async (entry: SftpEntry) => {
    try {
      await remover(entry.path, entry.type === 'dir')
      recarregar()
    } catch (e: any) {
      window.alert(e?.message || 'Erro ao remover')
    }
  }

  const handleBaixar = async (entry: SftpEntry) => {
    try {
      await baixar(entry.path)
    } catch (e: any) {
      window.alert(e?.message || 'Erro ao baixar')
    }
  }

  const handleRenomear = async (entry: SftpEntry, novoNome: string) => {
    const parent = entry.path.slice(0, entry.path.lastIndexOf('/')) || '/'
    const novoPath = parent === '/' ? '/' + novoNome : parent + '/' + novoNome
    try {
      await renomear(entry.path, novoPath)
      recarregar()
    } catch (e: any) {
      window.alert(e?.message || 'Erro ao renomear')
    }
  }

  const handleCriarPasta = async (fullPath: string) => {
    try {
      await criarPasta(fullPath)
    } catch (e: any) {
      window.alert(e?.message || 'Erro ao criar pasta')
    }
  }

  if (status !== 'connected' || !session) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Arquivos (SFTP)</h1>
          <p className="text-sm text-muted-foreground">
            Gerenciador de arquivos remoto estilo Termius — transfira arquivos entre seu PC e servidores via SSH
          </p>
        </header>
        <FormConexao onConectar={handleConectar} conectando={status === 'connecting'} erro={erro} />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-0 flex-col gap-3">
      <header className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <div className="text-sm">
            <span className="font-semibold">{session.username}@{session.host}</span>
            <span className="text-muted-foreground">:{session.port}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={desconectar}>
          <LogOut className="h-4 w-4" />
          Desconectar
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <BrowserLocal destinoRemoto={path} onEnviar={handleEnviar} />
        <BrowserRemoto
          path={path}
          onPathChange={setPath}
          entries={entries}
          loading={loadingList}
          erro={erroList}
          onRecarregar={recarregar}
          onCriarPasta={handleCriarPasta}
          onRemover={handleRemover}
          onBaixar={handleBaixar}
          onRenomear={handleRenomear}
        />
      </div>

      <FilaTransferencias transfers={transfers} onLimpar={limparTransfers} />
    </div>
  )
}

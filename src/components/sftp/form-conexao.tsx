'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  loadSavedConnections,
  removeSavedConnection,
  saveConnection,
  type SftpCredentials,
  type SftpSavedConnection,
} from '@/hooks/use-sftp'
import { Trash2, Key, Lock } from 'lucide-react'

interface Props {
  onConectar: (creds: SftpCredentials, saved?: SftpSavedConnection) => Promise<void>
  conectando: boolean
  erro: string | null
}

export function FormConexao({ onConectar, conectando, erro }: Props) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>('password')
  const [saved, setSaved] = useState<SftpSavedConnection[]>(loadSavedConnections())
  const [label, setLabel] = useState('')
  const [salvar, setSalvar] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const creds: SftpCredentials = {
      host: host.trim(),
      port: Number(port),
      username: username.trim(),
    }
    if (authMethod === 'password') creds.password = password
    else {
      creds.private_key = privateKey
      if (passphrase) creds.private_key_passphrase = passphrase
    }

    const savedConn: SftpSavedConnection | undefined = salvar
      ? {
          id: `${creds.username}@${creds.host}:${creds.port}`,
          label: label.trim() || `${creds.username}@${creds.host}`,
          host: creds.host,
          port: creds.port,
          username: creds.username,
        }
      : undefined

    await onConectar(creds, savedConn)
    if (savedConn) {
      saveConnection(savedConn)
      setSaved(loadSavedConnections())
    }
  }

  const usarSalva = (s: SftpSavedConnection) => {
    setHost(s.host)
    setPort(String(s.port))
    setUsername(s.username)
    setLabel(s.label)
  }

  const apagarSalva = (id: string) => {
    removeSavedConnection(id)
    setSaved(loadSavedConnections())
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <h2 className="text-lg font-semibold">Nova conexão SFTP</h2>
          <p className="text-sm text-muted-foreground">Conecte-se a um servidor remoto via SSH/SFTP</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Host</label>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="api.op7franquia.com.br" required autoComplete="off" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Porta</label>
            <Input value={port} onChange={(e) => setPort(e.target.value)} type="number" min={1} max={65535} required />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Usuário</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" required autoComplete="off" />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAuthMethod('password')}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              authMethod === 'password' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <Lock className="h-4 w-4" /> Senha
          </button>
          <button
            type="button"
            onClick={() => setAuthMethod('key')}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              authMethod === 'key' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <Key className="h-4 w-4" /> Chave privada
          </button>
        </div>

        {authMethod === 'password' ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Senha</label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="new-password" />
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Chave privada (cole o conteúdo)</label>
              <Textarea
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                rows={6}
                className="font-mono text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Passphrase (opcional)</label>
              <Input value={passphrase} onChange={(e) => setPassphrase(e.target.value)} type="password" autoComplete="new-password" />
            </div>
          </>
        )}

        <div className="flex items-center gap-2">
          <input
            id="salvar-conn"
            type="checkbox"
            checked={salvar}
            onChange={(e) => setSalvar(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="salvar-conn" className="text-sm text-muted-foreground">
            Salvar conexão (sem senha)
          </label>
          {salvar && (
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Rótulo opcional"
              className="ml-2 h-7"
            />
          )}
        </div>

        {erro && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </div>
        )}

        <Button type="submit" disabled={conectando} className="w-full">
          {conectando ? 'Conectando…' : 'Conectar'}
        </Button>
      </form>

      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Conexões salvas</h3>
        {saved.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma conexão salva ainda</p>
        ) : (
          <ul className="space-y-2">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-2 text-sm">
                <button onClick={() => usarSalva(s)} className="min-w-0 flex-1 text-left hover:text-primary">
                  <div className="truncate font-medium">{s.label}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.username}@{s.host}:{s.port}
                  </div>
                </button>
                <Button variant="ghost" size="icon-xs" onClick={() => apagarSalva(s.id)} title="Remover">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

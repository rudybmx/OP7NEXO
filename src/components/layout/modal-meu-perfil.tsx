'use client'

import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, User, Lock, Check, AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api-client'

interface ModalMeuPerfilProps {
  aberto: boolean
  onFechar: () => void
}

const BRAND_PRIMARY = '#3E5BFF'
const BRAND_SECONDARY = '#7A5AF8'

function getIniciais(nome: string): string {
  return nome.trim().split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase()
}

function inputStyle(focus: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${focus ? 'rgba(62,91,255,0.50)' : 'rgba(255,255,255,0.10)'}`,
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 150ms',
  }
}

export function ModalMeuPerfil({ aberto, onFechar }: ModalMeuPerfilProps) {
  const { user, reloadUser } = useAuth()

  // Dados do perfil
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [perfilFocus, setPerfilFocus] = useState<string | null>(null)
  const [perfilStatus, setPerfilStatus] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [perfilLoading, setPerfilLoading] = useState(false)

  // Troca de senha
  const [senhaNova, setSenhaNova] = useState('')
  const [senhaConfirm, setSenhaConfirm] = useState('')
  const [senhaFocus, setSenhaFocus] = useState<string | null>(null)
  const [senhaStatus, setSenhaStatus] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [senhaLoading, setSenhaLoading] = useState(false)

  useEffect(() => {
    if (aberto && user) {
      setNome(user.nome)
      setEmail(user.email)
      setPerfilStatus(null)
      setSenhaStatus(null)
      setSenhaNova('')
      setSenhaConfirm('')
    }
  }, [aberto, user])

  async function salvarPerfil() {
    if (!user) return
    if (!nome.trim()) { setPerfilStatus({ tipo: 'erro', msg: 'Nome é obrigatório.' }); return }
    if (!email.trim()) { setPerfilStatus({ tipo: 'erro', msg: 'E-mail é obrigatório.' }); return }
    setPerfilLoading(true)
    setPerfilStatus(null)
    try {
      await api.put(`/users/${user.id}`, { nome: nome.trim(), email: email.trim() })
      await reloadUser()
      setPerfilStatus({ tipo: 'ok', msg: 'Perfil atualizado com sucesso.' })
    } catch (err) {
      setPerfilStatus({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro ao salvar.' })
    } finally {
      setPerfilLoading(false)
    }
  }

  async function salvarSenha() {
    if (!user) return
    if (senhaNova.length < 6) { setSenhaStatus({ tipo: 'erro', msg: 'A senha deve ter ao menos 6 caracteres.' }); return }
    if (senhaNova !== senhaConfirm) { setSenhaStatus({ tipo: 'erro', msg: 'As senhas não coincidem.' }); return }
    setSenhaLoading(true)
    setSenhaStatus(null)
    try {
      await api.put(`/users/${user.id}`, { senha: senhaNova })
      setSenhaNova('')
      setSenhaConfirm('')
      setSenhaStatus({ tipo: 'ok', msg: 'Senha alterada com sucesso.' })
    } catch (err) {
      setSenhaStatus({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro ao alterar senha.' })
    } finally {
      setSenhaLoading(false)
    }
  }

  const iniciais = user ? getIniciais(user.nome) : '?'

  return (
    <Dialog.Root open={aberto} onOpenChange={open => { if (!open) onFechar() }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.60)',
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 150ms ease',
        }} />
        <Dialog.Content style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          width: '100%', maxWidth: 440,
          background: 'linear-gradient(160deg, #0d1b36 0%, #0a1228 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 14,
          padding: '24px 24px 28px',
          outline: 'none',
          boxShadow: '0 20px 60px rgba(0,0,0,0.50)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: `linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_SECONDARY})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff',
              }}>
                {iniciais}
              </div>
              <div>
                <Dialog.Title style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>
                  Meu Perfil
                </Dialog.Title>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{user?.email}</p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.40)', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center',
              }}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Seção: Dados do perfil */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <User size={13} style={{ color: BRAND_PRIMARY }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Dados do perfil
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 5 }}>Nome</label>
                <input
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  onFocus={() => setPerfilFocus('nome')}
                  onBlur={() => setPerfilFocus(null)}
                  style={inputStyle(perfilFocus === 'nome')}
                  placeholder="Seu nome completo"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 5 }}>E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setPerfilFocus('email')}
                  onBlur={() => setPerfilFocus(null)}
                  style={inputStyle(perfilFocus === 'email')}
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            {perfilStatus && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
                fontSize: 12, color: perfilStatus.tipo === 'ok' ? '#4ade80' : '#f87171',
              }}>
                {perfilStatus.tipo === 'ok' ? <Check size={13} /> : <AlertCircle size={13} />}
                {perfilStatus.msg}
              </div>
            )}

            <button
              onClick={salvarPerfil}
              disabled={perfilLoading}
              style={{
                marginTop: 14, width: '100%', padding: '9px 0',
                borderRadius: 8, border: 'none', cursor: perfilLoading ? 'not-allowed' : 'pointer',
                background: perfilLoading ? 'rgba(62,91,255,0.40)' : `linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_SECONDARY})`,
                color: '#fff', fontSize: 13, fontWeight: 600,
              }}
            >
              {perfilLoading ? 'Salvando…' : 'Salvar perfil'}
            </button>
          </section>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '22px 0' }} />

          {/* Seção: Trocar senha */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <Lock size={13} style={{ color: BRAND_PRIMARY }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Trocar senha
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 5 }}>Nova senha</label>
                <input
                  type="password"
                  value={senhaNova}
                  onChange={e => setSenhaNova(e.target.value)}
                  onFocus={() => setSenhaFocus('nova')}
                  onBlur={() => setSenhaFocus(null)}
                  style={inputStyle(senhaFocus === 'nova')}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 5 }}>Confirmar nova senha</label>
                <input
                  type="password"
                  value={senhaConfirm}
                  onChange={e => setSenhaConfirm(e.target.value)}
                  onFocus={() => setSenhaFocus('confirm')}
                  onBlur={() => setSenhaFocus(null)}
                  style={inputStyle(senhaFocus === 'confirm')}
                  placeholder="Repita a nova senha"
                />
              </div>
            </div>

            {senhaStatus && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
                fontSize: 12, color: senhaStatus.tipo === 'ok' ? '#4ade80' : '#f87171',
              }}>
                {senhaStatus.tipo === 'ok' ? <Check size={13} /> : <AlertCircle size={13} />}
                {senhaStatus.msg}
              </div>
            )}

            <button
              onClick={salvarSenha}
              disabled={senhaLoading}
              style={{
                marginTop: 14, width: '100%', padding: '9px 0',
                borderRadius: 8, border: '1px solid rgba(255,255,255,0.10)',
                cursor: senhaLoading ? 'not-allowed' : 'pointer',
                background: 'rgba(255,255,255,0.05)',
                color: senhaLoading ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.80)',
                fontSize: 13, fontWeight: 600,
              }}
            >
              {senhaLoading ? 'Salvando…' : 'Alterar senha'}
            </button>
          </section>

          <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

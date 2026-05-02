'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, User, Mail, Shield, Building2, Key, Loader2, ArrowLeft } from 'lucide-react'
import { apiGet, apiFetch } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'

interface OrgRow {
  id: string
  nome: string
  slug: string
}

export default function NovoUsuarioPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [orgId, setOrgId] = useState('')
  const [nivel, setNivel] = useState('2')
  const [orgs, setOrgs] = useState<OrgRow[]>([])

  const [carregando, setCarregando] = useState(false)
  const [carregandoOrgs, setCarregandoOrgs] = useState(true)

  useEffect(() => {
    if (!authLoading && user && user.level !== 0) {
      router.push('/')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    async function loadOrgs() {
      try {
        const data = await apiGet<OrgRow[]>('/admin/organizacoes')
        setOrgs(data)
        if (data.length > 0 && !orgId) {
          setOrgId(data[0].id)
        }
      } catch {
        setOrgs([])
      } finally {
        setCarregandoOrgs(false)
      }
    }
    if (user && user.level === 0) {
      loadOrgs()
    }
  }, [user])

  if (authLoading || (!user || user.level !== 0)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '60vh', gap: 16,
      }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue, #3E5BFF)' }} />
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Verificando permissoes...</span>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !senha) {
      toast.error('Email e senha sao obrigatorios')
      return
    }
    if (senha.length < 6) {
      toast.error('Senha deve ter no minimo 6 caracteres')
      return
    }

    setCarregando(true)
    try {
      const token = getToken()
      await apiFetch('/admin/usuarios', {
        email,
        password: senha,
        nome,
        org_id: orgId || undefined,
        nivel: Number(nivel),
      }, token)

      toast.success('Usuario criado com sucesso!')
      router.push('/admin/usuarios')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar usuario')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px', width: '100%' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button 
          onClick={() => router.back()}
          style={{
            background: 'var(--ws-glass-bg)',
            border: '1px solid var(--ws-glass-border)',
            borderRadius: '10px',
            width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
            backdropFilter: 'blur(10px)',
            color: 'var(--ws-text-1)'
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            Cadastrar Acesso
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0 0' }}>
            Crie uma nova conta de usuario na plataforma
          </p>
        </div>
      </div>

      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: 'var(--ws-glass-shadow-md)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)'
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20 }}>
            <div>
              <label style={labelStyle}>Nome do Colaborador</label>
              <div style={inputWrapperStyle}>
                <User size={15} style={iconStyle} />
                <input 
                  type="text" 
                  value={nome} onChange={e => setNome(e.target.value)}
                  placeholder="Ex: Ana Gabriela Machado" 
                  style={inputStyle} 
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Email <span style={{color:'#ef4444'}}>*</span></label>
              <div style={inputWrapperStyle}>
                <Mail size={15} style={iconStyle} />
                <input 
                  type="email" 
                  value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="ana@clinica.com.br" 
                  style={inputStyle} 
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20 }}>
            <div>
              <label style={labelStyle}>Senha Inicial <span style={{color:'#ef4444'}}>*</span></label>
              <div style={inputWrapperStyle}>
                <Key size={15} style={iconStyle} />
                <input 
                  type="text" 
                  value={senha} onChange={e => setSenha(e.target.value)} required
                  placeholder="Minimo 6 caracteres" 
                  style={inputStyle} 
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Empresa Vinculada</label>
              <div style={inputWrapperStyle}>
                <Building2 size={15} style={iconStyle} />
                <select 
                  value={orgId} onChange={e => setOrgId(e.target.value)}
                  style={selectStyle}
                  disabled={carregandoOrgs}
                >
                  {carregandoOrgs && (
                    <option value="">Carregando...</option>
                  )}
                  {!carregandoOrgs && orgs.length === 0 && (
                    <option value="">Nenhuma org</option>
                  )}
                  {orgs.map(org => (
                    <option key={org.id} value={org.id}>{org.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--ws-glass-bg-hover)',
            border: '1px solid var(--ws-glass-border)',
            padding: 20, borderRadius: 12, marginTop: 8
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <Shield size={16} color="var(--ws-text-1)" />
              <label style={{ ...labelStyle, marginBottom: 0 }}>Nivel Hierarquico (Role)</label>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { value: '0', title: 'Super Admin', desc: 'Acesso total' },
                { value: '1', title: 'Admin', desc: 'Administra orgs' },
                { value: '2', title: 'Gerente', desc: 'Gestao de equipe' },
                { value: '3', title: 'Estrategista', desc: 'Marketing' },
                { value: '4', title: 'Basico', desc: 'Visualizacao' },
              ].map(n => (
                <div 
                  key={n.value}
                  onClick={() => setNivel(n.value)}
                  style={{
                    border: nivel === n.value ? '1px solid #3E5BFF' : '1px solid var(--ws-glass-border)',
                    background: nivel === n.value ? 'rgba(62,91,255,0.06)' : 'transparent',
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                    position: 'relative', overflow: 'hidden'
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 2 }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>{n.desc}</div>
                  {nivel === n.value && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, width: 3, height: '100%',
                      background: '#3E5BFF'
                    }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--ws-glass-border)', margin: '16px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button 
              type="button" 
              onClick={() => router.back()}
              style={{
                background: 'transparent',
                border: '1px solid var(--ws-glass-border)',
                padding: '0 20px', height: 42, borderRadius: 8,
                fontSize: 13, fontWeight: 600, color: 'var(--ws-text-2)',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={carregando}
              style={{
                background: carregando ? 'rgba(62,91,255,0.6)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
                border: 'none',
                padding: '0 28px', height: 42, borderRadius: 8,
                fontSize: 13, fontWeight: 600, color: 'white',
                cursor: carregando ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(62,91,255,0.3)',
                display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s'
              }}
            >
              {carregando ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              {carregando ? 'Criando...' : 'Criar Conta'}
            </button>
          </div>

        </form>
      </div>

    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ws-text-2)', 
  textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6
}

const inputWrapperStyle = {
  position: 'relative' as const,
  width: '100%'
}

const iconStyle = {
  position: 'absolute' as const,
  left: 14, top: '50%', transform: 'translateY(-50%)',
  color: 'var(--ws-text-3)', pointerEvents: 'none' as const
}

const inputStyle = {
  width: '100%', height: 42, padding: '0 16px 0 42px',
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid var(--ws-glass-border)',
  borderRadius: 10, fontSize: 13, color: 'var(--ws-text-1)',
  outline: 'none',
  transition: 'border-color 0.2s, background 0.2s'
}

const selectStyle = {
  width: '100%', height: 42, padding: '0 16px 0 42px',
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid var(--ws-glass-border)',
  borderRadius: 10, fontSize: 13, color: 'var(--ws-text-1)',
  outline: 'none', appearance: 'none' as const,
  transition: 'border-color 0.2s, background 0.2s'
}
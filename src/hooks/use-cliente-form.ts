'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import api from '@/lib/api-client'

export interface Workspace {
  id: string
  nome: string
  razao_social: string | null
  cnpj: string | null
  telefone_principal: string | null
  telefone_responsavel: string | null
  endereco: Record<string, string>
  ativo: boolean
  modulos: string[]
}

interface ReceitaWS {
  status: string
  nome: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
}

export interface ClienteForm {
  nome: string
  razao_social: string
  cnpj: string
  telefone_principal: string
  telefone_responsavel: string
  endereco: {
    logradouro: string
    numero: string
    complemento: string
    bairro: string
    municipio: string
    uf: string
    cep: string
  }
  modulos: string[]
  ativo: boolean
}

export const MODULOS = [
  { id: 'marketing', label: 'Marketing' },
  { id: 'crm', label: 'CRM' },
  { id: 'gestao', label: 'Gestão' },
  { id: 'performance', label: 'Performance' },
]

export function formatCNPJ(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function emptyForm(): ClienteForm {
  return {
    nome: '',
    razao_social: '',
    cnpj: '',
    telefone_principal: '',
    telefone_responsavel: '',
    endereco: { logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', cep: '' },
    modulos: [],
    ativo: true,
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

const LISTA_HREF = '/administracao/empresas/contas'

export function useClienteForm(clienteId?: string) {
  const router = useRouter()
  const editando = Boolean(clienteId)

  const [form, setForm] = useState<ClienteForm>(emptyForm())
  const [carregando, setCarregando] = useState(editando)
  const [salvando, setSalvando] = useState(false)
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false)

  // Carrega o cliente no modo edição.
  useEffect(() => {
    if (!clienteId) return
    let ativo = true
    setCarregando(true)
    void (async () => {
      try {
        const w = await api.get<Workspace>(`/workspaces/${clienteId}`)
        if (!ativo) return
        setForm({
          nome: w.nome || '',
          razao_social: w.razao_social || '',
          cnpj: w.cnpj || '',
          telefone_principal: w.telefone_principal || '',
          telefone_responsavel: w.telefone_responsavel || '',
          endereco: {
            logradouro: w.endereco?.logradouro || '',
            numero: w.endereco?.numero || '',
            complemento: w.endereco?.complemento || '',
            bairro: w.endereco?.bairro || '',
            municipio: w.endereco?.municipio || '',
            uf: w.endereco?.uf || '',
            cep: w.endereco?.cep || '',
          },
          modulos: w.modulos || [],
          ativo: w.ativo,
        })
      } catch (err: unknown) {
        if (ativo) toast.error(getErrorMessage(err, 'Erro ao carregar cliente'))
      } finally {
        if (ativo) setCarregando(false)
      }
    })()
    return () => { ativo = false }
  }, [clienteId])

  const setEndereco = useCallback((field: keyof ClienteForm['endereco'], value: string) => {
    setForm(prev => ({ ...prev, endereco: { ...prev.endereco, [field]: value } }))
  }, [])

  const toggleModulo = useCallback((id: string) => {
    setForm(prev => ({
      ...prev,
      modulos: prev.modulos.includes(id)
        ? prev.modulos.filter(m => m !== id)
        : [...prev.modulos, id],
    }))
  }, [])

  const buscarCNPJ = useCallback(async (cnpj: string) => {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) return
    setBuscandoCNPJ(true)
    try {
      const res = await fetch(`/api/cnpj/${digits}`)
      const data: ReceitaWS = await res.json()
      if (data.status !== 'OK') throw new Error('CNPJ inválido ou não encontrado')
      setForm(prev => ({
        ...prev,
        razao_social: data.nome || prev.razao_social,
        endereco: {
          logradouro: data.logradouro || '',
          numero: data.numero || '',
          complemento: data.complemento || '',
          bairro: data.bairro || '',
          municipio: data.municipio || '',
          uf: data.uf || '',
          cep: data.cep || '',
        },
      }))
      toast.success('Dados preenchidos via Receita Federal')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao buscar CNPJ'))
    } finally {
      setBuscandoCNPJ(false)
    }
  }, [])

  const podeSalvar = Boolean(
    form.nome.trim() &&
    form.cnpj.replace(/\D/g, '').length === 14 &&
    form.telefone_principal.trim(),
  )

  const salvar = useCallback(async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSalvando(true)
    const payload = {
      nome: form.nome.trim(),
      razao_social: form.razao_social.trim() || null,
      cnpj: form.cnpj || null,
      telefone_principal: form.telefone_principal.trim() || null,
      telefone_responsavel: form.telefone_responsavel.trim() || null,
      endereco: form.endereco,
      modulos: form.modulos,
    }
    try {
      if (clienteId) {
        const atualizado = await api.put<Workspace>(`/workspaces/${clienteId}`, payload)
        if (form.ativo !== atualizado.ativo) {
          await api.patch<Workspace>(`/workspaces/${clienteId}/status`, { ativo: form.ativo })
        }
        toast.success('Cliente atualizado com sucesso!')
        router.push(LISTA_HREF)
      } else {
        const criado = await api.post<Workspace>('/workspaces', payload)
        if (!form.ativo) {
          await api.patch<Workspace>(`/workspaces/${criado.id}/status`, { ativo: false })
        }
        toast.success('Cliente criado com sucesso!')
        router.push(LISTA_HREF)
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao salvar cliente'))
    } finally {
      setSalvando(false)
    }
  }, [form, clienteId, router])

  return {
    form, setForm, setEndereco, toggleModulo,
    buscarCNPJ, buscandoCNPJ,
    salvar, salvando, podeSalvar,
    carregando, editando,
    cancelar: () => router.push(LISTA_HREF),
  }
}

'use client'

import React from 'react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { Button, Input, Tabs } from '@heroui/react'
import { Switch } from '@/components/ui/switch'
import { MODULOS, formatCNPJ, useClienteForm } from '@/hooks/use-cliente-form'

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ws-text-1)',
  display: 'block',
  marginBottom: 8,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  fontSize: 14,
  background: 'var(--card, #fff)',
  border: '1px solid rgba(15,23,42,0.12)',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  outline: 'none',
  boxSizing: 'border-box',
  color: 'var(--ws-text-1)',
}

const groupTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--ws-blue)',
  margin: '8px 0 12px',
}

const hintStyle: React.CSSProperties = { fontSize: 12, color: 'var(--ws-text-3)', marginTop: 6 }

function Req() {
  return <span style={{ color: '#f43f5e' }}> *</span>
}

export function ClienteForm({ clienteId }: { clienteId?: string }) {
  const {
    form, setForm, setEndereco, toggleModulo,
    buscarCNPJ, buscandoCNPJ,
    salvar, salvando, podeSalvar,
    carregando, editando, cancelar,
  } = useClienteForm(clienteId)

  if (carregando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 24px 120px', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <button
          type="button"
          onClick={cancelar}
          aria-label="Voltar"
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: 'var(--card, #fff)', border: '1px solid rgba(15,23,42,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}
        >
          <ArrowLeft size={18} style={{ color: 'var(--ws-text-1)' }} />
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            {editando ? 'Editar Cliente' : 'Novo Cliente'}
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ws-text-2)' }}>
            {editando ? 'Atualize os dados do workspace' : 'Configure o workspace do cliente'}
          </p>
        </div>
      </div>

      <Tabs.Root defaultSelectedKey="cadastro" variant="secondary">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Seções do cadastro">
            <Tabs.Tab id="cadastro">Cadastro</Tabs.Tab>
            <Tabs.Tab id="modulos">Módulos</Tabs.Tab>
            <Tabs.Tab id="integracoes">Integrações</Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        {/* ===== Aba Cadastro ===== */}
        <Tabs.Panel id="cadastro" style={{ paddingTop: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Nome */}
            <div>
              <label style={labelStyle}>Nome<Req /></label>
              <Input
                value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Nome comercial do cliente"
                style={inputStyle}
              />
            </div>

            {/* CNPJ */}
            <div>
              <label style={labelStyle}>CNPJ<Req /></label>
              <div style={{ position: 'relative' }}>
                <Input
                  value={form.cnpj}
                  onChange={e => setForm(p => ({ ...p, cnpj: formatCNPJ(e.target.value) }))}
                  onBlur={e => buscarCNPJ(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  style={{ ...inputStyle, paddingRight: buscandoCNPJ ? 44 : 14 }}
                />
                {buscandoCNPJ && (
                  <Loader2 size={16} className="animate-spin" style={{
                    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--ws-blue)',
                  }} />
                )}
              </div>
              <p style={hintStyle}>Ao sair do campo, buscamos os dados da Receita Federal automaticamente</p>
            </div>

            {/* Razão Social */}
            <div>
              <label style={labelStyle}>Razão Social</label>
              <Input
                value={form.razao_social}
                onChange={e => setForm(p => ({ ...p, razao_social: e.target.value }))}
                placeholder="Preenchida automaticamente via CNPJ"
                style={inputStyle}
              />
            </div>

            {/* Endereço */}
            <div>
              <p style={groupTitleStyle}>Endereço</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Logradouro</label>
                    <Input value={form.endereco.logradouro} onChange={e => setEndereco('logradouro', e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Nº</label>
                    <Input value={form.endereco.numero} onChange={e => setEndereco('numero', e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Complemento</label>
                    <Input value={form.endereco.complemento} onChange={e => setEndereco('complemento', e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Bairro</label>
                    <Input value={form.endereco.bairro} onChange={e => setEndereco('bairro', e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 140px', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Cidade</label>
                    <Input value={form.endereco.municipio} onChange={e => setEndereco('municipio', e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>UF</label>
                    <Input value={form.endereco.uf} onChange={e => setEndereco('uf', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>CEP</label>
                    <Input value={form.endereco.cep} onChange={e => setEndereco('cep', e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </div>
            </div>

            {/* WhatsApp */}
            <div>
              <p style={groupTitleStyle}>WhatsApp</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Telefone principal<Req /></label>
                  <Input
                    value={form.telefone_principal}
                    onChange={e => setForm(p => ({ ...p, telefone_principal: e.target.value }))}
                    placeholder="(00) 00000-0000"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Telefone do responsável</label>
                  <Input
                    value={form.telefone_responsavel}
                    onChange={e => setForm(p => ({ ...p, telefone_responsavel: e.target.value }))}
                    placeholder="(00) 00000-0000"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Cliente ativo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <Switch checked={form.ativo} onCheckedChange={checked => setForm(p => ({ ...p, ativo: checked }))} />
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ws-text-1)' }}>Cliente ativo</span>
            </div>
          </div>
        </Tabs.Panel>

        {/* ===== Aba Módulos ===== */}
        <Tabs.Panel id="modulos" style={{ paddingTop: 24 }}>
          <p style={hintStyle}>Selecione os módulos disponíveis para este cliente.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            {MODULOS.map(m => {
              const ativo = form.modulos.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleModulo(m.id)}
                  style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: ativo ? 'rgba(62,91,255,0.10)' : 'var(--card, #fff)',
                    border: `1px solid ${ativo ? 'rgba(62,91,255,0.40)' : 'rgba(15,23,42,0.12)'}`,
                    color: ativo ? 'var(--ws-blue)' : 'var(--ws-text-2)',
                    fontSize: 14, fontWeight: ativo ? 600 : 400,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 150ms ease',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    background: ativo ? 'var(--ws-blue)' : 'rgba(15,23,42,0.06)',
                    border: `1.5px solid ${ativo ? 'var(--ws-blue)' : 'rgba(15,23,42,0.18)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {ativo && <Check size={11} style={{ color: '#fff' }} />}
                  </div>
                  {m.label}
                </button>
              )
            })}
          </div>
        </Tabs.Panel>

        {/* ===== Aba Integrações (placeholder) ===== */}
        <Tabs.Panel id="integracoes" style={{ paddingTop: 24 }}>
          <div style={{
            border: '1px dashed rgba(15,23,42,0.18)', borderRadius: 12, padding: '40px 24px',
            textAlign: 'center', color: 'var(--ws-text-3)',
          }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ws-text-2)' }}>Integrações</p>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>Em breve: conecte contas de anúncios e canais a este cliente.</p>
          </div>
        </Tabs.Panel>
      </Tabs.Root>

      {/* Footer fixo */}
      <div style={{
        position: 'sticky', bottom: 0, left: 0, right: 0, marginTop: 28,
        display: 'flex', justifyContent: 'flex-end', gap: 12,
        padding: '16px 0', background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
      }}>
        <Button variant="ghost" onPress={cancelar} isDisabled={salvando}>Cancelar</Button>
        <Button variant="primary" onPress={salvar} isDisabled={!podeSalvar || salvando}>
          {salvando && <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />}
          {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar cliente'}
        </Button>
      </div>
    </div>
  )
}

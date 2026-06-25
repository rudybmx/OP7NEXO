'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CreditCard, Info, Wallet, QrCode } from 'lucide-react'
import { MiniGauge } from '@/components/ui/mini-gauge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { FinanceiroConta, FinanceiroMetaAds, FinanceiroResumo } from '@/types/meta-ads-financeiro'
import { formatAccountId, formatCurrency } from './utils'
import { getSaldoDisplay, getSaldoDisplayDetails } from './saldo-display'

interface SaldoFinanceiroCardProps {
  financeiro: FinanceiroMetaAds | null
  compact?: boolean
  ctaLabel?: string
  onCtaClick?: () => void
  onSelecionarConta?: (contaId: string) => void
}

function toneState(state: FinanceiroResumo['alertState']) {
  if (state === 'critical') {
    return {
      accent: 'var(--ws-coral)',
      accentSoft: 'var(--ws-coral-soft)',
      border: 'rgba(255,92,141,0.32)',
      bg: 'rgba(255,92,141,0.08)',
      label: 'Crítico',
    }
  }
  if (state === 'warning') {
    return {
      accent: 'var(--ws-gold)',
      accentSoft: 'var(--ws-gold-soft)',
      border: 'var(--ws-gold-border)',
      bg: 'rgba(242,101,34,0.08)',
      label: 'Atenção',
    }
  }
  if (state === 'ok') {
    return {
      accent: 'var(--ws-green)',
      accentSoft: 'var(--ws-green-soft)',
      border: 'rgba(15,168,86,0.22)',
      bg: 'rgba(15,168,86,0.06)',
      label: 'Saudável',
    }
  }
  return {
    accent: 'var(--ws-text-3)',
    accentSoft: 'rgba(136,146,176,0.12)',
    border: 'var(--ws-divider)',
    bg: 'var(--ws-glass-bg)',
    label: 'Sem dados',
  }
}

function fundingIcon(conta?: FinanceiroConta | null) {
  const brand = (conta?.fundingSourceBrand ?? '').toUpperCase()
  const texto = [
    conta?.fundingSourceDisplay,
    conta?.fundingTypeLabel,
    conta?.fundingType,
    brand,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  if (brand.includes('VISA') || texto.includes('VISA')) {
    return <CreditCard size={28} style={{ color: 'var(--ws-blue)' }} />
  }
  if (brand.includes('MASTER') || texto.includes('MASTER')) {
    return <CreditCard size={28} style={{ color: 'var(--ws-text-2)' }} />
  }
  if (conta?.isPrepayAccount || texto.includes('PIX') || texto.includes('PRE')) {
    return <QrCode size={20} style={{ color: 'var(--ws-green)' }} />
  }
  return <CreditCard size={18} style={{ color: 'var(--ws-text-3)' }} />
}

function accountLabel(conta?: FinanceiroConta | null) {
  if (!conta) {
    return 'Conta Meta'
  }
  return conta.accountName || conta.label || conta.accountId
}

function AccountSwitchChip({
  conta,
  selecionada,
  onSelecionarConta,
}: {
  conta: FinanceiroConta
  selecionada: boolean
  onSelecionarConta?: (contaId: string) => void
}) {
  const disabled = !onSelecionarConta || selecionada

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelecionarConta?.(conta.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 'var(--ws-radius-md)',
        border: `1px solid ${selecionada ? 'rgba(62,91,255,0.35)' : 'var(--ws-glass-border)'}`,
        background: selecionada ? 'var(--ws-blue-soft)' : 'var(--ws-glass-bg)',
        color: 'var(--ws-text-1)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'var(--ws-transition)',
      }}
    >
      <div style={{ minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {accountLabel(conta)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ws-text-3)', marginTop: 2 }}>
          {formatAccountId(conta.accountId)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-1)' }}>
          {formatCurrency(conta.displayBalanceAmount ?? conta.availableBalance, conta.currency)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ws-text-3)', marginTop: 2 }}>
          {conta.alertState === 'critical'
            ? 'Crítico'
            : conta.alertState === 'warning'
              ? 'Atenção'
              : conta.alertState === 'ok'
                ? 'OK'
                : 'Sem cálculo'}
        </div>
      </div>
    </button>
  )
}

export function SaldoFinanceiroCard({
  financeiro,
  compact = false,
  ctaLabel,
  onCtaClick,
  onSelecionarConta,
}: SaldoFinanceiroCardProps) {
  if (!financeiro) return null

  const resumo = financeiro.summary
  const selected = financeiro.selectedAccount
  const contaBase = selected ?? financeiro.accounts[0] ?? null
  const saldoPresentation = getSaldoDisplay(contaBase)
  const saldoDetails = getSaldoDisplayDetails(contaBase)
  const stateTone = toneState(resumo.alertState)
  const gaugeValue = resumo.alertRatio == null ? 0 : Math.max(0, Math.min(100, resumo.alertRatio * 100))
  const selectedAccountCount = financeiro.accounts.length
  const hasSelectionRequired = financeiro.selectionRequired || financeiro.selectionState !== 'ready'
  const showAccountList = !compact && selectedAccountCount > 1 && typeof onSelecionarConta === 'function'
  const isMultiConta = financeiro.selectionState === 'multiple' ||
                       (financeiro.accounts.length > 1 && !selected)
  const totalSaldo = financeiro.accounts.reduce(
    (s, a) => s + (a.displayBalanceAmount ?? a.availableBalance ?? 0), 0
  )
  const multiCurrency = financeiro.accounts[0]?.currency ?? resumo.currency
  const canAutoSelectOne = compact && hasSelectionRequired && selectedAccountCount === 1 && typeof onSelecionarConta === 'function'
  const compactButtonLabel = ctaLabel ?? 'Abrir financeiro'
  const hoverCloseTimer = useRef<number | null>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current) {
        window.clearTimeout(hoverCloseTimer.current)
      }
    }
  }, [])

  const buttonLabel = canAutoSelectOne
    ? 'Selecionar conta'
    : ctaLabel

  const buttonAction = canAutoSelectOne
    ? () => onSelecionarConta?.(financeiro.accounts[0].id)
    : onCtaClick

  const openHover = () => {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current)
      hoverCloseTimer.current = null
    }
    setHovered(true)
  }

  const closeHover = () => {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current)
    }
    hoverCloseTimer.current = window.setTimeout(() => {
      setHovered(false)
    }, 120)
  }

  if (compact) {
    return (
      <Popover open={hovered} onOpenChange={setHovered}>
        <PopoverTrigger asChild>
          <div
            className="group relative"
            style={{
              background: stateTone.bg,
              border: `1px solid ${stateTone.border}`,
              borderRadius: 'var(--ws-radius-lg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: 'var(--ws-glass-shadow)',
              position: 'relative',
              overflow: 'hidden',
              minHeight: 96,
              padding: '12px 14px',
              transition: 'var(--ws-transition)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 10,
            }}
            onMouseEnter={openHover}
            onMouseLeave={closeHover}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
              pointerEvents: 'none',
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: stateTone.accent,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  lineHeight: 1.2,
                }}>
                  <span>{isMultiConta ? 'VALOR RESTANTE' : saldoPresentation.label.toUpperCase()}</span>
                </div>
                <div style={{
                  marginTop: 6,
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.04,
                  color: hasSelectionRequired && !selected
                    ? 'var(--ws-text-1)'
                    : stateTone.accent,
                  wordBreak: 'break-word',
                }}>
                  {isMultiConta
                    ? formatCurrency(totalSaldo, multiCurrency)
                    : hasSelectionRequired && !selected
                      ? 'Selecione uma conta'
                      : formatCurrency(saldoPresentation.amount, resumo.currency)}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                buttonAction?.()
              }}
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 'var(--ws-radius-md)',
                border: '1px solid var(--ws-divider)',
                background: 'var(--ws-glass-bg-hover)',
                color: 'var(--ws-text-1)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'var(--ws-transition)',
                alignSelf: 'flex-start',
              }}
            >
              {compactButtonLabel}
            </button>
          </div>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={10}
          className="w-auto min-w-[320px] max-w-[min(92vw,560px)] p-0 border-0 bg-transparent shadow-none"
          onMouseEnter={openHover}
          onMouseLeave={closeHover}
        >
          <div style={{
            background: 'var(--ws-glass-bg)',
            border: '1px solid var(--ws-glass-border)',
            borderRadius: 'var(--ws-radius-lg)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: 'var(--ws-glass-shadow-lg)',
            overflow: 'hidden',
            position: 'relative',
            padding: 14,
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--ws-text-3)',
                }}>
                  Detalhes do saldo
                </div>
                <div style={{
                  marginTop: 4,
                  fontSize: 13,
                  fontWeight: 600,
                  color: stateTone.accent,
                  lineHeight: 1.35,
                }}>
                  {resumo.alertState === 'critical'
                    ? 'Crítico'
                    : resumo.alertState === 'warning'
                      ? 'Atenção'
                      : resumo.alertState === 'ok'
                        ? 'Saudável'
                        : 'Sem cálculo'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ws-text-2)', marginTop: 3, lineHeight: 1.45 }}>
                  {resumo.alertMessage}
                </div>
              </div>

              <div style={{
                width: 34,
                height: 34,
                borderRadius: '9999px',
                background: stateTone.accentSoft,
                color: stateTone.accent,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {fundingIcon(contaBase)}
              </div>
            </div>

                {isMultiConta ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {financeiro.accounts.map((conta) => (
                      <div key={conta.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        borderTop: '1px solid var(--ws-divider)',
                        paddingTop: 8,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: stateTone.accentSoft,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {fundingIcon(conta)}
                          </div>
                          <span style={{
                            fontSize: 11, color: 'var(--ws-text-1)',
                            minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {accountLabel(conta)}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-1)', flexShrink: 0, marginLeft: 8 }}>
                          {formatCurrency(conta.displayBalanceAmount ?? conta.availableBalance ?? 0, conta.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {saldoDetails.map((item) => (
                      <div
                        key={item.label}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          borderTop: '1px solid var(--ws-divider)',
                          paddingTop: 8,
                        }}
                      >
                        <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{item.label}</span>
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--ws-text-1)',
                            textAlign: 'right',
                            fontWeight: 500,
                          }}
                        >
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div
      className="group relative"
      style={{
        background: hasSelectionRequired ? 'rgba(255,92,141,0.06)' : 'var(--ws-glass-bg)',
        border: `1px solid ${hasSelectionRequired ? 'rgba(255,92,141,0.26)' : 'var(--ws-glass-border)'}`,
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 220,
        padding: '16px 18px',
        transition: 'var(--ws-transition)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = 'var(--ws-glass-shadow-lg)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = 'var(--ws-glass-shadow)'
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: stateTone.accent,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>{saldoPresentation.label}</span>
            {resumo.alertState === 'critical' && <AlertTriangle size={11} />}
          </div>
          <div style={{
            fontSize: compact ? 26 : 32,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            color: 'var(--ws-text-1)',
            marginTop: 6,
          }}>
            {hasSelectionRequired && !selected
              ? 'Selecione uma conta'
              : formatCurrency(saldoPresentation.amount, resumo.currency)}
          </div>
          <div style={{
            marginTop: 6,
            fontSize: 12,
            color: 'var(--ws-text-2)',
            lineHeight: 1.45,
            minHeight: 18,
          }}>
            {hasSelectionRequired && !selected
              ? financeiro.selectionMessage
              : saldoPresentation.note}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {!hasSelectionRequired && selected && resumo.alertState !== 'indisponivel' && (
            <MiniGauge
              value={gaugeValue}
              size={compact ? 44 : 54}
              strokeWidth={compact ? 4 : 4.5}
              color={stateTone.accent}
              showValue={false}
              label={undefined}
            />
          )}

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Detalhes financeiros"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '9999px',
                  border: '1px solid var(--ws-glass-border)',
                  background: 'var(--ws-glass-bg)',
                  color: 'var(--ws-text-3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Info size={13} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[320px] p-0 border-0 bg-transparent shadow-none"
            >
              <div style={{
                background: 'var(--ws-glass-bg)',
                border: '1px solid var(--ws-glass-border)',
                borderRadius: 'var(--ws-radius-lg)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: 'var(--ws-glass-shadow-lg)',
                overflow: 'hidden',
                position: 'relative',
                padding: 14,
              }}>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: '9999px',
                    background: stateTone.accentSoft,
                    color: stateTone.accent,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {fundingIcon(contaBase)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                      {hasSelectionRequired && !selected ? 'Selecione uma conta' : accountLabel(contaBase)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ws-text-3)', marginTop: 2 }}>
                      {contaBase?.accountId ? formatAccountId(contaBase.accountId) : financeiro.selectionMessage}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {saldoDetails.map((item) => (
                    <div key={item.label} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      borderTop: '1px solid var(--ws-divider)',
                      paddingTop: 8,
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{item.label}</span>
                      <span style={{
                        fontSize: 11,
                        color: 'var(--ws-text-1)',
                        textAlign: 'right',
                        fontWeight: 500,
                      }}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

                {buttonLabel && buttonAction && (
                  <button
                    type="button"
                    onClick={buttonAction}
                    style={{
                      marginTop: 12,
                      width: '100%',
                      height: 34,
                      borderRadius: 'var(--ws-radius-md)',
                      border: '1px solid var(--ws-divider)',
                      background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {buttonLabel}
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: '9999px',
          border: `1px solid ${stateTone.border}`,
          background: stateTone.bg,
          color: stateTone.accent,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          {stateTone.label}
        </div>

        {buttonLabel && buttonAction && (
          <button
            type="button"
            onClick={buttonAction}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 'var(--ws-radius-md)',
              border: '1px solid var(--ws-divider)',
              background: compact ? 'var(--ws-glass-bg-hover)' : 'var(--ws-blue-soft)',
              color: compact ? 'var(--ws-text-1)' : 'var(--ws-blue)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'var(--ws-transition)',
            }}
          >
            {buttonLabel}
          </button>
        )}
      </div>

      {!hasSelectionRequired && selected && (
        <>
          <div style={{
            height: 4,
            borderRadius: 9999,
            background: 'rgba(14,20,42,0.08)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, gaugeValue))}%`,
              height: '100%',
              borderRadius: 9999,
              background:
                resumo.alertState === 'critical'
                  ? 'linear-gradient(90deg, var(--ws-coral), rgba(255,92,141,0.65))'
                  : resumo.alertState === 'warning'
                    ? 'linear-gradient(90deg, var(--ws-gold), rgba(242,101,34,0.70))'
                    : 'linear-gradient(90deg, var(--ws-green), rgba(15,168,86,0.66))',
              transition: 'width 0.35s ease',
            }} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: 8,
          }}>
            {[
              {
                label: 'Gasto acumulado',
                value: formatCurrency(resumo.amountSpent, resumo.currency),
              },
              {
                label: resumo.referenceLabel,
                value: resumo.referenceAmount ? formatCurrency(resumo.referenceAmount, resumo.currency) : 'Sem referência',
              },
              {
                label: 'Financiamento',
                value: selected.fundingTypeLabel || 'Não informado',
              },
            ].map((item) => (
              <div key={item.label} style={{
                background: 'rgba(255,255,255,0.34)',
                border: '1px solid var(--ws-divider)',
                borderRadius: 'var(--ws-radius-md)',
                padding: '8px 10px',
                minWidth: 0,
              }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-3)' }}>
                  {item.label}
                </div>
                <div style={{
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--ws-text-1)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showAccountList && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 8,
          marginTop: 2,
        }}>
          {financeiro.accounts.map((conta) => (
            <AccountSwitchChip
              key={conta.id}
              conta={conta}
              selecionada={selected?.id === conta.id}
              onSelecionarConta={onSelecionarConta}
            />
          ))}
        </div>
      )}

      {compact && hasSelectionRequired && !selected && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'var(--ws-text-2)',
          lineHeight: 1.4,
        }}>
          <Wallet size={14} style={{ color: 'var(--ws-text-3)' }} />
          {financeiro.selectionMessage}
        </div>
      )}
    </div>
  )
}

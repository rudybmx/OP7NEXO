import React from 'react'

export const wsSheetCreamStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #fffdf8 0%, #f7efe3 100%)',
  borderLeft: '1px solid rgba(15,23,42,0.14)',
  boxShadow: '-16px 0 36px rgba(15,23,42,0.10)',
  color: '#0f172a',
  backdropFilter: 'blur(10px)',
}

export const wsSheetCreamHeaderStyle: React.CSSProperties = {
  borderBottom: '1px solid rgba(15,23,42,0.12)',
}

export const wsSheetCreamCloseButtonStyle: React.CSSProperties = {
  background: 'rgba(15,23,42,0.04)',
  border: '1px solid rgba(15,23,42,0.12)',
  color: '#334155',
}

export const wsSheetCreamInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.86)',
  border: '1px solid rgba(15,23,42,0.14)',
  color: '#0f172a',
}

/* Tokens para elementos internos do drawer cream (fundo claro).
   NUNCA use rgba(255,255,255,0.XX) dentro do cream sheet — some no fundo bege.
   Use sempre navy com opacidade (rgba(15,23,42,0.XX)). */
export const wsSheetCreamTokens = {
  surface: 'rgba(15,23,42,0.04)',
  surfaceHover: 'rgba(15,23,42,0.07)',
  border: 'rgba(15,23,42,0.12)',
  borderStrong: 'rgba(15,23,42,0.18)',
  checkboxUncheckedBg: 'rgba(15,23,42,0.06)',
  checkboxUncheckedBorder: 'rgba(15,23,42,0.18)',
  textMuted: '#475569',
}

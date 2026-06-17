'use client'

import React, { useState } from 'react'
import {
  Layers,
  LayoutGrid,
  CheckSquare,
  Activity,
  Calendar,
  Cpu,
  Code2,
  Users,
  MessageSquare,
  MessageCircle,
  Sparkles,
  Mail,
  LayoutDashboard,
  Database,
  Building2,
  UserCog,
  LogOut,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react'

// Hardcoded colors to match spec
const W04 = 'rgba(255,255,255,0.04)'
const W06 = 'rgba(255,255,255,0.06)'
const W08 = 'rgba(255,255,255,0.08)'
const W10 = 'rgba(255,255,255,0.10)'
const W12 = 'rgba(255,255,255,0.12)'
const W14 = 'rgba(255,255,255,0.14)'
const W22 = 'rgba(255,255,255,0.22)'
const W25 = 'rgba(255,255,255,0.25)'
const W30 = 'rgba(255,255,255,0.30)'
const W40 = 'rgba(255,255,255,0.40)'
const W45 = 'rgba(255,255,255,0.45)'
const W50 = 'rgba(255,255,255,0.50)'
const W60 = 'rgba(255,255,255,0.60)'
const W70 = 'rgba(255,255,255,0.70)'
const W75 = 'rgba(255,255,255,0.75)'
const W80 = 'rgba(255,255,255,0.80)'
const W85 = 'rgba(255,255,255,0.85)'
const BRAND_PRIMARY = '#3E5BFF'
const BRAND_SECONDARY = '#7A5AF8'
const CORAL = '#FF5C8D'

// Components for reuse
const NavItem = ({
  icon: Icon,
  label,
  isActive = false,
  isExpanded = false,
  hasChevron = true,
  badge = null,
  isCollapsed = false,
  subItems = [],
  onItemClick,
  onSubItemClick
}: any) => {
  const [isHovered, setIsHovered] = useState(false)

  const activeBg = 'linear-gradient(135deg, rgba(62,91,255,0.18) 0%, rgba(122,90,248,0.10) 100%)'
  const hoverBg = W06
  
  if (isCollapsed) {
    return (
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onItemClick}
        style={{
          position: 'relative',
          width: 40,
          height: 40,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 150ms ease',
          background: isActive || isExpanded || isHovered ? (isActive || isExpanded ? activeBg : hoverBg) : 'transparent',
          border: `1px solid ${isActive || isExpanded ? 'rgba(62,91,255,0.25)' : 'transparent'}`,
          margin: '0 auto',
          marginBottom: 4
        }}
      >
        <Icon 
          size={18} 
          style={{ 
            color: isActive || isExpanded || isHovered ? '#ffffff' : W50, 
            transition: 'color 150ms ease' 
          }} 
        />

        {/* Flyout Menu Popover when Hovered */}
        {isHovered && (
          <div style={{
            position: 'absolute',
            left: '100%',
            top: 0,
            paddingLeft: 12,
            zIndex: 50,
            cursor: 'default'
          }}>
            <div style={{
              width: subItems.length > 0 ? 180 : 'max-content',
              background: 'linear-gradient(160deg, rgba(30, 40, 80, 0.98) 0%, rgba(14, 20, 42, 0.98) 100%)',
              border: `1px solid ${W14}`,
              borderRadius: 10,
              boxShadow: '4px 8px 32px rgba(0,0,0,0.4)',
              padding: subItems.length > 0 ? '8px' : '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              backdropFilter: 'blur(16px)'
            }}>
              <div style={{
                fontSize: subItems.length > 0 ? 12 : 13,
                fontWeight: 600,
                color: '#fff',
                padding: subItems.length > 0 ? '6px 8px' : 0,
                borderBottom: subItems.length > 0 ? `1px solid ${W08}` : 'none',
                marginBottom: subItems.length > 0 ? 4 : 0
              }}>
                {label}
              </div>
              
              {subItems.length > 0 && (
                <div style={{ 
                  display: 'flex', flexDirection: 'column', gap: 2, 
                  marginTop: 4, 
                  borderLeft: `1px solid ${W08}`, 
                  marginLeft: 12,
                  paddingLeft: 12
                 }}>
                  {subItems.map((sub: any, i: number) => (
                    <SubItem 
                      key={i} 
                      label={sub.label} 
                      isActive={sub.isActive} 
                      onClick={(e: React.MouseEvent) => { 
                        e.stopPropagation(); 
                        if (onSubItemClick) onSubItemClick(sub.label); 
                      }} 
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onItemClick}
      style={{
        height: 36,
        padding: '0 10px',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        transition: 'all 150ms ease',
        cursor: 'pointer',
        background: isActive || isExpanded ? activeBg : isHovered ? hoverBg : 'transparent',
        border: `1px solid ${isActive || isExpanded ? 'rgba(62,91,255,0.25)' : isHovered ? W06 : 'transparent'}`,
        color: isActive || isExpanded ? '#ffffff' : isHovered ? W85 : W60,
        fontWeight: isActive || isExpanded ? 500 : 400,
      }}
    >
      <Icon size={15} style={{ color: isActive || isExpanded ? '#ffffff' : isHovered ? W80 : W50, transition: 'all 150ms ease' }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 1, transition: 'opacity 150ms ease' }}>{label}</span>
      {badge && (
        <span style={{
          background: CORAL, color: '#ffffff', fontSize: 9, fontWeight: 700,
          padding: '1px 6px', borderRadius: 9999, marginLeft: 'auto'
        }}>
          {badge}
        </span>
      )}
      {hasChevron && !badge && (
        isExpanded ? <ChevronDown size={14} style={{ color: W30 }} /> : <ChevronRight size={14} style={{ color: W30 }} />
      )}
    </div>
  )
}

const SubItem = ({ label, isActive = false, onClick }: any) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '5px 8px',
        borderRadius: 6,
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        color: isActive ? '#ffffff' : isHovered ? W75 : W45,
        fontWeight: isActive ? 500 : 400,
        background: isActive ? 'rgba(62,91,255,0.08)' : isHovered ? W04 : 'transparent',
      }}
    >
      {/* Horizontal connector line */}
      <div style={{
        position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%)',
        width: 8, height: 1, background: isActive ? 'rgba(62,91,255,0.60)' : W10
      }} />
      
      {/* Bullet dot for active item */}
      {isActive && (
        <div style={{
          width: 5, height: 5, borderRadius: '50%', background: BRAND_PRIMARY,
          boxShadow: '0 0 6px rgba(62,91,255,0.8)', flexShrink: 0
        }} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {!isActive && <span style={{ paddingLeft: 11 }} />} {/* Space compensation for missing bullet */}
    </div>
  )
}

export function DSSidebar() {
  const [logoutHovered, setLogoutHovered] = useState(false)
  const [aiHovered, setAiHovered] = useState(false)
  const [toggleHovered, setToggleHovered] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [activeItem, setActiveItem] = useState('Meta Ads')

  const currentWidth = isCollapsed ? 64 : 220

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 64 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Sidebar Preview</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ws-text-2)' }}>
          Este é o padrão visual do sidebar. Para implementar em produção, aplicar os mesmos tokens em <code style={{ fontFamily: 'monospace', fontSize: 12 }}>src/components/layout/barra-lateral.tsx</code>
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {/* Sidebar Container */}
        <div style={{
          position: 'relative',
          width: currentWidth,
          height: 880,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(160deg, rgba(30, 40, 80, 0.97) 0%, rgba(14, 20, 42, 0.99) 45%, rgba(10, 15, 35, 1.0) 100%)',
          borderRight: `1px solid ${W08}`,
          boxShadow: `inset -1px 0 0 ${W04}, 4px 0 24px rgba(0,0,0,0.25)`,
          padding: isCollapsed ? '0 0 16px' : '0 12px 16px',
          color: '#ffffff',
          transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          {/* Top highlight line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${W12} 30%, ${W06} 70%, transparent 100%)`
          }} />

          {/* Toggle Button */}
          <div 
            onClick={() => setIsCollapsed(!isCollapsed)}
            onMouseEnter={() => setToggleHovered(true)}
            onMouseLeave={() => setToggleHovered(false)}
            style={{
              position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)',
              zIndex: 10, width: 28, height: 28, borderRadius: 8,
              background: toggleHovered ? 'rgba(30,40,80,0.98)' : 'rgba(20, 28, 56, 0.95)',
              border: `1px solid ${toggleHovered ? W22 : W14}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 150ms ease'
            }}
          >
            {isCollapsed ? (
              <PanelLeftOpen size={15} style={{ color: toggleHovered ? '#ffffff' : W70, transition: 'color 150ms ease' }} />
            ) : (
              <PanelLeftClose size={15} style={{ color: toggleHovered ? '#ffffff' : W70, transition: 'color 150ms ease' }} />
            )}
          </div>

          {/* Logo Section */}
          <div style={{
            padding: isCollapsed ? '25px 0' : '20px 14px 16px',
            borderBottom: `1px solid ${W08}`,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 72,
            transition: 'padding 250ms'
          }}>
            {isCollapsed ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="50 290 1820 560" style={{ height: 16, width: 'auto' }}>
                <g>
                  <path fill="#fff" d="M66.41,339.67c47.59-18.4,98.92-13.5,149.61-12.51l34.66,198.23,73.49-204.34c22.24-8.6,45.69-13.55,71.63-10.13l40.57,200.25c19.66-51.44,37.39-103,51.81-156.5,2.02-7.51,2.41-15.31-1.38-21.1-3.53-5.4-8.6-5.82-11.17-5.63-1.06.08-2.06-.49-2.57-1.43-.84-1.53-2.06-3.87-2.84-6.02,29.9-10.26,60.22-16.27,94.07-13.35l-120.04,298.89c-21.71,9.55-42.09,17.72-66.58,16.24l-44.49-184.86-75.18,197.27c-22.08,9.56-44.38,16.27-68.52,16.8l-59.92-267.71c-3.57-15.97-15.12-29.14-30.68-34.23-9.79-3.2-20.99-6.74-32.47-9.86Z"/>
                  <path fill="#fff" d="M1208.83,546.85c-56.5,78.09-221.47,74.11-311.35,37.24,11.67-27.65,19.39-51.95,24.62-79.22,3.91-1.19,9.34-2.13,9.34-2.13,0,0,8.3,34.98,49.82,52.77,60.13,25.76,137.53,5.86,137.09-33.23-.12-10.34-8.07-21.58-19.47-26.16l-98.52-39.6c-19.31-7.76-34.96-22.36-40.22-37.6-7.99-23.14-5.92-44.78,5.65-64.09,49.87-83.23,196.51-89.66,288.19-61.53l-29.29,68.21c-8.35,1.37-12.44,1.37-12.44,1.37,0,0-12.62-29.18-29.43-35.92-52.3-20.96-120.65,3.07-117.57,37.37.93,10.39,9.05,20.59,19.99,25.42l92.41,40.77c21.72,9.58,38.67,27.7,43.79,46.82,6.84,25.52,2.04,49.25-12.62,69.51Z"/>
                  <path fill="#fff" d="M1621.78,560.75l25.99-106.93c1.53-6.3.39-12.83-3.8-16.19-14.13-11.34-40.15,12.04-57.62,29.94l-23.62,115.63c-26.68,3.72-51.53,6.42-78.18,4.94l34.91-166.53c1.14-5.71-.18-11.27-2.71-14.05-3.02-3.32-9.28-6.76-16.54-5.11.5-6.05,5.97-12.39,5.97-12.39,0,0,23.28-9.05,99.25-9.96l-10.96,49.5c34.18-35.13,100.53-69.24,128.76-42.85,8.47,7.92,11.89,20.83,8.87,33.46l-27.81,116.25c-1.25,5.22-.17,10.89,2.2,14.12,9.47,12.9,31.17-6.06,44.86-1.53-30.7,31.68-92.59,63.26-120.52,40.93-7.05-5.64-11.93-17.4-9.05-29.24Z"/>
                  <path fill="#fff" d="M1238.12,550.34l24.43-125.35c1.19-6.11,1.35-11.32-1.83-16.37-2.66-4.24-7.8-7.45-15.64-7.21.9-2.74,1.66-4.62,3.23-7.54,15.67-12.19,70.16-13.27,98.94-11.99l-29.92,136.22c-1.56,7.12,1.2,14.61,6.73,17.82,14.7,8.53,34.21-13.75,48.62-31.83l27.27-120.64c18.59-2.9,57.66-4.39,76.57-2.99l-33.64,150.42c-1.34,6.01.51,12.38,4.68,15.49,12.8,9.52,33.73-11.55,43.57-5.05-27.49,31.68-100.98,68.97-121.06,41.53-6.92-9.45-6.29-21.16-4.72-35.46-30.8,31.03-87.66,63.42-115.22,37.01-6.99-6.7-14.74-20.11-12.02-34.05Z"/>
                  <path fill="#fff" d="M582.43,514.02c41.27-2.44,82.26-15.61,106.27-48.37,12.51-17.07,16.25-37.9,7.29-56.38-7.68-15.83-26.03-26.55-46.94-27.17-75.58-2.31-139.32,60.22-138.21,135.17.7,46.82,34.47,75.89,79.5,77.56,47.91,1.75,93.8-23.18,106.66-72.58-22.77,16.51-44.05,30.86-71.49,31.54-26.2.66-45.15-16.27-43.08-39.78ZM634.1,413.92c5.59,1.32,10.16,7.33,9.83,14.39-1.53,34.29-28.36,59.6-61,60.65,3.3-36.58,28.74-80.36,51.18-75.04Z"/>
                  <path fill="#fff" d="M781.66,580.34c-24.11,6.33-48.04,7.38-72.06,7.11l19.8-154.29c2.12-16.51-1-22.47-18.94-32.05,31.21-16.69,62.44-19.75,95.2-18.36l-7.71,49.71c19.43-32.99,58.32-67.81,80.96-49.96,18.83,14.85,4.52,74.53-28.92,83.99.77-8.2,2.27-16.68-4.54-21.63-16.86-12.27-42.38,14.15-54.32,36.95l-9.48,98.54Z"/>
                  <path fill="#fff" d="M888.71,393.32c15.57-27.59,12.54-56.85-14.83-74.15,11.76-22.39,39.56-31.34,63.34-26.79,13.58,2.6,19.14,16.89,16.48,30.34-6.56,33.11-31.83,60.16-64.99,70.59Z"/>
                </g>
                <path fill="#ddae36" d="M177.65,735.22s199.78-54.07,716.53-60.47c516.75-6.39,745.83,52.21,745.83,52.21,0,0,30.85-8.48,62.6-15.58l68.46-15.32s-350.54-53.27-877.41-47.95c-411.52,4.16-715.99,87.1-715.99,87.1Z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="50 290 1820 560" style={{ height: 36, width: 'auto', opacity: 1, transition: 'opacity 150ms' }}>
                <g>
                  <path fill="#fff" d="M66.41,339.67c47.59-18.4,98.92-13.5,149.61-12.51l34.66,198.23,73.49-204.34c22.24-8.6,45.69-13.55,71.63-10.13l40.57,200.25c19.66-51.44,37.39-103,51.81-156.5,2.02-7.51,2.41-15.31-1.38-21.1-3.53-5.4-8.6-5.82-11.17-5.63-1.06.08-2.06-.49-2.57-1.43-.84-1.53-2.06-3.87-2.84-6.02,29.9-10.26,60.22-16.27,94.07-13.35l-120.04,298.89c-21.71,9.55-42.09,17.72-66.58,16.24l-44.49-184.86-75.18,197.27c-22.08,9.56-44.38,16.27-68.52,16.8l-59.92-267.71c-3.57-15.97-15.12-29.14-30.68-34.23-9.79-3.2-20.99-6.74-32.47-9.86Z"/>
                  <path fill="#fff" d="M1208.83,546.85c-56.5,78.09-221.47,74.11-311.35,37.24,11.67-27.65,19.39-51.95,24.62-79.22,3.91-1.19,9.34-2.13,9.34-2.13,0,0,8.3,34.98,49.82,52.77,60.13,25.76,137.53,5.86,137.09-33.23-.12-10.34-8.07-21.58-19.47-26.16l-98.52-39.6c-19.31-7.76-34.96-22.36-40.22-37.6-7.99-23.14-5.92-44.78,5.65-64.09,49.87-83.23,196.51-89.66,288.19-61.53l-29.29,68.21c-8.35,1.37-12.44,1.37-12.44,1.37,0,0-12.62-29.18-29.43-35.92-52.3-20.96-120.65,3.07-117.57,37.37.93,10.39,9.05,20.59,19.99,25.42l92.41,40.77c21.72,9.58,38.67,27.7,43.79,46.82,6.84,25.52,2.04,49.25-12.62,69.51Z"/>
                  <path fill="#fff" d="M1621.78,560.75l25.99-106.93c1.53-6.3.39-12.83-3.8-16.19-14.13-11.34-40.15,12.04-57.62,29.94l-23.62,115.63c-26.68,3.72-51.53,6.42-78.18,4.94l34.91-166.53c1.14-5.71-.18-11.27-2.71-14.05-3.02-3.32-9.28-6.76-16.54-5.11.5-6.05,5.97-12.39,5.97-12.39,0,0,23.28-9.05,99.25-9.96l-10.96,49.5c34.18-35.13,100.53-69.24,128.76-42.85,8.47,7.92,11.89,20.83,8.87,33.46l-27.81,116.25c-1.25,5.22-.17,10.89,2.2,14.12,9.47,12.9,31.17-6.06,44.86-1.53-30.7,31.68-92.59,63.26-120.52,40.93-7.05-5.64-11.93-17.4-9.05-29.24Z"/>
                  <path fill="#fff" d="M1238.12,550.34l24.43-125.35c1.19-6.11,1.35-11.32-1.83-16.37-2.66-4.24-7.8-7.45-15.64-7.21.9-2.74,1.66-4.62,3.23-7.54,15.67-12.19,70.16-13.27,98.94-11.99l-29.92,136.22c-1.56,7.12,1.2,14.61,6.73,17.82,14.7,8.53,34.21-13.75,48.62-31.83l27.27-120.64c18.59-2.9,57.66-4.39,76.57-2.99l-33.64,150.42c-1.34,6.01.51,12.38,4.68,15.49,12.8,9.52,33.73-11.55,43.57-5.05-27.49,31.68-100.98,68.97-121.06,41.53-6.92-9.45-6.29-21.16-4.72-35.46-30.8,31.03-87.66,63.42-115.22,37.01-6.99-6.7-14.74-20.11-12.02-34.05Z"/>
                  <path fill="#fff" d="M582.43,514.02c41.27-2.44,82.26-15.61,106.27-48.37,12.51-17.07,16.25-37.9,7.29-56.38-7.68-15.83-26.03-26.55-46.94-27.17-75.58-2.31-139.32,60.22-138.21,135.17.7,46.82,34.47,75.89,79.5,77.56,47.91,1.75,93.8-23.18,106.66-72.58-22.77,16.51-44.05,30.86-71.49,31.54-26.2.66-45.15-16.27-43.08-39.78ZM634.1,413.92c5.59,1.32,10.16,7.33,9.83,14.39-1.53,34.29-28.36,59.6-61,60.65,3.3-36.58,28.74-80.36,51.18-75.04Z"/>
                  <path fill="#fff" d="M781.66,580.34c-24.11,6.33-48.04,7.38-72.06,7.11l19.8-154.29c2.12-16.51-1-22.47-18.94-32.05,31.21-16.69,62.44-19.75,95.2-18.36l-7.71,49.71c19.43-32.99,58.32-67.81,80.96-49.96,18.83,14.85,4.52,74.53-28.92,83.99.77-8.2,2.27-16.68-4.54-21.63-16.86-12.27-42.38,14.15-54.32,36.95l-9.48,98.54Z"/>
                  <path fill="#fff" d="M888.71,393.32c15.57-27.59,12.54-56.85-14.83-74.15,11.76-22.39,39.56-31.34,63.34-26.79,13.58,2.6,19.14,16.89,16.48,30.34-6.56,33.11-31.83,60.16-64.99,70.59Z"/>
                </g>
                <path fill="#ddae36" d="M177.65,735.22s199.78-54.07,716.53-60.47c516.75-6.39,745.83,52.21,745.83,52.21,0,0,30.85-8.48,62.6-15.58l68.46-15.32s-350.54-53.27-877.41-47.95c-411.52,4.16-715.99,87.1-715.99,87.1Z"/>
                <g>
                  <polygon fill="#ddae36" points="471.19 775.84 262.36 771.71 471.19 767.58 471.19 775.84"/>
                  <polygon fill="#ddae36" points="1461.54 767.58 1670.37 771.71 1461.54 775.84 1461.54 767.58"/>
                  <g>
                    <path fill="#fff" d="M568.9,762.24c0,13.45-10.29,21.82-26.74,21.82h-12.41v16.65h-14.25v-60.37h26.66c16.45,0,26.74,8.37,26.74,21.91ZM554.48,762.24c0-6.64-4.4-10.52-13.11-10.52h-11.61v20.96h11.61c8.71,0,13.11-3.88,13.11-10.43Z"/>
                    <path fill="#fff" d="M608.14,740.34h14.25v48.99h30.88v11.38h-45.13v-60.37Z"/>
                    <path fill="#fff" d="M731.48,787.77h-28.59l-5.46,12.94h-14.6l27.45-60.37h14.08l27.54,60.37h-14.96l-5.45-12.94ZM726.99,777.16l-9.77-23.11-9.77,23.11h19.53Z"/>
                    <path fill="#fff" d="M797.1,751.72h-19.71v-11.38h53.67v11.38h-19.71v48.99h-14.25v-48.99Z"/>
                    <path fill="#fff" d="M905.31,787.77h-28.59l-5.46,12.94h-14.6l27.45-60.37h14.08l27.54,60.37h-14.96l-5.45-12.94ZM900.83,777.16l-9.77-23.11-9.77,23.11h19.53Z"/>
                    <path fill="#fff" d="M975.51,751.55v15.95h28.51v11.21h-28.51v21.99h-14.25v-60.37h46.54v11.21h-32.29Z"/>
                    <path fill="#fff" d="M1042.11,770.52c0-17.94,14.25-31.22,33.7-31.22s33.69,13.2,33.69,31.22-14.34,31.22-33.69,31.22-33.7-13.28-33.7-31.22ZM1095.07,770.52c0-11.47-8.27-19.32-19.27-19.32s-19.27,7.85-19.27,19.32,8.27,19.32,19.27,19.32,19.27-7.85,19.27-19.32Z"/>
                    <path fill="#fff" d="M1188.59,800.71l-11.88-16.82h-13.11v16.82h-14.25v-60.37h26.66c16.45,0,26.75,8.37,26.75,21.91c0,9.06-4.66,15.7-12.67,19.06l13.81,19.41h-15.31ZM1175.21,751.72h-11.61v21.04h11.61c8.71,0,13.11-3.97,13.11-10.52s-4.4-10.52-13.11-10.52Z"/>
                    <path fill="#fff" d="M1299.17,800.71l-.09-36.22-18.12,29.84h-6.42l-18.04-29.06v35.45h-13.37v-60.37h11.79l23.05,37.52,22.7-37.52h11.7l.18,60.37h-13.37Z"/>
                    <path fill="#fff" d="M1396.81,787.77h-28.59l-5.46,12.94h-14.6l27.45-60.37h14.08l27.54,60.37h-14.96l-5.46-12.94ZM1392.33,777.16l-9.77-23.11-9.77,23.11h19.53Z"/>
                  </g>
                </g>
              </svg>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingRight: isCollapsed ? 0 : 4 }}>
            {/* MARKETING */}
            {!isCollapsed ? (
              <div style={{
                fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
                color: W25, padding: '0 10px', marginTop: 16, marginBottom: 4,
                opacity: 1, transition: 'opacity 150ms ease'
              }}>MARKETING</div>
            ) : (
              <div style={{ height: 1, background: W08, margin: '8px 10px', marginTop: 16 }} />
            )}
            
            <NavItem 
              icon={LayoutGrid} 
              label="Campanhas" 
              isExpanded={!isCollapsed} 
              isCollapsed={isCollapsed} 
              isActive={activeItem === 'Campanhas' || ['Meta Ads', 'Google Ads', 'LinkedIn Ads', 'TikTok Ads'].includes(activeItem)}
              onItemClick={() => setActiveItem('Campanhas')}
              onSubItemClick={(subLabel: string) => setActiveItem(subLabel)}
              subItems={[
                { label: 'Meta Ads', isActive: activeItem === 'Meta Ads' },
                { label: 'Google Ads', isActive: activeItem === 'Google Ads' },
                { label: 'LinkedIn Ads', isActive: activeItem === 'LinkedIn Ads' },
                { label: 'TikTok Ads', isActive: activeItem === 'TikTok Ads' }
              ]} 
            />
            {!isCollapsed && (
              <div style={{
                marginLeft: 26, paddingLeft: 12, borderLeft: `1px solid ${W08}`,
                marginTop: 2, marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 2
              }}>
                <SubItem label="Meta Ads" isActive={activeItem === 'Meta Ads'} onClick={() => setActiveItem('Meta Ads')} />
                <SubItem label="Google Ads" isActive={activeItem === 'Google Ads'} onClick={() => setActiveItem('Google Ads')} />
                <SubItem label="LinkedIn Ads" isActive={activeItem === 'LinkedIn Ads'} onClick={() => setActiveItem('LinkedIn Ads')} />
                <SubItem label="TikTok Ads" isActive={activeItem === 'TikTok Ads'} onClick={() => setActiveItem('TikTok Ads')} />
              </div>
            )}

            <NavItem icon={CheckSquare} label="Demandas" isCollapsed={isCollapsed} isActive={activeItem === 'Demandas'} onItemClick={() => setActiveItem('Demandas')} />
            <NavItem icon={Activity} label="Performance" isCollapsed={isCollapsed} isActive={activeItem === 'Performance'} onItemClick={() => setActiveItem('Performance')} />
            <NavItem icon={Calendar} label="Eventos" isCollapsed={isCollapsed} isActive={activeItem === 'Eventos'} onItemClick={() => setActiveItem('Eventos')} />
            <NavItem icon={Cpu} label="Central AI" badge={isCollapsed ? null : "3"} isCollapsed={isCollapsed} isActive={activeItem === 'Central AI'} onItemClick={() => setActiveItem('Central AI')} />
            <NavItem icon={Code2} label="Automação e Tech" isCollapsed={isCollapsed} isActive={activeItem === 'Automação e Tech'} onItemClick={() => setActiveItem('Automação e Tech')} />
            <NavItem icon={Users} label="Estrategistas" isCollapsed={isCollapsed} isActive={activeItem === 'Estrategistas'} onItemClick={() => setActiveItem('Estrategistas')} />

            {/* CRM */}
            {!isCollapsed ? (
              <div style={{
                fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
                color: W25, padding: '0 10px', marginTop: 16, marginBottom: 4,
                opacity: 1, transition: 'opacity 150ms ease'
              }}>CRM</div>
            ) : (
              <div style={{ height: 1, background: W08, margin: '8px 10px', marginTop: 16 }} />
            )}
            <NavItem icon={MessageSquare} label="Atendimento" isCollapsed={isCollapsed} isActive={activeItem === 'Atendimento'} onItemClick={() => setActiveItem('Atendimento')} />
            <NavItem icon={Mail} label="Campanhas CRM" isCollapsed={isCollapsed} isActive={activeItem === 'Campanhas CRM'} onItemClick={() => setActiveItem('Campanhas CRM')} />
            <NavItem icon={LayoutDashboard} label="Gestão" isCollapsed={isCollapsed} isActive={activeItem === 'Gestão'} onItemClick={() => setActiveItem('Gestão')} />
            <NavItem icon={Database} label="Cadastros" isCollapsed={isCollapsed} isActive={activeItem === 'Cadastros'} onItemClick={() => setActiveItem('Cadastros')} />

            {/* ADMINISTRAÇÃO */}
            {!isCollapsed ? (
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', marginTop: 16, marginBottom: 4 }}>
                <div style={{
                  fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
                  color: W25
                }}>ADMINISTRAÇÃO</div>
                <span style={{
                  background: CORAL, color: '#ffffff', fontSize: 9, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 9999, marginLeft: 'auto'
                }}>
                  Admin
                </span>
              </div>
            ) : (
              <div style={{ height: 1, background: W08, margin: '8px 10px', marginTop: 16 }} />
            )}
            <NavItem icon={Building2} label="Empresas" hasChevron={false} isCollapsed={isCollapsed} isActive={activeItem === 'Empresas'} onItemClick={() => setActiveItem('Empresas')} />
            <NavItem icon={UserCog} label="Usuários Adm" hasChevron={false} isCollapsed={isCollapsed} isActive={activeItem === 'Usuários Adm'} onItemClick={() => setActiveItem('Usuários Adm')} />
          </div>

          {/* Footer Cards */}
          <div style={{
            borderTop: `1px solid ${W08}`,
            paddingTop: 14,
            marginTop: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'center'
          }}>
            {/* AI Assistant Card */}
            <div
              onMouseEnter={() => setAiHovered(true)}
              onMouseLeave={() => setAiHovered(false)}
              style={{
                width: isCollapsed ? 40 : '100%',
                height: isCollapsed ? 40 : 'auto',
                background: aiHovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${aiHovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 10,
                padding: isCollapsed ? 0 : '8px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                gap: 8,
                cursor: 'pointer',
                transition: 'all 150ms ease'
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'linear-gradient(135deg, #7A5AF8, #3E5BFF)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', flexShrink: 0
              }}>
                <MessageCircle size={15} color="#ffffff" />
              </div>
              {!isCollapsed && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', opacity: 1, transition: 'opacity 150ms ease' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#ffffff', lineHeight: 1.2 }}>Assistente AI</span>
                    <span style={{ fontSize: 10, color: W40, lineHeight: 1.2 }}>Pergunte qualquer coisa</span>
                  </div>
                  <Sparkles size={14} style={{ marginLeft: 'auto', color: W30 }} />
                </>
              )}
            </div>

            {/* User Card */}
            <div style={{
              width: isCollapsed ? 30 : '100%',
              height: isCollapsed ? 30 : 'auto',
              background: isCollapsed ? 'transparent' : W06,
              border: isCollapsed ? 'none' : `1px solid ${W08}`,
              borderRadius: isCollapsed ? '50%' : 10,
              padding: isCollapsed ? 0 : '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              gap: 8,
              transition: 'all 250ms ease'
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: `linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_SECONDARY})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 11, fontWeight: 600, flexShrink: 0
              }}>
                RD
              </div>
              {!isCollapsed && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', opacity: 1, transition: 'opacity 150ms ease' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#ffffff', lineHeight: 1.2 }}>Rudy Dias</span>
                    <span style={{ fontSize: 10, color: W40, lineHeight: 1.2 }}>CTO · Admin</span>
                  </div>
                  <LogOut
                    size={14}
                    onMouseEnter={() => setLogoutHovered(true)}
                    onMouseLeave={() => setLogoutHovered(false)}
                    style={{
                      marginLeft: 'auto',
                      color: logoutHovered ? W70 : W30,
                      cursor: 'pointer',
                      transition: 'color 150ms ease'
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Agents Documentation */}
      <div style={{ marginTop: 24, maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <div style={{ fontSize: 12, color: 'var(--ws-text-3)', marginBottom: 8 }}>Documentação para agentes</div>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${W08}`,
          borderRadius: 8,
          padding: '14px 16px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.70)',
          fontFamily: 'monospace',
          whiteSpace: 'pre',
          overflowX: 'auto'
        }}>
{`---
COMPONENTE: Sidebar BMK Marketing
ARQUIVO PRODUÇÃO: src/components/layout/barra-lateral.tsx

ESTADO RECOLHIDO (COLLAPSED):
- Largura: 64px
- Transição: width 250ms cubic-bezier(0.4, 0, 0.2, 1)
- Logo: Apenas ícone 30px (Layers gradient)
- Itens Nav: Apenas ícones (18px) centralizados em div 40px
- Texto/Labels: opacity 0, pointer-events none

TOKENS OBRIGATÓRIOS:
- Background: linear-gradient(160deg, rgba(30,40,80,0.97), rgba(14,20,42,0.99), rgba(10,15,35,1.0))
- Border-right: 1px solid rgba(255,255,255,0.08)
- Box-shadow: inset -1px 0 0 rgba(255,255,255,0.04), 4px 0 24px rgba(0,0,0,0.25)

ITEM ATIVO (pai):
- background: linear-gradient(135deg, rgba(62,91,255,0.18), rgba(122,90,248,0.10))
- border: 1px solid rgba(62,91,255,0.25)
- color: #ffffff, font-weight: 500

TOGGLE BUTTON:
- background: rgba(20, 28, 56, 0.95)
- border: 1px solid rgba(255,255,255,0.14)
- position: absolute, right -14px, top 50%
---`}
        </div>
      </div>
    </div>
  )
}
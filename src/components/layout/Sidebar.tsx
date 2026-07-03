import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Briefcase, CheckSquare, DollarSign,
  Calendar, UserCheck,
  Shield, BarChart2, X, UserCog,
  FileText, Newspaper, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import React, { useState } from 'react'

const navGroups = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/agenda',    icon: Calendar,         label: 'Agenda' },
      { to: '/tarefas',   icon: CheckSquare,       label: 'Atividades' },
    ],
  },
  {
    label: 'Jurídico',
    items: [
      { to: '/clientes',    icon: Users,      label: 'Contatos' },
      { to: '/processos',   icon: Briefcase,  label: 'Processos' },
      { to: '/publicacoes', icon: Newspaper,  label: 'Intimações', disabled: true },
      { to: '/documentos',  icon: FileText,   label: 'Documentos' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/financeiro',    icon: DollarSign, label: 'Financeiro' },
      { to: '/colaboradores', icon: UserCheck,  label: 'Parceiros' },
      { to: '/relatorios',    icon: BarChart2,  label: 'Relatórios' },
      { to: '/usuarios',      icon: UserCog,    label: 'Conta' },
    ],
  },
]

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { profile } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const isSuperAdmin = profile?.role === 'super_admin'

  return (
    <aside
      className={cn(
        'flex flex-col h-full transition-all duration-300 relative flex-shrink-0 select-none',
        collapsed ? 'w-[68px]' : 'w-[220px]',
      )}
      style={{ background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 60%, #0a1628 100%)' }}
    >
      {/* Subtle right border */}
      <div className="absolute inset-y-0 right-0 w-px bg-white/5" />

      {/* Decorative glow top */}
      <div
        className="absolute top-0 left-0 right-0 h-40 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% -20%, rgba(6,182,212,0.12) 0%, transparent 70%)' }}
      />

      {/* Logo */}
      <div className={cn(
        'flex-shrink-0 border-b border-white/5 relative z-10',
        collapsed
          ? 'flex items-center justify-center h-[72px]'
          : 'flex items-center justify-center px-3 py-3',
      )}>
        {onClose && !collapsed && (
          <button onClick={onClose} className="md:hidden absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 text-white/50">
            <X className="w-4 h-4" />
          </button>
        )}

        {collapsed ? (
          /* Collapsed: icon portion of the brand logo */
          <div className="rounded-xl overflow-hidden flex-shrink-0" style={{ width: 48, height: 48 }}>
            <img
              src="/logomarca.png"
              alt="LegalHub"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: '0% 50%',
              }}
            />
          </div>
        ) : (
          /* Expanded: full horizontal logo */
          <div className="w-full flex items-center justify-center" style={{ padding: '4px 8px' }}>
            <img
              src="/logomarca.png"
              alt="LegalHub"
              className="w-full h-auto object-contain"
              style={{ maxHeight: '64px' }}
            />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-none px-2 py-3 space-y-5 relative z-10">
        {navGroups.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2 mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/25">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label, disabled }: { to: string; icon: React.ElementType; label: string; disabled?: boolean }) =>
                disabled ? (
                  <div
                    key={to}
                    title={collapsed ? `${label} — Em desenvolvimento` : undefined}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium relative cursor-not-allowed opacity-30',
                      collapsed && 'justify-center px-0 w-full',
                    )}
                  >
                    <Icon style={{ width: 15, height: 15 }} className="flex-shrink-0 text-white/50" />
                    {!collapsed && (
                      <>
                        <span className="truncate text-white/50">{label}</span>
                        <span className="ml-auto text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 leading-none whitespace-nowrap">Em breve</span>
                      </>
                    )}
                  </div>
                ) : (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onClose}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) => cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-150 group relative',
                      isActive
                        ? 'text-white'
                        : 'text-white/45 hover:text-white/80 hover:bg-white/5',
                      collapsed && 'justify-center px-0 w-full',
                    )}
                    style={({ isActive }) => isActive ? {
                      background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(37,99,235,0.12) 100%)',
                      boxShadow: 'inset 1px 0 0 rgba(6,182,212,0.5)',
                    } : {}}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon style={{ width: 15, height: 15 }} className={cn(
                          'flex-shrink-0 transition-colors',
                          isActive ? 'text-cyan-400' : 'text-white/40 group-hover:text-white/70',
                        )} />
                        {!collapsed && (
                          <span className={cn('truncate', isActive && 'font-semibold')}>{label}</span>
                        )}
                        {isActive && collapsed && (
                          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-cyan-400 rounded-l-full" />
                        )}
                      </>
                    )}
                  </NavLink>
                )
              )}
            </div>
          </div>
        ))}

        {isSuperAdmin && (
          <div>
            {!collapsed && (
              <p className="px-2 mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/25">Admin</p>
            )}
            <NavLink to="/admin" title={collapsed ? 'Admin' : undefined}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all group relative',
                isActive
                  ? 'text-white'
                  : 'text-white/45 hover:text-white/80 hover:bg-white/5',
                collapsed && 'justify-center px-0',
              )}
              style={({ isActive }) => isActive ? {
                background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(37,99,235,0.12) 100%)',
                boxShadow: 'inset 1px 0 0 rgba(6,182,212,0.5)',
              } : {}}>
              {({ isActive }) => (
                <>
                  <Shield style={{ width: 15, height: 15 }} className={cn('flex-shrink-0', isActive ? 'text-cyan-400' : 'text-white/40 group-hover:text-white/70')} />
                  {!collapsed && <span className={cn(isActive && 'font-semibold')}>Painel Admin</span>}
                  {isActive && collapsed && (
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-cyan-400 rounded-l-full" />
                  )}
                </>
              )}
            </NavLink>
          </div>
        )}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-14 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md z-20"
        style={{
          background: '#0d1f3c',
          border: '1px solid rgba(6,182,212,0.25)',
          color: 'rgba(6,182,212,0.7)',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(6,182,212,0.7)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(6,182,212,0.25)')}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  )
}

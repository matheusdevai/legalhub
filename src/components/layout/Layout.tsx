import { ReactNode, useState, useRef, useEffect, useCallback } from 'react'
import { SupportChatWidget } from '@/components/support/SupportChatWidget'
import { AiAssistantWidget } from '@/components/ai/AiAssistantWidget'
import { DailyAgendaModal } from '@/components/agenda/DailyAgendaModal'
import { useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import type { Notification } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Menu, Bell, Sun, Moon, Plus, ChevronDown,
  CheckSquare, Users, Briefcase, DollarSign,
  User, CreditCard, HelpCircle, LogOut, X, Wrench,
  Calendar, AlertCircle, CheckCheck, CreditCard as PaymentIcon,
  Info, Search,
} from 'lucide-react'

type SearchResults = {
  clients: { id: string; name: string; type: 'pf' | 'pj' }[]
  processes: { id: string; number: string; title: string; client_name: string | null }[]
  tasks: { id: string; title: string; status: string | null }[]
}

interface LayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
  actions?: ReactNode
  breadcrumbs?: { label: string; to?: string }[]
}

function useClickOutside(ref: React.RefObject<HTMLElement>, handler: () => void) {
  useEffect(() => {
    function listener(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}

function MaintenanceBanner() {
  return null
}

const NOTIF_ICONS: Record<string, React.ElementType> = {
  deadline: AlertCircle,
  hearing: Calendar,
  task: CheckSquare,
  payment: PaymentIcon,
  system: Info,
}

const NOTIF_COLORS: Record<string, string> = {
  deadline: 'text-red-500',
  hearing: 'text-blue-500',
  task: 'text-green-500',
  payment: 'text-amber-500',
  system: 'text-slate-400',
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const { session, profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null)
  const [agendaOpen, setAgendaOpen] = useState(false)

  const addRef = useRef<HTMLDivElement>(null!)
  const profileRef = useRef<HTMLDivElement>(null!)
  const notifRef = useRef<HTMLDivElement>(null!)
  const searchRef = useRef<HTMLDivElement>(null!)
  const searchInputRef = useRef<HTMLInputElement>(null!)
  useClickOutside(addRef, () => setAddOpen(false))
  useClickOutside(profileRef, () => setProfileOpen(false))
  useClickOutside(notifRef, () => setNotifOpen(false))
  useClickOutside(searchRef, () => setSearchOpen(false))

  const doSearch = useCallback(async (q: string) => {
    if (!profile?.tenant_id) return
    setSearchLoading(true)
    const [{ data: clients }, { data: processes }, { data: tasks }] = await Promise.all([
      supabase.from('clients').select('id,name,type').eq('tenant_id', profile.tenant_id).is('deleted_at', null).ilike('name', `%${q}%`).limit(4),
      supabase.from('processes').select('id,number,title,client_name').eq('tenant_id', profile.tenant_id).is('deleted_at', null).or(`title.ilike.%${q}%,number.ilike.%${q}%`).limit(4),
      supabase.from('tasks').select('id,title,status').eq('tenant_id', profile.tenant_id).ilike('title', `%${q}%`).limit(4),
    ])
    setSearchResults({ clients: clients || [], processes: processes || [], tasks: tasks || [] })
    setSearchLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => {
    if (search.length < 2) { setSearchResults(null); setSearchLoading(false); return }
    setSearchLoading(true)
    const timer = setTimeout(() => doSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search, doSearch])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        searchInputRef.current?.focus()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') { setSearchOpen(false); setSearch(''); searchInputRef.current?.blur() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function closeSearch() { setSearch(''); setSearchOpen(false); setSearchResults(null) }

  function goSearch(path: string) { closeSearch(); navigate(path) }

  const hasResults = searchResults && (
    searchResults.clients.length > 0 || searchResults.processes.length > 0 || searchResults.tasks.length > 0
  )

  const loadNotifications = useCallback(async () => {
    if (!profile?.user_id) return
    setNotifLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.user_id)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications(data || [])
    setNotifLoading(false)
  }, [profile?.user_id])

  useEffect(() => {
    if (notifOpen) loadNotifications()
  }, [notifOpen, loadNotifications])

  useEffect(() => {
    if (!profile?.user_id) return
    // Key changes on each new login (last_sign_in_at) — sessionStorage clears on tab close
    const signInAt = (session as any)?.user?.last_sign_in_at
    if (!signInAt) return
    const key = `lawfy_agenda_${profile.user_id}_${signInAt.slice(0, 16)}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      setAgendaOpen(true)
    }
  }, [profile?.user_id, (session as any)?.user?.last_sign_in_at])

  async function markAsRead(n: Notification) {
    if (!n.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    if (n.link) { setNotifOpen(false); navigate(n.link) }
  }

  async function markAllAsRead() {
    if (!profile?.user_id) return
    await supabase.from('notifications').update({ read: true })
      .eq('user_id', profile.user_id).eq('read', false)
    setNotifications(prev => prev.map(x => ({ ...x, read: true })))
  }

  const unreadCount = notifications.filter(n => !n.read).length

  const name = profile?.name || profile?.display_name || 'Usuário'
  const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()

  function goNew(path: string) {
    setAddOpen(false)
    navigate(path, { state: { openNew: true } })
  }

  const ADD_ITEMS = [
    { label: 'Nova tarefa',        icon: CheckSquare, action: () => goNew('/tarefas') },
    { label: 'Novo contato',       icon: Users,       action: () => goNew('/clientes') },
    { label: 'Novo processo',      icon: Briefcase,   action: () => goNew('/processos') },
    { label: 'Nova receita/despesa', icon: DollarSign, action: () => goNew('/financeiro') },
  ]

  const PROFILE_ITEMS = [
    { label: 'Meus dados',           icon: User,        action: () => { setProfileOpen(false); navigate('/configuracoes') } },
    { label: 'Assinatura e pagamento', icon: CreditCard, action: () => { setProfileOpen(false); navigate('/configuracoes') } },
    { label: 'Central de ajuda',     icon: HelpCircle,  action: () => { setProfileOpen(false); navigate('/suporte') } },
    { label: 'Sair',                 icon: LogOut,      action: () => { setProfileOpen(false); signOut() }, danger: true },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] dark:bg-dark-900">

      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed md:relative inset-y-0 left-0 z-40 md:z-auto transform transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <Sidebar onClose={() => setMobileSidebarOpen(false)} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Header ── */}
        <header className="sticky top-0 z-20 h-[58px] flex items-center gap-3 px-4 sm:px-5
          bg-white/95 dark:bg-dark-900/95 backdrop-blur-md
          border-b border-slate-100 dark:border-dark-700/50 flex-shrink-0 no-print">

          {/* Hamburger (mobile) */}
          <button className="md:hidden p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors flex-shrink-0"
            onClick={() => setMobileSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <div ref={searchRef} className="hidden sm:flex flex-1 max-w-xs relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Digite / para pesquisar"
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-full text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 transition-all"
            />
            {search && (
              <button onClick={closeSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Dropdown de resultados */}
            {searchOpen && search.length >= 2 && (
              <div className="absolute left-0 top-full mt-1.5 w-full min-w-[340px] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-slate-100 dark:border-dark-700 z-50 animate-fade-in overflow-hidden">
                {searchLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-4 h-4 border-2 border-[#0f172a] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : !hasResults ? (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    Nenhum resultado para <span className="font-medium text-slate-600 dark:text-slate-300">"{search}"</span>
                  </div>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto py-1.5">

                    {searchResults!.clients.length > 0 && (
                      <section>
                        <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Clientes</p>
                        {searchResults!.clients.map(c => (
                          <button key={c.id} onClick={() => goSearch('/clientes')}
                            className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 dark:hover:bg-dark-700/60 transition-colors text-left">
                            <Users className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                            <span className="text-xs text-slate-700 dark:text-slate-200 truncate">{c.name}</span>
                            <span className="ml-auto text-[10px] text-slate-400 flex-shrink-0">{c.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}</span>
                          </button>
                        ))}
                        <button onClick={() => goSearch('/clientes')} className="w-full px-4 py-1.5 text-left text-[10px] text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium">
                          Ver todos os clientes →
                        </button>
                      </section>
                    )}

                    {searchResults!.processes.length > 0 && (
                      <section className={searchResults!.clients.length > 0 ? 'border-t border-slate-50 dark:border-dark-700/50 mt-1 pt-1' : ''}>
                        <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Processos</p>
                        {searchResults!.processes.map(p => (
                          <button key={p.id} onClick={() => goSearch('/processos')}
                            className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 dark:hover:bg-dark-700/60 transition-colors text-left">
                            <Briefcase className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-slate-700 dark:text-slate-200 truncate">{p.title}</p>
                              {p.client_name && <p className="text-[10px] text-slate-400 truncate">{p.client_name}</p>}
                            </div>
                            <span className="ml-auto text-[10px] text-slate-400 flex-shrink-0 font-mono">{p.number}</span>
                          </button>
                        ))}
                        <button onClick={() => goSearch('/processos')} className="w-full px-4 py-1.5 text-left text-[10px] text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium">
                          Ver todos os processos →
                        </button>
                      </section>
                    )}

                    {searchResults!.tasks.length > 0 && (
                      <section className={(searchResults!.clients.length > 0 || searchResults!.processes.length > 0) ? 'border-t border-slate-50 dark:border-dark-700/50 mt-1 pt-1' : ''}>
                        <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Tarefas</p>
                        {searchResults!.tasks.map(t => (
                          <button key={t.id} onClick={() => goSearch('/tarefas')}
                            className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 dark:hover:bg-dark-700/60 transition-colors text-left">
                            <CheckSquare className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                            <span className="text-xs text-slate-700 dark:text-slate-200 truncate">{t.title}</span>
                          </button>
                        ))}
                        <button onClick={() => goSearch('/tarefas')} className="w-full px-4 py-1.5 text-left text-[10px] text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium">
                          Ver todas as tarefas →
                        </button>
                      </section>
                    )}

                  </div>
                )}
              </div>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Theme toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-dark-800 rounded-full p-0.5 gap-0.5">
            <button
              onClick={() => theme === 'dark' && toggleTheme()}
              className={`p-1.5 rounded-full transition-all ${theme === 'light' ? 'bg-white shadow-sm text-amber-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title="Modo Claro"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => theme === 'light' && toggleTheme()}
              className={`p-1.5 rounded-full transition-all ${theme === 'dark' ? 'bg-dark-700 shadow-sm text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title="Modo Escuro"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Bell */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => { setNotifOpen(o => !o); setAddOpen(false); setProfileOpen(false) }}
              className="relative p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-700 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Notificações"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-80 bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-slate-100 dark:border-dark-700 z-50 animate-fade-in flex flex-col" style={{ maxHeight: '420px' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-dark-700 flex-shrink-0">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Notificações</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="flex items-center gap-1 text-[11px] text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Marcar todas como lidas
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1">
                  {notifLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="w-5 h-5 border-2 border-[#0f172a] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500">
                      <Bell className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-xs">Nenhuma notificação</p>
                    </div>
                  ) : (
                    notifications.map(n => {
                      const Icon = NOTIF_ICONS[n.type || 'system'] || Info
                      const iconColor = NOTIF_COLORS[n.type || 'system'] || 'text-slate-400'
                      return (
                        <button
                          key={n.id}
                          onClick={() => markAsRead(n)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-dark-700/60 transition-colors border-b border-slate-50 dark:border-dark-700/50 last:border-0 ${!n.read ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
                        >
                          <div className={`mt-0.5 flex-shrink-0 ${iconColor}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium truncate ${!n.read ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>
                              {n.title}
                            </p>
                            {n.message && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                            )}
                            {n.created_at && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-1">
                                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                              </p>
                            )}
                          </div>
                          {!n.read && (
                            <span className="mt-1.5 w-2 h-2 rounded-full bg-[#0f172a] flex-shrink-0" />
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Adicionar dropdown */}
          <div ref={addRef} className="relative">
            <button
              onClick={() => { setAddOpen(o => !o); setProfileOpen(false); setNotifOpen(false) }}
              className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3.5 py-2 rounded-full transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Adicionar</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${addOpen ? 'rotate-180' : ''}`} />
            </button>
            {addOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-slate-100 dark:border-dark-700 py-1 z-50 animate-fade-in">
                {ADD_ITEMS.map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors text-left"
                  >
                    <item.icon className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Profile dropdown */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => { setProfileOpen(o => !o); setAddOpen(false); setNotifOpen(false) }}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {initials}
              </div>
              <span className="hidden sm:block text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                Olá, {name.split(' ')[0]}
              </span>
              <ChevronDown className={`hidden sm:block w-3 h-3 text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-slate-100 dark:border-dark-700 py-1 z-50 animate-fade-in">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-dark-700">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{name}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{profile?.email || ''}</p>
                </div>
                {PROFILE_ITEMS.map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left ${
                      (item as any).danger
                        ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-700'
                    }`}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${(item as any).danger ? 'text-red-400' : 'text-slate-400 dark:text-slate-500'}`} />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

        </header>

        {/* Maintenance banner */}
        <MaintenanceBanner />

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="flex-shrink-0 px-4 sm:px-6 py-2.5 border-t border-slate-100 dark:border-dark-700/50 bg-white/80 dark:bg-dark-900/80 no-print">
          <p className="text-center text-[10px] text-slate-400 dark:text-slate-600">
            Desenvolvido por <span className="font-semibold text-slate-500 dark:text-slate-500">Agência Raiz Digital Tech</span>
            {' '}·{' '}
            © {new Date().getFullYear()} LegalHub Gestor de Escritórios de Advocacia. Todos os direitos reservados.
          </p>
        </footer>
      </div>

      {/* Daily agenda modal */}
      <DailyAgendaModal open={agendaOpen} onClose={() => setAgendaOpen(false)} />

      {/* Support chat widget */}
      <SupportChatWidget />

      {/* AI assistant widget */}
      <AiAssistantWidget />
    </div>
  )
}

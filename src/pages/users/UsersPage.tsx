import { usePageLoadingState } from '@/contexts/PageLoadingContext'
import { useEffect, useState } from 'react'
import {
  Plus, Search, Users, Mail, Trash2, Eye, EyeOff, Copy, Check, RefreshCw,
  Shield, Scale, BookOpen, DollarSign, Crown, UserCheck, UserX, Building2,
  CreditCard, ChevronRight, Zap, Star, Infinity,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Badge, Modal, Input, Select, EmptyState, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import {
  getInitials, getRoleStyle, computeRoleCounts, filterProfiles,
  canManageUsers, planUsagePercent, ROLE_LABELS, PLAN_LABELS, PLAN_LIMITS,
} from '@/lib/accountUtils'

// ── inner nav sections ────────────────────────────────────────────────────────
type Section = 'conta' | 'usuarios' | 'plano'

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'conta',    label: 'Dados da Conta',       icon: Building2 },
  { id: 'usuarios', label: 'Usuários do Escritório', icon: Users },
  { id: 'plano',    label: 'Plano e Assinatura',   icon: CreditCard },
]

const ROLE_ICONS_MAP: Record<string, React.ReactNode> = {
  admin:      <Shield className="w-3.5 h-3.5" />,
  lawyer:     <Scale className="w-3.5 h-3.5" />,
  intern:     <BookOpen className="w-3.5 h-3.5" />,
  financial:  <DollarSign className="w-3.5 h-3.5" />,
  super_admin:<Crown className="w-3.5 h-3.5" />,
}

type UserForm = { name: string; email: string; role: string; password: string }
const EMPTY_FORM: UserForm = { name: '', email: '', role: 'intern', password: '' }

const roleTabs = [
  { id: '', label: 'Todos' },
  { id: 'admin', label: 'Admins' },
  { id: 'lawyer', label: 'Advogados' },
  { id: 'intern', label: 'Estagiários' },
  { id: 'financial', label: 'Financeiro' },
]

const PLAN_FEATURES: Record<string, string[]> = {
  starter:      ['Até 3 usuários', '500 MB de armazenamento', 'Clientes e processos', 'Módulo financeiro básico'],
  professional: ['Até 10 usuários', '5 GB de armazenamento', 'Todos os módulos', 'Relatórios avançados', 'Suporte prioritário'],
  enterprise:   ['Usuários ilimitados', 'Armazenamento ilimitado', 'Todos os módulos', 'API de integração', 'Gerente de conta dedicado'],
}

const PLAN_ICONS: Record<string, React.ElementType> = {
  starter:      Zap,
  professional: Star,
  enterprise:   Infinity,
}

const PLAN_COLORS: Record<string, string> = {
  starter:      'from-blue-600 to-blue-400',
  professional: 'from-purple-600 to-purple-400',
  enterprise:   'from-amber-600 to-amber-400',
}

export function UsersPage() {
  const { profile, refreshProfile } = useAuth()
  const [section, setSection] = useState<Section>('conta')

  // ── users state ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = usePageLoadingState()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // ── account (dados da conta) state ───────────────────────────────────────
  const [tenantName, setTenantName] = useState('')
  const [tenantCity, setTenantCity] = useState('')
  const [oabNumber, setOabNumber] = useState('')
  const [oabSeccional, setOabSeccional] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountSaved, setAccountSaved] = useState(false)

  async function loadUsers() {
    setLoading(true)
    let q = supabase.from('profiles').select('*').order('name')
    if (profile?.tenant_id) q = q.eq('tenant_id', profile.tenant_id)
    const { data } = await q
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
    if (profile) {
      setTenantName(profile.name || '')
      setOabNumber(profile.oab_number || '')
      setOabSeccional(profile.oab_seccional || '')
    }
  }, [profile?.tenant_id])

  // ── derived ──────────────────────────────────────────────────────────────
  const roleCounts = computeRoleCounts(users)
  const filtered = filterProfiles(users, search, roleFilter)
  const canManage = canManageUsers(profile?.role || '')
  const plan = (profile as any)?.subscription_plan || 'starter'
  const usagePercent = planUsagePercent(users.length, plan)
  const planLimit = PLAN_LIMITS[plan] ?? 999
  const PlanIcon = PLAN_ICONS[plan] || Zap

  // ── user CRUD ────────────────────────────────────────────────────────────
  function openNew() {
    setEditId(null)
    setForm({ ...EMPTY_FORM, password: Array.from({ length: 12 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$'[Math.floor(Math.random() * 58)]).join('') })
    setCreatedCredentials(null)
    setShowPassword(false)
    setModalOpen(true)
  }

  function openEdit(u: Profile) {
    setEditId(u.id)
    setForm({ name: u.name || u.display_name || '', email: u.email || '', role: u.role, password: '' })
    setCreatedCredentials(null)
    setModalOpen(true)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editId) {
        const { error } = await supabase.from('profiles')
          .update({ name: form.name, display_name: form.name, role: form.role as Profile['role'] })
          .eq('id', editId)
        if (error) { alert('Erro ao atualizar: ' + error.message); return }
        setModalOpen(false)
        loadUsers()
        return
      }
      if (!form.email.trim() || !form.password.trim()) return
      if (!profile?.tenant_id) { alert('Erro: administrador sem tenant válido. Contate o suporte.'); return }

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) { alert('Erro: sessão expirada. Faça login novamente.'); return }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ email: form.email.trim(), password: form.password, name: form.name, role: form.role, tenant_id: profile.tenant_id }),
      })
      const resData = await res.json().catch(() => ({ error: 'Resposta inválida do servidor' }))
      if (!res.ok) { alert('Erro ao criar usuário: ' + (resData.error || res.statusText)); return }
      setCreatedCredentials({ email: form.email.trim(), password: form.password })
      loadUsers()
    } catch (err: unknown) {
      alert('Erro inesperado: ' + (err instanceof Error ? err.message : 'Erro de conexão.'))
    } finally { setSaving(false) }
  }

  function copyCredentials() {
    if (!createdCredentials) return
    navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nSenha: ${createdCredentials.password}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function removeUser(id: string) {
    if (!confirm('Deseja remover este usuário do escritório? Esta ação não pode ser desfeita.')) return
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) { alert('Sessão expirada. Faça login novamente.'); return }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ userId: id }),
      })
      const resData = await res.json().catch(() => ({ error: 'Resposta inválida' }))
      if (!res.ok) { alert('Erro ao excluir usuário: ' + (resData.error || res.statusText)); return }
      loadUsers()
    } catch (err: unknown) {
      alert('Erro inesperado: ' + (err instanceof Error ? err.message : 'Erro de conexão.'))
    }
  }

  // ── save account info ────────────────────────────────────────────────────
  async function saveAccount() {
    if (!profile?.id) return
    setSavingAccount(true)
    await supabase.from('profiles').update({
      name: tenantName,
      display_name: tenantName,
      oab_number: oabNumber,
      oab_seccional: oabSeccional,
    }).eq('id', profile.id)
    await refreshProfile()
    setSavingAccount(false)
    setAccountSaved(true)
    setTimeout(() => setAccountSaved(false), 2500)
  }

  return (
    <Layout title="Conta e Assinatura">
      <div className="flex gap-5 min-h-[600px]">

        {/* ── Left inner nav ─────────────────────────────────────────────── */}
        <div className="w-52 flex-shrink-0">
          <Card className="p-2 sticky top-4">
            <nav className="space-y-0.5">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                const active = section === id
                return (
                  <button
                    key={id}
                    onClick={() => setSection(id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left relative ${
                      active
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-800 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-600 rounded-r-full" />}
                    <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'}`} />
                    <span className="leading-tight">{label}</span>
                    {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-primary-400" />}
                  </button>
                )
              })}
            </nav>
          </Card>
        </div>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* ============================================================ */}
          {/* SEÇÃO 1: DADOS DA CONTA                                       */}
          {/* ============================================================ */}
          {section === 'conta' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Dados do escritório</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Informações exibidas no sistema e nos documentos gerados.</p>
              </div>

              <Card className="p-6 space-y-5">
                {/* Avatar placeholder */}
                <div className="flex items-center gap-4 pb-5 border-b border-gray-100 dark:border-dark-700">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${PLAN_COLORS[plan]} flex items-center justify-center text-white text-2xl font-bold shadow-md`}>
                    {getInitials(tenantName || profile?.name || '')}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{tenantName || profile?.name || 'Seu escritório'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{profile?.email}</p>
                    <span className={`inline-flex items-center gap-1 mt-1 text-xs px-2 py-0.5 rounded-full font-medium bg-gradient-to-r ${PLAN_COLORS[plan]} text-white`}>
                      <PlanIcon className="w-3 h-3" />
                      {PLAN_LABELS[plan] || plan}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Input
                      label="Nome / Razão Social *"
                      value={tenantName}
                      onChange={e => setTenantName(e.target.value)}
                      placeholder="Ex: Silva & Associados Advogados"
                    />
                  </div>
                  <Input
                    label="Cidade"
                    value={tenantCity}
                    onChange={e => setTenantCity(e.target.value)}
                    placeholder="São Paulo"
                  />
                  <Input
                    label="Email"
                    value={profile?.email || ''}
                    disabled
                    hint="O email não pode ser alterado aqui."
                  />
                  <Input
                    label="Número OAB"
                    value={oabNumber}
                    onChange={e => setOabNumber(e.target.value)}
                    placeholder="123456"
                  />
                  <Input
                    label="Seccional OAB"
                    value={oabSeccional}
                    onChange={e => setOabSeccional(e.target.value)}
                    placeholder="SP"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  {accountSaved && (
                    <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                      <Check className="w-4 h-4" /> Salvo com sucesso!
                    </span>
                  )}
                  <Button onClick={saveAccount} loading={savingAccount}>
                    Salvar alterações
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* ============================================================ */}
          {/* SEÇÃO 2: USUÁRIOS DO ESCRITÓRIO                               */}
          {/* ============================================================ */}
          {section === 'usuarios' && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Usuários do escritório</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {users.length} {users.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'}
                    {planLimit < 999 && ` · limite ${planLimit} no plano ${PLAN_LABELS[plan]}`}
                  </p>
                </div>
                {canManage && (
                  <Button onClick={openNew} className="gap-1.5">
                    <Plus className="w-4 h-4" /> Novo usuário
                  </Button>
                )}
              </div>

              {/* Stats bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { role: 'admin', label: 'Admins', icon: Shield, color: 'purple' },
                  { role: 'lawyer', label: 'Advogados', icon: Scale, color: 'blue' },
                  { role: 'intern', label: 'Estagiários', icon: BookOpen, color: 'amber' },
                  { role: 'financial', label: 'Financeiro', icon: DollarSign, color: 'green' },
                ].map(({ role, label, icon: Icon, color }) => (
                  <Card key={role} className="p-3.5 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                      color === 'blue'   ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                      color === 'amber'  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                                           'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{roleCounts[role] || 0}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Search + role filter */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-dark-600 rounded-xl bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                    placeholder="Buscar por nome, email ou perfil..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {roleTabs.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setRoleFilter(t.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                        roleFilter === t.id
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
                      }`}
                    >
                      {t.label}
                      {t.id && <span className={`ml-1 text-xs font-bold ${roleFilter === t.id ? 'opacity-80' : 'opacity-60'}`}>{roleCounts[t.id] || 0}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Users grid */}
              {!loading && (filtered.length === 0 ? (
                <EmptyState icon={Users} title="Nenhum usuário encontrado" description="Cadastre o primeiro usuário do escritório." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map(u => {
                    const isCurrentUser = u.id === profile?.id
                    const style = getRoleStyle(u.role)
                    const initials = getInitials(u.name || u.display_name || '')

                    return (
                      <Card key={u.id} className={`overflow-hidden hover:shadow-lg transition-all group ${isCurrentUser ? 'ring-2 ring-primary-500/30' : ''}`}>
                        <div className={`h-1.5 w-full bg-gradient-to-r ${style.gradient}`} />
                        <div className="p-5">
                          <div className="flex items-start justify-between mb-4">
                            <div className={`w-13 h-13 w-[52px] h-[52px] rounded-2xl bg-gradient-to-br ${style.gradient} flex items-center justify-center text-white font-bold text-lg shadow-sm flex-shrink-0`}>
                              {initials}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {canManage && (
                                <button
                                  onClick={() => openEdit(u)}
                                  className="p-2 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-400 hover:text-primary-600 transition-colors"
                                  title="Editar"
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </button>
                              )}
                              {canManage && !isCurrentUser && (
                                <button
                                  onClick={() => removeUser(u.id)}
                                  className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                                  title="Remover"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                                {u.name || u.display_name || '—'}
                              </h3>
                              {isCurrentUser && (
                                <span className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 font-medium bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded-full flex-shrink-0">
                                  <UserCheck className="w-3 h-3" /> você
                                </span>
                              )}
                            </div>
                            <Badge className={`inline-flex items-center gap-1.5 ${style.badge}`}>
                              {ROLE_ICONS_MAP[u.role]}
                              {ROLE_LABELS[u.role] || u.role}
                            </Badge>
                          </div>

                          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-dark-700 space-y-1.5">
                            {u.email && (
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <Mail className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                                <span className="truncate">{u.email}</span>
                              </div>
                            )}
                            {u.created_at && (
                              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                                <UserX className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>Desde {formatDate(u.created_at)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ============================================================ */}
          {/* SEÇÃO 3: PLANO E ASSINATURA                                   */}
          {/* ============================================================ */}
          {section === 'plano' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Plano e assinatura</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Gerencie seu plano, uso e faturamento.</p>
              </div>

              {/* Current plan card */}
              <div className={`rounded-2xl bg-gradient-to-br ${PLAN_COLORS[plan]} p-6 text-white shadow-lg`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <PlanIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-sm text-white/70">Plano atual</p>
                      <p className="text-2xl font-bold">{PLAN_LABELS[plan] || plan}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white/70">Status</p>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold bg-white/20 px-3 py-1 rounded-full">
                      <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                      Ativo
                    </span>
                  </div>
                </div>
              </div>

              {/* Usage meter */}
              {planLimit < 999 && (
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Usuários utilizados</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {users.length} de {planLimit} usuários
                      </p>
                    </div>
                    <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${
                      usagePercent >= 90 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      usagePercent >= 70 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    }`}>
                      {usagePercent}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 dark:bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  {usagePercent >= 90 && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
                      <span>⚠️</span> Você está próximo do limite. Considere fazer upgrade.
                    </p>
                  )}
                </Card>
              )}

              {/* Features list */}
              <Card className="p-5">
                <p className="font-medium text-gray-900 dark:text-white mb-4">Recursos do seu plano</p>
                <ul className="space-y-2.5">
                  {(PLAN_FEATURES[plan] || PLAN_FEATURES.starter).map(feature => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Upgrade CTA */}
              {plan !== 'enterprise' && (
                <Card className="p-5 border border-primary-200 dark:border-primary-800/30 bg-primary-50/50 dark:bg-primary-900/10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        Quer mais recursos?
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                        Faça upgrade para o plano {plan === 'starter' ? 'Professional' : 'Enterprise'} e desbloqueie mais usuários e funcionalidades avançadas.
                      </p>
                    </div>
                    <Button className="flex-shrink-0" onClick={() => window.open('mailto:suporte@lawfy.com.br?subject=Upgrade de plano', '_blank')}>
                      Fazer upgrade
                    </Button>
                  </div>
                </Card>
              )}

              {/* Contact */}
              <p className="text-sm text-center text-gray-500 dark:text-gray-400">
                Dúvidas sobre cobrança?{' '}
                <a href="mailto:suporte@lawfy.com.br" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
                  Fale com nosso suporte
                </a>
              </p>
            </div>
          )}

        </div>
      </div>

      {/* ── Novo / Editar Usuário Modal ─────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setCreatedCredentials(null) }}
        title={createdCredentials ? 'Usuário criado' : editId ? 'Editar usuário' : 'Novo usuário'}
        size="md"
      >
        {createdCredentials ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-green-800 dark:text-green-300">Usuário criado com sucesso!</p>
                <p className="text-sm text-green-600 dark:text-green-400">Compartilhe as credenciais com o usuário.</p>
              </div>
            </div>

            <div className="space-y-3 p-4 rounded-xl bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Email</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{createdCredentials.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Senha temporária</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-lg font-mono text-sm font-bold text-gray-900 dark:text-white tracking-widest">
                    {showPassword ? createdCredentials.password : '••••••••••••'}
                  </div>
                  <button onClick={() => setShowPassword(!showPassword)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button onClick={copyCredentials} className="p-2 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 text-primary-600 dark:text-primary-400" title="Copiar credenciais">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">⚠️ Salve essa senha — ela não será exibida novamente.</p>
            </div>

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={openNew}><Plus className="w-4 h-4" /> Criar outro</Button>
              <Button onClick={() => { setModalOpen(false); setCreatedCredentials(null) }}>Fechar</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="Nome completo *"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do usuário"
            />
            {!editId && (
              <Input
                label="Email *"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            )}
            <Select
              label="Perfil de acesso"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              <option value="admin">Administrador — acesso total</option>
              <option value="lawyer">Advogado — acesso completo</option>
              <option value="intern">Estagiário — acesso limitado</option>
              <option value="financial">Financeiro — módulo financeiro</option>
            </Select>
            {!editId && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Senha temporária</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, password: Array.from({ length: 12 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$'[Math.floor(Math.random() * 58)]).join('') })}
                    className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" /> Gerar nova
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 font-mono"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-400">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">O usuário precisará dessa senha para o primeiro acesso.</p>
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={save} loading={saving}>{editId ? 'Salvar alterações' : 'Criar usuário'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  )
}

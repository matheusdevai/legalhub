import { useState, useEffect } from 'react'
import {
  User, Lock, Bell, Building2, CreditCard, Palette, Globe,
  CheckCircle2, AlertCircle, Eye, EyeOff, Shield, Smartphone, Mail,
  History, Plus, Pencil, Trash2, ShieldAlert, LogIn, KeyRound, UserCog,
  Download, ShieldX,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Input, Select, EmptyState } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import { cn, formatDate } from '@/lib/utils'
import { NotificationPrefs } from '@/types'
import { withErrorFeedback } from '@/lib/errorFeedback'

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  new_tasks: true, task_due: true, new_processes: false,
  new_publications: true, financial_due: true, new_clients: false,
}

const NOTIFICATION_ITEMS: { key: keyof NotificationPrefs; icon: any; label: string; desc: string }[] = [
  { key: 'new_tasks',        icon: Bell,       label: 'Novas tarefas atribuídas', desc: 'Quando uma tarefa é atribuída a você' },
  { key: 'task_due',         icon: AlertCircle, label: 'Tarefas vencendo',         desc: 'Lembretes 24h antes do vencimento' },
  { key: 'new_processes',    icon: Mail,       label: 'Novos processos',          desc: 'Quando um processo é criado ou atualizado' },
  { key: 'new_publications', icon: Bell,       label: 'Novas publicações',        desc: 'Publicações no Diário de Justiça' },
  { key: 'financial_due',    icon: CreditCard, label: 'Vencimentos financeiros',   desc: 'Cobranças próximas do vencimento' },
  { key: 'new_clients',      icon: User,       label: 'Novos clientes',           desc: 'Quando um cliente é cadastrado' },
]

type Tab = 'profile' | 'security' | 'notifications' | 'appearance' | 'plan' | 'audit' | 'alerts'

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'profile',       label: 'Perfil',         icon: User },
  { id: 'security',      label: 'Segurança',       icon: Lock },
  { id: 'notifications', label: 'Notificações',    icon: Bell },
  { id: 'appearance',    label: 'Aparência',       icon: Palette },
  { id: 'plan',          label: 'Plano',           icon: CreditCard },
]

interface AuditLogEntry {
  id: string
  entity_type: string
  entity_id: string
  action: 'create' | 'update' | 'delete'
  entity_label: string | null
  changes: Record<string, { de: unknown; para: unknown }> | null
  user_id: string | null
  user_name: string | null
  created_at: string
}

const ENTITY_LABELS: Record<string, string> = {
  clients: 'Cliente', processes: 'Processo', tasks: 'Tarefa', financials: 'Financeiro',
}
const FIELD_LABELS: Record<string, string> = {
  status: 'Status', priority: 'Prioridade', due_date: 'Vencimento', amount: 'Valor',
  title: 'Título', name: 'Nome', description: 'Descrição', assigned_to: 'Responsável',
  type: 'Tipo', category: 'Categoria',
}
const ACTION_META: Record<string, { label: string; icon: any; color: string }> = {
  create: { label: 'Criou', icon: Plus, color: 'text-emerald-600 dark:text-emerald-400' },
  update: { label: 'Editou', icon: Pencil, color: 'text-blue-600 dark:text-blue-400' },
  delete: { label: 'Excluiu', icon: Trash2, color: 'text-red-500 dark:text-red-400' },
}

interface SecurityEvent {
  id: string
  event_type: string
  severity: 'info' | 'warning' | 'critical'
  user_id: string | null
  user_email: string | null
  user_name: string | null
  ip_address: string | null
  user_agent: string | null
  detail: Record<string, unknown> | null
  occurred_at: string
}

const SECURITY_EVENT_META: Record<string, { label: string; icon: any }> = {
  login_anomaly: { label: 'Entrada incomum', icon: LogIn },
  email_changed: { label: 'E-mail de acesso alterado', icon: Mail },
  password_changed: { label: 'Senha alterada', icon: KeyRound },
  brute_force: { label: 'Possível força bruta no login', icon: ShieldX },
  mass_export: { label: 'Exportação/consulta em massa', icon: Download },
  admin_created: { label: 'Novo administrador criado', icon: UserCog },
  admin_promoted: { label: 'Usuário promovido a administrador', icon: UserCog },
  mass_delete: { label: 'Exclusão em massa', icon: Trash2 },
}

const SEVERITY_META: Record<string, { label: string; badge: string }> = {
  info: { label: 'Informativo', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  warning: { label: 'Atenção', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  critical: { label: 'Crítico', badge: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
}

// Traduz o evento para uma frase única, em português simples — o painel deve
// ser entendível sem precisar abrir o campo `detail` (JSON cru).
function describeSecurityEvent(evt: SecurityEvent): string {
  const d = evt.detail || {}
  const quem = evt.user_name || evt.user_email || 'Alguém'
  switch (evt.event_type) {
    case 'login_anomaly': {
      const motivos = Array.isArray(d.motivos) ? (d.motivos as string[]).join('; ') : ''
      return `${quem} entrou de forma incomum${evt.ip_address ? ` (IP ${evt.ip_address})` : ''}${motivos ? `: ${motivos}` : ''}.`
    }
    case 'email_changed':
      return `${quem} trocou o e-mail de acesso${d.email_antigo && d.email_novo ? ` de ${d.email_antigo} para ${d.email_novo}` : ''}.`
    case 'password_changed':
      return `${quem} trocou a senha de acesso.`
    case 'brute_force':
      return `Alvo: ${evt.user_email || '—'} · ${d.tentativas_mesmo_usuario ?? '?'} tentativas para o mesmo e-mail, ${d.tentativas_totais ?? '?'} no total em ${d.janela_minutos ?? 10} minutos${evt.ip_address ? ` (IP ${evt.ip_address})` : ''}.`
    case 'mass_export':
      return `${quem} exportou/consultou ${d.quantidade ?? '?'} registros de uma vez${d.origem ? ` (${d.origem})` : ''}.`
    case 'admin_created':
      return `${quem} foi criado já como ${d.novo_papel === 'super_admin' ? 'super administrador' : 'administrador'}.`
    case 'admin_promoted':
      return `${quem} foi promovido a ${d.novo_papel === 'super_admin' ? 'super administrador' : 'administrador'}.`
    case 'mass_delete':
      return d.motivo
        ? `${quem} fez uma exclusão definitiva (fora do padrão do sistema) na tabela ${d.tabela}.`
        : `${quem} excluiu ${d.quantidade ?? 'vários'} registros em ${d.janela_minutos ?? 10} minutos (tabela: ${d.tabela_do_disparo ?? '—'}).`
    default:
      return quem
  }
}

export function SettingsPage() {
  const { profile, refreshProfile } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [tab, setTab] = useState<Tab>('profile')
  const [name, setName] = useState(profile?.name || profile?.display_name || '')
  const [city, setCity] = useState(profile?.city || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(profile?.notification_prefs || DEFAULT_NOTIFICATION_PREFS)
  const [savingNotifKey, setSavingNotifKey] = useState<string | null>(null)
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditEntityFilter, setAuditEntityFilter] = useState('')
  const AUDIT_PAGE_SIZE = 200
  const [auditLimit, setAuditLimit] = useState(AUDIT_PAGE_SIZE)
  const [auditHasMore, setAuditHasMore] = useState(false)
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([])
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securityTypeFilter, setSecurityTypeFilter] = useState('')
  const SECURITY_PAGE_SIZE = 100
  const [securityLimit, setSecurityLimit] = useState(SECURITY_PAGE_SIZE)
  const [securityHasMore, setSecurityHasMore] = useState(false)

  useEffect(() => {
    if (!profile) return
    setName(profile.name || profile.display_name || '')
    setCity(profile.city || '')
    setPhone(profile.phone || '')
    setNotifPrefs(profile.notification_prefs || DEFAULT_NOTIFICATION_PREFS)
  }, [profile])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const initials = (profile?.name || profile?.display_name || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()

  async function saveProfile() {
    if (!profile) return
    setSaving(true)
    const { error } = await withErrorFeedback(supabase.from('profiles').update({ name, city, phone }).eq('id', profile.id), 'Erro ao salvar perfil')
    setSaving(false)
    if (error) return
    await refreshProfile()
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function toggleNotification(key: keyof NotificationPrefs) {
    if (!profile) return
    const next = { ...notifPrefs, [key]: !notifPrefs[key] }
    setNotifPrefs(next)
    setSavingNotifKey(key)
    const { error } = await withErrorFeedback(supabase.from('profiles').update({ notification_prefs: next }).eq('id', profile.id), 'Erro ao salvar preferência de notificação')
    setSavingNotifKey(null)
    if (error) return
    await refreshProfile()
  }

  async function loadAuditLog(limit = auditLimit) {
    setAuditLoading(true)
    // Busca 1 registro a mais que o limite só para saber se existe mais
    // conteúdo além da página atual, sem precisar de um COUNT separado.
    let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit + 1)
    if (auditEntityFilter) query = query.eq('entity_type', auditEntityFilter)
    const { data } = await query
    const rows = (data || []) as AuditLogEntry[]
    setAuditHasMore(rows.length > limit)
    setAuditLog(rows.slice(0, limit))
    setAuditLoading(false)
  }

  function loadMoreAuditLog() {
    const next = auditLimit + AUDIT_PAGE_SIZE
    setAuditLimit(next)
    loadAuditLog(next)
  }

  async function loadSecurityEvents(limit = securityLimit) {
    setSecurityLoading(true)
    let query = supabase.from('security_events').select('*').order('occurred_at', { ascending: false }).limit(limit + 1)
    if (securityTypeFilter) query = query.eq('event_type', securityTypeFilter)
    const { data } = await query
    const rows = (data || []) as SecurityEvent[]
    setSecurityHasMore(rows.length > limit)
    setSecurityEvents(rows.slice(0, limit))
    setSecurityLoading(false)
  }

  function loadMoreSecurityEvents() {
    const next = securityLimit + SECURITY_PAGE_SIZE
    setSecurityLimit(next)
    loadSecurityEvents(next)
  }

  useEffect(() => {
    if (tab === 'audit' && isAdmin) { setAuditLimit(AUDIT_PAGE_SIZE); loadAuditLog(AUDIT_PAGE_SIZE) }
  }, [tab, auditEntityFilter, isAdmin])

  useEffect(() => {
    if (tab === 'alerts' && isAdmin) { setSecurityLimit(SECURITY_PAGE_SIZE); loadSecurityEvents(SECURITY_PAGE_SIZE) }
  }, [tab, securityTypeFilter, isAdmin])

  async function changePassword() {
    if (!newPassword || newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'As senhas não coincidem.' })
      return
    }
    setChangingPassword(true)
    setPasswordMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPasswordMsg({ type: 'error', text: 'Erro: ' + error.message })
    } else {
      setPasswordMsg({ type: 'success', text: 'Senha alterada com sucesso!' })
      setNewPassword('')
      setConfirmPassword('')
    }
    setChangingPassword(false)
  }

  const roleLabel: Record<string, string> = {
    super_admin: 'Super Administrador',
    admin: 'Administrador',
    lawyer: 'Advogado',
    intern: 'Estagiário',
    financial: 'Financeiro',
  }

  return (
    <Layout title="Configurações" subtitle="Gerencie seu perfil e preferências">
      <div className="max-w-4xl">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Sidebar tabs */}
          <div className="w-full lg:w-52 flex-shrink-0">
            <Card className="p-2 overflow-hidden">
              {[...TABS, ...(isAdmin ? [
                { id: 'audit' as Tab, label: 'Auditoria', icon: History },
                { id: 'alerts' as Tab, label: 'Alertas de Segurança', icon: ShieldAlert },
              ] : [])].map(t => {
                const Icon = t.icon
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                      tab === t.id
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700'
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {t.label}
                  </button>
                )
              })}
            </Card>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">

            {/* PROFILE TAB */}
            {tab === 'profile' && (
              <Card className="overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-700">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Dados do Perfil</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Suas informações pessoais e de conta</p>
                </div>

                {/* Avatar section */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-700 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{profile?.name || profile?.display_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{profile?.email}</p>
                    <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 rounded-full">
                      {roleLabel[profile?.role || ''] || profile?.role}
                    </span>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Nome completo" value={name} onChange={e => setName(e.target.value)} />
                    <Input label="Email" value={profile?.email || ''} disabled className="opacity-60 cursor-not-allowed" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Cidade" value={city} onChange={e => setCity(e.target.value)} placeholder="São Paulo, SP" />
                    <Input label="Telefone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Função</label>
                    <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300 font-medium">{roleLabel[profile?.role || ''] || profile?.role || '—'}</p>
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <Button onClick={saveProfile} loading={saving}>Salvar Alterações</Button>
                    {saved && (
                      <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" /> Salvo com sucesso!
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* SECURITY TAB */}
            {tab === 'security' && (
              <div className="space-y-4">
                <Card className="overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-700">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Alterar Senha</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Recomendamos usar uma senha forte com letras, números e símbolos</p>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="relative">
                      <Input
                        label="Nova senha"
                        type={showPwd ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(!showPwd)}
                        className="absolute right-3 top-8 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Input
                      label="Confirmar senha"
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Digite a senha novamente"
                    />

                    {/* Password strength */}
                    {newPassword && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Força da senha</p>
                        <div className="flex gap-1">
                          {[...Array(4)].map((_, i) => {
                            const strength = Math.min(Math.floor(newPassword.length / 3), 4)
                            return (
                              <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all', i < strength
                                ? strength <= 1 ? 'bg-red-500' : strength <= 2 ? 'bg-orange-500' : strength <= 3 ? 'bg-yellow-500' : 'bg-emerald-500'
                                : 'bg-gray-200 dark:bg-dark-600'
                              )} />
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {passwordMsg && (
                      <div className={cn(
                        'flex items-center gap-2 text-sm rounded-xl px-4 py-3',
                        passwordMsg.type === 'success'
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                      )}>
                        {passwordMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                        {passwordMsg.text}
                      </div>
                    )}

                    <div className="pt-2">
                      <Button onClick={changePassword} loading={changingPassword} variant="outline">
                        <Lock className="w-4 h-4" /> Alterar Senha
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-700">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Segurança da Conta</h2>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-700 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                          <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Autenticação de dois fatores</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Adiciona uma camada extra de segurança</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-gray-400 bg-gray-200 dark:bg-dark-600 px-3 py-1 rounded-full">Em breve</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-700 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                          <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Sessões ativas</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Gerencie dispositivos conectados</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-gray-400 bg-gray-200 dark:bg-dark-600 px-3 py-1 rounded-full">Em breve</span>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* NOTIFICATIONS TAB */}
            {tab === 'notifications' && (
              <Card className="overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-700">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Preferências de Notificações</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Controle como e quando receber notificações</p>
                </div>
                <div className="p-6 space-y-1">
                  {NOTIFICATION_ITEMS.map(item => {
                    const Icon = item.icon
                    const enabled = notifPrefs[item.key]
                    return (
                      <div key={item.key} className="flex items-center justify-between py-3.5 border-b border-gray-50 dark:border-dark-700 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-dark-700 flex items-center justify-center">
                            <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleNotification(item.key)}
                          disabled={savingNotifKey === item.key}
                          className={cn(
                            'relative w-11 h-6 rounded-full transition-all disabled:opacity-60',
                            enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
                          )}
                        >
                          <span className={cn(
                            'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                            enabled ? 'left-[22px]' : 'left-0.5'
                          )} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}

            {/* APPEARANCE TAB */}
            {tab === 'appearance' && (
              <Card className="overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-700">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Aparência</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Personalize a interface do sistema</p>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">Tema</p>
                    <div className="flex gap-3">
                      {[
                        { id: 'light', label: 'Claro', preview: 'bg-gray-100' },
                        { id: 'dark', label: 'Escuro', preview: 'bg-gray-900' },
                      ].map(t => (
                        <button
                          key={t.id}
                          onClick={() => { if (t.id !== theme) toggleTheme() }}
                          className={cn(
                            'flex-1 p-4 rounded-xl border-2 transition-all text-sm font-medium',
                            theme === t.id
                              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                              : 'border-gray-200 dark:border-dark-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-dark-500'
                          )}
                        >
                          <div className={cn('w-full h-12 rounded-lg mb-2 border border-gray-200 dark:border-dark-600', t.preview)} />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Idioma</p>
                      <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 dark:bg-dark-600 px-2 py-0.5 rounded-full">Em breve</span>
                    </div>
                    <Select label="" value="pt-BR" disabled className="opacity-60 cursor-not-allowed">
                      <option value="pt-BR">Português (Brasil)</option>
                    </Select>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">O sistema está disponível apenas em português por enquanto.</p>
                  </div>
                </div>
              </Card>
            )}

            {/* PLAN TAB */}
            {tab === 'plan' && (
              <div className="space-y-4">
                <Card className="overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-700">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Plano Atual</h2>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between p-5 bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl text-white mb-5 shadow-lg">
                      <div>
                        <p className="text-xs text-white/70 uppercase tracking-wide">Seu plano</p>
                        <p className="text-2xl font-bold capitalize mt-0.5">{profile?.subscription_plan || 'Free'}</p>
                      </div>
                      <div className={cn(
                        'px-3 py-1.5 rounded-full text-sm font-semibold',
                        profile?.subscription_status === 'active'
                          ? 'bg-white/20 text-white'
                          : 'bg-white/20 text-white'
                      )}>
                        {profile?.subscription_status === 'active' ? 'Ativo' : 'Inativo'}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { label: 'Processos ilimitados', included: true },
                        { label: 'Clientes ilimitados', included: true },
                        { label: 'Integração com Google Calendar', included: true },
                        { label: 'Monitoramento de publicações', included: profile?.subscription_plan !== 'free' },
                        { label: 'Relatórios avançados', included: profile?.subscription_plan !== 'free' },
                        { label: 'API de integração', included: false },
                        { label: 'Suporte prioritário', included: false },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2.5 text-sm">
                          {item.included
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            : <AlertCircle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                          }
                          <span className={item.included ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>

                <Card className="p-6 border-2 border-dashed border-primary-200 dark:border-primary-800">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Upgrade para Pro</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Acesse monitoramento de publicações, relatórios avançados, suporte prioritário e muito mais.</p>
                    </div>
                    <Button>Fazer Upgrade</Button>
                  </div>
                </Card>
              </div>
            )}

            {/* AUDIT TAB */}
            {tab === 'audit' && isAdmin && (
              <Card className="overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-700 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Log de Auditoria</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Quem criou, editou ou excluiu registros no sistema</p>
                  </div>
                  <select
                    value={auditEntityFilter}
                    onChange={e => setAuditEntityFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300"
                  >
                    <option value="">Todas as entidades</option>
                    <option value="clients">Clientes</option>
                    <option value="processes">Processos</option>
                    <option value="tasks">Tarefas</option>
                    <option value="financials">Financeiro</option>
                  </select>
                </div>
                <div className="max-h-[560px] overflow-y-auto divide-y divide-gray-50 dark:divide-dark-700">
                  {auditLoading ? (
                    <p className="text-sm text-gray-400 text-center py-10">Carregando...</p>
                  ) : auditLog.length === 0 ? (
                    <EmptyState icon={History} title="Nenhum registro de auditoria ainda" />
                  ) : auditLog.map(entry => {
                    const meta = ACTION_META[entry.action]
                    const Icon = meta.icon
                    return (
                      <div key={entry.id} className="px-6 py-3.5 flex items-start gap-3">
                        <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', meta.color)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-white">{entry.user_name || 'Sistema (automático)'}</span>
                            {' '}{meta.label.toLowerCase()}{' '}
                            <span className="font-medium">{ENTITY_LABELS[entry.entity_type] || entry.entity_type}</span>
                            {entry.entity_label && <> — <span className="italic">{entry.entity_label}</span></>}
                          </p>
                          {entry.changes && Object.keys(entry.changes).length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {Object.entries(entry.changes).map(([field, diff]) => (
                                <li key={field} className="text-xs text-gray-400 dark:text-gray-500">
                                  {FIELD_LABELS[field] || field}: <span className="line-through">{String(diff.de ?? '—')}</span> → <span className="text-gray-600 dark:text-gray-300">{String(diff.para ?? '—')}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{formatDate(entry.created_at, "dd/MM/yyyy 'às' HH:mm")}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {!auditLoading && auditHasMore && (
                  <div className="px-6 py-3 border-t border-gray-50 dark:border-dark-700 text-center">
                    <button
                      onClick={loadMoreAuditLog}
                      className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                    >
                      Carregar mais registros
                    </button>
                  </div>
                )}
              </Card>
            )}

            {/* ALERTS TAB */}
            {tab === 'alerts' && isAdmin && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {(['critical', 'warning', 'info'] as const).map(sev => (
                    <Card key={sev} className="p-4 text-center">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {securityEvents.filter(e => e.severity === sev).length}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{SEVERITY_META[sev].label}</p>
                    </Card>
                  ))}
                </div>

                <Card className="overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-700 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900 dark:text-white">Alertas de Segurança</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Entradas incomuns, tentativas de invasão e ações sensíveis, mais recentes primeiro</p>
                    </div>
                    <select
                      value={securityTypeFilter}
                      onChange={e => setSecurityTypeFilter(e.target.value)}
                      className="px-3 py-1.5 text-xs border border-gray-200 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-700 dark:text-gray-300"
                    >
                      <option value="">Todos os tipos</option>
                      {Object.entries(SECURITY_EVENT_META).map(([key, meta]) => (
                        <option key={key} value={key}>{meta.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="max-h-[560px] overflow-y-auto divide-y divide-gray-50 dark:divide-dark-700">
                    {securityLoading ? (
                      <p className="text-sm text-gray-400 text-center py-10">Carregando...</p>
                    ) : securityEvents.length === 0 ? (
                      <EmptyState icon={ShieldAlert} title="Nenhum alerta de segurança" description="Ótimo sinal — nada incomum foi detectado até agora." />
                    ) : securityEvents.map(evt => {
                      const meta = SECURITY_EVENT_META[evt.event_type] || { label: evt.event_type, icon: ShieldAlert }
                      const Icon = meta.icon
                      const sev = SEVERITY_META[evt.severity] || SEVERITY_META.warning
                      return (
                        <div key={evt.id} className="px-6 py-3.5 flex items-start gap-3">
                          <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">{meta.label}</span>
                              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', sev.badge)}>{sev.label}</span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                              {describeSecurityEvent(evt)}
                            </p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{formatDate(evt.occurred_at, "dd/MM/yyyy 'às' HH:mm")}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {!securityLoading && securityHasMore && (
                    <div className="px-6 py-3 border-t border-gray-50 dark:border-dark-700 text-center">
                      <button
                        onClick={loadMoreSecurityEvents}
                        className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                      >
                        Carregar mais alertas
                      </button>
                    </div>
                  )}
                </Card>
              </div>
            )}

          </div>
        </div>
      </div>
    </Layout>
  )
}

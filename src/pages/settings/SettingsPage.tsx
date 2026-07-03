import { useState } from 'react'
import {
  User, Lock, Bell, Building2, CreditCard, Palette, Globe,
  CheckCircle2, AlertCircle, Eye, EyeOff, Shield, Smartphone, Mail,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button, Card, Input, Select } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Tab = 'profile' | 'security' | 'notifications' | 'appearance' | 'plan'

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'profile',       label: 'Perfil',         icon: User },
  { id: 'security',      label: 'Segurança',       icon: Lock },
  { id: 'notifications', label: 'Notificações',    icon: Bell },
  { id: 'appearance',    label: 'Aparência',       icon: Palette },
  { id: 'plan',          label: 'Plano',           icon: CreditCard },
]

export function SettingsPage() {
  const { profile, refreshProfile } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [tab, setTab] = useState<Tab>('profile')
  const [name, setName] = useState(profile?.name || profile?.display_name || '')
  const [city, setCity] = useState(profile?.city || '')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const initials = (profile?.name || profile?.display_name || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()

  async function saveProfile() {
    if (!profile) return
    setSaving(true)
    await supabase.from('profiles').update({ name, city }).eq('id', profile.id)
    await refreshProfile()
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
  }

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
              {TABS.map(t => {
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
                  {[
                    { icon: Bell, label: 'Novas tarefas atribuídas', desc: 'Quando uma tarefa é atribuída a você', enabled: true },
                    { icon: AlertCircle, label: 'Tarefas vencendo', desc: 'Lembretes 24h antes do vencimento', enabled: true },
                    { icon: Mail, label: 'Novos processos', desc: 'Quando um processo é criado ou atualizado', enabled: false },
                    { icon: Bell, label: 'Novas publicações', desc: 'Publicações no Diário de Justiça', enabled: true },
                    { icon: CreditCard, label: 'Vencimentos financeiros', desc: 'Cobranças próximas do vencimento', enabled: true },
                    { icon: User, label: 'Novos clientes', desc: 'Quando um cliente é cadastrado', enabled: false },
                  ].map((item, i) => {
                    const Icon = item.icon
                    return (
                      <div key={i} className="flex items-center justify-between py-3.5 border-b border-gray-50 dark:border-dark-700 last:border-0">
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
                          className={cn(
                            'relative w-11 h-6 rounded-full transition-all',
                            item.enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
                          )}
                        >
                          <span className={cn(
                            'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                            item.enabled ? 'left-[22px]' : 'left-0.5'
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
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">Idioma</p>
                    <Select label="" value="pt-BR" onChange={() => {}}>
                      <option value="pt-BR">Português (Brasil)</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </Select>
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

          </div>
        </div>
      </div>
    </Layout>
  )
}

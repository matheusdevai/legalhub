import { useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button, Input } from '@/components/ui'
import { isAutoOfficeName, MIN_PASSWORD_LENGTH, passwordUpdateErrorMessage, validateFirstAccess } from '@/lib/firstAccess'

/**
 * Tela obrigatória enquanto profile.must_change_password estiver ligado
 * (conta criada com senha temporária): a pessoa define a senha definitiva,
 * informa o próprio nome e — se for admin — o nome do escritório. Nada do app
 * fica acessível antes disso.
 */
export function FirstAccessScreen() {
  const { profile, user, refreshProfile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [name, setName] = useState(() => (profile?.name && profile.name !== (profile.email || '').split('@')[0] ? profile.name : ''))
  const [officeName, setOfficeName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAdmin || !profile?.tenant_id) return
    supabase.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle().then(({ data }) => {
      if (data?.name && !isAutoOfficeName(data.name, profile.email)) setOfficeName(data.name)
    })
  }, [isAdmin, profile?.tenant_id, profile?.email])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const invalid = validateFirstAccess({ name, officeName, password, confirm }, { requireOffice: isAdmin })
    if (invalid) { setError(invalid); return }
    setSaving(true)
    setError('')
    const { error: pwdErr } = await supabase.auth.updateUser({ password })
    if (pwdErr) {
      setSaving(false)
      setError(passwordUpdateErrorMessage(pwdErr.message, (pwdErr as { code?: string }).code))
      return
    }
    const { error: rpcErr } = await supabase.rpc('complete_first_access', { p_name: name, p_office_name: isAdmin ? officeName : null })
    if (rpcErr) {
      setSaving(false)
      setError('Sua senha foi trocada, mas não conseguimos salvar seus dados. Tente salvar de novo.')
      return
    }
    await refreshProfile()
    setSaving(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-900 px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-dark-800 rounded-2xl shadow-card border border-slate-100 dark:border-dark-700 p-6 sm:p-8 space-y-5">
        <div>
          <div className="w-11 h-11 rounded-xl bg-primary-600 text-white flex items-center justify-center mb-4">
            <KeyRound className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Bem-vinda(o) ao LegalHub</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Este é o seu primeiro acesso. Troque a senha temporária por uma senha só sua
            {isAdmin ? ' e cadastre o seu escritório' : ''} para começar.
          </p>
          {user?.email && <p className="mt-2 text-xs text-slate-400">Conta: {user.email}</p>}
        </div>

        <Input label="Seu nome completo" value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Dra. Maria Silva" autoFocus />
        {isAdmin && (
          <Input label="Nome do escritório" value={officeName} onChange={e => setOfficeName(e.target.value)} placeholder="Silva & Associados Advocacia"
            hint="É assim que o escritório vai aparecer no sistema e no Portal do Cliente." />
        )}

        <div className="relative">
          <Input label="Nova senha" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="new-password" placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres, com letras e números`} />
          <button type="button" onClick={() => setShowPwd(v => !v)} aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600">
            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <Input label="Confirme a nova senha" type={showPwd ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />

        {error && <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-xl px-3.5 py-2.5">{error}</p>}

        <Button type="submit" loading={saving} className="w-full" size="lg">Salvar e começar</Button>
        <button type="button" onClick={() => signOut()} className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
          <LogOut className="w-3.5 h-3.5" /> Sair
        </button>
      </form>
    </div>
  )
}

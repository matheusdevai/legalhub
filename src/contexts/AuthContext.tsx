import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/types'
import type { SubscriptionSnapshot } from '@/lib/billingStatus'

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  // Linha de billing_subscriptions do tenant (status 'trialing'|'active'|
  // 'past_due'|'canceled'|'incomplete' + fim do período/teste), null se o
  // tenant não tem assinatura (criado antes do billing existir). Lida por
  // tenantAccess() para o banner de teste e o modo somente leitura.
  subscription: SubscriptionSnapshot | null
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSubscriptionStatus = useCallback(async (tenantId: string) => {
    const { data } = await supabase.from('billing_subscriptions').select('status, current_period_end').eq('tenant_id', tenantId).maybeSingle()
    setSubscription((data as SubscriptionSnapshot | null) ?? null)
  }, [])

  // useCallback com identidade estável (só muda se fetchSubscriptionStatus
  // mudar, e essa nunca muda) — permite incluir fetchProfile nas deps do
  // useEffect de auth abaixo sem disparar um re-subscribe a cada render.
  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (data) {
      setProfile(data as Profile)
      if (data.tenant_id) fetchSubscriptionStatus(data.tenant_id)
    }
  }, [fetchSubscriptionStatus])

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        // On fresh login, clear the CNJ sync flag so the modal shows again
        if (event === 'SIGNED_IN') {
          sessionStorage.removeItem(`lawfy_cnj_sync_${session.user.id}`)
          // Registra o login para o monitoramento de segurança (Etapa 2): dispositivo
          // novo, local novo ou fora do horário de trabalho geram alerta por e-mail
          // para o dono. Falha aqui nunca deve travar o login do usuário.
          supabase.functions.invoke('security-monitor', { body: { acao: 'login' } }).catch(() => {})
        }
      } else {
        setProfile(null)
        setSubscription(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // Alimenta o alarme de força bruta (Etapa 3): mais de 20 senhas erradas
      // em 10 min, no total ou para o mesmo e-mail, gera aviso ao dono.
      supabase.functions.invoke('security-monitor', { body: { acao: 'login_failed', email } }).catch(() => {})
    }
    return { error: error as Error | null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, subscription, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

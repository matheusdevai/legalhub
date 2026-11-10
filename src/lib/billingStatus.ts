export interface SubscriptionSnapshot {
  status: string
  current_period_end: string | null
  // Escritório com teste que só começa no primeiro acesso (opcionais: linhas
  // antigas / mocks sem essas colunas valem como "teste normal").
  trial_starts_on_first_access?: boolean
  trial_started_at?: string | null
}

export interface TenantAccess {
  // Mesmo critério de public.tenant_is_active(): se readOnly for true, o
  // trigger enforce_tenant_active() recusa qualquer escrita do escritório.
  readOnly: boolean
  // Dias restantes do teste grátis (arredondado pra cima), null fora do teste.
  trialDaysLeft: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

export function tenantAccess(sub: SubscriptionSnapshot | null, now: Date = new Date()): TenantAccess {
  // Sem linha em billing_subscriptions = escritório anterior ao billing: liberado.
  if (!sub) return { readOnly: false, trialDaysLeft: null }
  if (sub.status === 'active' || sub.status === 'past_due') return { readOnly: false, trialDaysLeft: null }
  if (sub.status === 'trialing') {
    if (!sub.current_period_end) return { readOnly: false, trialDaysLeft: null }
    const msLeft = new Date(sub.current_period_end).getTime() - now.getTime()
    if (msLeft <= 0) return { readOnly: true, trialDaysLeft: null }
    return { readOnly: false, trialDaysLeft: Math.ceil(msLeft / DAY_MS) }
  }
  return { readOnly: true, trialDaysLeft: null }
}

/**
 * Escritório marcado para o teste começar no primeiro acesso e que ainda não
 * começou. Nesse estado o banco o mantém ATIVO e sem data final (tenantAccess
 * já devolve readOnly=false e trialDaysLeft=null, pois current_period_end é
 * null). O app deve chamar start_trial_on_first_access() uma vez.
 */
export function isTrialAwaitingFirstAccess(sub: SubscriptionSnapshot | null): boolean {
  return !!sub
    && sub.status === 'trialing'
    && sub.trial_starts_on_first_access === true
    && !sub.trial_started_at
}

export type TrialNotice =
  | { kind: 'none' }
  // Teste normal (14 dias do cadastro): o banner acompanha o teste todo, como sempre.
  | { kind: 'countdown'; daysLeft: number }
  // Teste de primeiro acesso: só avisa quando falta 1 dia ou menos.
  | { kind: 'ending'; daysLeft: number; endsAt: Date }

/** Quanto antes do fim (em dias) o aviso "assine" aparece no teste de primeiro acesso. */
export const FIRST_ACCESS_NOTICE_DAYS = 1

export function trialNotice(sub: SubscriptionSnapshot | null, now: Date = new Date()): TrialNotice {
  const { trialDaysLeft } = tenantAccess(sub, now)
  if (trialDaysLeft === null || !sub) return { kind: 'none' }
  if (!sub.trial_starts_on_first_access) return { kind: 'countdown', daysLeft: trialDaysLeft }
  if (trialDaysLeft > FIRST_ACCESS_NOTICE_DAYS) return { kind: 'none' }
  return { kind: 'ending', daysLeft: trialDaysLeft, endsAt: new Date(sub.current_period_end as string) }
}

/** "hoje" ou "amanhã" (dia do calendário de Brasília) + horário do fim do teste. */
export function formatTrialEnd(endsAt: Date, now: Date = new Date()): string {
  const tz = 'America/Sao_Paulo'
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(endsAt)
  const tomorrow = new Date(now.getTime() + DAY_MS)
  if (day(endsAt) === day(now)) return `hoje às ${time}`
  if (day(endsAt) === day(tomorrow)) return `amanhã às ${time}`
  return `em ${new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(endsAt)} às ${time}`
}

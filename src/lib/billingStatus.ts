export interface SubscriptionSnapshot {
  status: string
  current_period_end: string | null
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

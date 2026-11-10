import { LAUNCH_PLAN_ID, PROMO_LAST_DAY, type Plan } from './landingData'

/**
 * Preço de um cartão de plano. Sempre o preço real de PLANS: nunca mostra preço
 * riscado, "% OFF" nem R$ 149 promocional nos planos Pro/Enterprise — o checkout
 * só cumpre a oferta de lançamento no plano Básico, e só ele ganha a linha da oferta.
 */
export function PlanPrice({ plan, promoActive }: { plan: Plan; promoActive: boolean }) {
  return (
    <>
      <div className="flex items-baseline gap-1">
        <span className="text-sm text-[color:var(--lh-muted)]">R$</span>
        <span className="font-display text-4xl font-bold tracking-[-0.03em] text-[color:var(--lh-fg)]">{plan.price}</span>
        <span className="text-sm text-[color:var(--lh-muted)]">/mês</span>
      </div>
      {promoActive && plan.id === LAUNCH_PLAN_ID && (
        <p className="mt-1 text-[11px] text-[#1677FF] font-medium">Oferta de lançamento até {PROMO_LAST_DAY}</p>
      )}
    </>
  )
}

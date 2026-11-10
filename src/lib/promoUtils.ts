// ─────────────────────────────────────────────────────────────────────────────
// Promoção de lançamento — plano Básico por R$ 149/mês + e-book de bônus.
// (O Básico já custa R$ 149; Pro e Enterprise NÃO têm desconto de lançamento
// enquanto não houver cupom Stripe configurado no checkout.)
// Janela fixa: quem cria a conta (profile.created_at) dentro dela ganha o e-book,
// e create-checkout-session só aplica cupom de lançamento (quando o plano tem um
// configurado) até EBOOK_PROMO_END (LAUNCH_PROMO_END lá — mudar as duas juntas).
// ─────────────────────────────────────────────────────────────────────────────

export const EBOOK_PROMO_START = '2026-08-23T00:00:00.000Z'
export const EBOOK_PROMO_END = '2026-11-23T00:00:00.000Z'
export const EBOOK_URL = '/ebook/legalhub-ebook.html'

/** Um novo cadastro (profile.created_at) dentro da janela da promoção ganha o e-book. */
export function isEbookEligible(profileCreatedAt: string | null | undefined): boolean {
  if (!profileCreatedAt) return false
  const created = new Date(profileCreatedAt)
  if (Number.isNaN(created.getTime())) return false
  return created >= new Date(EBOOK_PROMO_START) && created < new Date(EBOOK_PROMO_END)
}

/** A oferta de lançamento (preço promocional + e-book) ainda está valendo? */
export function isLaunchPromoActive(now: Date = new Date()): boolean {
  return now >= new Date(EBOOK_PROMO_START) && now < new Date(EBOOK_PROMO_END)
}

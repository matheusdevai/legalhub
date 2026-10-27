-- Promoção de lançamento ("R$ 149/mês nos 3 primeiros meses, em qualquer
-- plano", prometida na Landing Page) precisa de um cupom Stripe por plano:
-- o desconto em reais é diferente em cada um (Pro: R$ 200 off, Enterprise:
-- R$ 650 off; Básico já custa R$ 149 e não precisa de cupom). Cupom do tipo
-- amount_off, duration = repeating, duration_in_months = 3, moeda BRL.
--
-- create-checkout-session aplica stripe_launch_coupon_id enquanto a janela
-- da promoção estiver aberta (LAUNCH_PROMO_END, mesma data de
-- EBOOK_PROMO_END em src/lib/promoUtils.ts).
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_launch_coupon_id text;

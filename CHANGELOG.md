# Changelog

## Unreleased

### Adicionado
- Billing recorrente via Stripe (cartão de crédito apenas): planos Básico
  (R$ 149/mês), Pro (R$ 349/mês) e Enterprise (R$ 799/mês), com limites de
  usuários/clientes/processos/armazenamento/IA Jurídica por plano.
  - Tabelas `plans`, `subscriptions`, `stripe_events` e a função
    `enforce_plan_limit()` (bloqueia criação de cliente/processo acima do
    limite do plano do tenant).
  - Edge Functions `create-checkout-session`, `stripe-webhook` (idempotente,
    verifica assinatura HMAC) e `create-customer-portal-session`.
  - Aba **Plano** em Configurações mostra plano atual, uso vs. limite e
    permite assinar/trocar de plano ou abrir o Customer Portal do Stripe.
  - Aviso (soft-gate, sem bloqueio) quando a assinatura do escritório está
    com pagamento pendente ou cancelada.
  - Roda com chaves de teste/placeholder — ver checklist de go-live no
    `README.md` antes de vender qualquer plano de verdade.

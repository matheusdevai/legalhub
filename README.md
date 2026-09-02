# LegalHub

SaaS de gestão para escritórios de advocacia (React + TypeScript + Vite, Supabase para auth/banco/storage/Edge Functions). Detalhes de arquitetura, convenções e tabelas para quem for editar o código: ver `CLAUDE.md`.

## Desenvolvimento

```bash
npm install
npm run dev             # servidor de desenvolvimento (Vite)
npm run build            # tsc + vite build
npm test                 # vitest run
```

## Billing (Stripe) — checklist de go-live

O billing (planos Básico/Pro/Enterprise, cartão de crédito via Stripe Checkout)
está implementado e roda com chaves de teste/placeholder — o dono do produto
ainda não tem conta Stripe. Antes de vender qualquer plano de verdade, alguém
precisa:

- [ ] Criar a conta Stripe (verificação de negócio + conta bancária para repasse).
- [ ] Habilitar o método de pagamento **Cartão** (nenhum outro método deve ficar habilitado — o produto por ora só aceita cartão).
- [ ] Criar os 3 Products/Prices no Dashboard do Stripe espelhando os preços aprovados:
  - Básico — R$ 149,00/mês
  - Pro — R$ 349,00/mês
  - Enterprise — R$ 799,00/mês
- [ ] Preencher a coluna `stripe_price_id` de cada linha da tabela `plans` com o Price id correspondente (`price_...`). Enquanto ficar `NULL`, `create-checkout-session` recusa checkout para aquele plano com um erro explicativo.
- [ ] Configurar o endpoint de webhook de produção no Dashboard do Stripe, apontando para a Edge Function `stripe-webhook` deployada, assinando pelo menos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`.
- [ ] Configurar os secrets de Edge Function no Supabase (mesmo mecanismo já usado para `RESEND_API_KEY`/`CRON_SECRET`, nunca no repo): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Opcional: `APP_URL` (default `https://legalhubgestor.vercel.app`).
- [ ] Deployar as 3 Edge Functions novas: `create-checkout-session`, `stripe-webhook`, `create-customer-portal-session`.
- [ ] Rodar um teste ponta a ponta em modo teste do Stripe (cartão de teste `4242 4242 4242 4242`) antes de trocar para as chaves live.

Enquanto o item do `stripe_price_id` não for preenchido, a tela Configurações
> Plano funciona normalmente (mostra planos, uso, limites) mas o botão
"Assinar"/"Trocar de plano" retorna um erro claro em vez de travar.

Decisão registrada: bloqueio de tenant inadimplente hoje é só um **aviso**
(banner) na interface quando `subscriptions.status` é `past_due`/`canceled` —
nenhuma tela ou escrita é bloqueada de verdade ainda. Um bloqueio real (RLS)
usando a função `tenant_is_active()` já existente no banco fica para uma
etapa futura, após definir com o dono um período de carência.

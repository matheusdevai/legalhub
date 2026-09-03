import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@22.6.0?target=deno'

// Endpoint público chamado pelo Stripe (server-to-server) — autenticação é
// por assinatura HMAC do corpo bruto (header stripe-signature), não por JWT
// de usuário nem x-cron-secret. Roda com service_role (bypassa RLS): é o
// único lugar do sistema que escreve em `subscriptions`.
//
// Mapeia tenant_id ↔ stripe_customer_id via `subscriptions.tenant_id`
// (chave única). O vínculo nasce em checkout.session.completed, lendo
// client_reference_id/metadata.tenant_id setados por create-checkout-session.

type SupabaseAdmin = ReturnType<typeof createClient>

function mapStripeStatus(status: string): 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' {
  switch (status) {
    case 'trialing': return 'trialing'
    case 'active': return 'active'
    case 'past_due': return 'past_due'
    case 'canceled': return 'canceled'
    case 'incomplete': return 'incomplete'
    case 'incomplete_expired': return 'canceled'
    // 'unpaid'/'paused': tratamos como "precisa de atenção", mesmo bucket de
    // past_due — não temos esses dois no CHECK de subscriptions.status.
    case 'unpaid': return 'past_due'
    case 'paused': return 'past_due'
    default: return 'incomplete'
  }
}

async function lookupTenantIdBySubscriptionId(supabaseAdmin: SupabaseAdmin, stripeSubscriptionId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('subscriptions').select('tenant_id').eq('stripe_subscription_id', stripeSubscriptionId).maybeSingle()
  return (data as { tenant_id: string } | null)?.tenant_id ?? null
}

async function syncTenantStorageQuota(supabaseAdmin: SupabaseAdmin, tenantId: string, maxStorageBytes: number | null) {
  if (!maxStorageBytes) return
  await supabaseAdmin.from('tenants').update({ storage_quota_bytes: maxStorageBytes }).eq('id', tenantId)
}

async function notifyPaymentFailed(supabaseAdmin: SupabaseAdmin, tenantId: string) {
  const { data: admins } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'super_admin', 'financial'])
  const rows = (admins as { user_id: string }[] | null) || []
  if (rows.length === 0) return
  await supabaseAdmin.from('notifications').insert(rows.map(a => ({
    user_id: a.user_id,
    type: 'payment',
    title: 'Pagamento da assinatura falhou',
    message: 'Não conseguimos cobrar o cartão da assinatura do escritório. Atualize a forma de pagamento em Configurações > Plano para evitar a suspensão do acesso.',
    link: '/configuracoes',
  })))
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!stripeSecretKey || !webhookSecret) {
    return new Response(JSON.stringify({ error: 'Stripe ainda não configurado neste ambiente (falta STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET).' }), { status: 501, headers: { 'Content-Type': 'application/json' } })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Assinatura ausente' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const stripe = new Stripe(stripeSecretKey, { httpClient: Stripe.createFetchHttpClient() })

  // Corpo bruto, sem parse — a verificação de assinatura precisa dos bytes
  // exatos enviados pelo Stripe. Nunca fazer req.json() antes disto.
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    // Versão assíncrona: runtimes edge (Deno/Workers) não têm o crypto síncrono
    // do Node que a verificação padrão do SDK usa por baixo dos panos.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'assinatura inválida'
    return new Response(JSON.stringify({ error: `Falha na verificação de assinatura: ${message}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Idempotência: grava o event id ANTES de aplicar qualquer efeito (conforme
  // decidido na proposta). Stripe reenvia o mesmo evento em retry de
  // timeout/5xx — o insert com UNIQUE(stripe_event_id) rejeita o reenvio.
  // Trade-off aceito: se o processamento abaixo falhar no meio do caminho
  // (ex: banco fora do ar), o evento já consta como "visto" e um retry do
  // Stripe não vai reprocessá-lo — revisar `stripe_events`/logs manualmente
  // se um efeito parecer ter ficado pela metade.
  const { error: dedupeError } = await supabaseAdmin
    .from('stripe_events')
    .insert({ stripe_event_id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> })

  if (dedupeError) {
    if (dedupeError.code === '23505') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: dedupeError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const tenantId = session.client_reference_id || (session.metadata?.tenant_id as string | undefined)
        const planId = session.metadata?.plan_id as string | undefined
        if (!tenantId || !planId || !session.subscription) break

        const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
        const { data: plan } = await supabaseAdmin.from('plans').select('id, max_storage_bytes').eq('id', planId).maybeSingle()

        await supabaseAdmin.from('subscriptions').upsert({
          tenant_id: tenantId,
          plan_id: planId,
          stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
          stripe_subscription_id: subscription.id,
          status: mapStripeStatus(subscription.status),
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        }, { onConflict: 'tenant_id' })

        await syncTenantStorageQuota(supabaseAdmin, tenantId, (plan as { max_storage_bytes: number | null } | null)?.max_storage_bytes ?? null)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const tenantId = (subscription.metadata?.tenant_id as string | undefined) || await lookupTenantIdBySubscriptionId(supabaseAdmin, subscription.id)
        if (!tenantId) break

        const priceId = subscription.items.data[0]?.price?.id
        let planId: string | undefined
        let maxStorageBytes: number | null = null
        if (priceId) {
          const { data: plan } = await supabaseAdmin.from('plans').select('id, max_storage_bytes').eq('stripe_price_id', priceId).maybeSingle()
          if (plan) {
            planId = (plan as { id: string }).id
            maxStorageBytes = (plan as { max_storage_bytes: number | null }).max_storage_bytes
          }
        }

        const updatePayload: Record<string, unknown> = {
          stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
          status: mapStripeStatus(subscription.status),
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        }
        // Só sobrescreve plan_id se a troca de preço bater com um plano
        // conhecido — um Price fora do catálogo (ex: criado manualmente no
        // Dashboard) não deve apagar o plano atual da assinatura.
        if (planId) updatePayload.plan_id = planId

        await supabaseAdmin.from('subscriptions').update(updatePayload).eq('stripe_subscription_id', subscription.id)
        await syncTenantStorageQuota(supabaseAdmin, tenantId, maxStorageBytes)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await supabaseAdmin.from('subscriptions').update({ status: 'canceled', cancel_at_period_end: false }).eq('stripe_subscription_id', subscription.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break
        const stripeSubscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id
        const tenantId = await lookupTenantIdBySubscriptionId(supabaseAdmin, stripeSubscriptionId)
        if (!tenantId) break

        await supabaseAdmin.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', stripeSubscriptionId)
        await notifyPaymentFailed(supabaseAdmin, tenantId)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break
        const stripeSubscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id
        // Relê a subscription completa em vez de confiar só no invoice — é a
        // fonte de verdade do status/período atual pós-cobrança bem-sucedida.
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
        await supabaseAdmin.from('subscriptions').update({
          status: mapStripeStatus(subscription.status),
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        }).eq('stripe_subscription_id', stripeSubscriptionId)
        break
      }

      default:
        break
    }
  } catch (err: unknown) {
    // O evento já está marcado em stripe_events (visto acima). Logamos e
    // respondemos 200 mesmo assim: um efeito colateral que falhou aqui (ex:
    // erro transitório de rede numa notificação) não deve fazer o Stripe
    // reenviar o evento pra sempre — o estado de subscriptions já foi
    // tentado nas linhas acima do bloco que falhou.
    console.error(`stripe-webhook: erro processando ${event.type} (${event.id})`, err)
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
})

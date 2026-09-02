import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@22.6.0?target=deno'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// URL de retorno pós-Checkout. Mesmo domínio de produção documentado em
// CLAUDE.md (não confundir com o projeto Vercel vazio "lawfy-saas").
const APP_URL = Deno.env.get('APP_URL') || 'https://legalhubgestor.vercel.app'

// Mesmo rate limit de create-user: no máximo RATE_LIMIT chamadas numa janela
// de RATE_WINDOW_MS, contra edge_function_rate_limits (só service role).
// Evita que uma credencial de admin comprometida crie Checkout Sessions em
// volume (spam de e-mail do Stripe pro cliente, ruído na conta Stripe).
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60 * 60 * 1000

async function checkRateLimit(supabaseAdmin: ReturnType<typeof createClient>, key: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('edge_function_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('rate_key', key)
    .gte('created_at', windowStart)
  if ((count ?? 0) >= RATE_LIMIT) return false
  await supabaseAdmin.from('edge_function_rate_limits').insert({ rate_key: key })
  await supabaseAdmin.from('edge_function_rate_limits').delete().lt('created_at', new Date(Date.now() - 24 * RATE_WINDOW_MS).toISOString())
  return true
}

// Cria (ou reaproveita) a assinatura Stripe do tenant do admin chamador e
// devolve a URL do Checkout Session hospedado pelo Stripe. Só cartão de
// crédito — decisão do dono, sem Pix/Boleto por ora.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      return new Response(JSON.stringify({ error: 'Stripe ainda não configurado neste ambiente (falta o secret STRIPE_SECRET_KEY).' }), { status: 501, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Token de autorização ausente' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: callerError } = await supabaseAdmin.auth.getUser(token)
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, tenant_id, email')
      .eq('id', callerUser.id)
      .single()

    if (!callerProfile?.tenant_id || !['admin', 'super_admin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Apenas administradores do escritório podem gerenciar a assinatura' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const withinLimit = await checkRateLimit(supabaseAdmin, `create-checkout-session:${callerUser.id}`)
    if (!withinLimit) {
      return new Response(JSON.stringify({ error: 'Muitas tentativas de checkout em pouco tempo. Aguarde e tente novamente.' }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const body = await req.json().catch(() => ({}))
    const planSlug = body?.plan_slug
    if (!['basico', 'pro', 'enterprise'].includes(planSlug)) {
      return new Response(JSON.stringify({ error: 'plan_slug inválido (esperado: basico | pro | enterprise)' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: plan } = await supabaseAdmin.from('plans').select('*').eq('slug', planSlug).eq('active', true).single()
    if (!plan) {
      return new Response(JSON.stringify({ error: 'Plano não encontrado' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (!plan.stripe_price_id) {
      return new Response(JSON.stringify({ error: `Plano "${plan.name}" ainda não tem um Price configurado no Stripe (plans.stripe_price_id). Preencha isso no go-live antes de vender este plano.` }), { status: 501, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Reaproveita o stripe_customer_id já existente (assinatura anterior/em
    // andamento) em vez de criar um Customer novo a cada tentativa de checkout.
    const { data: existingSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('tenant_id', callerProfile.tenant_id)
      .maybeSingle()

    const stripe = new Stripe(stripeSecretKey, { httpClient: Stripe.createFetchHttpClient() })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: existingSubscription?.stripe_customer_id || undefined,
      customer_email: existingSubscription?.stripe_customer_id ? undefined : (callerProfile.email || undefined),
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      client_reference_id: callerProfile.tenant_id,
      metadata: { tenant_id: callerProfile.tenant_id, plan_id: plan.id },
      subscription_data: { metadata: { tenant_id: callerProfile.tenant_id, plan_id: plan.id } },
      success_url: `${APP_URL}/configuracoes?billing=success`,
      cancel_url: `${APP_URL}/configuracoes?billing=cancel`,
    })

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

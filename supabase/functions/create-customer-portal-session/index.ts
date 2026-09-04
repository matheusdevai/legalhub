import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@22.6.0?target=deno'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APP_URL = Deno.env.get('APP_URL') || 'https://legalhubgestor.vercel.app'

// Mesmo rate limit de create-user/create-checkout-session: no máximo
// RATE_LIMIT chamadas numa janela de RATE_WINDOW_SECONDS, contra
// edge_function_rate_limits (só service role).
const RATE_LIMIT = 10
const RATE_WINDOW_SECONDS = 60 * 60

// Count + insert atômicos via RPC (função Postgres com pg_advisory_xact_lock
// por rate_key) — um SELECT count() + INSERT separados aqui deixaria N
// chamadas concorrentes lerem o mesmo count() antes de qualquer INSERT
// comitar, passando todas juntas acima do limite (TOCTOU). Ver migration
// 20260903120000_fix_edge_function_rate_limit_race.sql.
async function checkRateLimit(supabaseAdmin: ReturnType<typeof createClient>, key: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  })
  if (error) {
    console.error('check_rate_limit RPC error:', error)
    throw new Error('Erro ao verificar limite de uso')
  }
  return data === true
}

// Devolve a URL do Customer Portal do Stripe, onde o próprio tenant troca de
// cartão, baixa faturas ou cancela a assinatura sem precisar de suporte.
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
      .select('role, tenant_id')
      .eq('id', callerUser.id)
      .single()

    if (!callerProfile?.tenant_id || !['admin', 'super_admin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Apenas administradores do escritório podem gerenciar a assinatura' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const withinLimit = await checkRateLimit(supabaseAdmin, `create-customer-portal-session:${callerUser.id}`)
    if (!withinLimit) {
      return new Response(JSON.stringify({ error: 'Muitas tentativas em pouco tempo. Aguarde e tente novamente.' }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('tenant_id', callerProfile.tenant_id)
      .maybeSingle()

    if (!subscription?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: 'Este escritório ainda não tem uma assinatura Stripe ativa.' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const stripe = new Stripe(stripeSecretKey, { httpClient: Stripe.createFetchHttpClient() })

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${APP_URL}/configuracoes`,
    })

    return new Response(JSON.stringify({ url: portalSession.url }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

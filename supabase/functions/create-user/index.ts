import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Rate limit simples por admin chamador: no máximo RATE_LIMIT chamadas numa
// janela de RATE_WINDOW_MS, contra a tabela edge_function_rate_limits
// (só acessível via service role). Evita que uma credencial de admin
// comprometida seja usada para criar um volume grande de contas.
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
  // Limpeza oportunista de acertos antigos. É aguardada (em vez de "fire and
  // forget") porque, em runtimes serverless como o Deno Deploy usado pelas
  // Edge Functions, a execução pode ser encerrada assim que a resposta HTTP
  // é enviada — uma promise não aguardada corre o risco de nunca rodar.
  await supabaseAdmin.from('edge_function_rate_limits').delete().lt('created_at', new Date(Date.now() - 24 * RATE_WINDOW_MS).toISOString())
  return true
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  try {
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

    if (!callerProfile || !['admin', 'superadmin', 'super_admin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Apenas administradores podem criar usuários' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const withinLimit = await checkRateLimit(supabaseAdmin, `create-user:${callerUser.id}`)
    if (!withinLimit) {
      return new Response(JSON.stringify({ error: 'Muitas criações de usuário em pouco tempo. Aguarde e tente novamente.' }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    const { email, password, name, role, client_id } = body

    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: 'email, password e name são obrigatórios' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (role === 'client' && !client_id) {
      return new Response(JSON.stringify({ error: 'client_id é obrigatório para acesso do tipo client' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (role === 'client') {
      const { data: clientRow } = await supabaseAdmin.from('clients').select('id, tenant_id').eq('id', client_id).is('deleted_at', null).maybeSingle()
      if (!clientRow || clientRow.tenant_id !== callerProfile.tenant_id) {
        return new Response(JSON.stringify({ error: 'Cliente não encontrado neste escritório' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role, tenant_id: callerProfile.tenant_id },
    })

    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: authError?.message || 'Erro ao criar usuário' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: authData.user.id,
      user_id: authData.user.id,
      name,
      display_name: name,
      email,
      role,
      tenant_id: callerProfile.tenant_id,
      client_id: role === 'client' ? client_id : null,
    }, { onConflict: 'id' })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      // Limite de usuários do plano (plans.max_users) é aplicado atomicamente
      // pelo trigger enforce_user_limit() em profiles (BEFORE INSERT, com
      // advisory lock por tenant — ver migration 20260902190000). A exceção
      // dele chega aqui como profileError; traduzimos pra 403 com a mesma
      // mensagem amigável em vez do 500 genérico abaixo.
      if (profileError.message.includes('Limite do plano atingido')) {
        return new Response(JSON.stringify({ error: profileError.message }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ error: 'Erro ao criar perfil: ' + profileError.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ user: { id: authData.user.id, email: authData.user.email } }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

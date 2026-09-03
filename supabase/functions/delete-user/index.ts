import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
}

// Rate limit simples por admin chamador: no máximo RATE_LIMIT chamadas numa
// janela de RATE_WINDOW_MS, contra a tabela edge_function_rate_limits
// (só acessível via service role). Evita que uma credencial de admin
// comprometida seja usada para excluir um volume grande de contas.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'DELETE') {
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
      return new Response(JSON.stringify({ error: 'Token ausente' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
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
      return new Response(JSON.stringify({ error: 'Apenas administradores podem excluir usuários' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const withinLimit = await checkRateLimit(supabaseAdmin, `delete-user:${callerUser.id}`)
    if (!withinLimit) {
      return new Response(JSON.stringify({ error: 'Muitas exclusões de usuário em pouco tempo. Aguarde e tente novamente.' }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId é obrigatório' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    if (userId === callerUser.id) {
      return new Response(JSON.stringify({ error: 'Você não pode excluir sua própria conta' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single()

    if (!targetProfile || targetProfile.tenant_id !== callerProfile.tenant_id) {
      return new Response(JSON.stringify({ error: 'Usuário não encontrado neste escritório' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Auth user primeiro: se isso falhar, nada foi alterado (profile
    // continua intacto). Se deletássemos o profile antes e o delete do auth
    // falhasse, sobraria um usuário órfão (auth ativo sem profile).
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) {
      return new Response(JSON.stringify({ error: 'Erro ao excluir usuário: ' + deleteError.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userId)
    if (profileError) {
      return new Response(JSON.stringify({ error: 'Usuário excluído do login, mas houve erro ao remover o perfil: ' + profileError.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Proxy server-side para a API pública da OAB (cna.oab.org.br), usada no
// onboarding para validar a inscrição informada pelo advogado. Precisa ser
// uma Edge Function porque cna.oab.org.br não envia
// Access-Control-Allow-Origin — chamar ela direto do navegador é sempre
// bloqueado por CORS em produção (funciona só em dev/localhost por acaso,
// dependendo do navegador/extensões). O servidor não tem essa restrição.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const body = await req.json().catch(() => ({}))
    const q = String(body.q || '').trim()
    const uf = String(body.uf || '').trim()
    if (!q || !uf) {
      return new Response(JSON.stringify({ error: 'Parâmetros q e uf são obrigatórios.' }), { status: 400, headers: CORS })
    }

    const resp = await fetch(
      `https://cna.oab.org.br/api/find_advogado?q=${encodeURIComponent(q)}&uf=${encodeURIComponent(uf)}`,
      { headers: { 'Accept': 'application/json' } }
    )
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'Consulta à OAB indisponível no momento.' }), { status: 502, headers: CORS })
    }

    const data = await resp.json()
    return new Response(JSON.stringify(data), { status: 200, headers: CORS })
  } catch (e) {
    console.error('oab-lookup error:', e)
    return new Response(JSON.stringify({ error: 'Erro interno ao consultar a OAB.' }), { status: 500, headers: CORS })
  }
})

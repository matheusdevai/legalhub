import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { enrichFromDatajud } from "../_shared/oabSync/datajud.ts"

// CNJ / DataJud — complemento dos processos do escritório pelo NÚMERO.
//
// Antes esta função tentava achar processos pela OAB no DataJud. Isso nunca
// funcionou: o índice público não tem o campo `partes` (verificado em
// 05/11/2026: "failed to find nested object under path [partes]"; a consulta
// plana devolve 0 após 20–55 s). Com até ~20 tentativas por tribunal, a função
// estourava o limite de ~150 s (HTTP 546) e derrubava junto o cron das 5h.
//
// Agora: pega processos do escritório ainda não conferidos (ou conferidos há
// mais de 7 dias), consulta o DataJud pelo número e só PREENCHE o que estiver
// vazio (classe, órgão julgador, data de ajuizamento) e SOMA os andamentos —
// nunca apaga as intimações do DJEN nem sobrescreve o que o advogado digitou.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Content-Type": "application/json",
}

const RATE_LIMIT = 10
const RATE_WINDOW_SECONDS = 60 * 60
const TIME_BUDGET_MS = 100_000

const reply = (data: object, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const startedAt = Date.now()
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return reply({ error: 'Unauthorized' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return reply({ error: 'Unauthorized' }, 401)

    const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('user_id', user.id).single()
    if (!profile?.tenant_id || profile.role === 'client') return reply({ error: 'Perfil não encontrado' }, 404)

    const { data: allowed, error: rlErr } = await supabase.rpc('check_rate_limit', {
      p_key: `sync-cnj:${user.id}`, p_limit: RATE_LIMIT, p_window_seconds: RATE_WINDOW_SECONDS,
    })
    if (rlErr) return reply({ error: 'Erro ao verificar limite de uso' }, 500)
    if (allowed !== true) return reply({ error: 'Muitas sincronizações em pouco tempo. Aguarde e tente novamente.' }, 429)

    const r = await enrichFromDatajud(supabase, profile.tenant_id, startedAt + TIME_BUDGET_MS, { limit: 16, concurrency: 4 })
    console.log(JSON.stringify({ fn: 'sync-cnj', tenant: profile.tenant_id, checked: r.checked, enriched: r.enriched, errors: r.errors.length, ms: Date.now() - startedAt }))
    return reply({
      total: r.checked,
      imported: 0,
      updated: r.enriched,
      pending: r.pending,
      errors: r.errors.slice(0, 10),
      note: 'O DataJud não permite buscar pela OAB; ele completa classe, órgão e andamentos dos processos já encontrados, pelo número.',
    })
  } catch (e: any) {
    console.error('sync-cnj:', e?.message)
    return reply({ error: e?.message || 'Erro inesperado' }, 500)
  }
})

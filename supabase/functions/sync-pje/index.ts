import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { inscricoesOf, runDjenSync } from "../_shared/oabSync/run.ts"

// Sincronização manual (e a primeira, logo após o onboarding) pelo DJEN /
// Comunica PJe — API pública do CNJ, sem login/senha, que cobre tribunais
// estaduais, federais e do trabalho de TODO o país. Consulta todas as
// inscrições do advogado (principal + suplementares em outros estados), porque
// o DJEN filtra pela UF da inscrição, não pela do tribunal.
//
// Usa só as inscrições gravadas no perfil de quem chama (nunca uma OAB vinda no
// corpo da requisição): assim ninguém importa para o próprio escritório os
// processos de outro advogado.
//
// Limitação real: só aparecem processos com alguma comunicação publicada no
// DJEN dentro da janela consultada (até 365 dias). Processo sem publicação no
// período, sigiloso ou intimado por outro meio (pessoal, carta, sistema
// próprio fora do DJEN) não aparece — esses entram pelo cadastro manual ou
// pelas fontes pagas (Escavador/JusBrasil), se configuradas.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Content-Type": "application/json",
}

const RATE_LIMIT = 10
const RATE_WINDOW_SECONDS = 60 * 60
const TIME_BUDGET_MS = 110_000 // a Edge Function é encerrada em ~150 s
const MAX_DAYS = 365

const empty = { total: 0, imported: 0, updated: 0, errors: [] as string[] }
const reply = (data: object) => new Response(JSON.stringify(data), { headers: CORS })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const startedAt = Date.now()

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return reply({ ...empty, error: 'Unauthorized' })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return reply({ ...empty, error: 'Unauthorized' })

    const { data: profile } = await supabase.from('profiles')
      .select('user_id, tenant_id, role, oab_number, oab_seccional, oab_inscricoes')
      .eq('user_id', user.id).single()
    if (!profile?.tenant_id) return reply({ ...empty, error: 'Perfil não encontrado' })
    if (profile.role === 'client') return reply({ ...empty, error: 'Sem permissão' })

    const inscricoes = inscricoesOf(profile)
    if (inscricoes.length === 0) {
      return reply({ ...empty, error: 'Cadastre o número da OAB e a seccional (UF) antes de sincronizar.' })
    }

    const { data: allowed, error: rlErr } = await supabase.rpc('check_rate_limit', {
      p_key: `sync-pje:${user.id}`, p_limit: RATE_LIMIT, p_window_seconds: RATE_WINDOW_SECONDS,
    })
    if (rlErr) { console.error('check_rate_limit:', rlErr.message); return reply({ ...empty, error: 'Erro ao verificar limite de uso' }) }
    if (allowed !== true) return reply({ ...empty, error: 'Muitas sincronizações em pouco tempo. Aguarde e tente novamente.' })

    const body = await req.json().catch(() => ({}))
    const days = Math.min(MAX_DAYS, Math.max(1, Number(body.days) || MAX_DAYS))
    const trigger = body.trigger === 'onboarding' ? 'onboarding' : 'manual'

    const r = await runDjenSync(supabase, profile, { days, trigger, deadline: startedAt + TIME_BUDGET_MS, inscricoes })
    console.log(JSON.stringify({ fn: 'sync-pje', user: user.id, tenant: profile.tenant_id, run: r.run_id, inscricoes: r.inscricoes.map(i => `${i.oab}:${i.found}/${i.count}`), imported: r.imported, updated: r.updated, errors: r.errors.length, ms: Date.now() - startedAt }))

    return reply({
      total: r.total,
      imported: r.imported,
      updated: r.updated,
      unchanged: r.unchanged,
      skipped_plan_limit: r.skippedByPlanLimit,
      truncated: r.truncated,
      errors: r.errors,
      inscricoes: r.inscricoes,
      oab: inscricoes.map(i => `${i.numero}/${i.uf}`).join(', '),
      periodo: r.periodo,
      run_id: r.run_id,
    })
  } catch (e: any) {
    console.error('sync-pje:', e?.message)
    return reply({ ...empty, error: e?.message || 'Erro inesperado', errors: [e?.message || 'Erro inesperado'] })
  }
})

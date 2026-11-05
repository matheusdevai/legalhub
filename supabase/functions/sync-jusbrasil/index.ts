import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { courtFromCnjNumber, mergeMovimentos, parseDatajudDate } from "../_shared/oabSync/core.ts"
import { findProcessByNumber } from "../_shared/oabSync/persist.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Content-Type": "application/json",
}

const DIGESTO_BASE = "https://op.digesto.com.br/api"
const CNJ_BASE = "https://api-publica.datajud.cnj.jus.br"
const CNJ_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="

// Rate limit simples por usuário chamador: no máximo RATE_LIMIT chamadas numa
// janela de RATE_WINDOW_SECONDS, contra a tabela edge_function_rate_limits (só
// acessível via service role). O JUSBRASIL_TOKEN é pago e compartilhado por
// todo o projeto, então chamadas repetidas de uma conta comprometida podem
// estourar a cota/gerar custo indevido para todos os tenants.
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

// Tribunal pelo número CNJ. A versão antiga tinha a tabela de códigos errada
// ('13' = PB, mas no padrão CNJ 13 = MG e 15 = PB; segmento 4 é Justiça
// Federal e 5 é do Trabalho) e consultava o índice errado do DataJud.
function oabTribunal(cnj: string): string {
  return courtFromCnjNumber(cnj) || ''
}

async function enrichWithDatajud(cnj: string): Promise<any | null> {
  const tribunal = oabTribunal(cnj)
  if (!tribunal) return null
  try {
    const r = await fetch(`${CNJ_BASE}/api_publica_${tribunal}/_search`, {
      method: 'POST',
      headers: { 'Authorization': `APIKey ${CNJ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { match: { numeroProcesso: cnj } }, size: 1 }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!r.ok) return null
    const d = await r.json()
    return d?.hits?.hits?.[0]?._source ?? null
  } catch { return null }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const ok = (data: object) => new Response(JSON.stringify(data), { headers: CORS })

  try {
    const token = Deno.env.get('JUSBRASIL_TOKEN') ?? ''
    if (!token) {
      return ok({ error: 'JUSBRASIL_TOKEN nao configurado. Cadastre-se em op.digesto.com.br e adicione o token nas secrets do Supabase.', total: 0, imported: 0, updated: 0, errors: [], tribunais_pesquisados: 0 })
    }

    const auth = req.headers.get('Authorization') ?? ''
    if (!auth) return ok({ error: 'Unauthorized', total: 0, imported: 0, updated: 0, errors: [], tribunais_pesquisados: 0 })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return ok({ error: 'Unauthorized', total: 0, imported: 0, updated: 0, errors: [], tribunais_pesquisados: 0 })

    const { data: profile } = await supabase.from('profiles').select('tenant_id, oab_number, oab_seccional, name').eq('user_id', user.id).single()
    if (!profile?.tenant_id) return ok({ error: 'Perfil nao encontrado', total: 0, imported: 0, updated: 0, errors: [], tribunais_pesquisados: 0 })

    const withinLimit = await checkRateLimit(supabase, `sync-jusbrasil:${user.id}`)
    if (!withinLimit) {
      return ok({ error: 'Muitas sincronizações em pouco tempo. Aguarde e tente novamente.', total: 0, imported: 0, updated: 0, errors: [], tribunais_pesquisados: 0 })
    }

    // Só a OAB gravada no perfil de quem chama (nunca uma vinda do navegador):
    // o token do JusBrasil é pago e compartilhado entre todos os escritórios.
    const oabNum   = (profile.oab_number    || '').trim().replace(/\D/g, '')
    const oabState = (profile.oab_seccional || '').trim().toUpperCase()
    const oabName  = profile.name || 'Advogado'

    if (!oabNum || !oabState) return ok({ error: 'OAB nao configurada', total: 0, imported: 0, updated: 0, errors: [], tribunais_pesquisados: 0 })

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    // Passo 1: Registra (ou reativa) OAB para monitoramento
    let correlationId = ''
    {
      const r = await fetch(`${DIGESTO_BASE}/monitoramento/oab/acompanhamento/`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{ name: oabName, number: parseInt(oabNum), region: oabState, is_active: true }]),
        signal: AbortSignal.timeout(15_000),
      })

      if (r.status === 401) return ok({ error: 'Token JusBrasil invalido ou expirado', total: 0, imported: 0, updated: 0, errors: ['Token invalido'], tribunais_pesquisados: 0 })

      if (r.ok) {
        const data = await r.json()
        const entry = Array.isArray(data) ? data[0] : data
        correlationId = entry?.correlation_id || String(entry?.id || '')
      } else if (r.status === 409) {
        const existing = await fetch(`${DIGESTO_BASE}/monitoramento/oab/acompanhamento/?number=${oabNum}&region=${oabState}&per_page=1`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null)
        if (existing?.ok) {
          const d = await existing.json()
          const e = Array.isArray(d) ? d[0] : d
          correlationId = e?.correlation_id || String(e?.id || '')
        }
      }
    }

    if (!correlationId) {
      return ok({ error: 'Nao foi possivel registrar OAB no JusBrasil. Verifique o token.', total: 0, imported: 0, updated: 0, errors: ['Falha no registro'], tribunais_pesquisados: 0 })
    }

    // Passo 2: Busca CNJs vinculados (paginado)
    const allCnjs: string[] = []
    let page = 1
    while (true) {
      const r = await fetch(
        `${DIGESTO_BASE}/monitoramento/oab/vinculos/processos/oab?correlation_id=${correlationId}&per_page=500&page=${page}`,
        { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }, signal: AbortSignal.timeout(15_000) },
      ).catch(() => null)

      if (!r?.ok) break
      const data = await r.json()
      const items = Array.isArray(data) ? data : []
      if (items.length === 0) break

      for (const item of items) {
        const cnj = item.cnj || item.numero_cnj
        if (cnj) allCnjs.push(cnj)
      }
      if (items.length < 500) break
      page++
    }

    // Passo 3: Enriquecer com DataJud e salvar
    const now = new Date().toISOString()
    let imported = 0, updated = 0
    const errors: string[] = []

    const BATCH = 10
    for (let i = 0; i < allCnjs.length; i += BATCH) {
      const batch = allCnjs.slice(i, i + BATCH)
      await Promise.all(batch.map(async cnj => {
        const num = cnj.replace(/\D/g, '')
        if (!num) return

        const ex = await findProcessByNumber(supabase, profile.tenant_id, num)

        const enriched = await enrichWithDatajud(num)
        const movimentos = enriched && Array.isArray(enriched.movimentos) ? enriched.movimentos : []

        if (ex) {
          const { error: upErr } = await supabase.from('processes').update({
            cnj_synced_at: now,
            // Soma os andamentos (nunca substitui: apagaria as intimações do DJEN)
            ...(movimentos.length ? { movimentos: mergeMovimentos(ex.movimentos, movimentos).merged } : {}),
            ...(enriched?.orgaoJulgador?.nome && !ex.court ? { court: enriched.orgaoJulgador.nome } : {}),
          }).eq('id', ex.id).eq('tenant_id', profile.tenant_id)
          if (upErr) errors.push(`update ${num}: ${upErr.message}`)
          else updated++
        } else {
          const { error: insErr } = await supabase.from('processes').insert({
            tenant_id: profile.tenant_id,
            number: num,
            title: enriched?.assuntos?.[0]?.nome || enriched?.classe?.nome || 'Processo',
            client_name: null,
            court: enriched?.orgaoJulgador?.nome || null,
            area: enriched?.classe?.nome || null,
            status: 'active',
            priority: 'medium',
            data_protocolo: parseDatajudDate(enriched?.dataAjuizamento),
            cnj_source: true,
            cnj_synced_at: now,
            movimentos: movimentos.length ? movimentos : null,
          })
          if (insErr) errors.push(`insert ${num}: ${insErr.message}`)
          else imported++
        }
      }))
    }

    const isFirstSync = allCnjs.length === 0
    return ok({
      total: allCnjs.length,
      imported,
      updated,
      errors,
      oab: `${oabNum}/${oabState}`,
      tribunais_pesquisados: 1,
      first_sync_note: isFirstSync ? 'OAB registrada com sucesso. O JusBrasil indexa os processos em ate 24h — sincronize novamente amanha para importa-los.' : null,
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, total: 0, imported: 0, updated: 0, errors: [e.message], tribunais_pesquisados: 0 }), { headers: CORS })
  }
})

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CNJ_BASE = "https://api-publica.datajud.cnj.jus.br"
const CNJ_API_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
}

function oabVariants(num: string): string[] {
  const digits = num.replace(/\D/g, '')
  const n = parseInt(digits, 10)
  const s = new Set<string>([
    digits,
    digits.padStart(5, '0'),
    digits.padStart(6, '0'),
    digits.padStart(7, '0'),
    String(n),
  ])
  return Array.from(s)
}

function buildQueries(num: string, oabState: string, skipNested: boolean) {
  const nestedQuery = {
    size: 100,
    query: {
      nested: {
        path: "partes",
        query: {
          nested: {
            path: "partes.advogados",
            query: {
              bool: {
                must: [
                  { match: { "partes.advogados.OabNumero": num } },
                  { match: { "partes.advogados.OabEstado": oabState } },
                ],
              },
            },
          },
        },
      },
    },
  }

  const boolNestedQuery = {
    size: 100,
    query: {
      bool: {
        must: [
          {
            nested: {
              path: "partes",
              query: {
                nested: {
                  path: "partes.advogados",
                  query: {
                    bool: {
                      must: [
                        { match: { "partes.advogados.OabNumero": num } },
                        { match: { "partes.advogados.OabEstado": oabState } },
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  }

  const flatQuery = {
    size: 100,
    query: {
      bool: {
        must: [
          { match: { "partes.advogados.OabNumero": num } },
          { match: { "partes.advogados.OabEstado": oabState } },
        ],
      },
    },
  }

  const all = [
    { name: `nested(${num})`,     body: nestedQuery,     requireNested: true },
    { name: `boolNested(${num})`, body: boolNestedQuery,  requireNested: true },
    { name: `flat(${num})`,       body: flatQuery,        requireNested: false },
    {
      name: `qs(${num})`,
      body: {
        size: 100,
        query: {
          query_string: {
            query: 'partes.advogados.OabNumero:"' + num + '" AND partes.advogados.OabEstado:"' + oabState + '"',
          },
        },
      },
      requireNested: false,
    },
  ]

  return all.filter(q => !skipNested || !q.requireNested)
}

function buildNoStateQueries(num: string) {
  return [
    {
      name: `flatNoState(${num})`,
      body: { size: 100, query: { bool: { must: [{ match: { "partes.advogados.OabNumero": num } }] } } },
    },
    {
      name: `qsNoState(${num})`,
      body: { size: 100, query: { query_string: { query: 'partes.advogados.OabNumero:"' + num + '"' } } },
    },
  ]
}

async function searchDatajud(trib: string, oabNum: string, oabState: string): Promise<{ hits: any[]; debug: string }> {
  const url = `${CNJ_BASE}/api_publica_${trib.toLowerCase()}/_search`
  const variants = oabVariants(oabNum)
  let skipNested = false
  const debugParts: string[] = []

  for (const v of variants) {
    const strategies = buildQueries(v, oabState, skipNested)
    for (const { name, body } of strategies) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `APIKey ${CNJ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        })
        if (!r.ok) {
          const errBody = await r.text().catch(() => '')
          if (errBody.includes('failed to find nested object')) skipNested = true
          debugParts.push(`${name}:HTTP${r.status}`)
          continue
        }
        const d = await r.json()
        const hits: any[] = d?.hits?.hits ?? []
        debugParts.push(`${name}:${hits.length}hits`)
        if (hits.length > 0) {
          return { hits: hits.map((h: any) => h._source), debug: debugParts.join(' | ') + ' [encontrado]' }
        }
      } catch {
        debugParts.push(`${name}:timeout`)
      }
    }
  }

  for (const v of variants) {
    for (const { name, body } of buildNoStateQueries(v)) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `APIKey ${CNJ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        })
        if (!r.ok) { debugParts.push(`${name}:HTTP${r.status}`); continue }
        const d = await r.json()
        const hits: any[] = d?.hits?.hits ?? []
        debugParts.push(`${name}:${hits.length}hits`)
        if (hits.length > 0) {
          return { hits: hits.map((h: any) => h._source), debug: debugParts.join(' | ') + ' [AVISO:OabEstado-mismatch]' }
        }
      } catch {
        debugParts.push(`${name}:timeout`)
      }
    }
  }

  const indexType = skipNested ? 'indice-plano' : 'indice-nested'
  return { hits: [], debug: debugParts.join(' | ') + ` [0-resultados:${indexType}]` }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { data: profile } = await supabase
      .from('profiles').select('tenant_id, oab_number, oab_seccional')
      .eq('user_id', user.id).single()
    if (!profile?.tenant_id) return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: CORS })

    const body = await req.json()
    const oabNum   = (body.oab_number    || profile.oab_number    || '').trim().replace(/\D/g, '')
    const oabState = (body.oab_seccional || profile.oab_seccional || '').trim().toUpperCase()
    const tribunais: string[] = body.tribunais || []

    if (!oabNum || !oabState) {
      return new Response(JSON.stringify({ error: 'OAB nao configurada.' }), { status: 400, headers: CORS })
    }
    if (tribunais.length === 0) {
      return new Response(JSON.stringify({ error: 'Selecione ao menos um tribunal.' }), { status: 400, headers: CORS })
    }

    const allProcs: Array<{ source: any }> = []
    const errors: string[] = []
    const debug_per_tribunal: Record<string, string> = {}
    const now = new Date().toISOString()

    await Promise.all(tribunais.map(async trib => {
      const { hits, debug } = await searchDatajud(trib, oabNum, oabState)
      debug_per_tribunal[trib] = debug
      for (const src of hits) allProcs.push({ source: src })
    }))

    let imported = 0, updated = 0
    const insert_errors: string[] = []

    for (const { source: proc } of allProcs) {
      const num = proc.numeroProcesso
      if (!num) continue

      const parteAtiva = Array.isArray(proc.partes)
        ? proc.partes.find((p: any) => p.polo === 'ATIVO' || p.polo === 'A')
        : null
      const movimentos = Array.isArray(proc.movimentos) ? proc.movimentos : []

      const { data: ex } = await supabase.from('processes').select('id')
        .eq('number', num).eq('tenant_id', profile.tenant_id)
        .is('deleted_at', null).maybeSingle()

      if (ex) {
        const { error: upErr } = await supabase.from('processes').update({
          cnj_synced_at: now,
          movimentos: movimentos.length ? movimentos : null,
        }).eq('id', ex.id)
        if (upErr) insert_errors.push(`update ${num}: ${upErr.message}`)
        else updated++
      } else {
        const { error: insErr } = await supabase.from('processes').insert({
          tenant_id: profile.tenant_id,
          number: num,
          title: proc.assuntos?.[0]?.nome || proc.classe?.nome || 'Processo CNJ',
          client_name: parteAtiva?.nome || null,
          court: proc.orgaoJulgador?.nome || null,
          area: proc.classe?.nome || null,
          status: 'active',
          priority: 'medium',
          data_protocolo: proc.dataAjuizamento?.slice(0, 10) || null,
          cnj_source: true,
          cnj_synced_at: now,
          movimentos: movimentos.length ? movimentos : null,
        })
        if (insErr) insert_errors.push(`insert ${num}: ${insErr.message}`)
        else imported++
      }
    }

    return new Response(
      JSON.stringify({
        total: allProcs.length,
        imported,
        updated,
        errors: [...errors, ...insert_errors],
        oab: `${oabNum}/${oabState}`,
        tribunais_pesquisados: tribunais.length,
        debug_per_tribunal,
      }),
      { headers: CORS },
    )
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
})

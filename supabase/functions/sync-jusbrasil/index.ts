import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
}

const DIGESTO_BASE = "https://op.digesto.com.br/api"
const CNJ_BASE = "https://api-publica.datajud.cnj.jus.br"
const CNJ_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="

function oabTribunal(cnj: string): string {
  const digits = cnj.replace(/\D/g, '')
  if (digits.length < 20) return ''
  const seg = digits[13]
  const trib = digits.slice(14, 16)
  if (seg === '8') return 'tj' + stateByCourt(trib)
  if (seg === '4') return 'trt' + parseInt(trib)
  if (seg === '3') return 'trf' + parseInt(trib)
  return ''
}

const COURT_STATE: Record<string, string> = {
  '01':'sp','02':'mg','03':'rj','04':'rs','05':'ba',
  '06':'pr','07':'ce','08':'pe','09':'go','10':'pa',
  '11':'am','12':'ma','13':'pb','14':'pi','15':'rn',
  '16':'al','17':'es','18':'mt','19':'ms','20':'se',
  '21':'ac','22':'rr','23':'ro','24':'ap','25':'to',
  '26':'df','27':'sc',
}

function stateByCourt(code: string): string {
  return COURT_STATE[code] || code.toLowerCase()
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

    const body = await req.json().catch(() => ({}))
    const oabNum   = (body.oab_number    || profile.oab_number    || '').trim().replace(/\D/g, '')
    const oabState = (body.oab_seccional || profile.oab_seccional || '').trim().toUpperCase()
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
        const num = cnj.replace(/[^\d\-\.]/g, '')
        if (!num) return

        const { data: ex } = await supabase.from('processes').select('id').eq('number', num).eq('tenant_id', profile.tenant_id).is('deleted_at', null).maybeSingle()

        const enriched = await enrichWithDatajud(num)
        const parteAtiva = enriched && Array.isArray(enriched.partes) ? enriched.partes.find((p: any) => p.polo === 'ATIVO' || p.polo === 'A') : null
        const movimentos = enriched && Array.isArray(enriched.movimentos) ? enriched.movimentos : []

        if (ex) {
          const { error: upErr } = await supabase.from('processes').update({
            cnj_synced_at: now,
            ...(movimentos.length ? { movimentos } : {}),
            ...(enriched?.orgaoJulgador?.nome ? { court: enriched.orgaoJulgador.nome } : {}),
          }).eq('id', ex.id)
          if (upErr) errors.push(`update ${num}: ${upErr.message}`)
          else updated++
        } else {
          const { error: insErr } = await supabase.from('processes').insert({
            tenant_id: profile.tenant_id,
            number: num,
            title: enriched?.assuntos?.[0]?.nome || enriched?.classe?.nome || 'Processo',
            client_name: parteAtiva?.nome || null,
            court: enriched?.orgaoJulgador?.nome || null,
            area: enriched?.classe?.nome || null,
            status: 'active',
            priority: 'medium',
            data_protocolo: enriched?.dataAjuizamento?.slice(0, 10) || null,
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

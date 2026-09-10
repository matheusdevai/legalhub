import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Job noturno (pg_cron, ~05h) de sincronização automática de processos via OAB.
// Roda para CADA advogado com OAB cadastrada (qualquer tenant), um de cada vez,
// e cada leitura/escrita usa sempre profile.tenant_id daquele advogado — igual
// ao fluxo manual do OabSyncModal. Isso garante isolamento entre escritórios:
// nenhuma chamada nunca mistura dados de tenants diferentes.
//
// PJe (via DJEN/Comunica PJe, API pública gratuita do CNJ) roda aqui também —
// diferente da versão antiga baseada em MNI, não exige CPF+senha do usuário,
// só OAB+UF, então é seguro incluir no cron. Janela de busca curta (últimos 2
// dias) porque o cron roda diariamente — não precisa reconsultar 90 dias toda
// noite (isso fica só para a sincronização manual/inicial no OabSyncModal).
//
// Autenticação: segredo fixo no header (não é chamada de usuário, é pg_cron →
// Edge Function server-to-server), mesmo padrão já usado neste projeto para o
// job "licitahub-verificar-vencimentos".
const CRON_SECRET = Deno.env.get('CRON_SECRET')

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

const CNJ_BASE = "https://api-publica.datajud.cnj.jus.br"
const CNJ_API_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
const ESCAVADOR_BASE = "https://api.escavador.com/api/v2"
const DIGESTO_BASE = "https://op.digesto.com.br/api"

const UF_TO_TJ: Record<string, string> = {
  AC: 'tjac', AL: 'tjal', AM: 'tjam', AP: 'tjap', BA: 'tjba', CE: 'tjce',
  DF: 'tjdft', ES: 'tjes', GO: 'tjgo', MA: 'tjma', MG: 'tjmg', MS: 'tjms',
  MT: 'tjmt', PA: 'tjpa', PB: 'tjpb', PE: 'tjpe', PI: 'tjpi', PR: 'tjpr',
  RJ: 'tjrj', RN: 'tjrn', RO: 'tjro', RR: 'tjrr', RS: 'tjrs', SC: 'tjsc',
  SE: 'tjse', SP: 'tjsp', TO: 'tjto',
}

type Profile = {
  user_id: string
  tenant_id: string
  name: string | null
  oab_number: string
  oab_seccional: string
  oab_tribunais: string[] | null
}

type SyncOutcome = { imported: number; updated: number; errors: string[] }

// ── CNJ (DataJud) — mesma lógica de busca do supabase/functions/sync-cnj ──

function oabVariants(num: string): string[] {
  const digits = num.replace(/\D/g, '')
  const n = parseInt(digits, 10)
  const s = new Set<string>([digits, digits.padStart(5, '0'), digits.padStart(6, '0'), digits.padStart(7, '0'), String(n)])
  return Array.from(s)
}

function buildQueries(num: string, oabState: string, skipNested: boolean) {
  const nestedQuery = { size: 100, query: { nested: { path: "partes", query: { nested: { path: "partes.advogados", query: { bool: { must: [{ match: { "partes.advogados.OabNumero": num } }, { match: { "partes.advogados.OabEstado": oabState } }] } } } } } } }
  const boolNestedQuery = { size: 100, query: { bool: { must: [{ nested: { path: "partes", query: { nested: { path: "partes.advogados", query: { bool: { must: [{ match: { "partes.advogados.OabNumero": num } }, { match: { "partes.advogados.OabEstado": oabState } }] } } } } } }] } } }
  const flatQuery = { size: 100, query: { bool: { must: [{ match: { "partes.advogados.OabNumero": num } }, { match: { "partes.advogados.OabEstado": oabState } }] } } }
  const all = [
    { name: `nested(${num})`, body: nestedQuery, requireNested: true },
    { name: `boolNested(${num})`, body: boolNestedQuery, requireNested: true },
    { name: `flat(${num})`, body: flatQuery, requireNested: false },
    { name: `qs(${num})`, body: { size: 100, query: { query_string: { query: 'partes.advogados.OabNumero:"' + num + '" AND partes.advogados.OabEstado:"' + oabState + '"' } } }, requireNested: false },
  ]
  return all.filter(q => !skipNested || !q.requireNested)
}

function buildNoStateQueries(num: string) {
  return [
    { name: `flatNoState(${num})`, body: { size: 100, query: { bool: { must: [{ match: { "partes.advogados.OabNumero": num } }] } } } },
    { name: `qsNoState(${num})`, body: { size: 100, query: { query_string: { query: 'partes.advogados.OabNumero:"' + num + '"' } } } },
  ]
}

async function searchDatajud(trib: string, oabNum: string, oabState: string): Promise<any[]> {
  const url = `${CNJ_BASE}/api_publica_${trib.toLowerCase()}/_search`
  const variants = oabVariants(oabNum)
  let skipNested = false

  for (const v of variants) {
    for (const { body } of buildQueries(v, oabState, skipNested)) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Authorization': `APIKey ${CNJ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) })
        if (!r.ok) {
          const errBody = await r.text().catch(() => '')
          if (errBody.includes('failed to find nested object')) skipNested = true
          continue
        }
        const d = await r.json()
        const hits: any[] = d?.hits?.hits ?? []
        if (hits.length > 0) return hits.map((h: any) => h._source)
      } catch { /* tenta próxima estratégia */ }
    }
  }

  for (const v of variants) {
    for (const { body } of buildNoStateQueries(v)) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Authorization': `APIKey ${CNJ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) })
        if (!r.ok) continue
        const d = await r.json()
        const hits: any[] = d?.hits?.hits ?? []
        if (hits.length > 0) return hits.map((h: any) => h._source)
      } catch { /* tenta próxima estratégia */ }
    }
  }
  return []
}

async function upsertProcessFromCnjSource(supabase: any, profile: Profile, proc: any, now: string): Promise<'imported' | 'updated' | null> {
  const num = proc.numeroProcesso
  if (!num) return null
  const parteAtiva = Array.isArray(proc.partes) ? proc.partes.find((p: any) => p.polo === 'ATIVO' || p.polo === 'A') : null
  const movimentos = Array.isArray(proc.movimentos) ? proc.movimentos : []

  const { data: ex } = await supabase.from('processes').select('id').eq('number', num).eq('tenant_id', profile.tenant_id).is('deleted_at', null).maybeSingle()

  if (ex) {
    const { error } = await supabase.from('processes').update({ cnj_synced_at: now, movimentos: movimentos.length ? movimentos : null }).eq('id', ex.id)
    return error ? null : 'updated'
  }
  const { error } = await supabase.from('processes').insert({
    tenant_id: profile.tenant_id, number: num,
    title: proc.assuntos?.[0]?.nome || proc.classe?.nome || 'Processo CNJ',
    client_name: parteAtiva?.nome || null, court: proc.orgaoJulgador?.nome || null,
    area: proc.classe?.nome || null, status: 'active', priority: 'medium',
    data_protocolo: proc.dataAjuizamento?.slice(0, 10) || null,
    cnj_source: true, cnj_synced_at: now, movimentos: movimentos.length ? movimentos : null,
  })
  return error ? null : 'imported'
}

async function syncCnjForProfile(supabase: any, profile: Profile, tribunais: string[]): Promise<SyncOutcome> {
  if (tribunais.length === 0) return { imported: 0, updated: 0, errors: [] }
  const now = new Date().toISOString()
  const errors: string[] = []
  let imported = 0, updated = 0

  const perTribunal = await Promise.all(tribunais.map(async trib => {
    try { return await searchDatajud(trib, profile.oab_number, profile.oab_seccional) }
    catch (e: any) { errors.push(`CNJ ${trib}: ${e.message}`); return [] }
  }))

  for (const proc of perTribunal.flat()) {
    try {
      const outcome = await upsertProcessFromCnjSource(supabase, profile, proc, now)
      if (outcome === 'imported') imported++
      else if (outcome === 'updated') updated++
    } catch (e: any) { errors.push(`CNJ upsert ${proc?.numeroProcesso}: ${e.message}`) }
  }
  return { imported, updated, errors }
}

// ── Escavador — mesma lógica do supabase/functions/sync-escavador ──

async function syncEscavadorForProfile(supabase: any, profile: Profile, token: string): Promise<SyncOutcome> {
  const headers = { "Authorization": `Bearer ${token}`, "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }
  const allProcesses: any[] = []
  const errors: string[] = []
  let nextUrl: string | null = `${ESCAVADOR_BASE}/advogado/processos?oab_numero=${profile.oab_number}&oab_estado=${profile.oab_seccional}&limit=100`
  let pageCount = 0

  while (nextUrl && pageCount < 5) {
    const r = await fetch(nextUrl, { headers, signal: AbortSignal.timeout(20_000) }).catch((e: any) => { errors.push(`fetch: ${e.message}`); return null })
    if (!r) break
    if (r.status === 401) { errors.push("Token Escavador inválido ou expirado"); break }
    if (r.status === 429) { errors.push("Rate limit Escavador atingido"); break }
    if (!r.ok) { errors.push(`HTTP ${r.status}`); break }
    const data = await r.json().catch(() => null)
    if (!data?.sucesso) { errors.push(data?.mensagem || data?.message || "Resposta inválida"); break }
    allProcesses.push(...(data?.resposta?.items ?? []))
    nextUrl = data?.resposta?.links?.next ?? null
    pageCount++
  }

  const now = new Date().toISOString()
  let imported = 0, updated = 0
  const BATCH = 10
  for (let i = 0; i < allProcesses.length; i += BATCH) {
    const batch = allProcesses.slice(i, i + BATCH)
    await Promise.all(batch.map(async (proc: any) => {
      const num = proc.numero_cnj?.replace(/[^\d\-\.]/g, "") || ""
      if (!num) return
      const { data: ex } = await supabase.from("processes").select("id").eq("number", num).eq("tenant_id", profile.tenant_id).is("deleted_at", null).maybeSingle()
      const title = proc.titulo_polo_ativo || proc.titulo_polo_passivo || `Processo ${num}`
      const court = proc.unidade_origem?.nome || proc.estado_origem?.nome || null
      if (ex) {
        const { error } = await supabase.from("processes").update({ cnj_synced_at: now, ...(court ? { court } : {}) }).eq("id", ex.id)
        if (error) errors.push(`update ${num}: ${error.message}`); else updated++
      } else {
        const { error } = await supabase.from("processes").insert({
          tenant_id: profile.tenant_id, number: num, title, court, status: "active", priority: "medium",
          data_protocolo: proc.data_inicio?.slice(0, 10) ?? null, cnj_source: true, cnj_synced_at: now,
        })
        if (error) errors.push(`insert ${num}: ${error.message}`); else imported++
      }
    }))
  }
  return { imported, updated, errors }
}

// ── JusBrasil (Digesto) — mesma lógica do supabase/functions/sync-jusbrasil ──

const COURT_STATE: Record<string, string> = {
  '01': 'sp', '02': 'mg', '03': 'rj', '04': 'rs', '05': 'ba', '06': 'pr', '07': 'ce', '08': 'pe', '09': 'go', '10': 'pa',
  '11': 'am', '12': 'ma', '13': 'pb', '14': 'pi', '15': 'rn', '16': 'al', '17': 'es', '18': 'mt', '19': 'ms', '20': 'se',
  '21': 'ac', '22': 'rr', '23': 'ro', '24': 'ap', '25': 'to', '26': 'df', '27': 'sc',
}

function oabTribunal(cnj: string): string {
  const digits = cnj.replace(/\D/g, '')
  if (digits.length < 20) return ''
  const seg = digits[13]
  const trib = digits.slice(14, 16)
  if (seg === '8') return 'tj' + (COURT_STATE[trib] || trib.toLowerCase())
  if (seg === '4') return 'trt' + parseInt(trib)
  if (seg === '3') return 'trf' + parseInt(trib)
  return ''
}

async function enrichWithDatajud(cnj: string): Promise<any | null> {
  const tribunal = oabTribunal(cnj)
  if (!tribunal) return null
  try {
    const r = await fetch(`${CNJ_BASE}/api_publica_${tribunal}/_search`, { method: 'POST', headers: { 'Authorization': `APIKey ${CNJ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: { match: { numeroProcesso: cnj } }, size: 1 }), signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return null
    const d = await r.json()
    return d?.hits?.hits?.[0]?._source ?? null
  } catch { return null }
}

async function syncJusbrasilForProfile(supabase: any, profile: Profile, token: string): Promise<SyncOutcome> {
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }
  const errors: string[] = []

  let correlationId = ''
  {
    const r = await fetch(`${DIGESTO_BASE}/monitoramento/oab/acompanhamento/`, {
      method: 'POST', headers,
      body: JSON.stringify([{ name: profile.name || 'Advogado', number: parseInt(profile.oab_number), region: profile.oab_seccional, is_active: true }]),
      signal: AbortSignal.timeout(15_000),
    })
    if (r.status === 401) return { imported: 0, updated: 0, errors: ['Token JusBrasil inválido ou expirado'] }
    if (r.ok) {
      const data = await r.json()
      const entry = Array.isArray(data) ? data[0] : data
      correlationId = entry?.correlation_id || String(entry?.id || '')
    } else if (r.status === 409) {
      const existing = await fetch(`${DIGESTO_BASE}/monitoramento/oab/acompanhamento/?number=${profile.oab_number}&region=${profile.oab_seccional}&per_page=1`, { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null)
      if (existing?.ok) {
        const d = await existing.json()
        const e = Array.isArray(d) ? d[0] : d
        correlationId = e?.correlation_id || String(e?.id || '')
      }
    }
  }
  if (!correlationId) return { imported: 0, updated: 0, errors: ['Não foi possível registrar OAB no JusBrasil'] }

  const allCnjs: string[] = []
  let page = 1
  while (true) {
    const r = await fetch(`${DIGESTO_BASE}/monitoramento/oab/vinculos/processos/oab?correlation_id=${correlationId}&per_page=500&page=${page}`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }, signal: AbortSignal.timeout(15_000) }).catch(() => null)
    if (!r?.ok) break
    const data = await r.json()
    const items = Array.isArray(data) ? data : []
    if (items.length === 0) break
    for (const item of items) { const cnj = item.cnj || item.numero_cnj; if (cnj) allCnjs.push(cnj) }
    if (items.length < 500) break
    page++
  }

  const now = new Date().toISOString()
  let imported = 0, updated = 0
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
        const { error } = await supabase.from('processes').update({ cnj_synced_at: now, ...(movimentos.length ? { movimentos } : {}), ...(enriched?.orgaoJulgador?.nome ? { court: enriched.orgaoJulgador.nome } : {}) }).eq('id', ex.id)
        if (error) errors.push(`update ${num}: ${error.message}`); else updated++
      } else {
        const { error } = await supabase.from('processes').insert({
          tenant_id: profile.tenant_id, number: num,
          title: enriched?.assuntos?.[0]?.nome || enriched?.classe?.nome || 'Processo',
          client_name: parteAtiva?.nome || null, court: enriched?.orgaoJulgador?.nome || null, area: enriched?.classe?.nome || null,
          status: 'active', priority: 'medium', data_protocolo: enriched?.dataAjuizamento?.slice(0, 10) || null,
          cnj_source: true, cnj_synced_at: now, movimentos: movimentos.length ? movimentos : null,
        })
        if (error) errors.push(`insert ${num}: ${error.message}`); else imported++
      }
    }))
  }
  return { imported, updated, errors }
}

// ── PJe (DJEN/Comunica PJe) — mesma lógica do supabase/functions/sync-pje ──

const DJEN_BASE = "https://comunicaapi.pje.jus.br/api/v1"
const DJEN_ITEMS_PER_PAGE = 50
const DJEN_MAX_PAGES = 10
const DJEN_PAGE_DELAY_MS = 400
const DJEN_LOOKBACK_DAYS = 2 // janela curta: cron roda diariamente

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchDjenPage(oabNum: string, oabState: string, dataInicio: string, dataFim: string, pagina: number): Promise<{ items: any[]; error: string | null }> {
  const url = new URL(`${DJEN_BASE}/comunicacao`)
  url.searchParams.set('numeroOab', oabNum)
  url.searchParams.set('ufOab', oabState)
  url.searchParams.set('dataDisponibilizacaoInicio', dataInicio)
  url.searchParams.set('dataDisponibilizacaoFim', dataFim)
  url.searchParams.set('pagina', String(pagina))
  url.searchParams.set('itensPorPagina', String(DJEN_ITEMS_PER_PAGE))

  try {
    const resp = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
    if (resp.status === 429) return { items: [], error: 'rate limit DJEN' }
    if (!resp.ok) return { items: [], error: `HTTP ${resp.status}` }
    const data = await resp.json().catch(() => null)
    if (!data || data.status === 'error') return { items: [], error: data?.message || 'resposta inválida' }
    return { items: Array.isArray(data.items) ? data.items : [], error: null }
  } catch (e: any) {
    return { items: [], error: e?.message || 'erro de rede' }
  }
}

async function syncPjeForProfile(supabase: any, profile: Profile): Promise<SyncOutcome> {
  const hoje = new Date()
  const dataFim = hoje.toISOString().slice(0, 10)
  const dataInicio = (() => { const d = new Date(hoje); d.setDate(d.getDate() - DJEN_LOOKBACK_DAYS); return d.toISOString().slice(0, 10) })()

  const errors: string[] = []
  const allItems: any[] = []

  for (let pagina = 1; pagina <= DJEN_MAX_PAGES; pagina++) {
    const { items, error } = await fetchDjenPage(profile.oab_number, profile.oab_seccional, dataInicio, dataFim, pagina)
    if (error) { errors.push(`PJe/DJEN: ${error}`); break }
    if (items.length === 0) break
    allItems.push(...items)
    if (items.length < DJEN_ITEMS_PER_PAGE) break
    await sleep(DJEN_PAGE_DELAY_MS)
  }

  const now = new Date().toISOString()
  let imported = 0, updated = 0

  for (const item of allItems) {
    const num = (item.numero_processo || '').replace(/\D/g, '')
    if (!num) continue

    const movimento = {
      fonte: 'pje',
      idComunicacao: item.id ?? item.hash ?? null,
      hash: item.hash ?? null,
      nome: item.tipoComunicacao || item.tipoDocumento || 'Intimação',
      dataHora: item.data_disponibilizacao || item.datadisponibilizacao || null,
      orgao: item.nomeOrgao || null,
      teor: item.texto || null,
      link: item.link || null,
    }

    const { data: ex } = await supabase.from('processes').select('id, movimentos').eq('number', num).eq('tenant_id', profile.tenant_id).is('deleted_at', null).maybeSingle()

    if (ex) {
      const existing: any[] = Array.isArray(ex.movimentos) ? ex.movimentos : []
      const already = existing.some((m: any) =>
        (movimento.idComunicacao != null && m.idComunicacao === movimento.idComunicacao) ||
        (movimento.hash != null && m.hash === movimento.hash))
      if (!already) {
        const { error } = await supabase.from('processes').update({ cnj_synced_at: now, movimentos: [...existing, movimento] }).eq('id', ex.id)
        if (error) errors.push(`PJe update ${num}: ${error.message}`); else updated++
      }
    } else {
      const parteNome = item.destinatarios?.[0]?.nome || null
      const { error } = await supabase.from('processes').insert({
        tenant_id: profile.tenant_id, number: num,
        title: parteNome ? `${movimento.nome} - ${parteNome}` : movimento.nome,
        client_name: parteNome, court: item.nomeOrgao || null, area: item.siglaTribunal || null,
        status: 'active', priority: 'medium', cnj_source: true, cnj_synced_at: now, movimentos: [movimento],
      })
      if (error) errors.push(`PJe insert ${num}: ${error.message}`); else imported++
    }
  }

  return { imported, updated, errors }
}

// ── Handler ──

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  if (!CRON_SECRET || !timingSafeEqual(req.headers.get('x-cron-secret') || '', CRON_SECRET)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const jusToken = Deno.env.get('JUSBRASIL_TOKEN') ?? ''
  const escToken = Deno.env.get('ESCAVADOR_API_KEY') ?? ''

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, tenant_id, name, oab_number, oab_seccional, oab_tribunais')
    .not('oab_number', 'is', null)
    .not('oab_seccional', 'is', null)
    .neq('role', 'client')

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const results: any[] = []

  for (const raw of profiles || []) {
    const profile = raw as Profile
    if (!profile.tenant_id || !profile.oab_number?.trim() || !profile.oab_seccional?.trim()) continue

    const tribunais = profile.oab_tribunais?.length ? profile.oab_tribunais
      : (UF_TO_TJ[profile.oab_seccional] ? [UF_TO_TJ[profile.oab_seccional]] : [])

    let imported = 0, updated = 0
    const errors: string[] = []

    try {
      const r = await syncCnjForProfile(supabase, profile, tribunais)
      imported += r.imported; updated += r.updated; errors.push(...r.errors)
    } catch (e: any) { errors.push(`CNJ: ${e.message}`) }

    try {
      const r = await syncPjeForProfile(supabase, profile)
      imported += r.imported; updated += r.updated; errors.push(...r.errors)
    } catch (e: any) { errors.push(`PJe: ${e.message}`) }

    if (escToken) {
      try {
        const r = await syncEscavadorForProfile(supabase, profile, escToken)
        imported += r.imported; updated += r.updated; errors.push(...r.errors)
      } catch (e: any) { errors.push(`Escavador: ${e.message}`) }
    }

    if (jusToken) {
      try {
        const r = await syncJusbrasilForProfile(supabase, profile, jusToken)
        imported += r.imported; updated += r.updated; errors.push(...r.errors)
      } catch (e: any) { errors.push(`JusBrasil: ${e.message}`) }
    }

    if (imported > 0 || updated > 0) {
      const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true })
        .eq('user_id', profile.user_id).eq('link', '/processos?auto_sync=1').gte('created_at', todayStart.toISOString())
      if (!count) {
        await supabase.from('notifications').insert({
          user_id: profile.user_id, type: 'system',
          title: 'Sincronização automática de processos',
          message: `${imported} novo(s) processo(s) e ${updated} atualizado(s) via OAB ${profile.oab_number}/${profile.oab_seccional}.`,
          read: false, link: '/processos?auto_sync=1',
        })
      }
    }

    results.push({ tenant_id: profile.tenant_id, oab: `${profile.oab_number}/${profile.oab_seccional}`, imported, updated, errors })

    // Intervalo curto entre advogados — JusBrasil/Escavador usam token único
    // compartilhado por todos os tenants, então evita rajada de requisições.
    await new Promise(r => setTimeout(r, 400))
  }

  return new Response(JSON.stringify({ processed: results.length, results }), { headers: { 'Content-Type': 'application/json' } })
})

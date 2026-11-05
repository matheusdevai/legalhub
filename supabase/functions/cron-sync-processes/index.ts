import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { courtFromCnjNumber, mergeMovimentos, parseDatajudDate } from "../_shared/oabSync/core.ts"
import { enrichFromDatajud } from "../_shared/oabSync/datajud.ts"
import { findProcessByNumber } from "../_shared/oabSync/persist.ts"
import { runDjenSync, type SyncProfile } from "../_shared/oabSync/run.ts"

// Sincronização automática diária (pg_cron, 5h UTC) de UM advogado por chamada.
//
// Antes, uma única chamada percorria todos os advogados em sequência e era
// encerrada pelo limite da Edge Function (HTTP 546 após ~150 s) todo dia —
// principalmente por causa da busca por OAB no DataJud, que não existe (o
// índice público não tem partes/advogados). Nenhum advogado chegava ao fim:
// não ficava nenhum registro em health_checks e quem se cadastrou depois
// nunca recebeu os processos. Agora a função de banco
// lawfy_dispatch_oab_sync() faz uma requisição por advogado (body
// { user_id }), cada uma com seu próprio orçamento de tempo.
//
// Isolamento: cada chamada lê e grava só no tenant_id do advogado informado.
// Autenticação: segredo do Vault no header x-cron-secret (server-to-server).

async function isCronAuthorized(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret') || ''
  if (!secret) return false
  const { data, error } = await supabase.rpc('lawfy_cron_secret_matches', { p_secret: secret })
  if (error) console.error('lawfy_cron_secret_matches:', error.message)
  return !error && data === true
}

const CNJ_BASE = "https://api-publica.datajud.cnj.jus.br"
const CNJ_API_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
const ESCAVADOR_BASE = "https://api.escavador.com/api/v2"
const DIGESTO_BASE = "https://op.digesto.com.br/api"
const TIME_BUDGET_MS = 115_000
// Janela do DJEN no cron: 7 dias (idempotente — a mesma comunicação nunca é
// gravada duas vezes), para cobrir dias em que o cron falhou.
const CRON_DJEN_DAYS = 7
const FIRST_SYNC_DAYS = 365

type Profile = SyncProfile & { name: string | null; oab_number: string; oab_seccional: string }
type SyncOutcome = { imported: number; updated: number; errors: string[] }

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
      const num = String(proc.numero_cnj || "").replace(/\D/g, "")
      if (!num) return
      const ex = await findProcessByNumber(supabase, profile.tenant_id, num)
      const title = proc.titulo_polo_ativo || proc.titulo_polo_passivo || `Processo ${num}`
      const court = proc.unidade_origem?.nome || proc.estado_origem?.nome || null
      if (ex) {
        const { error } = await supabase.from("processes").update({ cnj_synced_at: now, ...(court && !ex.court ? { court } : {}) }).eq("id", ex.id).eq("tenant_id", profile.tenant_id)
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

// Tribunal pelo número CNJ (a tabela antiga daqui tinha os códigos trocados).
const oabTribunal = (cnj: string) => courtFromCnjNumber(cnj) || ''

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
      const num = cnj.replace(/\D/g, '')
      if (!num) return
      const ex = await findProcessByNumber(supabase, profile.tenant_id, num)
      const enriched = await enrichWithDatajud(num)
      const movimentos = enriched && Array.isArray(enriched.movimentos) ? enriched.movimentos : []
      if (ex) {
        const { error } = await supabase.from('processes').update({ cnj_synced_at: now, ...(movimentos.length ? { movimentos: mergeMovimentos(ex.movimentos, movimentos).merged } : {}), ...(enriched?.orgaoJulgador?.nome && !ex.court ? { court: enriched.orgaoJulgador.nome } : {}) }).eq('id', ex.id).eq('tenant_id', profile.tenant_id)
        if (error) errors.push(`update ${num}: ${error.message}`); else updated++
      } else {
        const { error } = await supabase.from('processes').insert({
          tenant_id: profile.tenant_id, number: num,
          title: enriched?.assuntos?.[0]?.nome || enriched?.classe?.nome || 'Processo',
          client_name: null, court: enriched?.orgaoJulgador?.nome || null, area: enriched?.classe?.nome || null,
          status: 'active', priority: 'medium', data_protocolo: parseDatajudDate(enriched?.dataAjuizamento),
          cnj_source: true, cnj_synced_at: now, movimentos: movimentos.length ? movimentos : null,
        })
        if (error) errors.push(`insert ${num}: ${error.message}`); else imported++
      }
    }))
  }
  return { imported, updated, errors }
}

// ── Handler ──

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  const startedAt = Date.now()
  const deadline = startedAt + TIME_BUDGET_MS
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (!(await isCronAuthorized(req, supabase))) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!body.user_id) {
    return new Response(JSON.stringify({ error: 'Informe user_id — o disparo para todos é feito por lawfy_dispatch_oab_sync()' }), { status: 400 })
  }

  const { data: raw, error } = await supabase.from('profiles')
    .select('user_id, tenant_id, name, role, oab_number, oab_seccional, oab_inscricoes')
    .eq('user_id', body.user_id).maybeSingle()
  if (error || !raw) return new Response(JSON.stringify({ error: error?.message || 'perfil não encontrado' }), { status: 404 })
  if (raw.role === 'client' || !raw.tenant_id) return new Response(JSON.stringify({ skipped: true }), { status: 200 })
  const profile = raw as Profile

  const jusToken = Deno.env.get('JUSBRASIL_TOKEN') ?? ''
  const escToken = Deno.env.get('ESCAVADOR_API_KEY') ?? ''
  let imported = 0, updated = 0
  const errors: string[] = []

  // 1) DJEN — todas as inscrições (principal + suplementares). Quem nunca teve
  // uma sincronização completa (advogado novo que não abriu a tela, ou cuja
  // primeira tentativa falhou) recebe o último ano inteiro, não só 7 dias.
  const { count: fullRuns } = await supabase.from('oab_sync_runs').select('id', { count: 'exact', head: true })
    .eq('user_id', profile.user_id).eq('ok', true).eq('truncated', false).eq('full_backfill', true)
  const days = fullRuns ? CRON_DJEN_DAYS : FIRST_SYNC_DAYS
  const djen = await runDjenSync(supabase, profile, { days, trigger: 'cron', deadline: startedAt + 90_000 })
  imported += djen.imported; updated += djen.updated; errors.push(...djen.errors)
  const djenOk = djen.errors.length === 0

  // 2) Fontes pagas (só com token configurado) — pela inscrição principal
  const hasPrimary = !!profile.oab_number?.trim() && !!profile.oab_seccional?.trim()
  if (escToken && hasPrimary && Date.now() < deadline - 30_000) {
    try { const r = await syncEscavadorForProfile(supabase, profile, escToken); imported += r.imported; updated += r.updated; errors.push(...r.errors.map(e => `Escavador: ${e}`)) }
    catch (e: any) { errors.push(`Escavador: ${e.message}`) }
  }
  if (jusToken && hasPrimary && Date.now() < deadline - 30_000) {
    try { const r = await syncJusbrasilForProfile(supabase, profile, jusToken); imported += r.imported; updated += r.updated; errors.push(...r.errors.map(e => `JusBrasil: ${e}`)) }
    catch (e: any) { errors.push(`JusBrasil: ${e.message}`) }
  }

  // 3) DataJud — completa pelo número, com o tempo que sobrar
  if (Date.now() < deadline - 15_000) {
    const r = await enrichFromDatajud(supabase, profile.tenant_id, deadline, { limit: 8, concurrency: 4 })
    if (r.errors.length) errors.push(...r.errors.slice(0, 3))
  }

  if (imported > 0 || updated > 0) {
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true })
      .eq('user_id', profile.user_id).eq('link', '/processos?auto_sync=1').gte('created_at', todayStart.toISOString())
    if (!count) {
      await supabase.from('notifications').insert({
        user_id: profile.user_id, type: 'system',
        title: 'Sincronização automática de processos',
        message: `${imported} novo(s) processo(s) e ${updated} atualizado(s) via OAB ${djen.inscricoes.map(i => i.oab).join(', ')}.`,
        read: false, link: '/processos?auto_sync=1',
      })
    }
  }

  // Faixa de saúde do Controle de Prazos: "ok" olha o DJEN (alimenta "A triar").
  await supabase.from('health_checks').upsert({
    tenant_id: profile.tenant_id, check_key: `sync_oab:${profile.user_id}`,
    ok: djenOk,
    detail: `OAB ${djen.inscricoes.map(i => i.oab).join(', ') || '—'}: ${imported} novo(s), ${updated} atualizado(s)` + (errors.length ? ` · ${errors.slice(0, 3).join(' | ')}` : ''),
  }, { onConflict: 'tenant_id,check_key,checked_on' })

  const result = { user_id: profile.user_id, tenant_id: profile.tenant_id, imported, updated, errors: errors.slice(0, 10), ms: Date.now() - startedAt }
  console.log(JSON.stringify({ fn: 'cron-sync-processes', ...result }))
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
})

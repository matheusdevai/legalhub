import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Sincronização via PJe usando o DJEN (Diário de Justiça Eletrônico Nacional) /
// "Comunica PJe" — API pública do CNJ, sem autenticação, sem custo. Cobre
// intimações/citações/avisos publicados por QUALQUER tribunal (estadual ou
// federal) que publica no DJEN, filtrando só por número da OAB + UF — não
// exige seleção manual de tribunal nem login/senha do usuário no PJe.
//
// Verificado manualmente em 2026-09-09 contra a API em produção
// (https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=...&ufOab=...):
// resposta real tem o formato { status, message, count, items: [...] }, com
// cada item trazendo id, data_disponibilizacao, siglaTribunal, tipoComunicacao,
// nomeOrgao, texto, numero_processo, hash, destinatarioadvogados[], etc.
// Não há Swagger/versionamento oficial estável publicado pelo CNJ — os nomes
// de campo abaixo podem mudar sem aviso; por isso o parsing é defensivo
// (aceita variações de nome de campo quando plausível).
//
// Limitação conhecida: o DJEN cobre publicações feitas via Diário de Justiça
// Eletrônico Nacional. Na prática isso inclui a imensa maioria dos tribunais
// (inclusive TJSP, que usa e-SAJ como sistema processual mas publica no DJEN
// por força da Resolução CNJ 455/2022). Ainda assim, comunicações feitas por
// outro meio que não o Diário (ex.: intimação pessoal, carta, publicação em
// sistema próprio de tribunal fora do DJEN) NÃO aparecem aqui — não há
// garantia de cobertura de 100% dos atos processuais de 100% dos tribunais.
const DJEN_BASE = "https://comunicaapi.pje.jus.br/api/v1"
const ITEMS_PER_PAGE = 50
const MAX_PAGES = 20 // trava de segurança: até 1000 comunicações por sincronização
const PAGE_DELAY_MS = 400 // espaçamento entre chamadas — API pública sem SLA, evita 429

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
}

// Rate limit simples por usuário chamador: no máximo RATE_LIMIT chamadas numa
// janela de RATE_WINDOW_SECONDS, contra a tabela edge_function_rate_limits (só
// acessível via service role). A API do DJEN é pública e compartilhada por
// todo o país — limitar a cadência evita que o uso deste app gere rajadas
// desnecessárias contra a infraestrutura do CNJ.
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface DjenItem {
  id?: number | string
  hash?: string
  data_disponibilizacao?: string
  datadisponibilizacao?: string
  siglaTribunal?: string
  tipoComunicacao?: string
  tipoDocumento?: string
  nomeOrgao?: string
  texto?: string
  numero_processo?: string
  numeroprocessocommascara?: string
  link?: string
  destinatarios?: { nome?: string }[]
}

interface DjenPageResult {
  items: DjenItem[]
  count: number
  error: string | null
}

async function fetchDjenPage(oabNum: string, oabState: string, dataInicio: string, dataFim: string, pagina: number): Promise<DjenPageResult> {
  const url = new URL(`${DJEN_BASE}/comunicacao`)
  url.searchParams.set('numeroOab', oabNum)
  url.searchParams.set('ufOab', oabState)
  url.searchParams.set('dataDisponibilizacaoInicio', dataInicio)
  url.searchParams.set('dataDisponibilizacaoFim', dataFim)
  url.searchParams.set('pagina', String(pagina))
  url.searchParams.set('itensPorPagina', String(ITEMS_PER_PAGE))

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })

      if (resp.status === 429) {
        if (attempt === 0) { await sleep(2000); continue }
        return { items: [], count: 0, error: 'Limite de requisições do DJEN atingido, tente novamente em instantes' }
      }
      if (!resp.ok) {
        return { items: [], count: 0, error: `DJEN HTTP ${resp.status}` }
      }

      const data = await resp.json().catch(() => null)
      if (!data || data.status === 'error') {
        return { items: [], count: 0, error: data?.message || 'Resposta inválida do DJEN' }
      }

      const items: DjenItem[] = Array.isArray(data.items) ? data.items : []
      const count: number = typeof data.count === 'number' ? data.count : items.length
      return { items, count, error: null }
    } catch (e: any) {
      if (e?.name === 'TimeoutError' && attempt === 0) continue
      return { items: [], count: 0, error: e?.name === 'TimeoutError' ? 'Timeout ao consultar DJEN' : (e?.message || 'Erro de rede ao consultar DJEN') }
    }
  }
  return { items: [], count: 0, error: 'Falha ao consultar DJEN' }
}

// Busca todas as páginas para uma variante de número de OAB. Retorna cedo se
// a primeira página já vier vazia (sem custo de tentar as demais páginas).
async function fetchAllPages(oabNum: string, oabState: string, dataInicio: string, dataFim: string): Promise<{ items: DjenItem[]; errors: string[] }> {
  const allItems: DjenItem[] = []
  const errors: string[] = []

  for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
    const { items, error } = await fetchDjenPage(oabNum, oabState, dataInicio, dataFim, pagina)
    if (error) { errors.push(error); break }
    if (items.length === 0) break
    allItems.push(...items)
    if (items.length < ITEMS_PER_PAGE) break
    await sleep(PAGE_DELAY_MS)
  }

  return { items: allItems, errors }
}

// OAB às vezes está cadastrada com zeros à esquerda em algum tribunal — se a
// consulta com o número "cru" não achar nada, tenta uma variante com padding,
// igual ao mesmo cuidado já tomado em sync-cnj para o DataJud.
function oabVariants(num: string): string[] {
  const digits = num.replace(/\D/g, '')
  const variants = new Set([digits, digits.padStart(6, '0')])
  return Array.from(variants)
}

const TIPO_FALLBACK = 'Intimação'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized', total: 0, imported: 0, updated: 0, errors: [] }), { headers: CORS })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', total: 0, imported: 0, updated: 0, errors: [] }), { headers: CORS })
    }

    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).single()
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: 'Perfil nao encontrado', total: 0, imported: 0, updated: 0, errors: [] }), { headers: CORS })
    }

    const withinLimit = await checkRateLimit(supabase, `sync-pje:${user.id}`)
    if (!withinLimit) {
      return new Response(JSON.stringify({ error: 'Muitas sincronizações em pouco tempo. Aguarde e tente novamente.', total: 0, imported: 0, updated: 0, errors: [] }), { headers: CORS })
    }

    const body = await req.json().catch(() => ({}))
    const oabNumRaw: string = (body.oab_number || '').trim()
    const oabState: string = (body.oab_seccional || '').trim().toUpperCase()

    if (!oabNumRaw || !oabState) {
      return new Response(JSON.stringify({ error: 'OAB e seccional obrigatórias', total: 0, imported: 0, updated: 0, errors: [] }), { headers: CORS })
    }

    // Janela padrão: últimos 90 dias (cobre a maioria dos prazos processuais em
    // aberto). O cron noturno (cron-sync-processes) passa uma janela mais curta.
    const hoje = new Date()
    const dataFim: string = body.data_fim || hoje.toISOString().slice(0, 10)
    const dataInicio: string = body.data_inicio || (() => {
      const d = new Date(hoje); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10)
    })()

    const errors: string[] = []
    let djenItems: DjenItem[] = []

    for (const variant of oabVariants(oabNumRaw)) {
      const { items, errors: pageErrors } = await fetchAllPages(variant, oabState, dataInicio, dataFim)
      if (pageErrors.length) errors.push(...pageErrors.map(e => `PJe/DJEN: ${e}`))
      if (items.length > 0) { djenItems = items; break }
    }

    let imported = 0, updated = 0
    const insert_errors: string[] = []
    const now = new Date().toISOString()

    for (const item of djenItems) {
      const num = (item.numero_processo || '').replace(/\D/g, '')
      if (!num) continue

      const movimento = {
        fonte: 'pje',
        idComunicacao: item.id ?? item.hash ?? null,
        hash: item.hash ?? null,
        nome: item.tipoComunicacao || item.tipoDocumento || TIPO_FALLBACK,
        dataHora: item.data_disponibilizacao || item.datadisponibilizacao || null,
        orgao: item.nomeOrgao || null,
        teor: item.texto || null,
        link: item.link || null,
      }

      const { data: ex } = await supabase.from('processes').select('id, movimentos')
        .eq('number', num).eq('tenant_id', profile.tenant_id).is('deleted_at', null).maybeSingle()

      if (ex) {
        const existing: any[] = Array.isArray(ex.movimentos) ? ex.movimentos : []
        const already = existing.some((m: any) =>
          (movimento.idComunicacao != null && m.idComunicacao === movimento.idComunicacao) ||
          (movimento.hash != null && m.hash === movimento.hash))
        if (!already) {
          const { error: upErr } = await supabase.from('processes').update({ cnj_synced_at: now, movimentos: [...existing, movimento] }).eq('id', ex.id)
          if (upErr) insert_errors.push(`update ${num}: ${upErr.message}`)
          else updated++
        }
      } else {
        const parteNome = item.destinatarios?.[0]?.nome || null
        const { error: insErr } = await supabase.from('processes').insert({
          tenant_id: profile.tenant_id,
          number: num,
          title: parteNome ? `${movimento.nome} - ${parteNome}` : movimento.nome,
          client_name: parteNome,
          court: item.nomeOrgao || null,
          area: item.siglaTribunal || null,
          status: 'active',
          priority: 'medium',
          cnj_source: true,
          cnj_synced_at: now,
          movimentos: [movimento],
        })
        if (insErr) insert_errors.push(`insert ${num}: ${insErr.message}`)
        else imported++
      }
    }

    return new Response(
      JSON.stringify({
        total: djenItems.length,
        imported,
        updated,
        errors: [...errors, ...insert_errors],
        oab: `${oabNumRaw}/${oabState}`,
        periodo: { inicio: dataInicio, fim: dataFim },
      }),
      { headers: CORS },
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message, total: 0, imported: 0, updated: 0, errors: [e.message] }),
      { headers: CORS },
    )
  }
})

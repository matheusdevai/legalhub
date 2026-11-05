// Cliente do DJEN / Comunica PJe (API pública do CNJ, sem autenticação).
// Formato verificado em 05/11/2026: { status, message, count, items[] };
// itensPorPagina aceita até 500 e janelas de 1 ano respondem em < 1 s.
import type { DjenItem, OabInscricao } from './core.ts'

const DJEN_BASE = 'https://comunicaapi.pje.jus.br/api/v1'
const PER_PAGE = 500
const MAX_PAGES = 10 // até 5.000 comunicações por inscrição/execução
const PAGE_DELAY_MS = 300 // API pública sem SLA — espaça as chamadas para evitar 429

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface DjenFetchResult {
  items: DjenItem[]
  /** Total que o DJEN diz existir na janela. */
  count: number
  /** true se parou antes de trazer tudo (tempo ou trava de páginas). */
  truncated: boolean
  errors: string[]
}

async function fetchPage(insc: OabInscricao, inicio: string, fim: string, pagina: number): Promise<{ items: DjenItem[]; count: number; error: string | null }> {
  const url = new URL(`${DJEN_BASE}/comunicacao`)
  url.searchParams.set('numeroOab', insc.numero)
  url.searchParams.set('ufOab', insc.uf)
  url.searchParams.set('dataDisponibilizacaoInicio', inicio)
  url.searchParams.set('dataDisponibilizacaoFim', fim)
  url.searchParams.set('pagina', String(pagina))
  url.searchParams.set('itensPorPagina', String(PER_PAGE))

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) })
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < 2) { await sleep(1500 * (attempt + 1)); continue }
        return { items: [], count: 0, error: resp.status === 429 ? 'limite de requisições do DJEN atingido — tente de novo em alguns minutos' : `DJEN fora do ar (HTTP ${resp.status})` }
      }
      // O CNJ recusa consultas de fora do Brasil: a função precisa rodar em
      // sa-east-1 (header x-region / region no invoke).
      if (resp.status === 403) return { items: [], count: 0, error: 'o DJEN recusou o acesso (HTTP 403) — a API do CNJ só aceita consultas feitas a partir do Brasil' }
      if (!resp.ok) return { items: [], count: 0, error: `DJEN HTTP ${resp.status}` }
      const data = await resp.json().catch(() => null)
      if (!data || data.status === 'error') return { items: [], count: 0, error: data?.message || 'resposta inválida do DJEN' }
      const items: DjenItem[] = Array.isArray(data.items) ? data.items : []
      return { items, count: typeof data.count === 'number' ? data.count : items.length, error: null }
    } catch (e: any) {
      if (attempt < 2) { await sleep(1000); continue }
      return { items: [], count: 0, error: e?.name === 'TimeoutError' ? 'DJEN demorou demais para responder' : (e?.message || 'erro de rede ao consultar o DJEN') }
    }
  }
  return { items: [], count: 0, error: 'falha ao consultar o DJEN' }
}

/** Todas as comunicações de uma inscrição na janela, até `deadline` (Date.now()). */
export async function fetchDjenForInscricao(insc: OabInscricao, inicio: string, fim: string, deadline: number): Promise<DjenFetchResult> {
  const items: DjenItem[] = []
  const errors: string[] = []
  let count = 0
  let truncated = false
  for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
    if (Date.now() > deadline) { truncated = true; break }
    const r = await fetchPage(insc, inicio, fim, pagina)
    if (r.error) { errors.push(`OAB ${insc.numero}/${insc.uf}: ${r.error}`); truncated = items.length > 0; break }
    if (pagina === 1) count = r.count
    items.push(...r.items)
    if (r.items.length < PER_PAGE || items.length >= count) break
    if (pagina === MAX_PAGES) truncated = true
    await sleep(PAGE_DELAY_MS)
  }
  return { items, count, truncated, errors }
}

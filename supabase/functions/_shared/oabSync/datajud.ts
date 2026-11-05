// Complemento pelo DataJud (API pública do CNJ). O índice público não tem
// partes/advogados, então NÃO serve para achar processos pela OAB — só para
// completar classe, órgão, data de ajuizamento e andamentos de processos já
// encontrados (DJEN, Escavador, JusBrasil ou cadastro manual), pelo número.
// A API anda lenta (20–55 s por consulta em 05/11/2026): cada execução trata
// poucos processos, em paralelo e com orçamento de tempo, e marca
// datajud_checked_at para não repetir os mesmos.
import { courtFromCnjNumber, datajudPatch, type DatajudTarget } from './core.ts'

const CNJ_BASE = 'https://api-publica.datajud.cnj.jus.br'
// Chave pública divulgada pelo próprio CNJ para a API pública do DataJud.
const CNJ_API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='
const RECHECK_DAYS = 7

export async function fetchDatajudByNumber(court: string, digits: string, timeoutMs: number): Promise<any[]> {
  const r = await fetch(`${CNJ_BASE}/api_publica_${court}/_search`, {
    method: 'POST',
    headers: { Authorization: `APIKey ${CNJ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ size: 5, query: { match: { numeroProcesso: digits } } }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`DataJud ${court} HTTP ${r.status}`)
  const d = await r.json()
  return (d?.hits?.hits ?? []).map((h: any) => h._source)
}

export interface EnrichOutcome { checked: number; enriched: number; errors: string[]; pending: boolean }

export async function enrichFromDatajud(supabase: any, tenantId: string, deadline: number, opts: { limit?: number; concurrency?: number } = {}): Promise<EnrichOutcome> {
  const out: EnrichOutcome = { checked: 0, enriched: 0, errors: [], pending: false }
  const limit = opts.limit ?? 12
  const recheck = new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase.from('processes')
    .select('id, number_digits, title, area, court, data_protocolo, movimentos')
    .eq('tenant_id', tenantId).is('deleted_at', null)
    .or(`datajud_checked_at.is.null,datajud_checked_at.lt.${recheck}`)
    .order('cnj_synced_at', { ascending: false, nullsFirst: false })
    .limit(limit * 3)
  if (error) { out.errors.push(`DataJud: ${error.message}`); return out }
  const queue = ((data || []) as (DatajudTarget & { id: string; number_digits: string })[])
    .filter(r => r.number_digits?.length === 20).slice(0, limit)
  out.pending = (data || []).length > queue.length

  const worker = async () => {
    while (queue.length) {
      const remaining = deadline - Date.now()
      if (remaining < 8_000) { out.pending = true; return }
      const row = queue.shift()!
      const court = courtFromCnjNumber(row.number_digits)
      let patch: Record<string, unknown> = {}
      if (court) {
        try { patch = datajudPatch(row, await fetchDatajudByNumber(court, row.number_digits, Math.min(30_000, remaining - 5_000))) }
        catch (e: any) { out.errors.push(e?.name === 'TimeoutError' ? `DataJud ${court}: sem resposta a tempo` : (e?.message || 'DataJud: erro')); continue }
      }
      const { error: upErr } = await supabase.from('processes')
        .update({ ...patch, datajud_checked_at: new Date().toISOString() }).eq('id', row.id).eq('tenant_id', tenantId)
      if (upErr) out.errors.push(`DataJud ${row.number_digits}: ${upErr.message}`)
      else { out.checked++; if (Object.keys(patch).length) out.enriched++ }
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker))
  return out
}

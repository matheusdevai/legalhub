// Gravação dos processos sincronizados — sempre restrita a UM tenant (o do
// advogado que está sendo sincronizado). Procura o processo pelo número só em
// dígitos (coluna gerada processes.number_digits): o advogado costuma cadastrar
// com máscara ("0003553-06.2026.4.05.8201") e a busca antiga, por texto exato,
// criava uma cópia sem cliente para receber as intimações.
import {
  type DjenItem, type ExistingProcess, djenItemToMovimento, groupDjenItemsByProcess,
  isPlanLimitError, mergeMovimentos, pickExistingProcess, titleFromDjen,
} from './core.ts'

export interface PersistOutcome {
  imported: number
  updated: number
  unchanged: number
  errors: string[]
  /** Processos novos não gravados porque o plano chegou ao limite. */
  skippedByPlanLimit: number
}

const CONCURRENCY = 6

type Row = ExistingProcess & { number_digits: string; movimentos: unknown; court: string | null }

/** Processos do tenant com estes números (só dígitos), agrupados por número. */
export async function loadExistingByDigits(supabase: any, tenantId: string, digits: string[]): Promise<Map<string, Row[]>> {
  const out = new Map<string, Row[]>()
  for (let i = 0; i < digits.length; i += 150) {
    const chunk = digits.slice(i, i + 150)
    const { data, error } = await supabase.from('processes')
      .select('id, number_digits, client_id, cnj_source, created_at, movimentos, court')
      .eq('tenant_id', tenantId).is('deleted_at', null).in('number_digits', chunk)
    if (error) throw new Error(`leitura de processos: ${error.message}`)
    for (const r of (data || []) as Row[]) {
      const list = out.get(r.number_digits)
      if (list) list.push(r); else out.set(r.number_digits, [r])
    }
  }
  return out
}

/** Grava as comunicações do DJEN: anexa aos processos existentes ou cria os que faltam. */
export async function persistDjenItems(supabase: any, tenantId: string, items: DjenItem[], nowIso = new Date().toISOString()): Promise<PersistOutcome> {
  const out: PersistOutcome = { imported: 0, updated: 0, unchanged: 0, errors: [], skippedByPlanLimit: 0 }
  const groups = groupDjenItemsByProcess(items)
  if (groups.size === 0) return out
  const existing = await loadExistingByDigits(supabase, tenantId, Array.from(groups.keys()))
  let planLimitHit = false

  // Grava em paralelo (poucas conexões por vez): em sequência, um escritório
  // com ~500 processos levava ~120 s — perto do limite de 150 s da função.
  const queue = Array.from(groups.entries())
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [digits, group] = next
      const movs = group.map(djenItemToMovimento)
      const ex = pickExistingProcess(existing.get(digits) || [])
      if (ex) {
        const { merged, added } = mergeMovimentos(ex.movimentos, movs)
        if (added === 0) { out.unchanged++; continue }
        const patch: Record<string, unknown> = { movimentos: merged, cnj_synced_at: nowIso }
        if (!ex.court && group[0].nomeOrgao) patch.court = group[0].nomeOrgao
        const { error } = await supabase.from('processes').update(patch).eq('id', ex.id).eq('tenant_id', tenantId)
        if (error) out.errors.push(`atualizar ${digits}: ${error.message}`)
        else { out.updated++; ex.movimentos = merged }
        continue
      }
      if (planLimitHit) { out.skippedByPlanLimit++; continue }
      const { error } = await supabase.from('processes').insert({
        tenant_id: tenantId,
        number: digits,
        title: titleFromDjen(group),
        client_name: null,
        court: group[0].nomeOrgao || null,
        status: 'active',
        priority: 'medium',
        cnj_source: true,
        cnj_synced_at: nowIso,
        movimentos: mergeMovimentos([], movs).merged,
      })
      if (error) {
        if (isPlanLimitError(error.message)) { if (!planLimitHit) out.errors.push(error.message); planLimitHit = true; out.skippedByPlanLimit++ }
        else out.errors.push(`criar ${digits}: ${error.message}`)
      } else out.imported++
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return out
}

/** Para Escavador/JusBrasil: acha o processo do tenant pelo número em dígitos. */
export async function findProcessByNumber(supabase: any, tenantId: string, number: string): Promise<Row | null> {
  const digits = number.replace(/\D/g, '')
  if (!digits) return null
  const map = await loadExistingByDigits(supabase, tenantId, [digits])
  return pickExistingProcess(map.get(digits) || [])
}

// Uma sincronização pelo DJEN para um advogado: todas as inscrições (principal +
// suplementares), uma janela de datas, gravação no tenant dele e registro em
// oab_sync_runs (o que a tela mostra como "última sincronização" e o que o
// suporte consulta quando alguém diz que os processos não apareceram).
import { normalizeInscricoes, syncWindow, type OabInscricao } from './core.ts'
import { fetchDjenForInscricao } from './djen.ts'
import { persistDjenItems } from './persist.ts'

export interface SyncProfile {
  user_id: string
  tenant_id: string
  oab_number: string | null
  oab_seccional: string | null
  oab_inscricoes?: unknown
}

export interface InscricaoResult {
  oab: string
  found: number
  count: number
  truncated: boolean
  errors: string[]
}

export interface DjenRunResult {
  run_id: string | null
  inscricoes: InscricaoResult[]
  total: number
  imported: number
  updated: number
  unchanged: number
  skippedByPlanLimit: number
  truncated: boolean
  errors: string[]
  periodo: { inicio: string; fim: string }
}

export function inscricoesOf(p: SyncProfile): OabInscricao[] {
  return normalizeInscricoes({ numero: p.oab_number, uf: p.oab_seccional }, p.oab_inscricoes)
}

export async function runDjenSync(
  supabase: any,
  profile: SyncProfile,
  opts: { days: number; trigger: 'manual' | 'cron' | 'onboarding'; deadline: number; inscricoes?: OabInscricao[] },
): Promise<DjenRunResult> {
  const inscricoes = opts.inscricoes ?? inscricoesOf(profile)
  const periodo = syncWindow(new Date(), opts.days)
  const res: DjenRunResult = {
    run_id: null, inscricoes: [], total: 0, imported: 0, updated: 0, unchanged: 0,
    skippedByPlanLimit: 0, truncated: false, errors: [], periodo,
  }

  const { data: run } = await supabase.from('oab_sync_runs').insert({
    tenant_id: profile.tenant_id, user_id: profile.user_id, trigger: opts.trigger, source: 'djen',
    inscricoes: inscricoes.map(i => `${i.numero}/${i.uf}`), period_start: periodo.inicio, period_end: periodo.fim,
  }).select('id').single()
  res.run_id = run?.id ?? null

  try {
    if (inscricoes.length === 0) res.errors.push('Nenhuma inscrição na OAB válida (número + UF) cadastrada.')
    // Inscrições em sequência: a API é pública e compartilhada pelo país todo.
    for (const insc of inscricoes) {
      const f = await fetchDjenForInscricao(insc, periodo.inicio, periodo.fim, opts.deadline)
      res.inscricoes.push({ oab: `${insc.numero}/${insc.uf}`, found: f.items.length, count: f.count, truncated: f.truncated, errors: f.errors })
      res.errors.push(...f.errors)
      res.total += f.items.length
      if (f.truncated) res.truncated = true
      if (f.items.length === 0) continue
      const p = await persistDjenItems(supabase, profile.tenant_id, f.items)
      res.imported += p.imported; res.updated += p.updated; res.unchanged += p.unchanged
      res.skippedByPlanLimit += p.skippedByPlanLimit
      res.errors.push(...p.errors.slice(0, 20))
    }
  } catch (e: any) {
    res.errors.push(e?.message || 'erro inesperado na sincronização')
  }

  if (res.run_id) {
    await supabase.from('oab_sync_runs').update({
      finished_at: new Date().toISOString(),
      ok: res.errors.length === 0,
      found: res.total, imported: res.imported, updated: res.updated,
      truncated: res.truncated, skipped_plan_limit: res.skippedByPlanLimit,
      detail: res.inscricoes, errors: res.errors.slice(0, 30),
    }).eq('id', res.run_id)
  }
  return res
}

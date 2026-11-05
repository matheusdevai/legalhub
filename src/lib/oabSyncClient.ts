import { FunctionRegion } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// A API do DJEN (CNJ) recusa (HTTP 403) consultas vindas de fora do Brasil.
// Edge Functions rodam na região mais próxima de quem chama — por isso toda
// chamada de sincronização é fixada em São Paulo.
const REGION = FunctionRegion.SaEast1

export interface InscricaoResult { oab: string; found: number; count: number; truncated: boolean; errors: string[] }

export interface PjeSyncResult {
  total: number
  imported: number
  updated: number
  unchanged?: number
  skipped_plan_limit?: number
  truncated?: boolean
  errors: string[]
  inscricoes?: InscricaoResult[]
  oab?: string
  periodo?: { inicio: string; fim: string }
  error?: string
}

export interface SourceResult { total: number; imported: number; updated: number; errors?: string[]; error?: string; first_sync_note?: string | null; note?: string; pending?: boolean }

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body, region: REGION })
    if (error) {
      // FunctionsHttpError traz a resposta: tenta ler a mensagem real do servidor.
      const ctx = (error as { context?: Response }).context
      let msg = error.message
      try { const j = await ctx?.json(); if (j?.error) msg = j.error } catch { /* corpo não-JSON */ }
      return { total: 0, imported: 0, updated: 0, errors: [], error: msg } as unknown as T & { error?: string }
    }
    return (data ?? { total: 0, imported: 0, updated: 0, errors: [] }) as T & { error?: string }
  } catch (e) {
    return { total: 0, imported: 0, updated: 0, errors: [], error: e instanceof Error ? e.message : 'Falha de rede' } as unknown as T & { error?: string }
  }
}

/** DJEN — todas as inscrições gravadas no perfil (a função ignora OAB vinda do navegador). */
export function syncPje(trigger: 'manual' | 'onboarding' = 'manual', days = 365) {
  return invoke<PjeSyncResult>('sync-pje', { trigger, days })
}

export const syncEscavador = () => invoke<SourceResult>('sync-escavador', {})
export const syncJusbrasil = () => invoke<SourceResult>('sync-jusbrasil', {})
/** DataJud: só completa dados pelo número (não busca por OAB). */
export const syncCnjComplement = () => invoke<SourceResult>('sync-cnj', {})

export interface SyncRunRow {
  id: string
  trigger: string
  started_at: string
  finished_at: string | null
  ok: boolean | null
  found: number
  imported: number
  updated: number
  truncated: boolean
  skipped_plan_limit: number
  inscricoes: string[]
  errors: string[] | null
}

export async function lastSyncRun(userId: string): Promise<SyncRunRow | null> {
  const { data } = await supabase.from('oab_sync_runs')
    .select('id, trigger, started_at, finished_at, ok, found, imported, updated, truncated, skipped_plan_limit, inscricoes, errors')
    .eq('user_id', userId).order('started_at', { ascending: false }).limit(1).maybeSingle()
  return (data as SyncRunRow) || null
}

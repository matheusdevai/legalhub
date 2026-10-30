import { supabase } from '@/lib/supabase'
import { toLocalISODate } from '@/lib/utils'
import { communicationsToImport, type ProcessWithMovements } from './communicationsImport'
import type { CourtCalendarRow } from './courtCalendar'
import type { DeadlineRow, DeadlineStatus } from './workflow'

export interface DeadlineSettings {
  enabled: boolean
  internal_margin_days: number
  escalation_hour: number
  solo_mode: boolean
  triage_owner_id: string | null
}

export const DEFAULT_SETTINGS: DeadlineSettings = { enabled: false, internal_margin_days: 2, escalation_hour: 14, solo_mode: false, triage_owner_id: null }

export interface CommunicationRow {
  id: string
  process_id: string | null
  source: string
  external_id: string | null
  made_available_at: string | null
  delivery_method: string | null
  court: string | null
  organ: string | null
  title: string | null
  content: string | null
  assigned_to: string | null
  triage_status: 'pending' | 'deadline' | 'no_deadline' | 'duplicate'
  triage_reason: string | null
  created_at: string
}

export interface DeadlineEventRow {
  id: number
  kind: string
  actor_id: string | null
  origin: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}

export interface TeamMember { id: string; name: string; role: string }
export interface ProcessOption { id: string; number: string; title: string; client_name: string | null; court: string | null }

/** Configuração do escritório. Sem a tabela (migration não aplicada) ou sem linha = desligado. */
export async function fetchDeadlineSettings(tenantId: string): Promise<DeadlineSettings> {
  const { data, error } = await supabase.from('deadline_settings').select('enabled, internal_margin_days, escalation_hour, solo_mode, triage_owner_id').eq('tenant_id', tenantId).maybeSingle()
  if (error || !data) return DEFAULT_SETTINGS
  return { ...DEFAULT_SETTINGS, ...data }
}

export async function setDeadlinesEnabled(tenantId: string, enabled: boolean) {
  return supabase.from('deadline_settings').upsert({ tenant_id: tenantId, enabled }, { onConflict: 'tenant_id' })
}

/** Calendário forense visível ao escritório (nacional, tribunais e o do próprio escritório). Sem a tabela = vazio. */
export async function fetchCourtCalendar(): Promise<CourtCalendarRow[]> {
  const { data, error } = await supabase.from('court_calendar').select('scope, court, county, date_from, date_to, kind, label, source_ref, version').is('deleted_at', null)
  return error ? [] : (data as CourtCalendarRow[])
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const { data } = await supabase.from('profiles').select('id, name, display_name, role').neq('role', 'client').order('name')
  return (data || []).map(p => ({ id: p.id, name: p.display_name || p.name, role: p.role }))
}

export async function fetchProcessOptions(): Promise<ProcessOption[]> {
  const { data } = await supabase.from('processes').select('id, number, title, client_name, court').is('deleted_at', null).order('created_at', { ascending: false }).limit(1000)
  return (data || []) as ProcessOption[]
}

export async function fetchDeadlines(): Promise<DeadlineRow[]> {
  const { data, error } = await supabase.from('deadlines').select('*').is('deleted_at', null).order('fatal_date')
  if (error) throw error
  return (data || []) as DeadlineRow[]
}

export async function fetchPendingCommunications(): Promise<CommunicationRow[]> {
  const { data, error } = await supabase.from('communications').select('*').eq('triage_status', 'pending').is('deleted_at', null).order('made_available_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data || []) as CommunicationRow[]
}

export async function fetchDeadlineEvents(deadlineId: string, communicationId: string | null): Promise<DeadlineEventRow[]> {
  const filter = communicationId ? `deadline_id.eq.${deadlineId},communication_id.eq.${communicationId}` : `deadline_id.eq.${deadlineId}`
  const { data } = await supabase.from('deadline_events').select('id, kind, actor_id, origin, before, after, created_at').or(filter).order('created_at')
  return (data || []) as DeadlineEventRow[]
}

/**
 * Traz para a caixa "A triar" as intimações do DJEN que a sincronização já
 * gravou nos processos (últimos `days` dias). Devolve quantas entraram.
 */
export async function importDjenCommunications(triageOwner: string | null, days = 30): Promise<number> {
  const since = toLocalISODate(new Date(Date.now() - days * 86_400_000))
  const [{ data: processes }, { data: existing }] = await Promise.all([
    supabase.from('processes').select('id, number, movimentos').is('deleted_at', null).not('movimentos', 'is', null),
    supabase.from('communications').select('external_id').eq('source', 'djen'),
  ])
  const known = new Set((existing || []).map(e => e.external_id as string))
  const rows = communicationsToImport((processes || []) as ProcessWithMovements[], known, since)
  if (rows.length === 0) return 0
  const { error } = await supabase.from('communications').insert(rows.map(r => ({ ...r, assigned_to: triageOwner })))
  if (error) throw error
  return rows.length
}

export async function createManualCommunication(c: { process_id: string | null; made_available_at: string; delivery_method: string; title: string; content: string; organ: string | null }) {
  return supabase.from('communications').insert({ ...c, source: 'manual' }).select('*').single()
}

export async function triageCommunication(id: string, status: 'deadline' | 'no_deadline' | 'duplicate', extra: { reason?: string; duplicateOf?: string } = {}) {
  return supabase.from('communications').update({ triage_status: status, triage_reason: extra.reason ?? null, duplicate_of: extra.duplicateOf ?? null }).eq('id', id)
}

export type DeadlineInsert = Omit<DeadlineRow, 'id' | 'tenant_id' | 'status' | 'reviewed_at' | 'review_note' | 'protocol_at' | 'protocol_number' | 'protocol_file_url' | 'closed_reason' | 'task_id' | 'created_by' | 'created_at' | 'updated_at'>

export async function createDeadline(d: DeadlineInsert) {
  return supabase.from('deadlines').insert(d).select('*').single()
}

export async function updateDeadline(id: string, patch: Partial<DeadlineRow>) {
  return supabase.from('deadlines').update(patch).eq('id', id).select('*').single()
}

export async function setDeadlineStatus(id: string, status: DeadlineStatus, extra: Partial<DeadlineRow> = {}) {
  return updateDeadline(id, { status, ...extra })
}

/** Comprovante do protocolo no bucket `documents` (path {tenant}/prazos/{prazo}/…, mesma policy dos demais anexos). */
export async function uploadProtocolFile(tenantId: string, deadlineId: string, file: File): Promise<string> {
  const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
  const path = `${tenantId}/prazos/${deadlineId}/${Date.now()}_${safe}`
  const { error } = await supabase.storage.from('documents').upload(path, file)
  if (error) throw error
  return supabase.storage.from('documents').getPublicUrl(path).data.publicUrl
}

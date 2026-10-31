import { supabase } from '@/lib/supabase'
import { toLocalISODate } from '@/lib/utils'
import { communicationsToImport, type ProcessWithMovements } from './communicationsImport'
import type { CourtCalendarRow } from './courtCalendar'
import type { HealthCheckRow } from './health'
import type { TextSuggestion } from './suggest'
import type { ReportCommunication } from './reports'
import type { DeadlineRow, DeadlineStatus } from './workflow'

export interface DeadlineSettings {
  enabled: boolean
  internal_margin_days: number
  escalation_hour: number
  solo_mode: boolean
  /** Piloto: compara cada prazo com o controle atual do escritório (só a equipe do LegalHub liga). */
  pilot_mode: boolean
  triage_owner_id: string | null
}

export const DEFAULT_SETTINGS: DeadlineSettings = { enabled: false, internal_margin_days: 2, escalation_hour: 14, solo_mode: false, triage_owner_id: null, pilot_mode: false }

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
  const { data, error } = await supabase.from('deadline_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
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

// ── Fase 3: configurações, vigilância e conferência das fontes ─────────────

/** Margem, horário do escalonamento, responsável de triagem e modo solo (administrador). Ligar/desligar fica com a equipe do LegalHub. */
export async function updateDeadlineSettings(tenantId: string, patch: Partial<Omit<DeadlineSettings, 'enabled' | 'pilot_mode'>>) {
  return supabase.from('deadline_settings').update(patch).eq('tenant_id', tenantId)
}

export interface HealthSnapshot {
  checks: HealthCheckRow[]
  sourceCheckedToday: { by: string } | null
  lawyersWithoutOab: string[]
  hasOabProfiles: boolean
}

const today = () => toLocalISODate()
const yesterday = () => toLocalISODate(new Date(Date.now() - 86_400_000))

export async function fetchHealth(tenantId: string): Promise<HealthSnapshot> {
  const [{ data: checks }, { data: src }, { data: lawyers }] = await Promise.all([
    supabase.from('health_checks').select('check_key, checked_on, ok, detail, updated_at').eq('tenant_id', tenantId).gte('checked_on', yesterday()),
    supabase.from('source_checks').select('checked_by, created_at').eq('tenant_id', tenantId).eq('checked_on', today()).order('created_at', { ascending: false }).limit(1),
    supabase.from('profiles').select('name, display_name, oab_number, role').eq('tenant_id', tenantId).in('role', ['lawyer', 'admin']),
  ])
  let by: string | null = null
  if (src?.[0]) {
    const { data: p } = await supabase.from('profiles').select('name, display_name').eq('id', src[0].checked_by).maybeSingle()
    by = p?.display_name || p?.name || 'alguém do escritório'
  }
  return {
    checks: (checks || []) as HealthCheckRow[],
    sourceCheckedToday: by ? { by } : null,
    // Administrador sem OAB costuma ser o sócio-gestor; só cobra OAB de quem é advogado.
    lawyersWithoutOab: (lawyers || []).filter(l => l.role === 'lawyer' && !l.oab_number?.trim()).map(l => l.display_name || l.name),
    hasOabProfiles: (lawyers || []).some(l => !!l.oab_number?.trim()),
  }
}

/** "Conferi as fontes oficiais hoje" — registra quem e quando (o banco carimba a data de hoje). */
export async function registerSourceCheck(note?: string) {
  return supabase.from('source_checks').insert({ note: note?.trim() || null })
}

export interface OfficeHealth { tenantId: string; name: string; snapshot: HealthSnapshot; openDeadlines: number; pilotMode: boolean }

/** Painel interno (super_admin): saúde de todos os escritórios com o Controle de Prazos ligado. */
export async function fetchAllOfficesHealth(): Promise<OfficeHealth[]> {
  const { data: settings } = await supabase.from('deadline_settings').select('*').eq('enabled', true)
  const ids = (settings || []).map(s => s.tenant_id)
  if (!ids.length) return []
  const [{ data: tenants }, snapshots, { data: open }] = await Promise.all([
    supabase.from('tenants').select('id, name').in('id', ids),
    Promise.all(ids.map(id => fetchHealth(id))),
    supabase.from('deadlines').select('tenant_id').in('tenant_id', ids).is('deleted_at', null).not('status', 'in', '(protocolado,cancelado,perdido)'),
  ])
  return ids.map((id, i) => ({
    tenantId: id,
    name: tenants?.find(t => t.id === id)?.name || id,
    snapshot: snapshots[i],
    openDeadlines: (open || []).filter(o => o.tenant_id === id).length,
    pilotMode: !!(settings || []).find(s => s.tenant_id === id)?.pilot_mode,
  }))
}

/** Segunda leitura da intimação pela IA (Edge Function deadline-suggest) — só quando as regras ficaram em dúvida. */
export async function askAiSuggestion(communicationId: string): Promise<TextSuggestion> {
  const { data, error } = await supabase.functions.invoke('deadline-suggest', { body: { communication_id: communicationId } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const msg = ctx && typeof ctx.json === 'function' ? (await ctx.json().catch(() => null))?.error : null
    throw new Error(msg || error.message)
  }
  return (data as { suggestion: TextSuggestion }).suggestion
}

/** Dados do relatório mensal (o que a lista de prazos da tela não traz): intimações que chegaram no mês e dias com conferência das fontes. */
export async function fetchReportInputs(month: string): Promise<{ communications: ReportCommunication[]; sourceCheckDays: string[] }> {
  const first = `${month}-01`
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10)
  // Margem de 1 dia nas pontas: created_at é UTC e o mês é contado em Brasília (monthlyIndicators recorta).
  const from = new Date(Date.parse(`${first}T00:00:00Z`) - 86_400_000).toISOString()
  const to = new Date(Date.parse(`${next}T00:00:00Z`) + 86_400_000).toISOString()
  const [{ data: comms }, { data: checks }] = await Promise.all([
    supabase.from('communications').select('created_at, triage_status, triaged_at').is('deleted_at', null).gte('created_at', from).lt('created_at', to),
    supabase.from('source_checks').select('checked_on').gte('checked_on', first).lt('checked_on', next),
  ])
  return { communications: (comms || []) as ReportCommunication[], sourceCheckDays: [...new Set((checks || []).map(c => c.checked_on as string))] }
}

/** Liga/desliga o modo piloto de um escritório (só super_admin — o banco recusa os demais). */
export async function setPilotMode(tenantId: string, pilot: boolean) {
  return supabase.from('deadline_settings').update({ pilot_mode: pilot }).eq('tenant_id', tenantId)
}

export interface PilotDeadline extends Pick<DeadlineRow, 'id' | 'tenant_id' | 'act_type' | 'regime' | 'start_event' | 'start_date' | 'amount' | 'unit' | 'court' | 'county' | 'fatal_date' | 'status'> {
  pilot_reference_date: string
  pilot_divergence_note: string | null
}

/** Painel interno: prazos do piloto com a data do controle atual (todos os escritórios, super_admin). */
export async function fetchPilotDeadlines(): Promise<PilotDeadline[]> {
  const { data } = await supabase.from('deadlines')
    .select('id, tenant_id, act_type, regime, start_event, start_date, amount, unit, court, county, fatal_date, status, pilot_reference_date, pilot_divergence_note')
    .not('pilot_reference_date', 'is', null).is('deleted_at', null).order('fatal_date', { ascending: false }).limit(1000)
  return (data || []) as PilotDeadline[]
}

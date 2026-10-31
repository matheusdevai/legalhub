// Regras do ciclo de vida do prazo para a TELA. As mesmas regras são
// garantidas no banco (trigger deadlines_enforce_rules, migration
// 20261030170000) — aqui elas só decidem quais botões mostrar.
import { businessDaysUntil, type CalendarEntry, type MemoryDay, type Regime, type StartEvent, type Unit } from './engine'

export type DeadlineStatus = 'calculado' | 'conferido' | 'em_elaboracao' | 'pronto' | 'protocolado' | 'cancelado' | 'perdido'

export interface DeadlineRow {
  id: string
  tenant_id: string
  communication_id: string | null
  process_id: string | null
  act_type: string
  regime: Regime
  start_event: StartEvent
  start_date: string
  amount: number
  unit: Unit
  doubled: boolean
  doubled_reason: string | null
  apply_recess: boolean
  court: string | null
  county: string | null
  suggested_fatal_date: string
  fatal_date: string
  internal_date: string
  manually_adjusted: boolean
  adjust_reason: string | null
  calc_memory: MemoryDay[]
  rules_version: string
  calendar_version: string | null
  status: DeadlineStatus
  responsible_id: string
  reviewer_id: string | null
  reviewed_at: string | null
  review_note: string | null
  protocol_at: string | null
  protocol_number: string | null
  protocol_file_url: string | null
  closed_reason: string | null
  task_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  /** Piloto (fase 4): data fatal anotada no controle atual do escritório e, se diferente, por quê. */
  pilot_reference_date?: string | null
  pilot_divergence_note?: string | null
}

export const UNIT_LABELS: Record<Unit, string> = { dias_uteis: 'dias úteis', dias_corridos: 'dias corridos', meses: 'meses', anos: 'anos' }

export const STATUS_LABELS: Record<DeadlineStatus, string> = {
  calculado: 'Aguardando conferência',
  conferido: 'Conferido',
  em_elaboracao: 'Em elaboração',
  pronto: 'Pronto para protocolo',
  protocolado: 'Protocolado',
  cancelado: 'Cancelado',
  perdido: 'Prazo perdido',
}

export const STATUS_COLORS: Record<DeadlineStatus, string> = {
  calculado: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  conferido: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  em_elaboracao: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  pronto: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  protocolado: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelado: 'bg-slate-100 text-slate-600 dark:bg-dark-700 dark:text-slate-300',
  perdido: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

export const CLOSED: DeadlineStatus[] = ['protocolado', 'cancelado', 'perdido']
export const isClosed = (s: DeadlineStatus) => CLOSED.includes(s)

const TRANSITIONS: Record<DeadlineStatus, DeadlineStatus[]> = {
  calculado: ['conferido', 'cancelado', 'perdido'],
  conferido: ['em_elaboracao', 'pronto', 'protocolado', 'calculado', 'cancelado', 'perdido'],
  em_elaboracao: ['pronto', 'protocolado', 'calculado', 'cancelado', 'perdido'],
  pronto: ['em_elaboracao', 'protocolado', 'calculado', 'cancelado', 'perdido'],
  protocolado: [],
  cancelado: [],
  perdido: [],
}

export const canTransition = (from: DeadlineStatus, to: DeadlineStatus) => TRANSITIONS[from].includes(to)

/** Dia local (fuso do navegador) de um timestamp — mesma referência do banco (America/Sao_Paulo). */
function localDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type DeadlineAction = 'conferir' | 'devolver' | 'iniciar' | 'pronto' | 'protocolar' | 'recalcular' | 'cancelar' | 'perdido'

/**
 * Ações que a pessoa logada vê para um prazo. A conferência só aparece para o
 * conferente designado; no escritório solo, a autoconferência só a partir do
 * dia seguinte ao cadastro (mesma regra do banco).
 */
export function availableActions(d: Pick<DeadlineRow, 'status' | 'reviewer_id' | 'created_by' | 'created_at'>, me: string, opts: { soloMode: boolean; today: string }): DeadlineAction[] {
  if (isClosed(d.status)) return []
  const actions: DeadlineAction[] = []
  if (d.status === 'calculado' && d.reviewer_id === me) {
    const self = d.reviewer_id === d.created_by
    const nextDay = localDay(d.created_at) < opts.today
    if (!self || (opts.soloMode && nextDay)) actions.push('conferir', 'devolver')
  }
  if (d.status === 'conferido') actions.push('iniciar', 'pronto')
  if (d.status === 'em_elaboracao') actions.push('pronto')
  if (d.status === 'pronto') actions.push('iniciar')
  if (['conferido', 'em_elaboracao', 'pronto'].includes(d.status)) actions.push('protocolar')
  actions.push('recalcular', 'cancelar', 'perdido')
  return actions
}

/** Por que a conferência ainda não está disponível (para explicar na tela). */
export function reviewBlockedReason(d: Pick<DeadlineRow, 'status' | 'reviewer_id' | 'created_by' | 'created_at'>, me: string, opts: { soloMode: boolean; today: string }): string | null {
  if (d.status !== 'calculado') return null
  if (!d.reviewer_id) return 'Este prazo ainda não tem conferente.'
  if (d.reviewer_id !== me) return 'Aguardando a conferência do conferente designado.'
  if (d.reviewer_id === d.created_by) {
    if (!opts.soloMode) return 'A conferência precisa ser feita por outra pessoa. Escolha outro conferente.'
    if (localDay(d.created_at) >= opts.today) return 'Escritório solo: confira de novo a partir de amanhã, com a memória de cálculo aberta.'
  }
  return null
}

// ── Painel por urgência ─────────────────────────────────────────────────────

export type BoardColumn = 'vencidos' | 'hoje' | 'tres_dias' | 'semana' | 'depois'

export const BOARD_COLUMNS: { id: BoardColumn; label: string }[] = [
  { id: 'vencidos', label: 'Vencidos sem protocolo' },
  { id: 'hoje', label: 'Vencem hoje' },
  { id: 'tres_dias', label: 'Próximos 3 dias úteis' },
  { id: 'semana', label: 'Próximos 7 dias' },
  { id: 'depois', label: 'Depois' },
]

export function boardColumn(fatal: string, today: string, calendar: CalendarEntry[] = []): BoardColumn {
  if (fatal < today) return 'vencidos'
  if (fatal === today) return 'hoje'
  if (businessDaysUntil(today, fatal, calendar) <= 3) return 'tres_dias'
  const week = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10)
  return fatal <= week ? 'semana' : 'depois'
}

export interface DeadlineFlags {
  semConferente: boolean
  aguardandoConferencia: boolean
  internoVencido: boolean
  ajustadoManualmente: boolean
}

export function deadlineFlags(d: Pick<DeadlineRow, 'status' | 'reviewer_id' | 'internal_date' | 'manually_adjusted'>, today: string): DeadlineFlags {
  const open = !isClosed(d.status)
  return {
    semConferente: open && d.status === 'calculado' && !d.reviewer_id,
    aguardandoConferencia: open && d.status === 'calculado',
    internoVencido: open && d.status !== 'pronto' && d.internal_date < today,
    ajustadoManualmente: d.manually_adjusted,
  }
}

/** Abertos agrupados por coluna, cada coluna ordenada pela data fatal. */
export function groupBoard<T extends Pick<DeadlineRow, 'status' | 'fatal_date'>>(rows: T[], today: string, calendar: CalendarEntry[] = []): Record<BoardColumn, T[]> {
  const out: Record<BoardColumn, T[]> = { vencidos: [], hoje: [], tres_dias: [], semana: [], depois: [] }
  for (const r of rows) if (!isClosed(r.status)) out[boardColumn(r.fatal_date, today, calendar)].push(r)
  for (const k of Object.keys(out) as BoardColumn[]) out[k].sort((a, b) => a.fatal_date.localeCompare(b.fatal_date))
  return out
}

// ── Validações de formulário ────────────────────────────────────────────────

export function validateProtocol(f: { protocolAt: string; protocolNumber: string; hasFile: boolean }): string | null {
  if (!f.protocolAt) return 'Informe a data e a hora do protocolo.'
  if (!f.protocolNumber.trim() && !f.hasFile) return 'Informe o número do protocolo ou anexe o comprovante.'
  return null
}

export function validateClose(reason: string): string | null {
  return reason.trim().length < 5 ? 'Explique o motivo (pelo menos 5 caracteres).' : null
}

export const NO_DEADLINE_REASONS = [
  'Ciência apenas',
  'Ato já praticado',
  'Prazo da parte contrária',
  'Processo de outro escritório',
  'Outro',
]

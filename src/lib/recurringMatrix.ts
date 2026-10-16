import { addDays } from 'date-fns'
import type { Financial } from '@/types'
import { toLocalISODate } from '@/lib/utils'
import { buildProjectedFinancial, nextRecurrenceDate, projectRecurringDates } from '@/lib/financialSheet'

// Lógica pura da aba "Recorrentes" do Financeiro: uma linha por template
// recorrente, uma coluna por mês. Ocorrência = lançamento real com
// `generated_from_id = template.id` OU prevista (projetada, ainda não gravada —
// ver lib/financialSheet.ts).

export type CellState = 'paid' | 'pending' | 'overdue' | 'projected' | 'skipped' | 'none'

export type MonthCell = {
  state: CellState
  /** ocorrências do mês (reais + previstas), em ordem de vencimento */
  occurrences: Financial[]
  /** soma das ocorrências não canceladas */
  total: number
}

function inMonth(iso: string | null, year: number, month: number): boolean {
  if (!iso) return false
  const d = new Date(`${iso}T00:00:00`)
  return d.getFullYear() === year && d.getMonth() === month
}

function isLate(f: Financial, today: string): boolean {
  return f.status === 'overdue' || (f.status === 'pending' && !!f.due_date && f.due_date < today)
}

/** Ocorrências reais (gravadas) de um template. */
export function templateOccurrences(template: Financial, all: Financial[]): Financial[] {
  return all.filter(f => !f.recurring && f.generated_from_id === template.id)
}

export function recurringMonthCell(template: Financial, all: Financial[], year: number, month: number, today: string): MonthCell {
  const real = templateOccurrences(template, all).filter(f => inMonth(f.due_date, year, month))
  const projected = projectRecurringDates(template, all, year, month).map(d => buildProjectedFinancial(template, d))
  const occurrences = [...real, ...projected].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  const counted = occurrences.filter(f => f.status !== 'cancelled')
  const total = counted.reduce((s, f) => s + Number(f.amount), 0)

  let state: CellState
  if (occurrences.length === 0) state = 'none'
  else if (counted.length === 0) state = 'skipped'
  else if (real.some(f => f.status !== 'cancelled' && isLate(f, today))) state = 'overdue'
  else if (real.some(f => f.status === 'pending')) state = 'pending'
  else if (projected.length > 0) state = 'projected'
  else state = 'paid'
  return { state, occurrences, total }
}

/** Valor mensal equivalente (semanal × 52/12, anual ÷ 12) — para os totais de "fixos por mês". */
export function monthlyEquivalent(template: Financial): number {
  const amount = Number(template.amount) || 0
  if (template.recurrence_interval === 'weekly') return Math.round(amount * 52 / 12 * 100) / 100
  if (template.recurrence_interval === 'yearly') return Math.round(amount / 12 * 100) / 100
  return amount
}

export type RecurringAlerts = {
  /** ocorrências gravadas e atrasadas */
  overdue: Financial[]
  /** ocorrências (gravadas ou previstas) que vencem de hoje até `days` dias */
  dueSoon: Financial[]
}

export function recurringAlerts(templates: Financial[], all: Financial[], today: string, days = 7): RecurringAlerts {
  const limit = toLocalISODate(addDays(new Date(`${today}T00:00:00`), days))
  const overdue: Financial[] = []
  const dueSoon: Financial[] = []
  for (const t of templates) {
    const real = templateOccurrences(t, all).filter(f => f.status !== 'cancelled' && f.status !== 'paid')
    for (const f of real) {
      if (isLate(f, today)) overdue.push(f)
      else if (f.due_date && f.due_date <= limit) dueSoon.push(f)
    }
    // Previstas na janela: anda pelas datas do template até passar do limite
    const materialized = new Set(templateOccurrences(t, all).map(f => f.due_date))
    let d = t.due_date
    for (let i = 0; d && d <= limit && i < 400; i++) {
      if (t.recurrence_end_date && d > t.recurrence_end_date) break
      if (d >= today && !materialized.has(d)) dueSoon.push(buildProjectedFinancial(t, d))
      d = nextRecurrenceDate(d, t.recurrence_interval)
    }
  }
  const byDate = (a: Financial, b: Financial) => (a.due_date || '').localeCompare(b.due_date || '')
  return { overdue: overdue.sort(byDate), dueSoon: dueSoon.sort(byDate) }
}

export type AdjustmentPlan = {
  /** datas previstas ANTES do mês de vigência — gravadas com o valor antigo antes de mudar o template */
  materializeDates: string[]
  /** ocorrências já gravadas, ainda não pagas, a partir do mês de vigência — recebem o valor novo */
  updateIds: string[]
}

/**
 * Reajuste "a partir de" um mês (`effectiveMonth` = 'YYYY-MM'). O template
 * passa a ter o valor novo; o que vem antes da vigência e ainda não foi gravado
 * é gravado agora com o valor antigo (senão a projeção mostraria o valor novo
 * também nesses meses), e o que já foi gravado a partir da vigência e não foi
 * pago recebe o valor novo.
 */
export function adjustmentPlan(template: Financial, all: Financial[], effectiveMonth: string): AdjustmentPlan {
  const effectiveStart = `${effectiveMonth}-01`
  const occurrences = templateOccurrences(template, all)
  const materialized = new Set(occurrences.map(f => f.due_date))
  const materializeDates: string[] = []
  let d = template.due_date
  for (let i = 0; d && d < effectiveStart && i < 2000; i++) {
    if (template.recurrence_end_date && d > template.recurrence_end_date) break
    if (!materialized.has(d)) materializeDates.push(d)
    d = nextRecurrenceDate(d, template.recurrence_interval)
  }
  const updateIds = occurrences
    .filter(f => f.due_date && f.due_date >= effectiveStart && f.status !== 'paid' && f.status !== 'cancelled')
    .map(f => f.id)
  return { materializeDates, updateIds }
}

export const INTERVAL_LABELS: Record<string, string> = { weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' }

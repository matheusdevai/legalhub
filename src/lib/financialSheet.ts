import { addDays, addMonths, addYears } from 'date-fns'
import type { Financial } from '@/types'
import { toLocalISODate } from '@/lib/utils'

// Lógica pura da "Planilha" do Financeiro (FinancialsPage → FinancialSheet).
//
// Recorrências: um lançamento com `recurring = true` é um TEMPLATE — seu
// `due_date` é sempre a próxima ocorrência ainda não gerada. O cron diário
// `lawfy_generate_recurring_items()` copia o template quando `due_date <= hoje`
// (a cópia leva `generated_from_id = template.id`) e avança o `due_date`.
// A planilha projeta as ocorrências futuras a partir do template, com a MESMA
// aritmética de datas do Postgres (somas iterativas de 7 dias / 1 mês / 1 ano,
// em que o fim de mês é "grudado" — 31/01 → 28/02 → 28/03), para que a
// ocorrência prevista na tela caia exatamente no dia que o cron vai gerar.

export type RecurrenceInterval = 'weekly' | 'monthly' | 'yearly'

function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

export function nextRecurrenceDate(iso: string, interval: RecurrenceInterval | null): string {
  const d = parseISODate(iso)
  if (interval === 'weekly') return toLocalISODate(addDays(d, 7))
  if (interval === 'yearly') return toLocalISODate(addYears(d, 1))
  return toLocalISODate(addMonths(d, 1))
}

/** Limite de segurança contra laço infinito (template semanal muito antigo, dados corrompidos). */
const MAX_STEPS = 2000

/**
 * Datas (YYYY-MM-DD) em que `template` tem ocorrência no mês `month` (0-11) de `year`
 * e que ainda não viraram lançamento real (nenhum item em `existing` com
 * `generated_from_id = template.id` e o mesmo `due_date`).
 */
export function projectRecurringDates(template: Financial, existing: Financial[], year: number, month: number): string[] {
  if (!template.recurring || !template.due_date) return []
  const monthStart = toLocalISODate(new Date(year, month, 1))
  const monthEnd = toLocalISODate(new Date(year, month + 1, 0))
  const end = template.recurrence_end_date
  const materialized = new Set(
    existing.filter(f => f.generated_from_id === template.id && f.due_date).map(f => f.due_date as string)
  )
  const dates: string[] = []
  let current = template.due_date
  for (let i = 0; i < MAX_STEPS && current <= monthEnd; i++) {
    if (end && current > end) break
    if (current >= monthStart && !materialized.has(current)) dates.push(current)
    current = nextRecurrenceDate(current, template.recurrence_interval)
  }
  return dates
}

const PROJECTED_PREFIX = 'proj:'

export function projectedId(templateId: string, date: string): string {
  return `${PROJECTED_PREFIX}${templateId}:${date}`
}

export function isProjectedId(id: string): boolean {
  return id.startsWith(PROJECTED_PREFIX)
}

/** Ocorrência prevista (ainda não gravada) — só existe na tela. */
export function buildProjectedFinancial(template: Financial, date: string): Financial {
  return {
    ...template,
    id: projectedId(template.id, date),
    due_date: date,
    paid_date: null,
    status: 'pending',
    recurring: false,
    recurrence_interval: null,
    recurrence_end_date: null,
    generated_from_id: template.id,
    reconciled: false,
    reconciled_in_id: null,
  }
}

export type SheetRow = {
  financial: Financial
  /** true = ocorrência prevista de uma recorrência, ainda não gravada no banco */
  projected: boolean
  /** template de origem quando a linha é (ou veio de) uma recorrência */
  templateId: string | null
  income: number
  expense: number
  /** saldo acumulado até esta linha, na ordem exibida (canceladas não contam) */
  balance: number
}

/**
 * Lançamentos de um mês para a planilha: os reais (sem os templates, que são
 * representados pelas suas ocorrências previstas) + as ocorrências previstas.
 */
export function monthSheetFinancials(all: Financial[], year: number, month: number): Financial[] {
  const real = all.filter(f => {
    if (f.recurring || !f.due_date) return false
    const d = parseISODate(f.due_date)
    return d.getFullYear() === year && d.getMonth() === month
  })
  const projected = all
    .filter(f => f.recurring)
    .flatMap(t => projectRecurringDates(t, all, year, month).map(date => buildProjectedFinancial(t, date)))
  return [...real, ...projected]
}

/** Linhas na ordem recebida, com Entrada/Saída separadas e saldo acumulado. */
export function buildSheetRows(ordered: Financial[]): SheetRow[] {
  let balance = 0
  return ordered.map(f => {
    const amount = Number(f.amount) || 0
    const counts = f.status !== 'cancelled'
    const income = f.type === 'receivable' ? amount : 0
    const expense = f.type === 'payable' ? amount : 0
    if (counts) balance += income - expense
    return {
      financial: f,
      projected: isProjectedId(f.id),
      templateId: f.recurring ? f.id : f.generated_from_id,
      income,
      expense,
      balance,
    }
  })
}

export type SheetTotals = {
  income: number
  expense: number
  received: number
  paid: number
  result: number
}

export function sheetTotals(rows: SheetRow[]): SheetTotals {
  const t = { income: 0, expense: 0, received: 0, paid: 0, result: 0 }
  for (const r of rows) {
    if (r.financial.status === 'cancelled') continue
    t.income += r.income
    t.expense += r.expense
    if (r.financial.status === 'paid') {
      t.received += r.income
      t.paid += r.expense
    }
  }
  t.result = t.income - t.expense
  return t
}

/**
 * Valor digitado numa célula → número. Aceita "1500", "1500.5", "1.500,50",
 * "R$ 1.500,50". Retorna null se não for um valor válido (> 0).
 */
export function parseMoneyInput(raw: string): number | null {
  let s = raw.replace(/R\$|\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Math.round(parseFloat(s) * 100) / 100
  return n > 0 ? n : null
}

/** Status coerente ao editar a data de pagamento direto na célula. */
export function statusForPaidDate(paidDate: string | null, dueDate: string | null, today: string): Financial['status'] {
  if (paidDate) return 'paid'
  return dueDate && dueDate < today ? 'overdue' : 'pending'
}

/** Campos copiados do template ao gravar uma ocorrência — os mesmos que o cron copia. */
export function occurrenceInsertPayload(template: Financial, date: string, patch: Partial<Financial> = {}): Record<string, unknown> {
  return {
    tenant_id: template.tenant_id,
    type: template.type,
    category: template.category,
    description: template.description,
    amount: template.amount,
    due_date: date,
    status: 'pending',
    paid_date: null,
    client_id: template.client_id,
    client_name: template.client_name,
    process_id: template.process_id,
    process_number: template.process_number,
    notes: template.notes,
    account_id: template.account_id,
    generated_from_id: template.id,
    reconciled: false,
    ...patch,
  }
}

/**
 * O que fazer com o template depois de gravar a ocorrência de `date`: só avança
 * quando a ocorrência gravada é a próxima do template (a mesma que o cron geraria).
 * Ocorrências de meses à frente não mexem no template — o cron pula datas que
 * já têm ocorrência (migration 20261015120000).
 *
 * Ao passar do fim da recorrência o template também sai da lista (soft-delete):
 * se só virasse `recurring = false`, ficaria como um lançamento comum no mesmo
 * dia da última ocorrência — duplicado.
 */
export function templateUpdateAfterMaterialize(template: Financial, date: string, nowIso = new Date().toISOString()): Partial<Financial> | null {
  if (!template.due_date || date !== template.due_date) return null
  const next = nextRecurrenceDate(template.due_date, template.recurrence_interval)
  if (template.recurrence_end_date && next > template.recurrence_end_date) return { recurring: false, deleted_at: nowIso }
  return { due_date: next }
}

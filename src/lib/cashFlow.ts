import type { Financial } from '@/types'
import { monthSheetFinancials } from '@/lib/financialSheet'

// Lógica pura da aba "Fluxo de Caixa" do Financeiro: 12 meses × categorias,
// separados em entradas e saídas, com resultado e saldo acumulado.
//
// - `forecast` (Previsto): tudo que não foi cancelado, pelo VENCIMENTO, incluindo
//   as ocorrências previstas das recorrências (mesmo recorte da Planilha).
// - `actual` (Realizado): só o que foi pago/recebido, pela DATA DE PAGAMENTO
//   (é quando o dinheiro de fato entrou/saiu).
//
// O saldo inicial do ano é sempre o realizado até 31/12 do ano anterior.

export type CashFlowMode = 'forecast' | 'actual'

export type CashFlowRow = {
  /** chave da categoria ('' = sem categoria) */
  category: string
  values: number[]
  total: number
}

export type CashFlow = {
  income: CashFlowRow[]
  expense: CashFlowRow[]
  incomeTotals: number[]
  expenseTotals: number[]
  results: number[]
  /** saldo realizado antes de 1º/jan do ano */
  opening: number
  /** saldo acumulado ao fim de cada mês (opening + resultados) */
  balances: number[]
  totalIncome: number
  totalExpense: number
  totalResult: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

function actualDate(f: Financial): string | null {
  return f.paid_date || f.due_date
}

function monthItems(all: Financial[], year: number, month: number, mode: CashFlowMode): Financial[] {
  if (mode === 'forecast') return monthSheetFinancials(all, year, month).filter(f => f.status !== 'cancelled')
  return all.filter(f => {
    if (f.recurring || f.status !== 'paid') return false
    const iso = actualDate(f)
    if (!iso) return false
    const d = new Date(`${iso}T00:00:00`)
    return d.getFullYear() === year && d.getMonth() === month
  })
}

function rowsFor(byMonth: Financial[][], type: Financial['type']): CashFlowRow[] {
  const map = new Map<string, number[]>()
  byMonth.forEach((items, m) => {
    for (const f of items) {
      if (f.type !== type) continue
      const key = f.category || ''
      if (!map.has(key)) map.set(key, Array(12).fill(0))
      map.get(key)![m] += Number(f.amount) || 0
    }
  })
  return Array.from(map.entries())
    .map(([category, values]) => {
      const rounded = values.map(round2)
      return { category, values: rounded, total: round2(rounded.reduce((s, v) => s + v, 0)) }
    })
    .sort((a, b) => b.total - a.total)
}

function sumColumns(rows: CashFlowRow[]): number[] {
  return Array.from({ length: 12 }, (_, m) => round2(rows.reduce((s, r) => s + r.values[m], 0)))
}

export function openingBalance(all: Financial[], year: number): number {
  const start = `${year}-01-01`
  let total = 0
  for (const f of all) {
    if (f.recurring || f.status !== 'paid') continue
    const iso = actualDate(f)
    if (!iso || iso >= start) continue
    total += f.type === 'receivable' ? Number(f.amount) || 0 : -(Number(f.amount) || 0)
  }
  return round2(total)
}

export function buildCashFlow(all: Financial[], year: number, mode: CashFlowMode): CashFlow {
  const byMonth = Array.from({ length: 12 }, (_, m) => monthItems(all, year, m, mode))
  const income = rowsFor(byMonth, 'receivable')
  const expense = rowsFor(byMonth, 'payable')
  const incomeTotals = sumColumns(income)
  const expenseTotals = sumColumns(expense)
  const results = incomeTotals.map((v, m) => round2(v - expenseTotals[m]))
  const opening = openingBalance(all, year)
  const balances: number[] = []
  let running = opening
  for (const r of results) { running = round2(running + r); balances.push(running) }
  const totalIncome = round2(incomeTotals.reduce((s, v) => s + v, 0))
  const totalExpense = round2(expenseTotals.reduce((s, v) => s + v, 0))
  return {
    income, expense, incomeTotals, expenseTotals, results, opening, balances,
    totalIncome, totalExpense, totalResult: round2(totalIncome - totalExpense),
  }
}

/** Anos para o seletor: os que têm lançamento + o atual + o próximo (para previsão). */
export function cashFlowYears(all: Financial[], current: number): number[] {
  const set = new Set<number>([current, current + 1])
  for (const f of all) {
    const iso = f.due_date || f.paid_date
    if (iso) set.add(Number(iso.slice(0, 4)))
  }
  return Array.from(set).filter(y => Number.isFinite(y)).sort((a, b) => b - a)
}

import { UserExpense } from '@/types'

// ─── Datas ────────────────────────────────────────────────────────────────────
// Extrai ano/mês/dia diretamente da string "YYYY-MM-DD" (ou de um timestamp que
// comece assim), sem passar por `new Date(...)`. Colunas de data do Postgres
// chegam como "YYYY-MM-DD" puro; `new Date('YYYY-MM-DD')` interpreta isso como
// meia-noite UTC, e então `.getMonth()`/`.getDate()` no fuso local (ex: UTC-3,
// Brasil) podem deslocar para o dia/mês anterior perto da virada do dia.
export function dateParts(dateStr: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '')
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) }
}

export interface ExpenseMonthGroup {
  key: string
  year: number
  /** 0-indexado, igual a Date.getMonth() */
  month: number
  items: UserExpense[]
  total: number
}

// ─── Planilha mensal ────────────────────────────────────────────────────────
// Agrupa despesas por mês/ano (mais recente primeiro), cada grupo com os itens
// ordenados do dia mais recente para o mais antigo. Usado pela "planilha
// mensal" de Minhas Despesas — mostra todos os meses com despesa registrada,
// sem um filtro de período que esconderia meses antigos.
export function groupExpensesByMonth(expenses: UserExpense[]): ExpenseMonthGroup[] {
  const groups: Record<string, UserExpense[]> = {}
  for (const e of expenses) {
    const parts = dateParts(e.expense_date)
    if (!parts) continue
    const key = `${parts.year}-${String(parts.month + 1).padStart(2, '0')}`
    ;(groups[key] ||= []).push(e)
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => {
      const [year, month] = key.split('-').map(Number)
      return {
        key, year, month: month - 1,
        items: items.slice().sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1)),
        total: items.reduce((s, e) => s + Number(e.amount), 0),
      }
    })
}

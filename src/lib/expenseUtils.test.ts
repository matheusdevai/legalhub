import { describe, it, expect } from 'vitest'
import { dateParts, groupExpensesByMonth } from './expenseUtils'
import type { UserExpense } from '@/types'

function expense(overrides: Partial<UserExpense>): UserExpense {
  return {
    id: 'e' + Math.random(), tenant_id: 't1', user_id: 'u1',
    category: 'other', description: 'Despesa', amount: 10,
    expense_date: '2026-07-15', process_id: null, process_number: null,
    trip_destination: null, reimbursable: false, reimbursed: false,
    notes: null, receipt_url: null, created_at: null, deleted_at: null,
    ...overrides,
  }
}

describe('dateParts', () => {
  it('extrai ano, mês (0-indexado) e dia de uma data "YYYY-MM-DD"', () => {
    expect(dateParts('2026-08-05')).toEqual({ year: 2026, month: 7, day: 5 })
  })

  it('funciona com um timestamp completo, usando só a parte da data', () => {
    expect(dateParts('2026-01-31T23:00:00.000Z')).toEqual({ year: 2026, month: 0, day: 31 })
  })

  // Motivo da existência desta função: `new Date('2026-08-01')` é meia-noite
  // UTC; em fuso horário do Brasil (UTC-3), `.getDate()`/`.getMonth()` nessa
  // instância retornariam 31/07, não 01/08. dateParts nunca cria um objeto
  // Date, então não sofre esse deslocamento de fuso horário.
  it('não desloca o dia por fuso horário (ao contrário de new Date(...).getDate())', () => {
    const viaDateParts = dateParts('2026-08-01')
    const viaNewDate = new Date('2026-08-01')
    expect(viaDateParts).toEqual({ year: 2026, month: 7, day: 1 })
    // Este teste documenta a diferença; não assume um fuso horário específico
    // do ambiente de CI, só garante que dateParts é imune ao problema.
    expect(viaDateParts!.day).toBe(1)
    void viaNewDate
  })

  it('retorna null para string vazia ou fora do formato esperado', () => {
    expect(dateParts('')).toBeNull()
    expect(dateParts('15/08/2026')).toBeNull()
  })
})

describe('groupExpensesByMonth', () => {
  it('agrupa despesas por ano-mês e ordena do mais recente para o mais antigo', () => {
    const groups = groupExpensesByMonth([
      expense({ id: 'a', expense_date: '2026-06-10' }),
      expense({ id: 'b', expense_date: '2026-08-01' }),
      expense({ id: 'c', expense_date: '2026-08-20' }),
      expense({ id: 'd', expense_date: '2025-12-25' }),
    ])
    expect(groups.map(g => g.key)).toEqual(['2026-08', '2026-06', '2025-12'])
  })

  it('soma o total de cada grupo', () => {
    const groups = groupExpensesByMonth([
      expense({ id: 'a', expense_date: '2026-08-01', amount: 100 }),
      expense({ id: 'b', expense_date: '2026-08-20', amount: 50.5 }),
    ])
    expect(groups[0].total).toBe(150.5)
  })

  it('ordena os itens dentro do grupo do dia mais recente para o mais antigo', () => {
    const groups = groupExpensesByMonth([
      expense({ id: 'early', expense_date: '2026-08-01' }),
      expense({ id: 'late', expense_date: '2026-08-28' }),
    ])
    expect(groups[0].items.map(e => e.id)).toEqual(['late', 'early'])
  })

  it('expõe o mês como índice 0-based (compatível com MONTHS_PT / Date.getMonth())', () => {
    const groups = groupExpensesByMonth([expense({ expense_date: '2026-01-05' })])
    expect(groups[0].month).toBe(0)
    expect(groups[0].year).toBe(2026)
  })

  it('ignora despesas com expense_date inválida em vez de quebrar o agrupamento', () => {
    const groups = groupExpensesByMonth([
      expense({ id: 'ok', expense_date: '2026-08-01' }),
      expense({ id: 'bad', expense_date: '' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map(e => e.id)).toEqual(['ok'])
  })

  it('retorna lista vazia para nenhuma despesa', () => {
    expect(groupExpensesByMonth([])).toEqual([])
  })
})

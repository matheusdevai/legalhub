import { describe, it, expect } from 'vitest'
import type { Financial } from '@/types'
import { buildCashFlow, openingBalance, cashFlowYears } from './cashFlow'

function fin(overrides: Partial<Financial> = {}): Financial {
  return {
    id: Math.random().toString(36).slice(2), tenant_id: 't1', type: 'payable', category: 'rent', description: 'x',
    amount: 100, due_date: '2026-10-01', paid_date: null, status: 'pending',
    client_id: null, client_name: null, process_id: null, process_number: null, notes: null,
    created_at: null, deleted_at: null, account_id: null,
    installment_group_id: null, installment_number: null, installment_total: null,
    recurring: false, recurrence_interval: null, recurrence_end_date: null,
    generated_from_id: null, reconciled: false, reconciled_in_id: null,
    ...overrides,
  }
}

const DATA: Financial[] = [
  // saldo de 2025 (realizado): +5000 − 1000 = 4000
  fin({ type: 'receivable', category: 'fees', amount: 5000, due_date: '2025-06-10', status: 'paid', paid_date: '2025-06-10' }),
  fin({ type: 'payable', category: 'rent', amount: 1000, due_date: '2025-12-20', status: 'paid', paid_date: '2025-12-20' }),
  // pendente de 2025 não entra no saldo inicial
  fin({ type: 'receivable', category: 'fees', amount: 999, due_date: '2025-11-01', status: 'overdue' }),
  // 2026
  fin({ type: 'receivable', category: 'fees', amount: 2500, due_date: '2026-10-05', status: 'paid', paid_date: '2026-10-05' }),
  fin({ type: 'receivable', category: 'fees', amount: 9500, due_date: '2026-10-25', status: 'pending' }),
  // vence em out, pago em nov → previsto em out, realizado em nov
  fin({ type: 'payable', category: 'subscription', amount: 290, due_date: '2026-10-10', status: 'paid', paid_date: '2026-11-02' }),
  fin({ type: 'payable', category: null, amount: 50, due_date: '2026-10-12', status: 'pending' }),
  fin({ type: 'payable', category: 'rent', amount: 777, due_date: '2026-10-15', status: 'cancelled' }),
  // recorrência: aluguel 3200 todo dia 1º a partir de nov/2026
  fin({ id: 'tpl', type: 'payable', category: 'rent', amount: 3200, due_date: '2026-11-01', recurring: true, recurrence_interval: 'monthly' }),
]

describe('openingBalance', () => {
  it('só o realizado antes de 1º/jan', () => {
    expect(openingBalance(DATA, 2026)).toBe(4000)
    expect(openingBalance(DATA, 2025)).toBe(0)
  })
})

describe('buildCashFlow — previsto', () => {
  const cf = buildCashFlow(DATA, 2026, 'forecast')
  it('agrupa por categoria e por vencimento, sem canceladas', () => {
    const fees = cf.income.find(r => r.category === 'fees')!
    expect(fees.values[9]).toBe(12000)
    expect(cf.expense.find(r => r.category === 'subscription')!.values[9]).toBe(290)
    expect(cf.expense.find(r => r.category === '')!.values[9]).toBe(50)
    expect(cf.expenseTotals[9]).toBe(340)
  })
  it('inclui as recorrências projetadas nos meses futuros', () => {
    const rent = cf.expense.find(r => r.category === 'rent')!
    expect(rent.values[10]).toBe(3200)
    expect(rent.values[11]).toBe(3200)
    expect(rent.values[9]).toBe(0)
  })
  it('resultado por mês e saldo acumulado a partir do saldo inicial', () => {
    expect(cf.results[9]).toBe(11660)
    expect(cf.results[10]).toBe(-3200)
    expect(cf.balances[8]).toBe(4000)
    expect(cf.balances[9]).toBe(15660)
    expect(cf.balances[11]).toBe(9260)
    expect(cf.totalResult).toBe(12000 - 340 - 6400)
  })
  it('categorias ordenadas pelo total do ano', () => {
    expect(cf.expense.map(r => r.category)).toEqual(['rent', 'subscription', ''])
  })
})

describe('buildCashFlow — realizado', () => {
  const cf = buildCashFlow(DATA, 2026, 'actual')
  it('só pagos, pela data de pagamento, sem previstas', () => {
    expect(cf.incomeTotals[9]).toBe(2500)
    expect(cf.expenseTotals[9]).toBe(0)
    expect(cf.expenseTotals[10]).toBe(290)
    expect(cf.expense.find(r => r.category === 'rent')).toBeUndefined()
    expect(cf.balances[11]).toBe(4000 + 2500 - 290)
  })
})

describe('cashFlowYears', () => {
  it('anos com lançamento + atual + próximo, do mais recente', () => {
    expect(cashFlowYears(DATA, 2026)).toEqual([2027, 2026, 2025])
  })
})

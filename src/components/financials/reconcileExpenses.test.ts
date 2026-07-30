import { describe, it, expect } from 'vitest'

// ─── Tipos mínimos ─────────────────────────────────────────────────────────────
type MockExpense = { id: string; amount: number; reconciled: boolean; client_id: string | null; type: 'payable' | 'receivable' }

// ─── Réplica exata do cálculo líquido de ReconcileExpensesModal ──────────────
function computeNet(gross: number, selectedTotal: number) {
  return Math.max(0, gross - selectedTotal)
}

// ─── Réplica exata da agregação pendingExpensesByClient de FinancialsPage ────
function computePendingByClient(financials: MockExpense[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const f of financials) {
    if (f.type === 'payable' && !f.reconciled && f.client_id) {
      map[f.client_id] = (map[f.client_id] || 0) + Number(f.amount)
    }
  }
  return map
}

describe('ReconcileExpensesModal — computeNet()', () => {
  it('subtrai os gastos selecionados do valor bruto', () => {
    expect(computeNet(1000, 300)).toBe(700)
  })
  it('nunca retorna negativo — gastos maiores que o bruto zeram o líquido', () => {
    expect(computeNet(100, 500)).toBe(0)
  })
  it('sem gastos selecionados, líquido = bruto', () => {
    expect(computeNet(500, 0)).toBe(500)
  })
})

describe('FinancialsPage — computePendingByClient()', () => {
  const DATA: MockExpense[] = [
    { id: 'e1', amount: 100, reconciled: false, client_id: 'c1', type: 'payable' },
    { id: 'e2', amount: 50, reconciled: false, client_id: 'c1', type: 'payable' },
    { id: 'e3', amount: 80, reconciled: true, client_id: 'c1', type: 'payable' },
    { id: 'e4', amount: 200, reconciled: false, client_id: 'c2', type: 'payable' },
    { id: 'e5', amount: 999, reconciled: false, client_id: 'c1', type: 'receivable' },
    { id: 'e6', amount: 40, reconciled: false, client_id: null, type: 'payable' },
  ]

  it('soma apenas gastos payable não reconciliados por cliente', () => {
    const r = computePendingByClient(DATA)
    expect(r.c1).toBe(150)
    expect(r.c2).toBe(200)
  })
  it('gastos já reconciliados não entram na soma', () => {
    const r = computePendingByClient(DATA)
    expect(r.c1).not.toBe(230) // não inclui e3 (80, reconciled)
  })
  it('lançamentos do tipo receivable são ignorados', () => {
    const r = computePendingByClient(DATA)
    expect(r.c1).toBe(150) // não inclui e5 (999, receivable)
  })
  it('lançamentos sem client_id não geram entrada no mapa', () => {
    const r = computePendingByClient(DATA)
    expect(Object.keys(r)).not.toContain('null')
  })
  it('cliente sem nenhum gasto pendente não aparece no mapa', () => {
    const r = computePendingByClient(DATA)
    expect(r.c3).toBeUndefined()
  })
})

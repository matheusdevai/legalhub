import { describe, it, expect } from 'vitest'
import type { Financial } from '@/types'
import { recurringMonthCell, monthlyEquivalent, recurringAlerts, adjustmentPlan, templateOccurrences } from './recurringMatrix'

function fin(overrides: Partial<Financial> = {}): Financial {
  return {
    id: 'f1', tenant_id: 't1', type: 'payable', category: 'rent', description: 'Aluguel',
    amount: 3200, due_date: '2026-10-01', paid_date: null, status: 'pending',
    client_id: null, client_name: null, process_id: null, process_number: null, notes: null,
    created_at: null, deleted_at: null, account_id: null,
    installment_group_id: null, installment_number: null, installment_total: null,
    recurring: false, recurrence_interval: null, recurrence_end_date: null,
    generated_from_id: null, reconciled: false, reconciled_in_id: null,
    ...overrides,
  }
}
const tpl = (o: Partial<Financial> = {}) => fin({ id: 'tpl', recurring: true, recurrence_interval: 'monthly', due_date: '2026-11-01', ...o })
const occ = (id: string, due: string, o: Partial<Financial> = {}) => fin({ id, generated_from_id: 'tpl', due_date: due, ...o })
const TODAY = '2026-10-15'

describe('recurringMonthCell', () => {
  it('pago / pendente / atrasado / previsto / pulado / vazio', () => {
    const t = tpl()
    const all = [
      t,
      occ('aug', '2026-08-01', { status: 'paid' }),
      occ('sep', '2026-09-01', { status: 'overdue' }),
      occ('oct', '2026-10-01', { status: 'pending' }),
      occ('dec', '2026-12-01', { status: 'cancelled' }),
    ]
    expect(recurringMonthCell(t, all, 2026, 7, TODAY).state).toBe('paid')
    expect(recurringMonthCell(t, all, 2026, 8, TODAY).state).toBe('overdue')
    // pendente com vencimento no passado conta como atrasado mesmo antes do sync de status
    expect(recurringMonthCell(t, all, 2026, 9, TODAY).state).toBe('overdue')
    expect(recurringMonthCell(t, all, 2026, 9, '2026-09-20').state).toBe('pending')
    expect(recurringMonthCell(t, all, 2026, 10, TODAY).state).toBe('projected')
    expect(recurringMonthCell(t, all, 2026, 11, TODAY).state).toBe('skipped')
    expect(recurringMonthCell(t, all, 2026, 6, TODAY).state).toBe('none')
  })

  it('total ignora canceladas; ocorrências vêm ordenadas', () => {
    const t = tpl({ recurrence_interval: 'weekly', due_date: '2026-11-09', amount: 100 })
    const all = [t, occ('w1', '2026-11-02', { status: 'paid', amount: 100 })]
    const cell = recurringMonthCell(t, all, 2026, 10, TODAY)
    expect(cell.occurrences.map(f => f.due_date)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect(cell.total).toBe(500)
    expect(cell.state).toBe('projected')
  })

  it('não confunde ocorrências de outro template', () => {
    const t = tpl()
    const other = fin({ id: 'x', generated_from_id: 'outro', due_date: '2026-10-01', status: 'overdue' })
    expect(recurringMonthCell(t, [t, other], 2026, 9, TODAY).state).toBe('none')
  })
})

describe('monthlyEquivalent', () => {
  it('converte semanal e anual para valor mensal', () => {
    expect(monthlyEquivalent(tpl({ amount: 100, recurrence_interval: 'weekly' }))).toBe(433.33)
    expect(monthlyEquivalent(tpl({ amount: 1200, recurrence_interval: 'yearly' }))).toBe(100)
    expect(monthlyEquivalent(tpl({ amount: 290 }))).toBe(290)
  })
})

describe('recurringAlerts', () => {
  it('lista atrasadas e as que vencem em até 7 dias (gravadas ou previstas)', () => {
    const t = tpl({ due_date: '2026-10-20' })
    const t2 = fin({ id: 'tpl2', recurring: true, recurrence_interval: 'monthly', due_date: '2026-11-30' })
    const all = [
      t, t2,
      occ('late', '2026-09-20', { status: 'overdue' }),
      occ('soon', '2026-10-18', { status: 'pending' }),
      occ('paid', '2026-10-16', { status: 'paid' }),
    ]
    const { overdue, dueSoon } = recurringAlerts([t, t2], all, TODAY)
    expect(overdue.map(f => f.id)).toEqual(['late'])
    expect(dueSoon.map(f => f.due_date)).toEqual(['2026-10-18', '2026-10-20'])
  })
})

describe('adjustmentPlan', () => {
  it('grava com valor antigo as previstas antes da vigência e atualiza as gravadas não pagas a partir dela', () => {
    const t = tpl({ due_date: '2026-11-01' })
    const all = [
      t,
      occ('dec', '2026-12-01', { status: 'pending' }),
      occ('jan', '2027-01-01', { status: 'pending' }),
      occ('feb', '2027-02-01', { status: 'paid' }),
    ]
    expect(adjustmentPlan(t, all, '2027-01')).toEqual({ materializeDates: ['2026-11-01'], updateIds: ['jan'] })
  })

  it('vigência no próximo vencimento não grava nada antes', () => {
    const t = tpl({ due_date: '2026-11-01' })
    expect(adjustmentPlan(t, [t], '2026-11')).toEqual({ materializeDates: [], updateIds: [] })
  })

  it('respeita o fim da recorrência', () => {
    const t = tpl({ due_date: '2026-11-01', recurrence_end_date: '2026-11-30' })
    expect(adjustmentPlan(t, [t], '2027-03').materializeDates).toEqual(['2026-11-01'])
  })
})

describe('templateOccurrences', () => {
  it('só as filhas reais do template', () => {
    const t = tpl()
    expect(templateOccurrences(t, [t, occ('a', '2026-10-01'), fin({ id: 'b' })]).map(f => f.id)).toEqual(['a'])
  })
})

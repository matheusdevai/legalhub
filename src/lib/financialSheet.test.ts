import { describe, it, expect } from 'vitest'
import type { Financial } from '@/types'
import {
  nextRecurrenceDate, projectRecurringDates, monthSheetFinancials, buildSheetRows, sheetTotals,
  parseMoneyInput, statusForPaidDate, occurrenceInsertPayload, templateUpdateAfterMaterialize,
  isProjectedId, projectedId,
} from './financialSheet'
import { toLocalISODate } from './utils'

function fin(overrides: Partial<Financial> = {}): Financial {
  return {
    id: 'f1', tenant_id: 't1', type: 'payable', category: 'rent', description: 'Aluguel',
    amount: 3200, due_date: '2026-10-01', paid_date: null, status: 'pending',
    client_id: null, client_name: null, process_id: null, process_number: null, notes: null,
    created_at: '2026-01-01T00:00:00Z', deleted_at: null, account_id: 'acc1',
    installment_group_id: null, installment_number: null, installment_total: null,
    recurring: false, recurrence_interval: null, recurrence_end_date: null,
    generated_from_id: null, reconciled: false, reconciled_in_id: null,
    ...overrides,
  }
}

const template = (o: Partial<Financial> = {}) =>
  fin({ id: 'tpl', recurring: true, recurrence_interval: 'monthly', due_date: '2026-11-01', ...o })

describe('toLocalISODate', () => {
  it('usa a data local, não UTC (23h no Brasil continua sendo hoje)', () => {
    expect(toLocalISODate(new Date(2026, 9, 15, 23, 30))).toBe('2026-10-15')
  })
})

describe('nextRecurrenceDate — mesma aritmética do Postgres', () => {
  it('mensal/semanal/anual', () => {
    expect(nextRecurrenceDate('2026-10-05', 'monthly')).toBe('2026-11-05')
    expect(nextRecurrenceDate('2026-10-05', 'weekly')).toBe('2026-10-12')
    expect(nextRecurrenceDate('2026-10-05', 'yearly')).toBe('2027-10-05')
  })
  it('sem intervalo cai no mensal (mesmo default do cron)', () => {
    expect(nextRecurrenceDate('2026-10-05', null)).toBe('2026-11-05')
  })
  it('fim de mês "gruda" e não volta (31/01 → 28/02 → 28/03), como date + interval iterativo', () => {
    const feb = nextRecurrenceDate('2026-01-31', 'monthly')
    expect(feb).toBe('2026-02-28')
    expect(nextRecurrenceDate(feb, 'monthly')).toBe('2026-03-28')
  })
  it('vira o ano', () => {
    expect(nextRecurrenceDate('2026-12-15', 'monthly')).toBe('2027-01-15')
  })
})

describe('projectRecurringDates', () => {
  it('projeta a ocorrência do mês do próprio template e dos meses seguintes', () => {
    const t = template()
    expect(projectRecurringDates(t, [t], 2026, 10)).toEqual(['2026-11-01'])
    expect(projectRecurringDates(t, [t], 2027, 2)).toEqual(['2027-03-01'])
  })
  it('não projeta meses anteriores ao próximo vencimento do template', () => {
    const t = template()
    expect(projectRecurringDates(t, [t], 2026, 9)).toEqual([])
  })
  it('respeita recurrence_end_date', () => {
    const t = template({ recurrence_end_date: '2027-01-15' })
    expect(projectRecurringDates(t, [t], 2027, 0)).toEqual(['2027-01-01'])
    expect(projectRecurringDates(t, [t], 2027, 1)).toEqual([])
  })
  it('pula datas que já viraram lançamento real (inclusive pagos adiantado)', () => {
    const t = template()
    const done = fin({ id: 'occ', generated_from_id: 'tpl', due_date: '2026-12-01', status: 'paid' })
    expect(projectRecurringDates(t, [t, done], 2026, 11)).toEqual([])
    expect(projectRecurringDates(t, [t, done], 2027, 0)).toEqual(['2027-01-01'])
  })
  it('semanal gera várias ocorrências no mês', () => {
    const t = template({ recurrence_interval: 'weekly', due_date: '2026-11-02' })
    expect(projectRecurringDates(t, [t], 2026, 10)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
  })
  it('ignora quem não é template', () => {
    const f = fin()
    expect(projectRecurringDates(f, [f], 2026, 9)).toEqual([])
  })
})

describe('monthSheetFinancials', () => {
  it('junta reais do mês + previstas e esconde o template em si', () => {
    const t = template()
    const real = fin({ id: 'r1', due_date: '2026-11-10', type: 'receivable', amount: 500 })
    const otherMonth = fin({ id: 'r2', due_date: '2026-12-10' })
    const rows = monthSheetFinancials([t, real, otherMonth], 2026, 10)
    expect(rows.map(r => r.id).sort()).toEqual([projectedId('tpl', '2026-11-01'), 'r1'].sort())
    const proj = rows.find(r => isProjectedId(r.id))!
    expect(proj.recurring).toBe(false)
    expect(proj.generated_from_id).toBe('tpl')
    expect(proj.status).toBe('pending')
  })
  it('não interpreta dia 1º como mês anterior (fuso)', () => {
    const real = fin({ id: 'r1', due_date: '2026-11-01' })
    expect(monthSheetFinancials([real], 2026, 10)).toHaveLength(1)
    expect(monthSheetFinancials([real], 2026, 9)).toHaveLength(0)
  })
})

describe('buildSheetRows / sheetTotals', () => {
  const list = [
    fin({ id: 'a', type: 'receivable', amount: 2500, status: 'paid' }),
    fin({ id: 'b', type: 'payable', amount: 3200, status: 'paid' }),
    fin({ id: 'c', type: 'payable', amount: 999, status: 'cancelled' }),
    fin({ id: 'd', type: 'receivable', amount: 9500, status: 'pending' }),
  ]
  it('separa entrada/saída e acumula o saldo ignorando canceladas', () => {
    const rows = buildSheetRows(list)
    expect(rows.map(r => [r.income, r.expense])).toEqual([[2500, 0], [0, 3200], [0, 999], [9500, 0]])
    expect(rows.map(r => r.balance)).toEqual([2500, -700, -700, 8800])
  })
  it('totais: previsto, realizado e resultado', () => {
    expect(sheetTotals(buildSheetRows(list))).toEqual({ income: 12000, expense: 3200, received: 2500, paid: 3200, result: 8800 })
  })
  it('marca linhas previstas e o template de origem', () => {
    const rows = buildSheetRows([fin({ id: projectedId('tpl', '2026-11-01'), generated_from_id: 'tpl' }), fin({ id: 'x' })])
    expect(rows[0].projected).toBe(true)
    expect(rows[0].templateId).toBe('tpl')
    expect(rows[1].projected).toBe(false)
    expect(rows[1].templateId).toBeNull()
  })
})

describe('parseMoneyInput', () => {
  it.each([
    ['1500', 1500], ['1500.5', 1500.5], ['1.500,50', 1500.5], ['R$ 1.500,50', 1500.5],
    ['1,5', 1.5], ['1.500', 1500], ['2.200.000', 2200000], ['0,333', 0.33],
  ])('%s → %s', (raw, expected) => {
    expect(parseMoneyInput(raw)).toBe(expected)
  })
  it.each(['', 'abc', '0', '-10', '1,2,3', '12a'])('%s inválido', raw => {
    expect(parseMoneyInput(raw)).toBeNull()
  })
})

describe('statusForPaidDate', () => {
  it('com data → pago; sem data → pendente ou vencido conforme vencimento', () => {
    expect(statusForPaidDate('2026-10-15', '2026-10-01', '2026-10-15')).toBe('paid')
    expect(statusForPaidDate(null, '2026-10-01', '2026-10-15')).toBe('overdue')
    expect(statusForPaidDate(null, '2026-10-20', '2026-10-15')).toBe('pending')
    expect(statusForPaidDate(null, '2026-10-15', '2026-10-15')).toBe('pending')
  })
})

describe('occurrenceInsertPayload', () => {
  it('copia os campos do template, aponta generated_from_id e aplica o patch', () => {
    const t = template({ client_id: 'c1', client_name: 'João' })
    const p = occurrenceInsertPayload(t, '2026-12-01', { status: 'paid', paid_date: '2026-11-20' })
    expect(p).toMatchObject({
      due_date: '2026-12-01', generated_from_id: 'tpl', status: 'paid', paid_date: '2026-11-20',
      amount: 3200, client_id: 'c1', account_id: 'acc1', tenant_id: 't1',
    })
    expect(p).not.toHaveProperty('recurring')
    expect(p).not.toHaveProperty('id')
  })
})

describe('templateUpdateAfterMaterialize', () => {
  it('avança o template quando a ocorrência gravada é a próxima dele', () => {
    expect(templateUpdateAfterMaterialize(template(), '2026-11-01')).toEqual({ due_date: '2026-12-01' })
  })
  it('não mexe no template quando a ocorrência é de um mês à frente', () => {
    expect(templateUpdateAfterMaterialize(template(), '2027-01-01')).toBeNull()
  })
  it('encerra (e tira da lista) quando a próxima passaria do fim da recorrência', () => {
    const upd = templateUpdateAfterMaterialize(template({ recurrence_end_date: '2026-11-20' }), '2026-11-01')
    expect(upd?.recurring).toBe(false)
    expect(upd?.deleted_at).toBeTruthy()
  })
})

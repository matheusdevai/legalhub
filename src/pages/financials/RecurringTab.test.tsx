import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Financial } from '@/types'
import { RecurringTab } from './RecurringTab'

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

const aluguel = fin({ id: 'tpl', recurring: true, recurrence_interval: 'monthly', due_date: '2026-11-01', description: 'Aluguel', amount: 3200 })
const mensalidade = fin({ id: 'tpl2', recurring: true, recurrence_interval: 'monthly', due_date: '2026-11-05', type: 'receivable', description: 'Mensalidade cliente X', amount: 1500 })
const semanal = fin({ id: 'tpl3', recurring: true, recurrence_interval: 'weekly', due_date: '2026-11-02', description: 'Diarista', amount: 100 })
const occurrences = [
  fin({ id: 'sep', generated_from_id: 'tpl', due_date: '2026-09-01', status: 'paid', paid_date: '2026-09-01' }),
  fin({ id: 'oct', generated_from_id: 'tpl', due_date: '2026-10-01', status: 'overdue' }),
  fin({ id: 'oct2', generated_from_id: 'tpl2', type: 'receivable', due_date: '2026-10-05', status: 'paid', amount: 1500, description: 'Mensalidade cliente X' }),
]

function renderTab(templates = [aluguel, mensalidade], extra: Financial[] = occurrences) {
  const handlers = {
    onYearChange: vi.fn(), onTogglePaid: vi.fn(), onOpenMonth: vi.fn(),
    onAdjust: vi.fn(), onEdit: vi.fn(), onStop: vi.fn(), onNew: vi.fn(),
  }
  render(<RecurringTab templates={templates} financials={[...templates, ...extra]} year={2026} {...handlers} />)
  return handlers
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 15, 10)) })
afterEach(() => { vi.useRealTimers() })

describe('RecurringTab', () => {
  it('uma linha por recorrência, entradas primeiro', () => {
    renderTab()
    const rows = screen.getAllByTestId('recurring-row')
    expect(rows.map(r => r.textContent)).toEqual([expect.stringContaining('Mensalidade'), expect.stringContaining('Aluguel')])
  })

  it('células refletem pago / atrasado / previsto mês a mês', () => {
    renderTab()
    const row = screen.getAllByTestId('recurring-row')[1]
    expect(within(row).getByTestId('cell-8')).toHaveAttribute('data-state', 'paid')
    expect(within(row).getByTestId('cell-9')).toHaveAttribute('data-state', 'overdue')
    expect(within(row).getByTestId('cell-10')).toHaveAttribute('data-state', 'projected')
    expect(within(row).getByTestId('cell-11')).toHaveAttribute('data-state', 'projected')
    expect(within(row).queryByTestId('cell-0')).toBeNull()
  })

  it('clicar numa célula com 1 ocorrência alterna pago dela', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const h = renderTab()
    await user.click(within(screen.getAllByTestId('recurring-row')[1]).getByTestId('cell-9'))
    expect(h.onTogglePaid).toHaveBeenCalledWith(expect.objectContaining({ id: 'oct' }))
    await user.click(within(screen.getAllByTestId('recurring-row')[1]).getByTestId('cell-10'))
    expect(h.onTogglePaid).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'proj:tpl:2026-11-01', generated_from_id: 'tpl' }))
  })

  it('semanal com várias ocorrências no mês mostra contagem e abre o mês na planilha', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const h = renderTab([semanal], [])
    const cell = within(screen.getByTestId('recurring-row')).getByTestId('cell-10')
    expect(cell).toHaveTextContent('0/5')
    await user.click(cell)
    expect(h.onOpenMonth).toHaveBeenCalledWith(2026, 10)
    expect(h.onTogglePaid).not.toHaveBeenCalled()
  })

  it('cards de fixos por mês e totais por mês no rodapé', () => {
    renderTab()
    expect(screen.getByTestId('fixed-income')).toHaveTextContent('1.500,00')
    expect(screen.getByTestId('fixed-expense')).toHaveTextContent('3.200,00')
    const totals = screen.getByTestId('total-result')
    // Out: +1500 (mensalidade paga) − 3200 (aluguel atrasado)
    expect(totals).toHaveTextContent('-1.700,00')
  })

  it('alertas de atrasadas e que vencem em 7 dias', () => {
    renderTab([fin({ ...aluguel, due_date: '2026-10-20' }), mensalidade])
    expect(screen.getByTestId('alert-overdue')).toHaveTextContent('1 recorrente atrasada')
    expect(screen.getByTestId('alert-due-soon')).toHaveTextContent('vence nos próximos 7 dias')
  })

  it('ações da linha', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const h = renderTab()
    const row = screen.getAllByTestId('recurring-row')[1]
    await user.click(within(row).getByTitle('Reajustar valor a partir de um mês'))
    await user.click(within(row).getByTitle('Editar recorrência'))
    await user.click(within(row).getByTitle('Encerrar recorrência'))
    expect(h.onAdjust).toHaveBeenCalledWith(aluguel)
    expect(h.onEdit).toHaveBeenCalledWith(aluguel)
    expect(h.onStop).toHaveBeenCalledWith(aluguel)
  })

  it('estado vazio', () => {
    renderTab([], [])
    expect(screen.getByText(/Nenhuma recorrência ativa/)).toBeInTheDocument()
  })
})

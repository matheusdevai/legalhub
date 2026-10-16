import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Financial } from '@/types'
import { CashFlowTab } from './CashFlowTab'

vi.mock('./FinancialsCharts', () => ({ AnnualRevenueBarChart: () => <div data-testid="chart" /> }))

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

const DATA = [
  fin({ type: 'receivable', category: 'fees', amount: 2500, due_date: '2026-10-05', status: 'paid', paid_date: '2026-10-05' }),
  fin({ type: 'receivable', category: 'fees', amount: 1000, due_date: '2026-11-05', status: 'pending' }),
  fin({ id: 'tpl', type: 'payable', category: 'rent', amount: 3200, due_date: '2026-11-01', recurring: true, recurrence_interval: 'monthly' }),
]
const LABELS = { fees: 'Honorários', rent: 'Aluguel' }

function renderTab(props: Partial<React.ComponentProps<typeof CashFlowTab>> = {}) {
  const h = { onYearChange: vi.fn(), onModeChange: vi.fn(), onOpenCell: vi.fn(), onExport: vi.fn() }
  render(<CashFlowTab financials={DATA} year={2026} mode="forecast" categoryLabels={LABELS} {...h} {...props} />)
  return h
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 15, 10)) })
afterEach(() => { vi.useRealTimers() })

describe('CashFlowTab', () => {
  it('previsto: categorias por mês, totais, resultado e saldo — com recorrência projetada', () => {
    renderTab()
    const fees = screen.getByTestId('cf-row-receivable-fees')
    expect(fees).toHaveTextContent('Honorários')
    expect(fees).toHaveTextContent('2.500,00')
    expect(fees).toHaveTextContent('1.000,00')
    const rent = screen.getByTestId('cf-row-payable-rent')
    expect(rent).toHaveTextContent('Aluguel')
    expect(rent).toHaveTextContent('3.200,00')
    expect(screen.getByTestId('cf-total-income')).toHaveTextContent('3.500,00')
    expect(screen.getByTestId('cf-total-expense')).toHaveTextContent('6.400,00')
    expect(screen.getByTestId('cf-total-result')).toHaveTextContent('-R$ 2.900,00')
    expect(screen.getByTestId('cf-results')).toHaveTextContent('+2.500,00')
  })

  it('avisa os meses em que o saldo acumulado fica negativo', () => {
    renderTab()
    // Out +2.500 → Nov +1.000 −3.200 (saldo 300) → Dez −3.200 (saldo −2.900)
    expect(screen.getByTestId('cf-negative-alert')).toHaveTextContent('negativo em 1 mês de 2026 (Dez)')
  })

  it('realizado: só o que foi pago', () => {
    renderTab({ mode: 'actual' })
    expect(screen.getByTestId('cf-total-income')).toHaveTextContent('2.500,00')
    expect(screen.getByTestId('cf-total-expense')).toHaveTextContent('0,00')
    expect(screen.queryByTestId('cf-row-payable-rent')).toBeNull()
    expect(screen.queryByTestId('cf-negative-alert')).toBeNull()
  })

  it('alternar modo e ano chama os callbacks', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const h = renderTab()
    await user.click(screen.getByRole('button', { name: 'Realizado' }))
    expect(h.onModeChange).toHaveBeenCalledWith('actual')
    await user.selectOptions(screen.getByLabelText('Ano'), '2027')
    expect(h.onYearChange).toHaveBeenCalledWith(2027)
  })

  it('clicar num valor abre o mês na planilha filtrado pela categoria', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const h = renderTab()
    await user.click(within(screen.getByTestId('cf-row-payable-rent')).getAllByRole('button')[0])
    expect(h.onOpenCell).toHaveBeenCalledWith(10, 'rent', 'payable')
  })

  it('exportar entrega o fluxo calculado', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const h = renderTab()
    await user.click(screen.getByRole('button', { name: /Exportar/ }))
    expect(h.onExport).toHaveBeenCalledWith(expect.objectContaining({ totalIncome: 3500, totalExpense: 6400 }))
  })
})

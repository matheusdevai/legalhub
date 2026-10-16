import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Financial } from '@/types'
import { FinancialSheet } from './FinancialSheet'
import { buildSheetRows, projectedId } from '@/lib/financialSheet'

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

const LABELS = { fees: 'Honorários', rent: 'Aluguel', other: 'Outros' }

function renderSheet(list: Financial[], props: Partial<React.ComponentProps<typeof FinancialSheet>> = {}) {
  const onPatch = vi.fn()
  const onTogglePaid = vi.fn()
  const onQuickAdd = vi.fn().mockResolvedValue(true)
  const onToggleSelect = vi.fn()
  const onToggleSelectAll = vi.fn()
  render(
    <FinancialSheet
      rows={buildSheetRows(list)}
      accounts={[{ id: 'acc1', name: 'Itaú' } as never]}
      categoryLabels={LABELS}
      selectedIds={new Set()}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
      onPatch={onPatch}
      onTogglePaid={onTogglePaid}
      onQuickAdd={onQuickAdd}
      defaultNewDate="2026-10-15"
      {...props}
    />
  )
  return { onPatch, onTogglePaid, onQuickAdd, onToggleSelect, onToggleSelectAll }
}

const LIST = [
  fin({ id: 'a', type: 'receivable', description: 'Honorários Jan', amount: 2500, status: 'paid', paid_date: '2026-10-05' }),
  fin({ id: 'b', type: 'payable', description: 'Aluguel', amount: 3200 }),
]

describe('FinancialSheet — exibição', () => {
  it('mostra entrada/saída em colunas separadas, saldo acumulado e totais', () => {
    renderSheet(LIST)
    const rows = screen.getAllByTestId('sheet-row')
    expect(within(rows[0]).getByTestId('cell-income')).toHaveTextContent('2.500,00')
    expect(within(rows[0]).getByTestId('cell-expense')).toHaveTextContent('')
    expect(within(rows[1]).getByTestId('cell-expense')).toHaveTextContent('3.200,00')
    expect(rows[1]).toHaveTextContent('-R$ 700,00')
    expect(screen.getByTestId('total-income')).toHaveTextContent('2.500,00')
    expect(screen.getByTestId('total-expense')).toHaveTextContent('3.200,00')
    expect(screen.getByTestId('total-result')).toHaveTextContent('-R$ 700,00')
  })

  it('linha prevista aparece como "Previsto" e sem checkbox de seleção', () => {
    renderSheet([fin({ id: projectedId('tpl', '2026-10-30'), generated_from_id: 'tpl', due_date: '2026-10-30' })])
    const row = screen.getByTestId('sheet-row')
    expect(within(row).getByTestId('status-toggle')).toHaveTextContent('Previsto')
    expect(within(row).queryByRole('checkbox')).toBeNull()
  })
})

describe('FinancialSheet — edição na célula', () => {
  it('clicar no valor, digitar no formato brasileiro e Enter salva o novo valor', async () => {
    const { onPatch } = renderSheet(LIST)
    const cell = within(screen.getAllByTestId('sheet-row')[1]).getByTestId('cell-expense')
    await userEvent.click(cell)
    const input = screen.getByTestId('editor-expense')
    await userEvent.clear(input)
    await userEvent.type(input, '3.450,90{Enter}')
    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch.mock.calls[0][1]).toEqual({ amount: 3450.9 })
  })

  it('Esc cancela sem salvar', async () => {
    const { onPatch } = renderSheet(LIST)
    await userEvent.click(within(screen.getAllByTestId('sheet-row')[1]).getByTestId('cell-expense'))
    await userEvent.type(screen.getByTestId('editor-expense'), '9{Escape}')
    expect(onPatch).not.toHaveBeenCalled()
    expect(screen.queryByTestId('editor-expense')).toBeNull()
  })

  it('valor inválido não salva', async () => {
    const { onPatch } = renderSheet(LIST)
    await userEvent.click(within(screen.getAllByTestId('sheet-row')[1]).getByTestId('cell-expense'))
    const input = screen.getByTestId('editor-expense')
    await userEvent.clear(input)
    await userEvent.type(input, 'abc{Enter}')
    expect(onPatch).not.toHaveBeenCalled()
  })

  it('não deixa editar a coluna do tipo oposto (entrada numa despesa)', async () => {
    renderSheet(LIST)
    await userEvent.click(within(screen.getAllByTestId('sheet-row')[1]).getByTestId('cell-income'))
    expect(screen.queryByTestId('editor-income')).toBeNull()
  })

  it('descrição: Enter na célula focada edita, Tab salva e passa pra próxima', async () => {
    const { onPatch } = renderSheet(LIST)
    const cell = within(screen.getAllByTestId('sheet-row')[1]).getByTestId('cell-description')
    cell.focus()
    fireEvent.keyDown(cell, { key: 'Enter' })
    const input = screen.getByTestId('editor-description')
    await userEvent.clear(input)
    await userEvent.type(input, 'Aluguel sala 2')
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ financial: expect.objectContaining({ id: 'b' }) }), { description: 'Aluguel sala 2' })
  })

  it('digitar uma tecla numa célula de descrição focada já começa a edição com ela', () => {
    renderSheet(LIST)
    const cell = within(screen.getAllByTestId('sheet-row')[1]).getByTestId('cell-description')
    fireEvent.keyDown(cell, { key: 'X' })
    expect(screen.getByTestId('editor-description')).toHaveValue('X')
  })

  it('limpar "Pago em" manda paid_date null', async () => {
    const { onPatch } = renderSheet(LIST)
    await userEvent.click(within(screen.getAllByTestId('sheet-row')[0]).getByTestId('cell-paid_date'))
    const input = screen.getByTestId('editor-paid_date')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPatch.mock.calls[0][1]).toEqual({ paid_date: null })
  })

  it('vencimento de ocorrência prevista não é editável', async () => {
    renderSheet([fin({ id: projectedId('tpl', '2026-10-30'), generated_from_id: 'tpl', due_date: '2026-10-30' })])
    await userEvent.click(screen.getByTestId('cell-due_date'))
    expect(screen.queryByTestId('editor-due_date')).toBeNull()
  })

  it('clicar no status alterna pago', async () => {
    const { onTogglePaid } = renderSheet(LIST)
    await userEvent.click(within(screen.getAllByTestId('sheet-row')[1]).getByTestId('status-toggle'))
    expect(onTogglePaid).toHaveBeenCalledWith(expect.objectContaining({ financial: expect.objectContaining({ id: 'b' }) }))
  })
})

describe('FinancialSheet — inclusão rápida', () => {
  it('Enter com descrição + saída cria uma despesa na data padrão', async () => {
    const { onQuickAdd } = renderSheet(LIST)
    await userEvent.type(screen.getByTestId('quick-add-description'), 'Contador')
    await userEvent.type(screen.getByTestId('quick-add-expense'), '850{Enter}')
    await waitFor(() => expect(onQuickAdd).toHaveBeenCalledTimes(1))
    expect(onQuickAdd.mock.calls[0][0]).toEqual({
      type: 'payable', due_date: '2026-10-15', description: 'Contador', category: 'other', account_id: null, amount: 850,
    })
    await waitFor(() => expect(screen.getByTestId('quick-add-description')).toHaveValue(''))
  })

  it('entrada vira receita com categoria Honorários por padrão', async () => {
    const { onQuickAdd } = renderSheet(LIST)
    await userEvent.type(screen.getByTestId('quick-add-description'), 'Êxito')
    await userEvent.type(screen.getByTestId('quick-add-income'), '9.500,00{Enter}')
    await waitFor(() => expect(onQuickAdd).toHaveBeenCalled())
    expect(onQuickAdd.mock.calls[0][0]).toMatchObject({ type: 'receivable', category: 'fees', amount: 9500 })
  })

  it('exige entrada OU saída (não as duas, nem nenhuma)', async () => {
    const { onQuickAdd } = renderSheet(LIST)
    await userEvent.type(screen.getByTestId('quick-add-description'), 'Teste{Enter}')
    expect(screen.getByTestId('quick-add-error')).toHaveTextContent('Entrada OU Saída')
    await userEvent.type(screen.getByTestId('quick-add-income'), '10')
    await userEvent.type(screen.getByTestId('quick-add-expense'), '10{Enter}')
    expect(screen.getByTestId('quick-add-error')).toHaveTextContent('Entrada OU Saída')
    expect(onQuickAdd).not.toHaveBeenCalled()
  })

  it('some no modo somente atrasados', () => {
    renderSheet(LIST, { hideQuickAdd: true })
    expect(screen.queryByTestId('quick-add-row')).toBeNull()
  })
})

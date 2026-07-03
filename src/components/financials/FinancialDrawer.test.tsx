import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FinancialDrawer, DRAWER_EMPTY_FORM, type FinancialDrawerForm } from './FinancialDrawer'

// ── helpers ──────────────────────────────────────────────────────────────────
const CLIENTS = [
  { id: 'c1', name: 'João Silva' },
  { id: 'c2', name: 'Maria Souza' },
]
const PROCESSES = [
  { id: 'p1', number: '0001/2024', title: 'Ação de Cobrança' },
  { id: 'p2', number: '0002/2024', title: 'Divórcio Consensual' },
]

function renderDrawer(props: Partial<React.ComponentProps<typeof FinancialDrawer>> = {}) {
  const onClose = vi.fn()
  const onSave = vi.fn().mockResolvedValue(undefined)
  const utils = render(
    <FinancialDrawer
      open={true}
      onClose={onClose}
      onSave={onSave}
      clients={CLIENTS}
      processes={PROCESSES}
      {...props}
    />
  )
  return { ...utils, onClose, onSave }
}

// ── Visibilidade ──────────────────────────────────────────────────────────────
describe('FinancialDrawer — visibilidade', () => {
  it('renderiza o painel quando open=true', () => {
    renderDrawer({ open: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('oculta o painel quando open=false (translate-x-full)', () => {
    renderDrawer({ open: false })
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveClass('translate-x-full')
  })

  it('mostra título "Novo lançamento" sem editId', () => {
    renderDrawer()
    expect(screen.getByText(/novo lançamento/i)).toBeInTheDocument()
  })

  it('mostra título "Editar lançamento" com editId', () => {
    renderDrawer({ editId: 'abc-123' })
    expect(screen.getByText(/editar lançamento/i)).toBeInTheDocument()
  })
})

// ── Toggle de tipo ────────────────────────────────────────────────────────────
describe('FinancialDrawer — toggle Receita / Despesa', () => {
  it('começa como Receita por padrão', () => {
    renderDrawer()
    expect(screen.getByText('Receita')).toBeInTheDocument()
    const btn = screen.getByTestId('type-receivable')
    expect(btn).toHaveClass('bg-emerald-500')
  })

  it('troca para Despesa ao clicar no botão de Despesa', async () => {
    renderDrawer()
    await userEvent.click(screen.getByTestId('type-payable'))
    expect(screen.getByTestId('type-payable')).toHaveClass('bg-rose-500')
    expect(screen.getByText('Despesa')).toBeInTheDocument()
  })

  it('volta para Receita ao clicar novamente', async () => {
    renderDrawer()
    await userEvent.click(screen.getByTestId('type-payable'))
    await userEvent.click(screen.getByTestId('type-receivable'))
    expect(screen.getByTestId('type-receivable')).toHaveClass('bg-emerald-500')
  })

  it('inicializa como payable quando initial.type=payable', () => {
    renderDrawer({ initial: { type: 'payable' } })
    expect(screen.getByTestId('type-payable')).toHaveClass('bg-rose-500')
  })
})

// ── Validação ─────────────────────────────────────────────────────────────────
describe('FinancialDrawer — validação de campos obrigatórios', () => {
  it('botão Salvar está desabilitado com form vazio', () => {
    renderDrawer()
    expect(screen.getByTestId('btn-save')).toBeDisabled()
  })

  it('botão Salvar fica desabilitado com descrição preenchida mas sem valor', async () => {
    renderDrawer()
    await userEvent.type(screen.getByTestId('field-description'), 'Honorário mensal')
    expect(screen.getByTestId('btn-save')).toBeDisabled()
  })

  it('botão Salvar fica desabilitado com valor mas sem descrição', async () => {
    renderDrawer()
    await userEvent.type(screen.getByTestId('field-amount'), '1500')
    expect(screen.getByTestId('btn-save')).toBeDisabled()
  })

  it('botão Salvar fica habilitado quando descrição e valor estão preenchidos', async () => {
    renderDrawer()
    await userEvent.type(screen.getByTestId('field-description'), 'Honorário mensal')
    await userEvent.type(screen.getByTestId('field-amount'), '1500')
    expect(screen.getByTestId('btn-save')).not.toBeDisabled()
  })

  it('valor zero mantém o botão desabilitado', async () => {
    renderDrawer()
    await userEvent.type(screen.getByTestId('field-description'), 'Teste')
    await userEvent.type(screen.getByTestId('field-amount'), '0')
    expect(screen.getByTestId('btn-save')).toBeDisabled()
  })
})

// ── Exibição do valor ─────────────────────────────────────────────────────────
describe('FinancialDrawer — display do valor em tempo real', () => {
  it('exibe R$ 0,00 quando valor está vazio', () => {
    renderDrawer()
    expect(screen.getByLabelText(/valor do lançamento/i)).toHaveTextContent('R$ 0,00')
  })

  it('exibe o valor formatado enquanto o usuário digita', async () => {
    renderDrawer()
    await userEvent.type(screen.getByTestId('field-amount'), '2500')
    expect(screen.getByLabelText(/valor do lançamento/i)).toHaveTextContent('R$')
    const display = screen.getByLabelText(/valor do lançamento/i).textContent ?? ''
    expect(display).toMatch(/2\.?500/)
  })
})

// ── Status ────────────────────────────────────────────────────────────────────
describe('FinancialDrawer — seleção de status', () => {
  it('status Pendente está selecionado por padrão', () => {
    renderDrawer()
    const pendente = screen.getByTestId('status-pending')
    expect(pendente).toHaveClass('ring-2')
  })

  it('muda para Pago ao clicar no botão Pago', async () => {
    renderDrawer()
    await userEvent.click(screen.getByTestId('status-paid'))
    expect(screen.getByTestId('status-paid')).toHaveClass('ring-2')
    expect(screen.getByTestId('status-pending')).not.toHaveClass('ring-2')
  })

  it('muda para Vencido ao clicar no botão Vencido', async () => {
    renderDrawer()
    await userEvent.click(screen.getByTestId('status-overdue'))
    expect(screen.getByTestId('status-overdue')).toHaveClass('ring-2')
  })

  it('muda para Cancelado ao clicar no botão Cancelado', async () => {
    renderDrawer()
    await userEvent.click(screen.getByTestId('status-cancelled'))
    expect(screen.getByTestId('status-cancelled')).toHaveClass('ring-2')
  })
})

// ── Clientes e Processos ──────────────────────────────────────────────────────
describe('FinancialDrawer — campos de cliente e processo', () => {
  it('lista os clientes no select', () => {
    renderDrawer()
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
  })

  it('lista os processos no select', () => {
    renderDrawer()
    expect(screen.getByText(/0001\/2024/)).toBeInTheDocument()
    expect(screen.getByText(/0002\/2024/)).toBeInTheDocument()
  })

  it('não exibe select de clientes quando clients=[]', () => {
    renderDrawer({ clients: [] })
    expect(screen.queryByTestId('field-client')).not.toBeInTheDocument()
  })

  it('não exibe select de processos quando processes=[]', () => {
    renderDrawer({ processes: [] })
    expect(screen.queryByTestId('field-process')).not.toBeInTheDocument()
  })
})

// ── Callbacks ─────────────────────────────────────────────────────────────────
describe('FinancialDrawer — callbacks', () => {
  it('chama onClose ao clicar no botão Fechar (X)', async () => {
    const { onClose } = renderDrawer()
    await userEvent.click(screen.getByLabelText('Fechar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('chama onClose ao clicar no botão Cancelar', async () => {
    const { onClose } = renderDrawer()
    await userEvent.click(screen.getByTestId('btn-cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('chama onClose ao clicar no backdrop', async () => {
    const { onClose } = renderDrawer()
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('chama onSave com os dados corretos ao salvar', async () => {
    const { onSave } = renderDrawer()
    await userEvent.type(screen.getByTestId('field-description'), 'Honorário Jan')
    await userEvent.type(screen.getByTestId('field-amount'), '3500')
    await userEvent.click(screen.getByTestId('btn-save'))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
      const [arg] = onSave.mock.calls[0] as [FinancialDrawerForm]
      expect(arg.description).toBe('Honorário Jan')
      expect(arg.amount).toBe('3500')
      expect(arg.type).toBe('receivable')
    })
  })

  it('chama onSave com type=payable quando Despesa selecionada', async () => {
    const { onSave } = renderDrawer()
    await userEvent.click(screen.getByTestId('type-payable'))
    await userEvent.type(screen.getByTestId('field-description'), 'Aluguel escritório')
    await userEvent.type(screen.getByTestId('field-amount'), '2200')
    await userEvent.click(screen.getByTestId('btn-save'))
    await waitFor(() => {
      const [arg] = onSave.mock.calls[0] as [FinancialDrawerForm]
      expect(arg.type).toBe('payable')
    })
  })

  it('não chama onSave quando o form é inválido', async () => {
    const { onSave } = renderDrawer()
    await userEvent.click(screen.getByTestId('btn-save'))
    expect(onSave).not.toHaveBeenCalled()
  })
})

// ── Estado inicial ────────────────────────────────────────────────────────────
describe('FinancialDrawer — estado inicial (edição)', () => {
  it('preenche os campos com valores iniciais', () => {
    renderDrawer({
      initial: {
        type: 'payable',
        description: 'Custo processual',
        amount: '500',
        status: 'paid',
        category: 'costs',
      },
      editId: 'edit-123',
    })
    expect(screen.getByTestId('field-description')).toHaveValue('Custo processual')
    expect(screen.getByTestId('field-amount')).toHaveValue(500)
    expect(screen.getByTestId('status-paid')).toHaveClass('ring-2')
    expect(screen.getByTestId('type-payable')).toHaveClass('bg-rose-500')
  })
})

// ── Saving state ──────────────────────────────────────────────────────────────
describe('FinancialDrawer — estado de salvamento', () => {
  it('exibe "Salvando..." e botão desabilitado quando saving=true', async () => {
    renderDrawer({
      saving: true,
      initial: { description: 'Teste', amount: '100' },
    })
    const btn = screen.getByTestId('btn-save')
    expect(btn).toHaveTextContent('Salvando...')
    expect(btn).toBeDisabled()
  })
})

// ── Acessibilidade ────────────────────────────────────────────────────────────
describe('FinancialDrawer — acessibilidade', () => {
  it('o painel tem role="dialog"', () => {
    renderDrawer()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('o painel tem aria-modal="true"', () => {
    renderDrawer()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('o painel tem aria-label descritivo', () => {
    renderDrawer()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Novo lançamento')
  })

  it('o botão fechar tem aria-label', () => {
    renderDrawer()
    expect(screen.getByLabelText('Fechar')).toBeInTheDocument()
  })

  it('campo de valor tem label acessível', () => {
    renderDrawer()
    expect(screen.getByLabelText(/valor do lançamento/i)).toBeInTheDocument()
  })
})

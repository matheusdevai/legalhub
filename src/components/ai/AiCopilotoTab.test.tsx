import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unificação dos assistentes de IA: esta aba (Dashboard, tab "IA") passou a
// usar o mesmo backend ai-assistant-chat da página dedicada /assistente-ia,
// em vez da Edge Function antiga ai-assistant (removida). Este teste prova
// isso na prática — renderiza o componente de verdade e confirma que enviar
// uma pergunta chama a Edge Function certa, não a antiga.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: invokeMock } } }))

// jsdom não implementa Element.scrollTo (usado pelo auto-scroll do chat) — sem
// isso o componente lança em runtime assim que a primeira mensagem chega.
Element.prototype.scrollTo = vi.fn()

import { AiCopilotoTab } from './AiCopilotoTab'

describe('AiCopilotoTab — unificação com ai-assistant-chat', () => {
  beforeEach(() => { invokeMock.mockReset() })

  it('enviar uma pergunta chama ai-assistant-chat (nunca mais a Edge Function antiga ai-assistant)', async () => {
    invokeMock.mockResolvedValue({ data: { answer: 'Você tem 2 prazos críticos.', tools_called: ['consultar_prazos'] }, error: null })
    const user = userEvent.setup()
    render(<AiCopilotoTab />)

    await user.type(screen.getByPlaceholderText('Pergunte sobre o escritório...'), 'Quais processos vencem essa semana?{Enter}')

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1))
    expect(invokeMock).toHaveBeenCalledWith('ai-assistant-chat', { body: { message: 'Quais processos vencem essa semana?' } })
    expect(await screen.findByText('Você tem 2 prazos críticos.')).toBeInTheDocument()
  })

  it('resposta com proposed_action renderiza o card de confirmação (Confirmar/Cancelar)', async () => {
    invokeMock.mockResolvedValue({
      data: {
        answer: 'Vou criar a tarefa "Revisar contrato". Confirma?',
        tools_called: ['propor_criar_tarefa'],
        proposed_action: {
          log_id: 'log-1', type: 'criar_tarefa', title: 'Revisar contrato', description: null,
          due_date: null, priority: 'medium', assigned_to: 'user-1', assigned_name: 'Você', note: null,
        },
      },
      error: null,
    })
    const user = userEvent.setup()
    render(<AiCopilotoTab />)

    await user.type(screen.getByPlaceholderText('Pergunte sobre o escritório...'), 'Crie uma tarefa pra revisar o contrato{Enter}')

    expect(await screen.findByRole('button', { name: /confirmar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })
})

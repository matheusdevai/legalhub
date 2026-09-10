import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mesma unificação de AiCopilotoTab.test.tsx: o widget flutuante global
// (presente em toda página, via Layout.tsx) também passou a usar
// ai-assistant-chat em vez da Edge Function antiga ai-assistant.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: invokeMock } } }))

// jsdom não implementa Element.scrollTo (usado pelo auto-scroll do chat) — sem
// isso o componente lança em runtime assim que a primeira mensagem chega.
Element.prototype.scrollTo = vi.fn()

import { AiAssistantWidget } from './AiAssistantWidget'

describe('AiAssistantWidget — unificação com ai-assistant-chat', () => {
  beforeEach(() => { invokeMock.mockReset() })

  it('abrir o widget e enviar uma pergunta chama ai-assistant-chat', async () => {
    invokeMock.mockResolvedValue({ data: { answer: 'Nenhuma tarefa atrasada.', tools_called: ['consultar_tarefas'] }, error: null })
    const user = userEvent.setup()
    render(<AiAssistantWidget />)

    await user.click(screen.getByTitle('Copiloto Lawfy'))
    await user.type(screen.getByPlaceholderText('Pergunte sobre o escritório...'), 'Tem alguma tarefa atrasada?{Enter}')

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1))
    expect(invokeMock).toHaveBeenCalledWith('ai-assistant-chat', { body: { message: 'Tem alguma tarefa atrasada?' } })
    expect(await screen.findByText('Nenhuma tarefa atrasada.')).toBeInTheDocument()
  })
})

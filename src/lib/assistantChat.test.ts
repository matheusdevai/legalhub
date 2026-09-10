import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock estático de @/lib/supabase (mesmo padrão de Layout.notifications.test.tsx) ──
// vi.mock é hoisted pro topo do arquivo, então o mock em si precisa ser criado
// dentro de vi.hoisted() — uma const normal aqui daria ReferenceError.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: invokeMock } } }))

import { askAssistant, confirmAssistantAction, cancelAssistantAction, parseSlashCommand } from './assistantChat'

// Contrato único do frontend com o backend do LegalHub Assistente. As 3
// superfícies de IA do sistema — AssistantChat.tsx (/assistente-ia),
// AiCopilotoTab.tsx (aba "IA" do Dashboard) e AiAssistantWidget.tsx (widget
// flutuante global) — todas chamam askAssistant()/confirmAssistantAction()/
// cancelAssistantAction() deste módulo, nunca `supabase.functions.invoke`
// diretamente (ver imports em cada arquivo). Por isso testar que ESTE módulo
// sempre chama a Edge Function 'ai-assistant-chat' garante, por construção,
// que as três superfícies estão unificadas no mesmo backend — não precisa
// duplicar o mesmo teste em cada componente.
describe('assistantChat — contrato único das 3 superfícies de IA com o backend', () => {
  beforeEach(() => { invokeMock.mockReset() })

  it('askAssistant com mensagem livre chama a Edge Function ai-assistant-chat', async () => {
    invokeMock.mockResolvedValue({ data: { answer: 'oi', tools_called: [] }, error: null })
    await askAssistant({ message: 'Quais são meus prazos?' })
    expect(invokeMock).toHaveBeenCalledWith('ai-assistant-chat', { body: { message: 'Quais são meus prazos?' } })
  })

  it('askAssistant com comando de barra chama a mesma Edge Function ai-assistant-chat', async () => {
    invokeMock.mockResolvedValue({ data: { answer: 'ok', tools_called: [] }, error: null })
    await askAssistant({ slashCommand: 'prazos' })
    expect(invokeMock).toHaveBeenCalledWith('ai-assistant-chat', { body: { slash_command: 'prazos' } })
  })

  it('confirmAssistantAction chama ai-assistant-chat com confirm_action', async () => {
    invokeMock.mockResolvedValue({ data: { task_id: 't1' }, error: null })
    await confirmAssistantAction({ log_id: 'l1', type: 'criar_tarefa', title: 'X', assigned_to: 'u1' })
    expect(invokeMock).toHaveBeenCalledWith('ai-assistant-chat', {
      body: { confirm_action: { log_id: 'l1', type: 'criar_tarefa', title: 'X', assigned_to: 'u1' } },
    })
  })

  it('cancelAssistantAction chama ai-assistant-chat com cancel_action', async () => {
    invokeMock.mockResolvedValue({ data: { cancelled: true }, error: null })
    await cancelAssistantAction('l1')
    expect(invokeMock).toHaveBeenCalledWith('ai-assistant-chat', { body: { cancel_action: { log_id: 'l1' } } })
  })

  it('propaga o erro estruturado devolvido pela function (data.error)', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'Muitas perguntas em pouco tempo.' }, error: null })
    await expect(askAssistant({ message: 'oi' })).rejects.toThrow('Muitas perguntas em pouco tempo.')
  })

  it('parseSlashCommand reconhece só os comandos válidos', () => {
    expect(parseSlashCommand('/prazos')).toBe('prazos')
    expect(parseSlashCommand('/inexistente')).toBeNull()
    expect(parseSlashCommand('pergunta normal')).toBeNull()
  })
})

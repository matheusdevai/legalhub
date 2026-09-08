import { describe, it, expect } from 'vitest'
import {
  periodCutoffISO, filterAssistantLogs, historyTypeLabel, historyQuestionLabel,
  truncateText, historyAnswerSummary, isGenerationAnswer,
} from './assistantHistory'
import type { AssistantLog } from '@/types'

function log(overrides: Partial<AssistantLog>): AssistantLog {
  return {
    id: 'l' + Math.random(),
    tenant_id: 't1',
    user_id: 'u1',
    channel: 'chat',
    question: 'Como está meu dia?',
    slash_command: null,
    tools_called: [],
    answer: 'Você tem 2 tarefas pendentes hoje.',
    status: 'completed',
    error_message: null,
    created_at: '2026-09-08T12:00:00.000Z',
    action_type: null,
    action_payload: null,
    related_log_id: null,
    created_task_id: null,
    ...overrides,
  }
}

// Construído com o Date local (não literal UTC "Z") de propósito: a
// implementação usa setHours/setDate sobre um Date local, então os testes
// precisam comparar contra o mesmo referencial pra não quebrar conforme o
// fuso horário da máquina/CI (mesmo cuidado de dateParts, ver expenseUtils.test.ts).
const NOW = new Date(2026, 8, 8, 18, 0, 0) // 08/09/2026 18:00 local

describe('periodCutoffISO', () => {
  it('retorna null para "all" (sem corte)', () => {
    expect(periodCutoffISO('all', NOW)).toBeNull()
  })

  it('"today" corta à meia-noite do dia atual', () => {
    expect(periodCutoffISO('today', NOW)).toBe(new Date(2026, 8, 8, 0, 0, 0, 0).toISOString())
  })

  it('"7d" corta 6 dias atrás (inclui o dia de hoje = 7 dias no total)', () => {
    expect(periodCutoffISO('7d', NOW)).toBe(new Date(2026, 8, 2, 0, 0, 0, 0).toISOString())
  })

  it('"30d" corta 29 dias atrás', () => {
    expect(periodCutoffISO('30d', NOW)).toBe(new Date(2026, 7, 10, 0, 0, 0, 0).toISOString())
  })
})

describe('filterAssistantLogs', () => {
  // Timestamps espaçados por dias inteiros (não horas) e sempre a partir de
  // Date local, pra a comparação com o corte de período não depender do
  // fuso horário onde os testes rodam.
  const logs = [
    log({ id: 'a', created_at: new Date(2026, 8, 8, 10, 0).toISOString(), channel: 'chat', status: 'completed' }),
    log({ id: 'b', created_at: new Date(2026, 8, 5, 10, 0).toISOString(), channel: 'slash_command', status: 'completed' }),
    log({ id: 'c', created_at: new Date(2026, 6, 1, 10, 0).toISOString(), channel: 'action', status: 'confirmed' }),
    log({ id: 'd', created_at: new Date(2026, 8, 8, 9, 0).toISOString(), channel: 'chat', status: 'error' }),
  ]

  it('sem filtros, devolve tudo', () => {
    const result = filterAssistantLogs(logs, { period: 'all', channel: '', status: '' }, NOW)
    expect(result.map(l => l.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('filtra por período', () => {
    const result = filterAssistantLogs(logs, { period: '7d', channel: '', status: '' }, NOW)
    expect(result.map(l => l.id)).toEqual(['a', 'b', 'd'])
  })

  it('filtra por canal', () => {
    const result = filterAssistantLogs(logs, { period: 'all', channel: 'action', status: '' }, NOW)
    expect(result.map(l => l.id)).toEqual(['c'])
  })

  it('filtra por status', () => {
    const result = filterAssistantLogs(logs, { period: 'all', channel: '', status: 'error' }, NOW)
    expect(result.map(l => l.id)).toEqual(['d'])
  })

  it('combina período + canal + status', () => {
    const result = filterAssistantLogs(logs, { period: '7d', channel: 'chat', status: 'error' }, NOW)
    expect(result.map(l => l.id)).toEqual(['d'])
  })
})

describe('historyTypeLabel', () => {
  it('rotula chat e comando de barra pelo canal', () => {
    expect(historyTypeLabel(log({ channel: 'chat' }))).toBe('Chat')
    expect(historyTypeLabel(log({ channel: 'slash_command' }))).toBe('Comando de barra')
  })

  it('distingue ação confirmada, cancelada, com erro e proposta dentro do canal action', () => {
    expect(historyTypeLabel(log({ channel: 'action', status: 'confirmed' }))).toBe('Ação confirmada')
    expect(historyTypeLabel(log({ channel: 'action', status: 'cancelled' }))).toBe('Ação cancelada')
    expect(historyTypeLabel(log({ channel: 'action', status: 'error' }))).toBe('Ação com erro')
    expect(historyTypeLabel(log({ channel: 'action', status: 'proposed' }))).toBe('Ação proposta')
  })
})

describe('historyQuestionLabel', () => {
  it('mostra o comando de barra formatado quando presente', () => {
    expect(historyQuestionLabel(log({ slash_command: 'prazos', question: '/prazos' }))).toBe('/prazos')
  })

  it('mostra a pergunta em linguagem natural quando não é comando de barra', () => {
    expect(historyQuestionLabel(log({ slash_command: null, question: 'Quais são meus prazos?' }))).toBe('Quais são meus prazos?')
  })
})

describe('truncateText', () => {
  it('não altera texto dentro do limite', () => {
    expect(truncateText('curto', 10)).toBe('curto')
  })

  it('trunca e adiciona reticências quando excede o limite', () => {
    expect(truncateText('0123456789ABCDEF', 10)).toBe('0123456789…')
  })
})

describe('historyAnswerSummary', () => {
  it('indica "Minuta gerada." quando gerar_minuta foi chamada, sem expor o texto completo', () => {
    const minuta = log({ tools_called: ['gerar_minuta'], answer: 'MINUTA DE PETIÇÃO INICIAL\n\n' + 'x'.repeat(500) })
    expect(historyAnswerSummary(minuta)).toBe('Minuta gerada.')
  })

  it('indica "Análise de documento gerada." quando analisar_documento foi chamada', () => {
    const analise = log({ tools_called: ['analisar_documento'], answer: 'x'.repeat(500) })
    expect(historyAnswerSummary(analise)).toBe('Análise de documento gerada.')
  })

  it('usa a mensagem de erro truncada quando status é error', () => {
    const errored = log({ status: 'error', error_message: 'Falha ao consultar processos: timeout na API do tribunal' })
    expect(historyAnswerSummary(errored)).toBe('Falha ao consultar processos: timeout na API do tribunal')
  })

  it('mostra fallback genérico quando status é error sem error_message', () => {
    expect(historyAnswerSummary(log({ status: 'error', error_message: null, answer: null }))).toBe('Não foi possível concluir.')
  })

  it('trunca resposta longa comum (sem tool de geração)', () => {
    const longAnswer = 'y'.repeat(200)
    expect(historyAnswerSummary(log({ answer: longAnswer })).length).toBeLessThan(200)
  })

  it('indica aguardando confirmação quando proposta sem resposta ainda', () => {
    expect(historyAnswerSummary(log({ status: 'proposed', answer: null }))).toBe('Aguardando confirmação do usuário.')
  })
})

describe('isGenerationAnswer', () => {
  it('true quando gerar_minuta ou analisar_documento estão em tools_called', () => {
    expect(isGenerationAnswer(log({ tools_called: ['gerar_minuta'] }))).toBe(true)
    expect(isGenerationAnswer(log({ tools_called: ['consultar_processos', 'analisar_documento'] }))).toBe(true)
  })

  it('false para outras ferramentas ou nenhuma', () => {
    expect(isGenerationAnswer(log({ tools_called: ['consultar_tarefas'] }))).toBe(false)
    expect(isGenerationAnswer(log({ tools_called: [] }))).toBe(false)
  })
})

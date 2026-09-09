import { describe, it, expect } from 'vitest'
import {
  reportPeriodStart, reportPeriodCutoffISO, filterLogsByReportPeriod,
  buildAssistantReportMetrics, buildDailySeries,
} from './assistantRelatorio'
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

// Date local (não literal UTC) de propósito — a implementação usa
// startOfDay/addDays sobre um Date local, mesmo cuidado de
// assistantHistory.test.ts (periodCutoffISO).
const NOW = new Date(2026, 8, 8, 18, 0, 0) // 08/09/2026 (terça) 18:00 local

describe('reportPeriodStart / reportPeriodCutoffISO', () => {
  it('"today" começa hoje à meia-noite', () => {
    expect(reportPeriodStart('today', NOW)).toEqual(new Date(2026, 8, 8, 0, 0, 0, 0))
  })

  it('"7d" começa 6 dias atrás (inclui hoje = 7 dias no total)', () => {
    expect(reportPeriodStart('7d', NOW)).toEqual(new Date(2026, 8, 2, 0, 0, 0, 0))
  })

  it('"30d" começa 29 dias atrás', () => {
    expect(reportPeriodStart('30d', NOW)).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0))
  })

  it('"month" começa no dia 1 do mês corrente', () => {
    expect(reportPeriodStart('month', NOW)).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0))
  })

  it('reportPeriodCutoffISO devolve o mesmo instante em ISO', () => {
    expect(reportPeriodCutoffISO('today', NOW)).toBe(new Date(2026, 8, 8, 0, 0, 0, 0).toISOString())
  })
})

describe('filterLogsByReportPeriod', () => {
  const logs = [
    log({ id: 'a', created_at: new Date(2026, 8, 8, 10, 0).toISOString() }),
    log({ id: 'b', created_at: new Date(2026, 8, 5, 10, 0).toISOString() }),
    log({ id: 'c', created_at: new Date(2026, 7, 15, 10, 0).toISOString() }),
    log({ id: 'd', created_at: new Date(2026, 6, 1, 10, 0).toISOString() }),
  ]

  it('"today" só mantém logs de hoje', () => {
    expect(filterLogsByReportPeriod(logs, 'today', NOW).map(l => l.id)).toEqual(['a'])
  })

  it('"7d" mantém logs dos últimos 7 dias', () => {
    expect(filterLogsByReportPeriod(logs, '7d', NOW).map(l => l.id)).toEqual(['a', 'b'])
  })

  it('"month" mantém só logs do mês corrente (setembro)', () => {
    expect(filterLogsByReportPeriod(logs, 'month', NOW).map(l => l.id)).toEqual(['a', 'b'])
  })

  it('"30d" exclui logs fora da janela', () => {
    expect(filterLogsByReportPeriod(logs, '30d', NOW).map(l => l.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('buildAssistantReportMetrics', () => {
  it('conta o total de interações como o total de linhas', () => {
    const logs = [log({}), log({}), log({ status: 'error' })]
    expect(buildAssistantReportMetrics(logs).totalInteractions).toBe(3)
  })

  it('conta tarefas/lembretes criados por created_task_id distinto, só linhas confirmed com action_type', () => {
    const logs = [
      log({ status: 'confirmed', action_type: 'criar_tarefa', created_task_id: 'task-1' }),
      log({ status: 'confirmed', action_type: 'criar_lembrete', created_task_id: 'task-2' }),
      // mesma tarefa não é contada duas vezes
      log({ status: 'confirmed', action_type: 'criar_tarefa', created_task_id: 'task-1' }),
      // proposed/cancelled não contam, mesmo com action_type preenchido
      log({ status: 'proposed', action_type: 'criar_tarefa', created_task_id: null }),
      log({ status: 'cancelled', action_type: 'criar_tarefa', created_task_id: null }),
      // completed sem action_type não conta
      log({ status: 'completed', action_type: null, created_task_id: null }),
    ]
    expect(buildAssistantReportMetrics(logs).tasksCreated).toBe(2)
  })

  it('conta minutas geradas via tools_called', () => {
    const logs = [
      log({ tools_called: ['gerar_minuta'] }),
      log({ tools_called: ['consultar_processos'] }),
      log({ tools_called: ['gerar_minuta', 'consultar_processos'] }),
    ]
    expect(buildAssistantReportMetrics(logs).minutasGeneratedCount).toBe(2)
  })

  it('conta documentos analisados via tools_called', () => {
    const logs = [log({ tools_called: ['analisar_documento'] }), log({ tools_called: [] })]
    expect(buildAssistantReportMetrics(logs).documentsAnalyzedCount).toBe(1)
  })

  it('conta alertas/consultas de prazo via consultar_prazos OU consultar_processos, sem contar a mesma linha duas vezes', () => {
    const logs = [
      log({ tools_called: ['consultar_prazos'] }),
      log({ tools_called: ['consultar_processos'] }),
      log({ tools_called: ['consultar_prazos', 'consultar_processos'] }),
      log({ tools_called: ['gerar_minuta'] }),
    ]
    expect(buildAssistantReportMetrics(logs).deadlineAlertsCount).toBe(3)
  })

  it('conta erros e ações canceladas por status', () => {
    const logs = [
      log({ status: 'error' }),
      log({ status: 'error' }),
      log({ status: 'cancelled' }),
      log({ status: 'completed' }),
    ]
    const metrics = buildAssistantReportMetrics(logs)
    expect(metrics.errorsCount).toBe(2)
    expect(metrics.cancelledCount).toBe(1)
  })

  it('todas as métricas zeradas para lista vazia', () => {
    expect(buildAssistantReportMetrics([])).toEqual({
      totalInteractions: 0,
      tasksCreated: 0,
      minutasGeneratedCount: 0,
      documentsAnalyzedCount: 0,
      deadlineAlertsCount: 0,
      errorsCount: 0,
      cancelledCount: 0,
    })
  })
})

describe('buildDailySeries', () => {
  it('preenche todos os dias do período, inclusive os sem nenhuma linha (0)', () => {
    const logs = [
      log({ created_at: new Date(2026, 8, 8, 9, 0).toISOString() }),
      log({ created_at: new Date(2026, 8, 8, 20, 0).toISOString() }),
      log({ created_at: new Date(2026, 8, 6, 10, 0).toISOString() }),
    ]
    const series = buildDailySeries(logs, '7d', NOW)
    expect(series).toHaveLength(7)
    expect(series[0].date).toBe('2026-09-02')
    expect(series[series.length - 1].date).toBe('2026-09-08')
    expect(series.find(p => p.date === '2026-09-08')?.total).toBe(2)
    expect(series.find(p => p.date === '2026-09-06')?.total).toBe(1)
    expect(series.find(p => p.date === '2026-09-03')?.total).toBe(0)
  })

  it('"today" devolve um único ponto', () => {
    const logs = [log({ created_at: new Date(2026, 8, 8, 9, 0).toISOString() })]
    const series = buildDailySeries(logs, 'today', NOW)
    expect(series).toEqual([{ date: '2026-09-08', total: 1 }])
  })
})

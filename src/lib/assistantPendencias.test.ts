import { describe, it, expect } from 'vitest'
import { buildPendencies, categorizeTask, type PendencyTaskInput, type PendencyFinancialInput } from './assistantPendencias'

function makeTask(overrides: Partial<PendencyTaskInput> = {}): PendencyTaskInput {
  return {
    id: 't1',
    title: 'Tarefa',
    due_date: '2026-09-10',
    priority: 'medium',
    status: 'pending',
    type: 'custom',
    process_id: null,
    assigned_name: 'Fulano',
    assigned_to: 'user-1',
    ...overrides,
  }
}

function makeFinancial(overrides: Partial<PendencyFinancialInput> = {}): PendencyFinancialInput {
  return {
    id: 'f1',
    description: 'Honorários',
    due_date: '2026-09-10',
    status: 'pending',
    amount: 100,
    client_name: 'Cliente X',
    process_number: null,
    ...overrides,
  }
}

describe('categorizeTask', () => {
  it('classifica type document como documental', () => {
    expect(categorizeTask(makeTask({ type: 'document' }))).toBe('documental')
  })

  it('classifica type deadline como processual', () => {
    expect(categorizeTask(makeTask({ type: 'deadline' }))).toBe('processual')
  })

  it('classifica type hearing como processual', () => {
    expect(categorizeTask(makeTask({ type: 'hearing' }))).toBe('processual')
  })

  it('classifica type custom sem process_id como geral', () => {
    expect(categorizeTask(makeTask({ type: 'custom', process_id: null }))).toBe('geral')
  })

  it('classifica type meeting sem process_id como geral', () => {
    expect(categorizeTask(makeTask({ type: 'meeting', process_id: null }))).toBe('geral')
  })

  it('classifica type custom COM process_id como processual (vínculo com processo é sinal melhor que o type genérico)', () => {
    expect(categorizeTask(makeTask({ type: 'custom', process_id: 'proc-1' }))).toBe('processual')
  })
})

describe('buildPendencies', () => {
  it('agrupa tasks e financials nas categorias corretas', () => {
    const tasks = [
      makeTask({ id: 't-doc', type: 'document' }),
      makeTask({ id: 't-prazo', type: 'deadline' }),
      makeTask({ id: 't-geral', type: 'custom', process_id: null }),
      makeTask({ id: 't-vinculada', type: 'meeting', process_id: 'proc-1' }),
    ]
    const financials = [makeFinancial({ id: 'f-pend', status: 'pending' })]

    const grouped = buildPendencies(tasks, financials)

    expect(grouped.documental.map(i => i.id)).toEqual(['task-t-doc'])
    expect(grouped.processual.map(i => i.id).sort()).toEqual(['task-t-prazo', 'task-t-vinculada'].sort())
    expect(grouped.geral.map(i => i.id)).toEqual(['task-t-geral'])
    expect(grouped.financeira.map(i => i.id)).toEqual(['financial-f-pend'])
  })

  it('exclui tasks concluídas ou canceladas', () => {
    const tasks = [
      makeTask({ id: 't-done', status: 'done' }),
      makeTask({ id: 't-cancelled', status: 'cancelled' }),
      makeTask({ id: 't-pending', status: 'pending' }),
    ]
    const grouped = buildPendencies(tasks, [])
    const allIds = Object.values(grouped).flat().map(i => i.id)
    expect(allIds).toEqual(['task-t-pending'])
  })

  it('inclui financials pending e overdue, exclui paid e cancelled', () => {
    const financials = [
      makeFinancial({ id: 'f-pending', status: 'pending' }),
      makeFinancial({ id: 'f-overdue', status: 'overdue' }),
      makeFinancial({ id: 'f-paid', status: 'paid' }),
      makeFinancial({ id: 'f-cancelled', status: 'cancelled' }),
    ]
    const grouped = buildPendencies([], financials)
    expect(grouped.financeira.map(i => i.id).sort()).toEqual(['financial-f-overdue', 'financial-f-pending'].sort())
  })

  it('ordena por prazo (sem prazo por último) dentro de cada categoria', () => {
    const tasks = [
      makeTask({ id: 't-sem-prazo', type: 'document', due_date: null }),
      makeTask({ id: 't-longe', type: 'document', due_date: '2026-12-01' }),
      makeTask({ id: 't-perto', type: 'document', due_date: '2026-09-09' }),
    ]
    const grouped = buildPendencies(tasks, [])
    expect(grouped.documental.map(i => i.id)).toEqual(['task-t-perto', 'task-t-longe', 'task-t-sem-prazo'])
  })

  it('cada item aponta link/linkLabel para a tela onde pode ser resolvido', () => {
    const grouped = buildPendencies([makeTask({ type: 'document' })], [makeFinancial()])
    expect(grouped.documental[0].link).toBe('/tarefas')
    expect(grouped.documental[0].linkLabel).toBe('Resolver em Tarefas')
    expect(grouped.financeira[0].link).toBe('/financeiro')
    expect(grouped.financeira[0].linkLabel).toBe('Resolver em Financeiro')
  })
})

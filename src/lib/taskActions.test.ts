import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextRecurrenceDueDate, RECURRENCE_LABELS } from './taskActions'
import type { Task } from '@/types'

describe('nextRecurrenceDueDate', () => {
  it('soma 7 dias para recorrência semanal', () => {
    expect(nextRecurrenceDueDate('2026-07-20', 'weekly')).toBe('2026-07-27')
  })

  it('soma 1 mês para recorrência mensal', () => {
    expect(nextRecurrenceDueDate('2026-07-20', 'monthly')).toBe('2026-08-20')
  })

  it('lida com virada de ano na recorrência mensal', () => {
    expect(nextRecurrenceDueDate('2026-12-20', 'monthly')).toBe('2027-01-20')
  })

  // Bug real: a UI (TasksPage) sempre ofereceu "Ano" como opção de recorrência,
  // mas a função rejeitava 'yearly' e retornava null — a tarefa recorrente
  // anual simplesmente parava de se repetir silenciosamente.
  it('soma 1 ano para recorrência anual', () => {
    expect(nextRecurrenceDueDate('2026-07-20', 'yearly')).toBe('2027-07-20')
  })

  it('lida com 29 de fevereiro em ano bissexto na recorrência anual', () => {
    // 2028 é bissexto; 2029 não é — new Date com setFullYear rola para 1/mar.
    expect(nextRecurrenceDueDate('2028-02-29', 'yearly')).toBe('2029-03-01')
  })

  it('retorna null para intervalo desconhecido', () => {
    expect(nextRecurrenceDueDate('2026-07-20', null)).toBeNull()
    expect(nextRecurrenceDueDate('2026-07-20', 'daily')).toBeNull()
  })

  it('retorna null para data inválida', () => {
    expect(nextRecurrenceDueDate('not-a-date', 'weekly')).toBeNull()
  })
})

describe('RECURRENCE_LABELS', () => {
  it('inclui rótulo para "yearly", já que a UI oferece essa opção', () => {
    expect(RECURRENCE_LABELS.yearly).toBeTruthy()
  })
})

// ─── markTaskDone — respeita recurrence_end_date ────────────────────────────
const insertMock = vi.fn().mockResolvedValue({ error: null })
const updateEqMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: updateEqMock })),
      insert: insertMock,
    })),
  },
}))

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', tenant_id: 'ten1', title: 'Tarefa recorrente', description: null,
    process_id: null, client_id: null, assigned_to: null, assigned_name: null,
    due_date: '2026-07-20', priority: 'medium', status: 'pending', type: 'custom',
    location: null, all_day: false, deadline_date: null,
    created_at: null, updated_at: null, completed_at: null, deleted_at: null,
    recurring: true, recurrence_interval: 'monthly', recurrence_end_date: null,
    generated_from_id: null,
    ...overrides,
  }
}

describe('markTaskDone — recurrence_end_date', () => {
  beforeEach(() => { insertMock.mockClear(); updateEqMock.mockClear() })

  it('cria a próxima ocorrência quando não há data-limite de recorrência', async () => {
    const { markTaskDone } = await import('./taskActions')
    await markTaskDone(baseTask({ recurrence_end_date: null }))
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock.mock.calls[0][0]).toMatchObject({ due_date: '2026-08-20', recurring: true })
  })

  it('cria a próxima ocorrência quando a próxima data ainda está dentro do limite', async () => {
    const { markTaskDone } = await import('./taskActions')
    await markTaskDone(baseTask({ recurrence_end_date: '2026-12-31' }))
    expect(insertMock).toHaveBeenCalledTimes(1)
  })

  it('NÃO cria a próxima ocorrência quando ela ultrapassaria a data-limite', async () => {
    const { markTaskDone } = await import('./taskActions')
    await markTaskDone(baseTask({ due_date: '2026-07-20', recurrence_interval: 'monthly', recurrence_end_date: '2026-08-01' }))
    // Próxima ocorrência cairia em 2026-08-20, depois do limite (2026-08-01).
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('marca a tarefa como concluída mesmo quando não gera nova ocorrência', async () => {
    const { markTaskDone } = await import('./taskActions')
    await markTaskDone(baseTask({ recurrence_end_date: '2020-01-01' }))
    expect(updateEqMock).toHaveBeenCalled()
  })
})

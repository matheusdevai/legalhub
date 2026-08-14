import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextRecurrenceDueDate, RECURRENCE_LABELS, displayTaskDescription } from './taskActions'
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
const rpcMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: updateEqMock })),
      insert: insertMock,
    })),
    rpc: (...args: unknown[]) => rpcMock(...args),
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
    generated_from_id: null, created_by: null,
    ...overrides,
  }
}

describe('markTaskDone — recurrence_end_date', () => {
  beforeEach(() => { insertMock.mockClear(); updateEqMock.mockClear(); rpcMock.mockClear() })

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

describe('markTaskDone — avisa quem atribuiu a tarefa, quando concluída', () => {
  beforeEach(() => { insertMock.mockClear(); updateEqMock.mockClear(); rpcMock.mockClear() })

  it('notifica created_by quando ele é diferente do responsável pela tarefa', async () => {
    const { markTaskDone } = await import('./taskActions')
    await markTaskDone(baseTask({ recurring: false, created_by: 'admin-1', assigned_to: 'lawyer-2' }))
    expect(rpcMock).toHaveBeenCalledWith('notify_user', expect.objectContaining({
      target_user_id: 'admin-1',
      p_type: 'task',
      p_title: 'Tarefa concluída',
    }))
  })

  it('não notifica quando created_by é nulo (tarefa gerada pelo sistema)', async () => {
    const { markTaskDone } = await import('./taskActions')
    await markTaskDone(baseTask({ recurring: false, created_by: null, assigned_to: 'lawyer-2' }))
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('não notifica quando quem criou é a mesma pessoa responsável (concluiu a própria tarefa)', async () => {
    const { markTaskDone } = await import('./taskActions')
    await markTaskDone(baseTask({ recurring: false, created_by: 'lawyer-2', assigned_to: 'lawyer-2' }))
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('displayTaskDescription', () => {
  it('remove o prefixo client_id:{uuid} | usado internamente pra pré-preencher o cliente', () => {
    expect(displayTaskDescription('client_id:c48cd9fd-ff1b-462b-b50d-1221ed245234 | Cadastrado em 19/05/2026. Verificar documentação e iniciar processo'))
      .toBe('Cadastrado em 19/05/2026. Verificar documentação e iniciar processo')
  })

  it('mantém descrições sem o prefixo intocadas', () => {
    expect(displayTaskDescription('Digitalizar documentos e finalizar com petição.'))
      .toBe('Digitalizar documentos e finalizar com petição.')
  })

  it('retorna string vazia para descrição nula ou vazia', () => {
    expect(displayTaskDescription(null)).toBe('')
    expect(displayTaskDescription(undefined)).toBe('')
    expect(displayTaskDescription('')).toBe('')
  })
})

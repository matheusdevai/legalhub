import { describe, it, expect } from 'vitest'
import {
  resolveAssignee, proporCriarTarefa, proporCriarLembrete, confirmarAcaoProposta,
  type CallerProfile,
} from './tools'

// Testes das ferramentas de ESCRITA do LegalHub Assistente (milestone 3):
// propor_criar_tarefa / propor_criar_lembrete (nunca gravam nada — só
// resolvem responsável e devolvem uma ProposedAction) e confirmarAcaoProposta
// (grava de fato em `tasks`, chamada só pela requisição separada de
// confirmação). Mesma convenção de mock de src/.../tools.test.ts (injeção de
// dependência do client, sem bater no banco de verdade).

class MockQueryBuilder {
  calls: Array<{ method: string; args: unknown[] }> = []
  constructor(private result: { data: unknown; error: unknown }) {}
  private record(method: string, args: unknown[]) { this.calls.push({ method, args }); return this }
  select(...args: unknown[]) { return this.record('select', args) }
  eq(...args: unknown[]) { return this.record('eq', args) }
  neq(...args: unknown[]) { return this.record('neq', args) }
  ilike(...args: unknown[]) { return this.record('ilike', args) }
  or(...args: unknown[]) { return this.record('or', args) }
  limit(...args: unknown[]) { return this.record('limit', args) }
  insert(...args: unknown[]) { return this.record('insert', args) }
  maybeSingle() { return Promise.resolve(this.result) }
  single() { return Promise.resolve(this.result) }
  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    return Promise.resolve(this.result).then(resolve, reject)
  }
}

function mockDb(tableData: Record<string, { data: unknown; error?: unknown }>, rpcResults: Record<string, { data: unknown; error: unknown }> = {}) {
  const builders: Record<string, MockQueryBuilder[]> = {}
  const rpcCalls: Array<{ name: string; args: unknown }> = []
  const db = {
    from(table: string) {
      const builder = new MockQueryBuilder(tableData[table] ?? { data: [], error: null })
      builders[table] = builders[table] || []
      builders[table].push(builder)
      return builder
    },
    rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args })
      return Promise.resolve(rpcResults[name] ?? { data: null, error: null })
    },
  }
  return { db: db as any, builders, rpcCalls }
}

function callsOf(builder: MockQueryBuilder, method: string) {
  return builder.calls.filter(c => c.method === method)
}

function profile(overrides: Partial<CallerProfile> = {}): CallerProfile {
  return { id: 'profile-1', user_id: 'user-1', tenant_id: 'tenant-1', role: 'admin', name: 'Fulano', ...overrides }
}

describe('resolveAssignee', () => {
  it('sem nome pedido, atribui ao próprio usuário', async () => {
    const { db } = mockDb({})
    const result = await resolveAssignee(db, profile({ user_id: 'user-1', name: 'Fulano' }), undefined)
    expect(result).toEqual({ assigned_to: 'user-1', assigned_name: 'Fulano', note: null })
  })

  it('nome bate com exatamente 1 pessoa do tenant: atribui a ela', async () => {
    const rows = [{ user_id: 'user-2', name: 'João Silva', display_name: '', role: 'lawyer' }]
    const { db, builders } = mockDb({ profiles: { data: rows, error: null } })
    const result = await resolveAssignee(db, profile({ tenant_id: 'tenant-x' }), 'João')
    expect(result).toEqual({ assigned_to: 'user-2', assigned_name: 'João Silva', note: null })
    const b = builders.profiles[0]
    expect(callsOf(b, 'eq')).toContainEqual({ method: 'eq', args: ['tenant_id', 'tenant-x'] })
    expect(callsOf(b, 'neq')).toContainEqual({ method: 'neq', args: ['role', 'client'] })
  })

  it('nome não encontrado: cai para o próprio usuário com aviso', async () => {
    const { db } = mockDb({ profiles: { data: [], error: null } })
    const result = await resolveAssignee(db, profile({ user_id: 'user-1', name: 'Fulano' }), 'Ninguém')
    expect(result.assigned_to).toBe('user-1')
    expect(result.note).toMatch(/Não encontrei/)
  })

  it('nome ambíguo (mais de 1 pessoa): cai para o próprio usuário com aviso', async () => {
    const rows = [
      { user_id: 'user-2', name: 'Maria A', display_name: '', role: 'lawyer' },
      { user_id: 'user-3', name: 'Maria B', display_name: '', role: 'intern' },
    ]
    const { db } = mockDb({ profiles: { data: rows, error: null } })
    const result = await resolveAssignee(db, profile({ user_id: 'user-1', name: 'Fulano' }), 'Maria')
    expect(result.assigned_to).toBe('user-1')
    expect(result.note).toMatch(/mais de uma pessoa/)
  })
})

describe('proporCriarTarefa', () => {
  it('rejeita título vazio', async () => {
    const { db } = mockDb({})
    await expect(proporCriarTarefa(db, profile(), { titulo: '  ' })).rejects.toThrow('Título da tarefa é obrigatório')
  })

  it('monta proposta com prioridade padrão medium e sem atribuição explícita cai no próprio usuário', async () => {
    const { db } = mockDb({})
    const result = await proporCriarTarefa(db, profile({ user_id: 'user-1', name: 'Fulano' }), { titulo: 'Revisar contrato' })
    expect(result).toEqual({
      type: 'criar_tarefa',
      title: 'Revisar contrato',
      description: null,
      due_date: null,
      priority: 'medium',
      assigned_to: 'user-1',
      assigned_name: 'Fulano',
      note: null,
    })
  })

  it('data em formato inválido é descartada com aviso, mas não quebra a proposta', async () => {
    const { db } = mockDb({})
    const result = await proporCriarTarefa(db, profile(), { titulo: 'X', data_vencimento: '15/09/2026' })
    expect(result.due_date).toBeNull()
    expect(result.note).toMatch(/Não entendi a data/)
  })

  it('prioridade inválida cai para medium', async () => {
    const { db } = mockDb({})
    const result = await proporCriarTarefa(db, profile(), { titulo: 'X', prioridade: 'nada-a-ver' })
    expect(result.priority).toBe('medium')
  })

  it('atribuição explícita a colega resolve via profiles', async () => {
    const rows = [{ user_id: 'user-2', name: 'João', display_name: '', role: 'lawyer' }]
    const { db } = mockDb({ profiles: { data: rows, error: null } })
    const result = await proporCriarTarefa(db, profile(), { titulo: 'X', atribuir_a_nome: 'João' })
    expect(result.assigned_to).toBe('user-2')
    expect(result.assigned_name).toBe('João')
  })
})

describe('proporCriarLembrete', () => {
  it('rejeita título vazio', async () => {
    const { db } = mockDb({})
    await expect(proporCriarLembrete(db, profile(), { titulo: '' })).rejects.toThrow('Título do lembrete é obrigatório')
  })

  it('sempre usa prioridade low e type criar_lembrete', async () => {
    const { db } = mockDb({})
    const result = await proporCriarLembrete(db, profile({ user_id: 'user-1', name: 'Fulano' }), { titulo: 'Ligar pro cliente' })
    expect(result.type).toBe('criar_lembrete')
    expect(result.priority).toBe('low')
    expect(result.assigned_to).toBe('user-1')
  })
})

describe('confirmarAcaoProposta', () => {
  const assigneeRow = { user_id: 'user-1', name: 'Fulano', display_name: '', role: 'admin' }

  it('rejeita título vazio', async () => {
    const { db } = mockDb({ profiles: { data: assigneeRow, error: null } })
    await expect(confirmarAcaoProposta(db, profile(), {
      type: 'criar_tarefa', title: '  ', assigned_to: 'user-1',
    })).rejects.toThrow('Título é obrigatório')
  })

  it('rejeita data em formato inválido', async () => {
    const { db } = mockDb({ profiles: { data: assigneeRow, error: null } })
    await expect(confirmarAcaoProposta(db, profile(), {
      type: 'criar_tarefa', title: 'X', due_date: '15/09/2026', assigned_to: 'user-1',
    })).rejects.toThrow('Data de vencimento inválida')
  })

  it('rejeita quando o responsável não existe no tenant (nunca confia no assigned_to recebido sem checar)', async () => {
    const { db } = mockDb({ profiles: { data: null, error: null } })
    await expect(confirmarAcaoProposta(db, profile(), {
      type: 'criar_tarefa', title: 'X', assigned_to: 'user-de-outro-tenant',
    })).rejects.toThrow('Responsável inválido')
  })

  it('grava a tarefa com tenant_id explícito e type sempre custom, e retorna o id criado', async () => {
    const { db, builders } = mockDb({
      profiles: { data: assigneeRow, error: null },
      tasks: { data: { id: 'task-123' }, error: null },
    })
    const result = await confirmarAcaoProposta(db, profile({ tenant_id: 'tenant-x', user_id: 'user-1' }), {
      type: 'criar_tarefa', title: 'Revisar contrato', due_date: '2026-09-20', priority: 'high', assigned_to: 'user-1',
    })
    expect(result).toEqual({ task_id: 'task-123', assigned_to: 'user-1', assigned_name: 'Fulano' })
    const insertCall = callsOf(builders.tasks[0], 'insert')[0]
    expect(insertCall.args[0]).toMatchObject({
      tenant_id: 'tenant-x', title: 'Revisar contrato', due_date: '2026-09-20',
      priority: 'high', status: 'pending', type: 'custom', assigned_to: 'user-1', created_by: 'user-1',
    })
  })

  it('lembrete confirmado sempre grava prioridade low, mesmo se algo diferente for enviado', async () => {
    const { db, builders } = mockDb({
      profiles: { data: assigneeRow, error: null },
      tasks: { data: { id: 'task-456' }, error: null },
    })
    await confirmarAcaoProposta(db, profile(), {
      type: 'criar_lembrete', title: 'Ligar pro cliente', priority: 'urgent', assigned_to: 'user-1',
    })
    const insertCall = callsOf(builders.tasks[0], 'insert')[0]
    expect((insertCall.args[0] as any).priority).toBe('low')
  })

  it('notifica o responsável via notify_user quando atribuído a outra pessoa', async () => {
    const otherAssignee = { user_id: 'user-2', name: 'João', display_name: '', role: 'lawyer' }
    const { db, rpcCalls } = mockDb({
      profiles: { data: otherAssignee, error: null },
      tasks: { data: { id: 'task-789' }, error: null },
    })
    await confirmarAcaoProposta(db, profile({ user_id: 'user-1' }), {
      type: 'criar_tarefa', title: 'X', assigned_to: 'user-2',
    })
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('notify_user')
    expect(rpcCalls[0].args).toMatchObject({ target_user_id: 'user-2', p_type: 'task' })
  })

  it('NÃO notifica quando a tarefa é atribuída ao próprio usuário que confirmou', async () => {
    const { db, rpcCalls } = mockDb({
      profiles: { data: assigneeRow, error: null },
      tasks: { data: { id: 'task-999' }, error: null },
    })
    await confirmarAcaoProposta(db, profile({ user_id: 'user-1' }), {
      type: 'criar_tarefa', title: 'X', assigned_to: 'user-1',
    })
    expect(rpcCalls).toHaveLength(0)
  })
})

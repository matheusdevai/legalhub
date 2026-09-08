import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  consultarPrazos, consultarTarefas, consultarAgenda, consultarProcessos, consultarClientes,
  type CallerProfile,
} from './tools'

// Mesma convenção de teste do resto do repo (ver CLAUDE.md "Testes"): mockar
// o client do supabase em vez de bater no banco de verdade. Aqui as funções
// já recebem `db` por parâmetro (injeção de dependência), então basta passar
// um builder fake — sem precisar de vi.mock.
//
// O mock NÃO filtra `data` de acordo com os `.eq()/.gte()/...` chamados (isso
// seria reimplementar o Postgres); ele só grava quais filtros foram pedidos
// (pra testar que tenant_id/role são sempre aplicados) e devolve os dados
// crus pra classificação em JS ser testada (críticos/próximos, atrasadas/
// pendentes etc.) — que é a parte que roda no código, não no banco.

const TODAY = '2026-09-08'

class MockQueryBuilder {
  calls: Array<{ method: string; args: unknown[] }> = []
  constructor(private result: { data: unknown; error: unknown }) {}
  private record(method: string, args: unknown[]) { this.calls.push({ method, args }); return this }
  select(...args: unknown[]) { return this.record('select', args) }
  eq(...args: unknown[]) { return this.record('eq', args) }
  neq(...args: unknown[]) { return this.record('neq', args) }
  is(...args: unknown[]) { return this.record('is', args) }
  not(...args: unknown[]) { return this.record('not', args) }
  gte(...args: unknown[]) { return this.record('gte', args) }
  lte(...args: unknown[]) { return this.record('lte', args) }
  ilike(...args: unknown[]) { return this.record('ilike', args) }
  or(...args: unknown[]) { return this.record('or', args) }
  order(...args: unknown[]) { return this.record('order', args) }
  limit(...args: unknown[]) { return this.record('limit', args) }
  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    return Promise.resolve(this.result).then(resolve, reject)
  }
}

function mockDb(tableData: Record<string, { data: unknown; error?: unknown }>) {
  const builders: Record<string, MockQueryBuilder[]> = {}
  const db = {
    from(table: string) {
      const builder = new MockQueryBuilder(tableData[table] ?? { data: [], error: null })
      builders[table] = builders[table] || []
      builders[table].push(builder)
      return builder
    },
  }
  return { db: db as any, builders }
}

function callsOf(builder: MockQueryBuilder, method: string) {
  return builder.calls.filter(c => c.method === method)
}

function profile(overrides: Partial<CallerProfile>): CallerProfile {
  return { id: 'profile-1', user_id: 'user-1', tenant_id: 'tenant-1', role: 'admin', name: 'Fulano', ...overrides }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('consultarPrazos', () => {
  it('sempre filtra por tenant_id e por processos ativos', async () => {
    const { db, builders } = mockDb({ processes: { data: [], error: null } })
    await consultarPrazos(db, profile({ tenant_id: 'tenant-x' }), {})
    const b = builders.processes[0]
    expect(callsOf(b, 'eq')).toContainEqual({ method: 'eq', args: ['tenant_id', 'tenant-x'] })
    expect(callsOf(b, 'eq')).toContainEqual({ method: 'eq', args: ['status', 'active'] })
  })

  it('classifica prazo vencido/hoje como crítico e prazo em até 7 dias como próximo (mesmos limiares de assistantEngine.ts)', async () => {
    const rows = [
      { id: 'overdue', number: '1', title: 'P1', client_name: 'C1', next_deadline: '2026-09-05', priority: 'medium' },
      { id: 'today', number: '2', title: 'P2', client_name: 'C1', next_deadline: TODAY, priority: 'medium' },
      { id: 'in7', number: '3', title: 'P3', client_name: 'C1', next_deadline: '2026-09-15', priority: 'medium' },
      { id: 'in8', number: '4', title: 'P4', client_name: 'C1', next_deadline: '2026-09-16', priority: 'medium' },
    ]
    const { db } = mockDb({ processes: { data: rows, error: null } })
    const result = await consultarPrazos(db, profile({}), { escopo: 'todos' }) as any
    expect(result.prazos_criticos.map((p: any) => p.numero)).toEqual(['1', '2'])
    expect(result.prazos_proximos.map((p: any) => p.numero)).toEqual(['3'])
  })

  it('respeita o parâmetro escopo', async () => {
    const rows = [{ id: 'overdue', number: '1', title: 'P1', client_name: null, next_deadline: '2026-09-05', priority: 'medium' }]
    const { db } = mockDb({ processes: { data: rows, error: null } })
    const criticos = await consultarPrazos(db, profile({}), { escopo: 'criticos' }) as any
    expect(criticos).toHaveProperty('prazos_criticos')
    expect(criticos).not.toHaveProperty('prazos_proximos')
    const proximos = await consultarPrazos(db, profile({}), { escopo: 'proximos' }) as any
    expect(proximos).toHaveProperty('prazos_proximos')
    expect(proximos).not.toHaveProperty('prazos_criticos')
  })
})

describe('consultarTarefas', () => {
  it('filtra por tenant_id e nunca inclui done/cancelled', async () => {
    const { db, builders } = mockDb({ tasks: { data: [], error: null } })
    await consultarTarefas(db, profile({ tenant_id: 'tenant-x', role: 'admin' }), {})
    const b = builders.tasks[0]
    expect(callsOf(b, 'eq')).toContainEqual({ method: 'eq', args: ['tenant_id', 'tenant-x'] })
    expect(callsOf(b, 'neq')).toContainEqual({ method: 'neq', args: ['status', 'done'] })
    expect(callsOf(b, 'neq')).toContainEqual({ method: 'neq', args: ['status', 'cancelled'] })
  })

  it.each(['lawyer', 'intern'])('role %s só vê as próprias tarefas (assigned_to = profile.user_id)', async (role) => {
    const { db, builders } = mockDb({ tasks: { data: [], error: null } })
    await consultarTarefas(db, profile({ role, user_id: 'user-42' }), {})
    const b = builders.tasks[0]
    expect(callsOf(b, 'eq')).toContainEqual({ method: 'eq', args: ['assigned_to', 'user-42'] })
  })

  it.each(['admin', 'financial', 'super_admin'])('role %s NÃO é restrito por assigned_to', async (role) => {
    const { db, builders } = mockDb({ tasks: { data: [], error: null } })
    await consultarTarefas(db, profile({ role, user_id: 'user-42' }), {})
    const b = builders.tasks[0]
    expect(callsOf(b, 'eq').some(c => c.args[0] === 'assigned_to')).toBe(false)
  })

  it('separa tarefas atrasadas (due_date < hoje) de pendências, sem duplicar', async () => {
    const rows = [
      { id: 'late', title: 'T1', due_date: '2026-09-01', priority: 'medium', status: 'pending', assigned_name: 'A' },
      { id: 'no-date', title: 'T2', due_date: null, priority: 'medium', status: 'pending', assigned_name: 'A' },
      { id: 'future', title: 'T3', due_date: '2026-09-20', priority: 'medium', status: 'pending', assigned_name: 'A' },
    ]
    const { db } = mockDb({ tasks: { data: rows, error: null } })
    const result = await consultarTarefas(db, profile({}), { status: 'todas' }) as any
    expect(result.tarefas_atrasadas.map((t: any) => t.tarefa)).toEqual(['T1'])
    expect(result.tarefas_pendentes.map((t: any) => t.tarefa).sort()).toEqual(['T2', 'T3'])
  })
})

describe('consultarAgenda', () => {
  it('filtra por tenant_id e ignora eventos cancelados', async () => {
    const { db, builders } = mockDb({ calendar_events: { data: [], error: null } })
    await consultarAgenda(db, profile({ tenant_id: 'tenant-x' }), {})
    const b = builders.calendar_events[0]
    expect(callsOf(b, 'eq')).toContainEqual({ method: 'eq', args: ['tenant_id', 'tenant-x'] })
    expect(callsOf(b, 'neq')).toContainEqual({ method: 'neq', args: ['status', 'cancelled'] })
  })

  it.each([
    ['hoje', TODAY],
    ['semana', '2026-09-15'],
    ['mes', '2026-10-08'],
  ])('período %s consulta de hoje até a janela correta', async (periodo, expectedEnd) => {
    const { db, builders } = mockDb({ calendar_events: { data: [], error: null } })
    await consultarAgenda(db, profile({}), { periodo: periodo as any })
    const b = builders.calendar_events[0]
    expect(callsOf(b, 'gte')).toContainEqual({ method: 'gte', args: ['date', TODAY] })
    expect(callsOf(b, 'lte')).toContainEqual({ method: 'lte', args: ['date', expectedEnd] })
  })
})

describe('consultarProcessos', () => {
  it('filtra por tenant_id e só processos ativos', async () => {
    const { db, builders } = mockDb({ processes: { data: [], error: null } })
    await consultarProcessos(db, profile({ tenant_id: 'tenant-x' }), {})
    const b = builders.processes[0]
    expect(callsOf(b, 'eq')).toContainEqual({ method: 'eq', args: ['tenant_id', 'tenant-x'] })
    expect(callsOf(b, 'eq')).toContainEqual({ method: 'eq', args: ['status', 'active'] })
  })

  it('"exige atenção" usa EXATAMENTE o critério de assistantEngine.ts: só prioridade alta/urgente, sem checar prazo vencido', async () => {
    const rows = [
      { id: 'urgent', number: '1', title: 'P1', client_name: null, next_deadline: null, priority: 'urgent' },
      { id: 'high', number: '2', title: 'P2', client_name: null, next_deadline: null, priority: 'high' },
      { id: 'medium-overdue', number: '3', title: 'P3', client_name: null, next_deadline: '2026-09-01', priority: 'medium' },
      { id: 'medium', number: '4', title: 'P4', client_name: null, next_deadline: null, priority: 'medium' },
    ]
    const { db } = mockDb({ processes: { data: rows, error: null } })
    const result = await consultarProcessos(db, profile({}), { apenas_atencao: true }) as any
    expect(result.processos.map((p: any) => p.numero).sort()).toEqual(['1', '2'])
  })

  it('apenas_atencao=false retorna todos os processos ativos', async () => {
    const rows = [
      { id: 'medium', number: '4', title: 'P4', client_name: null, next_deadline: null, priority: 'medium' },
    ]
    const { db } = mockDb({ processes: { data: rows, error: null } })
    const result = await consultarProcessos(db, profile({}), { apenas_atencao: false }) as any
    expect(result.processos.map((p: any) => p.numero)).toEqual(['4'])
  })
})

describe('consultarClientes', () => {
  it('retorna vazio sem consultar o banco quando a busca é vazia', async () => {
    const { db, builders } = mockDb({ clients: { data: [], error: null }, processes: { data: [], error: null } })
    const result = await consultarClientes(db, profile({}), { busca: '  ' }) as any
    expect(result).toEqual({ clientes: [] })
    expect(builders.clients).toBeUndefined()
  })

  it('filtra clientes e processos por tenant_id e pelo termo buscado', async () => {
    const { db, builders } = mockDb({
      clients: { data: [], error: null },
      processes: { data: [], error: null },
    })
    await consultarClientes(db, profile({ tenant_id: 'tenant-x' }), { busca: 'João' })
    const clientBuilder = builders.clients[0]
    expect(callsOf(clientBuilder, 'eq')).toContainEqual({ method: 'eq', args: ['tenant_id', 'tenant-x'] })
    expect(callsOf(clientBuilder, 'ilike')).toContainEqual({ method: 'ilike', args: ['name', '%João%'] })

    const processBuilder = builders.processes[0]
    expect(callsOf(processBuilder, 'eq')).toContainEqual({ method: 'eq', args: ['tenant_id', 'tenant-x'] })
    expect(callsOf(processBuilder, 'or').length).toBe(1)
  })
})

import { describe, it, expect } from 'vitest'
import {
  resolveAssignee, proporCriarTarefa, proporCriarLembrete, confirmarAcaoProposta,
  claimProposedAction, processConfirmAction, processCancelAction,
  type CallerProfile,
} from './tools'

// Testes das ferramentas de ESCRITA do LegalHub Assistente (milestone 3):
// propor_criar_tarefa / propor_criar_lembrete (nunca gravam nada — só
// resolvem responsável e devolvem uma ProposedAction), confirmarAcaoProposta
// (grava de fato em `tasks`) e o fluxo completo de confirmação/cancelamento
// (processConfirmAction/processCancelAction, incluindo a reivindicação
// atômica que garante idempotência contra duplo clique). Mesma convenção de
// mock de src/.../tools.test.ts (injeção de dependência do client, sem bater
// no banco de verdade).

type MockResult = { data: unknown; error?: unknown }

class MockQueryBuilder {
  calls: Array<{ method: string; args: unknown[] }> = []
  constructor(private result: MockResult) {}
  private record(method: string, args: unknown[]) { this.calls.push({ method, args }); return this }
  select(...args: unknown[]) { return this.record('select', args) }
  eq(...args: unknown[]) { return this.record('eq', args) }
  neq(...args: unknown[]) { return this.record('neq', args) }
  ilike(...args: unknown[]) { return this.record('ilike', args) }
  or(...args: unknown[]) { return this.record('or', args) }
  limit(...args: unknown[]) { return this.record('limit', args) }
  insert(...args: unknown[]) { return this.record('insert', args) }
  update(...args: unknown[]) { return this.record('update', args) }
  maybeSingle() { return Promise.resolve(this.result) }
  single() { return Promise.resolve(this.result) }
  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    return Promise.resolve(this.result).then(resolve, reject)
  }
}

// `tableData[table]` aceita um resultado fixo (mesmo valor pra toda chamada
// `.from(table)`) OU uma FILA de resultados (um array — cada chamada consome
// o próximo item, repetindo o último quando a fila acaba). A fila é o que
// permite simular, num único teste, duas chamadas SEQUENCIAIS na mesma
// tabela com respostas DIFERENTES — ex: a reivindicação atômica de
// claimProposedAction (1ª chamada = UPDATE reivindica a linha, 2ª chamada =
// leitura de diagnóstico) ou duas tentativas de confirmação concorrentes do
// mesmo log_id (1ª ganha a corrida, 2ª não acha mais nada pra reivindicar).
function mockDb(
  tableData: Record<string, MockResult | MockResult[]>,
  rpcResults: Record<string, { data: unknown; error: unknown }> = {},
) {
  const builders: Record<string, MockQueryBuilder[]> = {}
  const cursors: Record<string, number> = {}
  const rpcCalls: Array<{ name: string; args: unknown }> = []
  const db = {
    from(table: string) {
      const spec = tableData[table]
      let result: MockResult
      if (Array.isArray(spec)) {
        const i = cursors[table] || 0
        result = spec[Math.min(i, spec.length - 1)]
        cursors[table] = i + 1
      } else {
        result = spec ?? { data: [], error: null }
      }
      const builder = new MockQueryBuilder(result)
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

// claimProposedAction é o que garante IDEMPOTÊNCIA: um UPDATE condicional
// (`WHERE status = 'proposed'`) que só uma requisição consegue "ganhar" pro
// mesmo log_id, mesmo com duas chegando ao mesmo tempo. Testado em isolado
// aqui, e de ponta a ponta (com o cenário de dupla confirmação) em
// processConfirmAction mais abaixo.
describe('claimProposedAction', () => {
  it('reivindica com sucesso uma proposta ainda "proposed", devolvendo action_type/action_payload da linha', async () => {
    const { db, builders } = mockDb({
      ai_assistant_logs: [{ data: [{ id: 'log-1', action_type: 'criar_tarefa', action_payload: { title: 'X' } }], error: null }],
    })
    const result = await claimProposedAction(db, profile({ user_id: 'user-1', tenant_id: 'tenant-1' }), 'log-1', 'confirmed', 'criar_tarefa')
    expect(result).toEqual({ status: 'claimed', action_type: 'criar_tarefa', action_payload: { title: 'X' } })
    const b = builders.ai_assistant_logs[0]
    expect(callsOf(b, 'update')[0].args[0]).toEqual({ status: 'confirmed' })
    expect(callsOf(b, 'eq')).toContainEqual({ method: 'eq', args: ['status', 'proposed'] })
    expect(callsOf(b, 'eq')).toContainEqual({ method: 'eq', args: ['action_type', 'criar_tarefa'] })
  })

  it('uma SEGUNDA reivindicação do MESMO log_id (já confirmado pela primeira) não reivindica de novo', async () => {
    const { db } = mockDb({
      ai_assistant_logs: [
        { data: [{ id: 'log-1', action_type: 'criar_tarefa', action_payload: null }], error: null }, // 1ª: ganha a corrida
        { data: [], error: null }, // 2ª: UPDATE condicional não afeta nenhuma linha (status já não é mais 'proposed')
        { data: { id: 'log-1', action_type: 'criar_tarefa' }, error: null }, // leitura de diagnóstico: linha existe
      ],
    })
    const p = profile({ user_id: 'user-1', tenant_id: 'tenant-1' })
    const first = await claimProposedAction(db, p, 'log-1', 'confirmed', 'criar_tarefa')
    expect(first.status).toBe('claimed')
    const second = await claimProposedAction(db, p, 'log-1', 'confirmed', 'criar_tarefa')
    expect(second.status).toBe('already_processed')
  })

  it('log inexistente (ou de outro tenant/usuário — filtrado pelo próprio UPDATE) retorna not_found', async () => {
    const { db } = mockDb({
      ai_assistant_logs: [
        { data: [], error: null },
        { data: null, error: null },
      ],
    })
    const result = await claimProposedAction(db, profile(), 'log-x', 'confirmed', 'criar_tarefa')
    expect(result.status).toBe('not_found')
  })

  it('action_type diferente do esperado não reivindica e retorna type_mismatch', async () => {
    const { db } = mockDb({
      ai_assistant_logs: [
        { data: [], error: null },
        { data: { id: 'log-1', action_type: 'criar_tarefa' }, error: null },
      ],
    })
    const result = await claimProposedAction(db, profile(), 'log-1', 'confirmed', 'criar_lembrete')
    expect(result.status).toBe('type_mismatch')
  })

  it('cancelamento não filtra por action_type (nenhum tipo esperado é passado)', async () => {
    const { db, builders } = mockDb({
      ai_assistant_logs: [{ data: [{ id: 'log-1', action_type: 'criar_lembrete', action_payload: { title: 'Ligar' } }], error: null }],
    })
    const result = await claimProposedAction(db, profile(), 'log-1', 'cancelled')
    expect(result).toEqual({ status: 'claimed', action_type: 'criar_lembrete', action_payload: { title: 'Ligar' } })
    const b = builders.ai_assistant_logs[0]
    expect(callsOf(b, 'eq').some(c => c.args[0] === 'action_type')).toBe(false)
  })
})

describe('processConfirmAction', () => {
  const assigneeRow = { user_id: 'user-1', name: 'Fulano', display_name: '', role: 'admin' }
  const baseInput = { log_id: 'log-1', type: 'criar_tarefa' as const, title: 'Revisar contrato', assigned_to: 'user-1' }

  it('body malformado retorna 400 sem tocar no banco', async () => {
    const { db, builders } = mockDb({})
    const result = await processConfirmAction(db, profile(), { log_id: 'log-1' })
    expect(result.status).toBe(400)
    expect(builders.ai_assistant_logs).toBeUndefined()
  })

  it('título vazio é barrado pela validação ANTES de reivindicar a proposta (fica retentável)', async () => {
    const { db, builders } = mockDb({ profiles: { data: assigneeRow, error: null } })
    const result = await processConfirmAction(db, profile(), { ...baseInput, title: '   ' })
    expect(result.status).toBe(400)
    // Nunca chegou a chamar claimProposedAction: nenhum UPDATE em ai_assistant_logs.
    expect(builders.ai_assistant_logs).toBeUndefined()
  })

  it('log_id inexistente retorna 404', async () => {
    const { db } = mockDb({
      profiles: { data: assigneeRow, error: null },
      ai_assistant_logs: [{ data: [], error: null }, { data: null, error: null }],
    })
    const result = await processConfirmAction(db, profile(), baseInput)
    expect(result.status).toBe(404)
  })

  it('confirma com sucesso: reivindica, grava a tarefa e loga uma linha de auditoria "confirmed"', async () => {
    const { db, builders } = mockDb({
      profiles: { data: assigneeRow, error: null },
      ai_assistant_logs: [
        { data: [{ id: 'log-1', action_type: 'criar_tarefa', action_payload: null }], error: null },
        { data: null, error: null },
      ],
      tasks: { data: { id: 'task-1' }, error: null },
    })
    const result = await processConfirmAction(db, profile({ user_id: 'user-1', tenant_id: 'tenant-1' }), baseInput)
    expect(result).toEqual({ status: 200, body: { task_id: 'task-1' } })
    expect(builders.tasks).toHaveLength(1)
    expect(builders.ai_assistant_logs).toHaveLength(2)
    const auditInsert = callsOf(builders.ai_assistant_logs[1], 'insert')[0]
    expect(auditInsert.args[0]).toMatchObject({ status: 'confirmed', channel: 'action', related_log_id: 'log-1', created_task_id: 'task-1' })
  })

  it('IDEMPOTÊNCIA — confirmar o MESMO log_id duas vezes só cria UMA tarefa; a 2ª tentativa recebe 409', async () => {
    const { db, builders } = mockDb({
      profiles: { data: assigneeRow, error: null },
      ai_assistant_logs: [
        { data: [{ id: 'log-1', action_type: 'criar_tarefa', action_payload: null }], error: null }, // 1ª: reivindica
        { data: null, error: null }, // 1ª: insere linha de auditoria 'confirmed'
        { data: [], error: null }, // 2ª: UPDATE condicional não afeta nada (já não é mais 'proposed')
        { data: { id: 'log-1', action_type: 'criar_tarefa' }, error: null }, // 2ª: diagnóstico — já processada
      ],
      tasks: { data: { id: 'task-1' }, error: null },
    })
    const p = profile({ user_id: 'user-1', tenant_id: 'tenant-1' })

    const first = await processConfirmAction(db, p, baseInput)
    expect(first).toEqual({ status: 200, body: { task_id: 'task-1' } })

    const second = await processConfirmAction(db, p, baseInput)
    expect(second.status).toBe(409)

    // A prova de que não duplicou: só existe 1 INSERT em `tasks` no total,
    // mesmo tendo chamado processConfirmAction duas vezes com o mesmo log_id.
    expect(builders.tasks).toHaveLength(1)
  })
})

describe('processCancelAction', () => {
  it('log_id ausente ou de tipo errado retorna 400', async () => {
    const { db } = mockDb({})
    const result = await processCancelAction(db, profile(), undefined)
    expect(result.status).toBe(400)
  })

  it('cancela com sucesso e loga uma linha de auditoria "cancelled" com os dados originais da proposta', async () => {
    const { db, builders } = mockDb({
      ai_assistant_logs: [{ data: [{ id: 'log-1', action_type: 'criar_lembrete', action_payload: { title: 'Ligar pro cliente' } }], error: null }],
    })
    const result = await processCancelAction(db, profile(), 'log-1')
    expect(result).toEqual({ status: 200, body: { cancelled: true } })
    const auditInsert = callsOf(builders.ai_assistant_logs[0], 'insert')
    // A própria reivindicação já é o UPDATE; o insert de auditoria é a 2ª
    // chamada nessa tabela.
    expect(builders.ai_assistant_logs).toHaveLength(2)
    const insertCall = callsOf(builders.ai_assistant_logs[1], 'insert')[0]
    expect(insertCall.args[0]).toMatchObject({ status: 'cancelled', action_type: 'criar_lembrete', action_payload: { title: 'Ligar pro cliente' } })
  })

  it('cancelar o MESMO log_id duas vezes: a 2ª tentativa recebe 409 e não duplica o log de auditoria', async () => {
    const { db, builders } = mockDb({
      ai_assistant_logs: [
        { data: [{ id: 'log-1', action_type: 'criar_lembrete', action_payload: null }], error: null }, // 1ª: reivindica
        { data: null, error: null }, // 1ª: insere linha de auditoria 'cancelled'
        { data: [], error: null }, // 2ª: UPDATE condicional não afeta nada
        { data: { id: 'log-1', action_type: 'criar_lembrete' }, error: null }, // 2ª: diagnóstico — já processada
      ],
    })
    const p = profile()
    const first = await processCancelAction(db, p, 'log-1')
    expect(first.status).toBe(200)
    const second = await processCancelAction(db, p, 'log-1')
    expect(second.status).toBe(409)
    // 2 chamadas na 1ª tentativa (claim + auditoria) + 2 chamadas na 2ª
    // (UPDATE condicional que não afeta nada + leitura de diagnóstico pra
    // decidir a mensagem de erro — não insere auditoria nova) = 4 no total.
    expect(builders.ai_assistant_logs).toHaveLength(4)
  })
})

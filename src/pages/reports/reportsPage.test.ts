import { describe, it, expect } from 'vitest'

// ─── Réplica exata de getPeriodStart() / inPeriod() de ReportsPage ────────────
type ProductivityPeriod = 'day' | 'week' | 'month'

function getPeriodStart(period: ProductivityPeriod, now: Date): Date {
  const d = new Date(now)
  if (period === 'day') { d.setHours(0, 0, 0, 0); return d }
  if (period === 'week') {
    const day = d.getDay()
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
    d.setHours(0, 0, 0, 0); return d
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function inPeriod(dateStr: string | null | undefined, start: Date) {
  if (!dateStr) return false
  return new Date(dateStr) >= start
}

// ─── Réplica exata da agregação userProductivity de ReportsPage ──────────────
type MockUser = { user_id: string; name?: string; display_name?: string; role: string }
type MockClient = { assigned_lawyer?: string; created_at?: string }
type MockProcess = { assigned_lawyer?: string; data_protocolo?: string }
type MockTask = { assigned_to?: string; status: string; completed_at?: string }

function computeUserProductivity(users: MockUser[], clients: MockClient[], processes: MockProcess[], tasks: MockTask[], start: Date) {
  return users.map(u => {
    const name = u.name || u.display_name || ''
    const clientsCount = clients.filter(c => c.assigned_lawyer === name && inPeriod(c.created_at, start)).length
    const protocoladosCount = processes.filter(p => p.assigned_lawyer === name && inPeriod(p.data_protocolo, start)).length
    const tasksCount = tasks.filter(t => t.assigned_to === u.user_id && t.status === 'done' && inPeriod(t.completed_at, start)).length
    return { user_id: u.user_id, name, role: u.role, clientsCount, protocoladosCount, tasksCount, total: clientsCount + protocoladosCount + tasksCount }
  }).sort((a, b) => b.total - a.total)
}

// ─── Réplica exata do cálculo de winRate de ReportsPage ───────────────────────
function computeWinRate(won: number, lost: number, returned: number) {
  const totalOutcome = won + lost + returned
  return totalOutcome > 0 ? Math.round((won / totalOutcome) * 100) : 0
}

describe('ReportsPage — getPeriodStart()', () => {
  it('"day" retorna a meia-noite do próprio dia', () => {
    const now = new Date('2026-07-28T15:30:00')
    const start = getPeriodStart('day', now)
    expect(start.getHours()).toBe(0)
    expect(start.getDate()).toBe(28)
  })

  it('"week" retorna a segunda-feira da semana atual', () => {
    // 2026-07-28 é terça-feira
    const now = new Date('2026-07-28T15:30:00')
    const start = getPeriodStart('week', now)
    expect(start.getDay()).toBe(1) // segunda
    expect(start.getDate()).toBe(27)
  })

  it('"week" com domingo retrocede para a segunda anterior', () => {
    // 2026-08-02 é domingo
    const now = new Date('2026-08-02T10:00:00')
    const start = getPeriodStart('week', now)
    expect(start.getDay()).toBe(1)
    expect(start.getDate()).toBe(27)
  })

  it('"month" retorna o dia 1 do mês atual', () => {
    const now = new Date('2026-07-28T15:30:00')
    const start = getPeriodStart('month', now)
    expect(start.getDate()).toBe(1)
    expect(start.getMonth()).toBe(6) // julho = índice 6
  })
})

describe('ReportsPage — inPeriod()', () => {
  const start = new Date('2026-07-01T00:00:00')
  it('data ausente retorna false', () => {
    expect(inPeriod(undefined, start)).toBe(false)
    expect(inPeriod(null, start)).toBe(false)
  })
  it('data dentro do período retorna true', () => {
    expect(inPeriod('2026-07-15', start)).toBe(true)
  })
  it('data anterior ao período retorna false', () => {
    expect(inPeriod('2026-06-20', start)).toBe(false)
  })
})

describe('ReportsPage — computeUserProductivity()', () => {
  const start = new Date('2026-07-01T00:00:00')
  const users: MockUser[] = [
    { user_id: 'u1', name: 'Ana', role: 'lawyer' },
    { user_id: 'u2', name: 'Bruno', role: 'lawyer' },
  ]
  const clients: MockClient[] = [
    { assigned_lawyer: 'Ana', created_at: '2026-07-10' },
    { assigned_lawyer: 'Ana', created_at: '2026-06-01' }, // fora do período
  ]
  const processes: MockProcess[] = [
    { assigned_lawyer: 'Ana', data_protocolo: '2026-07-05' },
    { assigned_lawyer: 'Bruno', data_protocolo: '2026-07-20' },
  ]
  const tasks: MockTask[] = [
    { assigned_to: 'u1', status: 'done', completed_at: '2026-07-12' },
    { assigned_to: 'u2', status: 'pending', completed_at: undefined },
  ]

  it('conta apenas itens dentro do período por usuário', () => {
    const r = computeUserProductivity(users, clients, processes, tasks, start)
    const ana = r.find(u => u.user_id === 'u1')!
    expect(ana.clientsCount).toBe(1)
    expect(ana.protocoladosCount).toBe(1)
    expect(ana.tasksCount).toBe(1)
    expect(ana.total).toBe(3)
  })

  it('tarefa não concluída (status != done) não conta', () => {
    const r = computeUserProductivity(users, clients, processes, tasks, start)
    const bruno = r.find(u => u.user_id === 'u2')!
    expect(bruno.tasksCount).toBe(0)
  })

  it('ordena por total decrescente', () => {
    const r = computeUserProductivity(users, clients, processes, tasks, start)
    expect(r[0].user_id).toBe('u1')
  })
})

describe('ReportsPage — computeWinRate()', () => {
  it('sem nenhum resultado retorna 0', () => {
    expect(computeWinRate(0, 0, 0)).toBe(0)
  })
  it('100% de vitórias retorna 100', () => {
    expect(computeWinRate(5, 0, 0)).toBe(100)
  })
  it('calcula porcentagem arredondada', () => {
    expect(computeWinRate(2, 1, 0)).toBe(67) // 2/3 = 66.67% arredondado
  })
  it('desconsidera devolvidos apenas se forem 0 no numerador', () => {
    expect(computeWinRate(1, 1, 2)).toBe(25) // 1/4
  })
})

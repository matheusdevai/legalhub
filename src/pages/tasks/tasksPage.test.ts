import { describe, it, expect } from 'vitest'

// ─── Tipos mínimos ─────────────────────────────────────────────────────────────
type MockTask = {
  id: string; title: string; assigned_name?: string | null; assigned_to?: string | null
  status?: string | null; priority?: string | null; type?: string | null
  due_date?: string | null
}

// ─── Réplica exata do filtro da visão Lista de TasksPage ─────────────────────
function filterTasks(tasks: MockTask[], opts: {
  search?: string; statusFilter?: string; priorityFilter?: string; typeFilter?: string; assignedFilter?: string
}) {
  const { search = '', statusFilter = '', priorityFilter = '', typeFilter = '', assignedFilter = '' } = opts
  return tasks.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !search || t.title.toLowerCase().includes(q) || t.assigned_name?.toLowerCase().includes(q)
    const matchStatus = !statusFilter || (t.status || 'pending') === statusFilter
    const matchPriority = !priorityFilter || (t.priority || 'medium') === priorityFilter
    const matchType = !typeFilter || (t.type || 'custom') === typeFilter
    const matchAssigned = !assignedFilter || t.assigned_to === assignedFilter
    return matchSearch && matchStatus && matchPriority && matchType && matchAssigned
  })
}

// ─── Réplica exata da checagem de atraso usada nas linhas da Lista ────────────
function isTaskLate(t: MockTask, today: string) {
  return !!(t.due_date && t.due_date.slice(0, 10) < today && t.status !== 'done')
}

const TASKS: MockTask[] = [
  { id: 't1', title: 'Protocolar processo de Ana', assigned_name: 'Bruno', assigned_to: 'u1', status: 'pending', priority: 'high', type: 'custom', due_date: '2026-08-10' },
  { id: 't2', title: 'Enviar contrato', assigned_name: 'Carla', assigned_to: 'u2', status: 'done', priority: 'medium', type: 'custom', due_date: '2026-08-01' },
  { id: 't3', title: 'Revisar petição', assigned_name: 'Bruno', assigned_to: 'u1', status: 'in_progress', priority: 'urgent', type: 'deadline', due_date: '2026-08-20' },
  { id: 't4', title: 'Ligar para cliente', assigned_name: null, assigned_to: null, status: 'pending', priority: 'low', type: 'custom', due_date: null },
]

describe('TasksPage — filterTasks()', () => {
  it('sem filtros retorna todas', () => {
    expect(filterTasks(TASKS, {})).toHaveLength(4)
  })
  it('busca por título', () => {
    const r = filterTasks(TASKS, { search: 'contrato' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('t2')
  })
  it('busca por nome do responsável', () => {
    const r = filterTasks(TASKS, { search: 'bruno' })
    expect(r).toHaveLength(2)
  })
  it('filtra por status', () => {
    const r = filterTasks(TASKS, { statusFilter: 'done' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('t2')
  })
  it('filtra por prioridade', () => {
    const r = filterTasks(TASKS, { priorityFilter: 'urgent' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('t3')
  })
  it('filtra por tipo', () => {
    const r = filterTasks(TASKS, { typeFilter: 'deadline' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('t3')
  })
  it('filtra por responsável atribuído', () => {
    const r = filterTasks(TASKS, { assignedFilter: 'u1' })
    expect(r).toHaveLength(2)
  })
  it('combina busca + prioridade', () => {
    const r = filterTasks(TASKS, { search: 'revisar', priorityFilter: 'urgent' })
    expect(r).toHaveLength(1)
  })
  it('tarefa sem status/prioridade/tipo usa os valores-padrão do filtro', () => {
    const withDefaults: MockTask = { id: 't5', title: 'Sem metadados', due_date: null }
    const r = filterTasks([withDefaults], { statusFilter: 'pending', priorityFilter: 'medium', typeFilter: 'custom' })
    expect(r).toHaveLength(1)
  })
})

describe('TasksPage — isTaskLate()', () => {
  const today = '2026-08-15'
  it('tarefa com due_date no passado e não concluída está atrasada', () => {
    expect(isTaskLate(TASKS[0], today)).toBe(true)
  })
  it('tarefa concluída nunca é marcada como atrasada, mesmo com due_date no passado', () => {
    expect(isTaskLate(TASKS[1], today)).toBe(false)
  })
  it('tarefa com due_date no futuro não está atrasada', () => {
    expect(isTaskLate(TASKS[2], today)).toBe(false)
  })
  it('tarefa sem due_date nunca está atrasada', () => {
    expect(isTaskLate(TASKS[3], today)).toBe(false)
  })
})

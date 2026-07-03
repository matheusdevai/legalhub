import { describe, it, expect } from 'vitest'
import {
  isCompletedOnTime,
  isOverdue,
  avgDelayDays,
  computeAgilityMetrics,
  agilityPerUser,
  overdueTasksByType,
  scoreLabel,
  scoreColorClass,
  formatDelayDays,
  type TaskLike,
} from './reportsUtils'

// ── isCompletedOnTime ─────────────────────────────────────────────────────────
describe('isCompletedOnTime', () => {
  it('retorna false para tarefas não concluídas', () => {
    expect(isCompletedOnTime({ status: 'pending' })).toBe(false)
    expect(isCompletedOnTime({ status: 'in_progress' })).toBe(false)
    expect(isCompletedOnTime({ status: 'cancelled' })).toBe(false)
  })

  it('retorna true quando concluída antes do prazo', () => {
    expect(isCompletedOnTime({
      status: 'done',
      due_date: '2026-06-30',
      completed_at: '2026-06-20',
    })).toBe(true)
  })

  it('retorna true quando concluída exatamente no prazo', () => {
    expect(isCompletedOnTime({
      status: 'done',
      due_date: '2026-06-20',
      completed_at: '2026-06-20',
    })).toBe(true)
  })

  it('retorna false quando concluída depois do prazo', () => {
    expect(isCompletedOnTime({
      status: 'done',
      due_date: '2026-06-10',
      completed_at: '2026-06-20',
    })).toBe(false)
  })

  it('retorna true (assume no prazo) quando faltam datas', () => {
    expect(isCompletedOnTime({ status: 'done' })).toBe(true)
    expect(isCompletedOnTime({ status: 'done', due_date: null })).toBe(true)
  })
})

// ── isOverdue ─────────────────────────────────────────────────────────────────
describe('isOverdue', () => {
  const REF = new Date('2026-06-19')

  it('retorna false para tarefas concluídas ou canceladas', () => {
    expect(isOverdue({ status: 'done', due_date: '2026-01-01' }, REF)).toBe(false)
    expect(isOverdue({ status: 'cancelled', due_date: '2026-01-01' }, REF)).toBe(false)
  })

  it('retorna false quando não há due_date', () => {
    expect(isOverdue({ status: 'pending' }, REF)).toBe(false)
  })

  it('retorna true quando vencida e pendente', () => {
    expect(isOverdue({ status: 'pending', due_date: '2026-06-01' }, REF)).toBe(true)
  })

  it('retorna false quando prazo é hoje ou futuro', () => {
    expect(isOverdue({ status: 'pending', due_date: '2026-06-19' }, REF)).toBe(false)
    expect(isOverdue({ status: 'pending', due_date: '2026-12-31' }, REF)).toBe(false)
  })

  it('funciona com in_progress', () => {
    expect(isOverdue({ status: 'in_progress', due_date: '2026-05-01' }, REF)).toBe(true)
  })
})

// ── avgDelayDays ──────────────────────────────────────────────────────────────
describe('avgDelayDays', () => {
  it('retorna null quando não há tarefas atrasadas', () => {
    expect(avgDelayDays([])).toBeNull()
    expect(avgDelayDays([{ status: 'done', due_date: '2026-06-30', completed_at: '2026-06-10' }])).toBeNull()
  })

  it('calcula a média corretamente com 1 tarefa', () => {
    const tasks: TaskLike[] = [{ status: 'done', due_date: '2026-06-01', completed_at: '2026-06-11' }]
    expect(avgDelayDays(tasks)).toBe(10)
  })

  it('calcula a média corretamente com múltiplas tarefas', () => {
    const tasks: TaskLike[] = [
      { status: 'done', due_date: '2026-06-01', completed_at: '2026-06-11' }, // 10 days
      { status: 'done', due_date: '2026-06-01', completed_at: '2026-06-21' }, // 20 days
    ]
    expect(avgDelayDays(tasks)).toBe(15)
  })

  it('ignora tarefas sem due_date ou completed_at', () => {
    const tasks: TaskLike[] = [
      { status: 'done', due_date: '2026-06-01', completed_at: '2026-06-11' }, // 10 days late
      { status: 'done' }, // sem datas, ignorada
    ]
    expect(avgDelayDays(tasks)).toBe(10)
  })
})

// ── computeAgilityMetrics ─────────────────────────────────────────────────────
describe('computeAgilityMetrics', () => {
  const REF = new Date('2026-06-19')

  it('retorna zeros com lista vazia', () => {
    const m = computeAgilityMetrics([], REF)
    expect(m.onTime).toBe(0)
    expect(m.late).toBe(0)
    expect(m.pending).toBe(0)
    expect(m.overdue).toBe(0)
    expect(m.total).toBe(0)
    expect(m.score).toBe(0)
  })

  it('exclui tarefas canceladas do cálculo', () => {
    const tasks: TaskLike[] = [
      { status: 'cancelled', due_date: '2026-01-01', completed_at: '2026-01-02' },
    ]
    expect(computeAgilityMetrics(tasks, REF).total).toBe(0)
  })

  it('score = 100 quando todas concluídas no prazo', () => {
    const tasks: TaskLike[] = [
      { status: 'done', due_date: '2026-06-30', completed_at: '2026-06-10' },
      { status: 'done', due_date: '2026-06-30', completed_at: '2026-06-15' },
    ]
    expect(computeAgilityMetrics(tasks, REF).score).toBe(100)
  })

  it('score = 33 quando 1 concluída com atraso (1/3 de 3 max pts)', () => {
    const tasks: TaskLike[] = [
      { status: 'done', due_date: '2026-06-01', completed_at: '2026-06-10' }, // late = 1 pt de 3
    ]
    const m = computeAgilityMetrics(tasks, REF)
    expect(m.late).toBe(1)
    expect(m.onTime).toBe(0)
    expect(m.score).toBe(33) // 1/3 = 33%
  })

  it('conta corretamente pendentes e vencidas', () => {
    const tasks: TaskLike[] = [
      { status: 'pending', due_date: '2026-12-31' },   // pending (futuro)
      { status: 'pending', due_date: '2026-01-01' },   // overdue
      { status: 'in_progress', due_date: '2026-01-01' }, // overdue
    ]
    const m = computeAgilityMetrics(tasks, REF)
    expect(m.pending).toBe(1)
    expect(m.overdue).toBe(2)
  })

  it('score entre 0 e 100 em cenário misto', () => {
    const tasks: TaskLike[] = [
      { status: 'done', due_date: '2026-06-30', completed_at: '2026-06-10' }, // on time: 3pts
      { status: 'done', due_date: '2026-06-01', completed_at: '2026-06-10' }, // late: 1pt
      { status: 'pending', due_date: '2026-12-31' }, // pending: 0pt
    ]
    // earned = 4, max = 9 → 44%
    const m = computeAgilityMetrics(tasks, REF)
    expect(m.score).toBeGreaterThanOrEqual(0)
    expect(m.score).toBeLessThanOrEqual(100)
    expect(m.score).toBe(44)
  })
})

// ── agilityPerUser ────────────────────────────────────────────────────────────
describe('agilityPerUser', () => {
  const REF = new Date('2026-06-19')

  it('retorna lista vazia com tasks vazia', () => {
    expect(agilityPerUser([], REF)).toEqual([])
  })

  it('agrupa corretamente por usuário', () => {
    const tasks: TaskLike[] = [
      { status: 'done', assigned_to: 'u1', assigned_name: 'Ana', due_date: '2026-06-30', completed_at: '2026-06-10' },
      { status: 'done', assigned_to: 'u1', assigned_name: 'Ana', due_date: '2026-06-30', completed_at: '2026-06-15' },
      { status: 'done', assigned_to: 'u2', assigned_name: 'Bruno', due_date: '2026-06-01', completed_at: '2026-06-10' },
    ]
    const result = agilityPerUser(tasks, REF)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Ana')   // score 100
    expect(result[1].name).toBe('Bruno') // score 33
  })

  it('ordena por score decrescente', () => {
    const tasks: TaskLike[] = [
      { status: 'done', assigned_to: 'u1', assigned_name: 'Baixo', due_date: '2026-01-01', completed_at: '2026-06-01' },
      { status: 'done', assigned_to: 'u2', assigned_name: 'Alto', due_date: '2026-12-31', completed_at: '2026-06-01' },
    ]
    const result = agilityPerUser(tasks, REF)
    expect(result[0].name).toBe('Alto')
    expect(result[1].name).toBe('Baixo')
  })

  it('usa "Sem responsável" para tasks sem assigned_to', () => {
    const tasks: TaskLike[] = [
      { status: 'pending', due_date: '2026-12-31' },
    ]
    const result = agilityPerUser(tasks, REF)
    expect(result[0].name).toBe('Sem responsável')
  })
})

// ── overdueTasksByType ────────────────────────────────────────────────────────
describe('overdueTasksByType', () => {
  const REF = new Date('2026-06-19')

  it('retorna lista vazia sem tarefas vencidas', () => {
    const tasks: TaskLike[] = [{ status: 'pending', due_date: '2026-12-31' }]
    expect(overdueTasksByType(tasks, REF)).toEqual([])
  })

  it('conta e agrupa por tipo corretamente', () => {
    const tasks: TaskLike[] = [
      { status: 'pending', due_date: '2026-01-01', type: 'hearing' },
      { status: 'pending', due_date: '2026-01-01', type: 'hearing' },
      { status: 'pending', due_date: '2026-01-01', type: 'document' },
    ]
    const result = overdueTasksByType(tasks, REF)
    expect(result[0]).toEqual({ type: 'hearing', count: 2 })
    expect(result[1]).toEqual({ type: 'document', count: 1 })
  })

  it('usa "Sem tipo" para tasks sem type', () => {
    const tasks: TaskLike[] = [{ status: 'pending', due_date: '2026-01-01' }]
    const result = overdueTasksByType(tasks, REF)
    expect(result[0].type).toBe('Sem tipo')
  })

  it('ignora tarefas concluídas e canceladas', () => {
    const tasks: TaskLike[] = [
      { status: 'done', due_date: '2026-01-01', type: 'hearing' },
      { status: 'cancelled', due_date: '2026-01-01', type: 'hearing' },
    ]
    expect(overdueTasksByType(tasks, REF)).toEqual([])
  })
})

// ── scoreLabel ────────────────────────────────────────────────────────────────
describe('scoreLabel', () => {
  it('retorna "Excelente" para score >= 80', () => {
    expect(scoreLabel(100)).toBe('Excelente')
    expect(scoreLabel(80)).toBe('Excelente')
  })

  it('retorna "Bom" para score entre 60 e 79', () => {
    expect(scoreLabel(79)).toBe('Bom')
    expect(scoreLabel(60)).toBe('Bom')
  })

  it('retorna "Regular" para score entre 40 e 59', () => {
    expect(scoreLabel(59)).toBe('Regular')
    expect(scoreLabel(40)).toBe('Regular')
  })

  it('retorna "Atenção" para score abaixo de 40', () => {
    expect(scoreLabel(39)).toBe('Atenção')
    expect(scoreLabel(0)).toBe('Atenção')
  })
})

// ── scoreColorClass ───────────────────────────────────────────────────────────
describe('scoreColorClass', () => {
  it('contém "emerald" para score >= 80', () => {
    expect(scoreColorClass(100)).toContain('emerald')
  })

  it('contém "blue" para score entre 60 e 79', () => {
    expect(scoreColorClass(65)).toContain('blue')
  })

  it('contém "amber" para score entre 40 e 59', () => {
    expect(scoreColorClass(50)).toContain('amber')
  })

  it('contém "red" para score < 40', () => {
    expect(scoreColorClass(20)).toContain('red')
  })
})

// ── formatDelayDays ───────────────────────────────────────────────────────────
describe('formatDelayDays', () => {
  it('retorna "N/A" para null', () => {
    expect(formatDelayDays(null)).toBe('N/A')
  })

  it('retorna "Em dia" para 0', () => {
    expect(formatDelayDays(0)).toBe('Em dia')
  })

  it('retorna "1 dia" para 1', () => {
    expect(formatDelayDays(1)).toBe('1 dia')
  })

  it('retorna "X dias" para N > 1', () => {
    expect(formatDelayDays(5)).toBe('5 dias')
    expect(formatDelayDays(30)).toBe('30 dias')
  })
})

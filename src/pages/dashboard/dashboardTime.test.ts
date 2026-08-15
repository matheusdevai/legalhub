import { describe, it, expect, vi } from 'vitest'
import type { Task } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

import { timeAgo, taskTime } from './Dashboard'

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', tenant_id: 'ten1', title: 'Tarefa', description: null,
    process_id: null, client_id: null, assigned_to: null, assigned_name: null,
    due_date: null, priority: 'medium', status: 'pending', type: 'custom',
    location: null, all_day: false, deadline_date: null,
    created_at: null, updated_at: null, completed_at: null, deleted_at: null,
    recurring: false, recurrence_interval: null, recurrence_end_date: null,
    generated_from_id: null, created_by: null,
    ...overrides,
  }
}

describe('timeAgo', () => {
  it('retorna string vazia para data nula ou ausente', () => {
    expect(timeAgo(null)).toBe('')
    expect(timeAgo(undefined)).toBe('')
  })

  it('retorna "Agora" para menos de 1 minuto atrás', () => {
    expect(timeAgo(new Date(Date.now() - 10_000).toISOString())).toBe('Agora')
  })

  it('retorna minutos atrás dentro da mesma hora', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 minutos atrás')
  })

  it('retorna horas atrás dentro do mesmo dia', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3 horas atrás')
  })

  it('retorna "Ontem" para exatamente 1 dia atrás', () => {
    expect(timeAgo(new Date(Date.now() - 25 * 3_600_000).toISOString())).toBe('Ontem')
  })

  it('retorna "N dias atrás" para mais de 1 dia', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 86_400_000).toISOString())).toBe('5 dias atrás')
  })
})

describe('taskTime', () => {
  const today = new Date().toISOString().slice(0, 10)

  it('sem due_date, usa timeAgo(created_at) e nunca marca como atrasada', () => {
    const createdAt = new Date(Date.now() - 2 * 3_600_000).toISOString()
    const { label, isOverdue } = taskTime(baseTask({ due_date: null, created_at: createdAt }))
    expect(label).toBe('2 horas atrás')
    expect(isOverdue).toBe(false)
  })

  it('due_date hoje sem horário vira "Hoje", não atrasada', () => {
    const { label, isOverdue } = taskTime(baseTask({ due_date: today }))
    expect(label).toBe('Hoje')
    expect(isOverdue).toBe(false)
  })

  it('due_date hoje com horário mostra "Hoje HH:MM"', () => {
    const { label, isOverdue } = taskTime(baseTask({ due_date: `${today}T14:30:00` }))
    expect(label).toBe('Hoje 14:30')
    expect(isOverdue).toBe(false)
  })

  it('due_date no passado marca isOverdue e usa timeAgo(due_date)', () => {
    const pastDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
    const { label, isOverdue } = taskTime(baseTask({ due_date: pastDate }))
    expect(isOverdue).toBe(true)
    expect(label).toBe('3 dias atrás')
  })

  it('due_date no futuro mostra a data formatada, não atrasada', () => {
    const futureDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    const { isOverdue } = taskTime(baseTask({ due_date: futureDate }))
    expect(isOverdue).toBe(false)
  })
})

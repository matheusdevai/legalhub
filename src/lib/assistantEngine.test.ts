import { describe, it, expect } from 'vitest'
import {
  greetingForHour, daysBetween, buildAssistantOverview, buildAssistantAlerts,
  type EngineProcess, type EngineTask, type EngineEvent,
} from './assistantEngine'

const TODAY = '2026-09-08'

function process(overrides: Partial<EngineProcess>): EngineProcess {
  return {
    id: 'p1', number: '0001', title: 'Processo teste', client_name: 'Cliente A',
    next_deadline: null, priority: 'medium', status: 'active', ...overrides,
  }
}

function task(overrides: Partial<EngineTask>): EngineTask {
  return {
    id: 't1', title: 'Tarefa teste', due_date: null, priority: 'medium',
    status: 'pending', assigned_name: 'Dr. Fulano', client_id: null, ...overrides,
  }
}

function event(overrides: Partial<EngineEvent>): EngineEvent {
  return {
    id: 'e1', title: 'Evento teste', type: 'meeting', date: TODAY, time: '10:00',
    client_name: null, location: null, status: 'scheduled', ...overrides,
  }
}

describe('greetingForHour', () => {
  it('retorna Bom dia antes do meio-dia', () => {
    expect(greetingForHour(0)).toBe('Bom dia')
    expect(greetingForHour(11)).toBe('Bom dia')
  })
  it('retorna Boa tarde entre meio-dia e 18h', () => {
    expect(greetingForHour(12)).toBe('Boa tarde')
    expect(greetingForHour(17)).toBe('Boa tarde')
  })
  it('retorna Boa noite a partir das 18h', () => {
    expect(greetingForHour(18)).toBe('Boa noite')
    expect(greetingForHour(23)).toBe('Boa noite')
  })
})

describe('daysBetween', () => {
  it('calcula diferença em dias corridos', () => {
    expect(daysBetween('2026-09-08', '2026-09-11')).toBe(3)
    expect(daysBetween('2026-09-11', '2026-09-08')).toBe(-3)
    expect(daysBetween('2026-09-08', '2026-09-08')).toBe(0)
  })
})

describe('buildAssistantOverview', () => {
  it('classifica prazo vencido/hoje como crítico e prazo futuro (<=7d) como próximo', () => {
    const processes = [
      process({ id: 'overdue', next_deadline: '2026-09-05' }),
      process({ id: 'today', next_deadline: TODAY }),
      process({ id: 'soon', next_deadline: '2026-09-12' }),
      process({ id: 'far', next_deadline: '2026-09-20' }),
      process({ id: 'inactive', next_deadline: TODAY, status: 'archived' }),
    ]
    const overview = buildAssistantOverview(processes, [], [], TODAY)
    expect(overview.criticalDeadlines.map(p => p.id).sort()).toEqual(['overdue', 'today'])
    expect(overview.upcomingDeadlines.map(p => p.id)).toEqual(['soon'])
  })

  it('separa tarefas atrasadas de pendências (sem duplicar)', () => {
    const tasks = [
      task({ id: 'late', due_date: '2026-09-01', status: 'pending' }),
      task({ id: 'pending-no-date', due_date: null, status: 'pending' }),
      task({ id: 'pending-future', due_date: '2026-09-15', status: 'pending' }),
      task({ id: 'done', due_date: '2026-09-01', status: 'done' }),
      task({ id: 'in-progress-late', due_date: '2026-09-01', status: 'in_progress' }),
    ]
    const overview = buildAssistantOverview([], tasks, [], TODAY)
    expect(overview.overdueTasks.map(t => t.id).sort()).toEqual(['in-progress-late', 'late'])
    expect(overview.pendingTasks.map(t => t.id).sort()).toEqual(['pending-future', 'pending-no-date'])
  })

  it('filtra compromissos de hoje ignorando cancelados', () => {
    const events = [
      event({ id: 'today1', date: TODAY }),
      event({ id: 'cancelled', date: TODAY, status: 'cancelled' }),
      event({ id: 'tomorrow', date: '2026-09-09' }),
    ]
    const overview = buildAssistantOverview([], [], events, TODAY)
    expect(overview.todayEvents.map(e => e.id)).toEqual(['today1'])
  })

  it('identifica processos que exigem atenção por prioridade alta/urgente', () => {
    const processes = [
      process({ id: 'urgent', priority: 'urgent' }),
      process({ id: 'high', priority: 'high' }),
      process({ id: 'medium', priority: 'medium' }),
      process({ id: 'urgent-archived', priority: 'urgent', status: 'archived' }),
    ]
    const overview = buildAssistantOverview(processes, [], [], TODAY)
    expect(overview.attentionProcesses.map(p => p.id).sort()).toEqual(['high', 'urgent'])
  })
})

describe('buildAssistantAlerts', () => {
  it('agrupa prazo vencido e tarefa atrasada como urgente', () => {
    const processes = [process({ id: 'p-overdue', next_deadline: '2026-09-05' })]
    const tasks = [task({ id: 't-late', due_date: '2026-09-06', status: 'pending' })]
    const overview = buildAssistantOverview(processes, tasks, [], TODAY)
    const alerts = buildAssistantAlerts(overview, TODAY)
    expect(alerts.urgente.map(a => a.id).sort()).toEqual(['deadline-critical-p-overdue', 'task-overdue-t-late'])
  })

  it('classifica prazo próximo em importante (<=3d) ou atenção (4-7d)', () => {
    const processes = [
      process({ id: 'p-soon', next_deadline: '2026-09-10' }),
      process({ id: 'p-later', next_deadline: '2026-09-14' }),
    ]
    const overview = buildAssistantOverview(processes, [], [], TODAY)
    const alerts = buildAssistantAlerts(overview, TODAY)
    expect(alerts.importante.map(a => a.id)).toEqual(['deadline-upcoming-p-soon'])
    expect(alerts.atencao.map(a => a.id)).toEqual(['deadline-upcoming-p-later'])
  })

  it('nunca duplica um processo já contado como prazo crítico/próximo na lista de prioridade', () => {
    const processes = [process({ id: 'p1', next_deadline: TODAY, priority: 'urgent' })]
    const overview = buildAssistantOverview(processes, [], [], TODAY)
    const alerts = buildAssistantAlerts(overview, TODAY)
    const allIds = [...alerts.urgente, ...alerts.importante, ...alerts.atencao, ...alerts.informativo].map(a => a.id)
    expect(allIds.filter(id => id.includes('p1'))).toEqual(['deadline-critical-p1'])
  })

  it('ordena itens dentro de cada categoria por data mais próxima primeiro', () => {
    const processes = [
      process({ id: 'p-far', next_deadline: '2026-09-14' }),
      process({ id: 'p-near', next_deadline: '2026-09-12' }),
    ]
    const overview = buildAssistantOverview(processes, [], [], TODAY)
    const alerts = buildAssistantAlerts(overview, TODAY)
    expect(alerts.atencao.map(a => a.id)).toEqual(['deadline-upcoming-p-near', 'deadline-upcoming-p-far'])
  })

  it('audiência de hoje é importante; outros compromissos de hoje são informativos', () => {
    const events = [
      event({ id: 'hearing', type: 'hearing' }),
      event({ id: 'meeting', type: 'meeting' }),
    ]
    const overview = buildAssistantOverview([], [], events, TODAY)
    const alerts = buildAssistantAlerts(overview, TODAY)
    expect(alerts.importante.map(a => a.id)).toEqual(['event-today-hearing'])
    expect(alerts.informativo.map(a => a.id)).toEqual(['event-today-meeting'])
  })
})

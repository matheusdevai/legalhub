import type { Process, Task, CalendarEvent } from '@/types'

// Camada de classificação do LegalHub Assistente (fundação — milestone 1).
// Puramente determinística (sem chamada a IA): agrega dados já existentes em
// processes/tasks/calendar_events e classifica por regras de urgência/prazo.
//
// TODO (próxima fatia): quando a Caixa de Entrada existir, "clientes aguardando
// resposta" e possivelmente "documentos pendentes" passam a ter fonte de dado
// real e devem ganhar suas próprias regras aqui em vez de ficarem "em breve".

export type EngineProcess = Pick<Process, 'id' | 'number' | 'title' | 'client_name' | 'next_deadline' | 'priority' | 'status'>
export type EngineTask = Pick<Task, 'id' | 'title' | 'due_date' | 'priority' | 'status' | 'assigned_name' | 'client_id'>
export type EngineEvent = Pick<CalendarEvent, 'id' | 'title' | 'type' | 'date' | 'time' | 'client_name' | 'location' | 'status'>

export interface AssistantOverview {
  criticalDeadlines: EngineProcess[]
  upcomingDeadlines: EngineProcess[]
  pendingTasks: EngineTask[]
  overdueTasks: EngineTask[]
  todayEvents: EngineEvent[]
  attentionProcesses: EngineProcess[]
}

export type AlertCategory = 'urgente' | 'importante' | 'atencao' | 'informativo'

export interface AlertItem {
  id: string
  category: AlertCategory
  title: string
  subtitle?: string
  link: string
  /** ISO date (ou date+time) usada só para ordenar dentro da categoria; null ordena por último */
  sortDate: string | null
}

const OPEN_TASK_STATUSES: Array<Task['status']> = ['pending', 'in_progress']
const UPCOMING_DEADLINE_WINDOW_DAYS = 7
const IMPORTANT_WITHIN_DAYS = 3

export function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO + 'T00:00:00')
  const to = new Date(toISO + 'T00:00:00')
  return Math.round((to.getTime() - from.getTime()) / 86400000)
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function buildAssistantOverview(
  processes: EngineProcess[],
  tasks: EngineTask[],
  events: EngineEvent[],
  todayISO: string,
): AssistantOverview {
  const activeProcesses = processes.filter(p => p.status === 'active')

  const criticalDeadlines = activeProcesses.filter(p => !!p.next_deadline && p.next_deadline <= todayISO)
  const upcomingDeadlines = activeProcesses.filter(p => {
    if (!p.next_deadline || p.next_deadline <= todayISO) return false
    return daysBetween(todayISO, p.next_deadline) <= UPCOMING_DEADLINE_WINDOW_DAYS
  })

  const overdueTasks = tasks.filter(t =>
    OPEN_TASK_STATUSES.includes(t.status) && !!t.due_date && t.due_date < todayISO
  )
  const overdueIds = new Set(overdueTasks.map(t => t.id))
  const pendingTasks = tasks.filter(t => t.status === 'pending' && !overdueIds.has(t.id))

  const todayEvents = events.filter(e => e.date === todayISO && e.status !== 'cancelled')

  const attentionProcesses = activeProcesses.filter(p => p.priority === 'high' || p.priority === 'urgent')

  return { criticalDeadlines, upcomingDeadlines, pendingTasks, overdueTasks, todayEvents, attentionProcesses }
}

const CATEGORY_ORDER: AlertCategory[] = ['urgente', 'importante', 'atencao', 'informativo']

export function buildAssistantAlerts(overview: AssistantOverview, todayISO: string): Record<AlertCategory, AlertItem[]> {
  const items: AlertItem[] = []

  for (const p of overview.criticalDeadlines) {
    const overdue = !!p.next_deadline && p.next_deadline < todayISO
    items.push({
      id: `deadline-critical-${p.id}`,
      category: 'urgente',
      title: `Prazo: ${p.title || p.number}`,
      subtitle: [p.client_name, overdue ? 'Prazo vencido' : 'Vence hoje'].filter(Boolean).join(' · '),
      link: '/processos',
      sortDate: p.next_deadline,
    })
  }

  for (const t of overview.overdueTasks) {
    const days = t.due_date ? daysBetween(t.due_date, todayISO) : 0
    items.push({
      id: `task-overdue-${t.id}`,
      category: 'urgente',
      title: t.title,
      subtitle: [t.assigned_name, `Atrasada há ${days} dia${days === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
      link: '/tarefas',
      sortDate: t.due_date,
    })
  }

  for (const p of overview.upcomingDeadlines) {
    const days = daysBetween(todayISO, p.next_deadline as string)
    items.push({
      id: `deadline-upcoming-${p.id}`,
      category: days <= IMPORTANT_WITHIN_DAYS ? 'importante' : 'atencao',
      title: `Prazo: ${p.title || p.number}`,
      subtitle: [p.client_name, `Vence em ${days} dia${days === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
      link: '/processos',
      sortDate: p.next_deadline,
    })
  }

  const alreadyFlagged = new Set([...overview.criticalDeadlines, ...overview.upcomingDeadlines].map(p => p.id))
  for (const p of overview.attentionProcesses) {
    if (alreadyFlagged.has(p.id)) continue
    items.push({
      id: `process-priority-${p.id}`,
      category: p.priority === 'urgent' ? 'importante' : 'atencao',
      title: p.title || `Processo ${p.number}`,
      subtitle: [p.client_name, p.priority === 'urgent' ? 'Prioridade urgente' : 'Prioridade alta'].filter(Boolean).join(' · '),
      link: '/processos',
      sortDate: null,
    })
  }

  for (const e of overview.todayEvents) {
    items.push({
      id: `event-today-${e.id}`,
      category: e.type === 'hearing' ? 'importante' : 'informativo',
      title: e.title,
      subtitle: [e.client_name, e.time ? e.time.slice(0, 5) : null, e.location].filter(Boolean).join(' · '),
      link: '/agenda',
      sortDate: `${e.date}T${e.time || '00:00'}`,
    })
  }

  for (const t of overview.pendingTasks) {
    const days = t.due_date ? daysBetween(todayISO, t.due_date) : null
    items.push({
      id: `task-pending-${t.id}`,
      category: days !== null && days <= IMPORTANT_WITHIN_DAYS ? 'atencao' : 'informativo',
      title: t.title,
      subtitle: [t.assigned_name, t.due_date ? `Vence em ${days} dia${days === 1 ? '' : 's'}` : 'Sem prazo definido'].filter(Boolean).join(' · '),
      link: '/tarefas',
      sortDate: t.due_date,
    })
  }

  const grouped: Record<AlertCategory, AlertItem[]> = { urgente: [], importante: [], atencao: [], informativo: [] }
  for (const item of items) grouped[item.category].push(item)
  for (const cat of CATEGORY_ORDER) {
    grouped[cat].sort((a, b) => {
      if (a.sortDate === b.sortDate) return 0
      if (!a.sortDate) return 1
      if (!b.sortDate) return -1
      return a.sortDate < b.sortDate ? -1 : 1
    })
  }
  return grouped
}

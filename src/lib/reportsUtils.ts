// Pure utility functions for ReportsPage — no React/DOM dependencies

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled'

export interface TaskLike {
  status: TaskStatus
  due_date?: string | null
  completed_at?: string | null
  assigned_to?: string | null
  assigned_name?: string | null
  title?: string
  type?: string
}

export interface AgilityMetrics {
  onTime: number
  late: number
  pending: number
  overdue: number
  total: number
  /** 0–100 integer score */
  score: number
}

/** Returns true when a done task was completed before its due date */
export function isCompletedOnTime(task: TaskLike): boolean {
  if (task.status !== 'done') return false
  if (!task.due_date || !task.completed_at) return true // no dates → assume on time
  return new Date(task.completed_at) <= new Date(task.due_date)
}

/** Returns true when a pending/in_progress task is already past its due date */
export function isOverdue(task: TaskLike, referenceDate = new Date()): boolean {
  if (task.status === 'done' || task.status === 'cancelled') return false
  if (!task.due_date) return false
  return new Date(task.due_date) < referenceDate
}

/**
 * Average delay in days for tasks completed after their due date.
 * Returns null when there are no late completions.
 */
export function avgDelayDays(tasks: TaskLike[]): number | null {
  const lateTasks = tasks.filter(t => t.status === 'done' && t.due_date && t.completed_at && new Date(t.completed_at) > new Date(t.due_date))
  if (lateTasks.length === 0) return null
  const totalDays = lateTasks.reduce((sum, t) => {
    const diff = new Date(t.completed_at!).getTime() - new Date(t.due_date!).getTime()
    return sum + diff / (1000 * 60 * 60 * 24)
  }, 0)
  return Math.round(totalDays / lateTasks.length)
}

/**
 * Computes agility metrics from a list of tasks.
 * Score formula: (3 × onTime + 1 × late) / (3 × (done + overdue + pending)) × 100
 * Cancelled tasks are excluded entirely.
 */
export function computeAgilityMetrics(tasks: TaskLike[], referenceDate = new Date()): AgilityMetrics {
  const active = tasks.filter(t => t.status !== 'cancelled')
  const onTime = active.filter(t => isCompletedOnTime(t)).length
  const late = active.filter(t => t.status === 'done' && !isCompletedOnTime(t)).length
  const overdue = active.filter(t => isOverdue(t, referenceDate)).length
  const pending = active.filter(t => (t.status === 'pending' || t.status === 'in_progress') && !isOverdue(t, referenceDate)).length
  const total = active.length

  const maxPoints = 3 * total
  const earned = 3 * onTime + 1 * late
  const score = maxPoints === 0 ? 0 : Math.round((earned / maxPoints) * 100)

  return { onTime, late, pending, overdue, total, score }
}

/** Groups tasks by assigned_to and returns sorted agility per user */
export function agilityPerUser(tasks: TaskLike[], referenceDate = new Date()): Array<{ userId: string; name: string; metrics: AgilityMetrics }> {
  const map = new Map<string, { name: string; tasks: TaskLike[] }>()
  for (const t of tasks) {
    const key = t.assigned_to || '__none__'
    if (!map.has(key)) map.set(key, { name: t.assigned_name || 'Sem responsável', tasks: [] })
    map.get(key)!.tasks.push(t)
  }
  return Array.from(map.entries())
    .map(([userId, { name, tasks: userTasks }]) => ({
      userId,
      name,
      metrics: computeAgilityMetrics(userTasks, referenceDate),
    }))
    .sort((a, b) => b.metrics.score - a.metrics.score)
}

/** Counts tasks by their `type` field and returns sorted descending */
export function overdueTasksByType(tasks: TaskLike[], referenceDate = new Date()): Array<{ type: string; count: number }> {
  const overdueTasks = tasks.filter(t => isOverdue(t, referenceDate))
  const map = new Map<string, number>()
  for (const t of overdueTasks) {
    const key = t.type || 'Sem tipo'
    map.set(key, (map.get(key) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
}

/** Task score label based on numeric score */
export function scoreLabel(score: number): string {
  if (score >= 80) return 'Excelente'
  if (score >= 60) return 'Bom'
  if (score >= 40) return 'Regular'
  return 'Atenção'
}

/** Task score color class based on numeric score */
export function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
  if (score >= 60) return 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
  if (score >= 40) return 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
  return 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
}

/** Format delay duration in days to human-readable PT-BR */
export function formatDelayDays(days: number | null): string {
  if (days === null) return 'N/A'
  if (days === 0) return 'Em dia'
  if (days === 1) return '1 dia'
  return `${days} dias`
}

import { toLocalISODate } from './utils'

/** Início do dia local (meia-noite no fuso do navegador) em ISO/UTC, para filtrar timestamptz. */
export function startOfLocalDayISO(d: Date = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

/** Dia local (YYYY-MM-DD) em que uma tarefa foi concluída — não o dia UTC. */
export function completionDayKey(completedAt: string): string {
  return toLocalISODate(new Date(completedAt))
}

/** Mês local (YYYY-MM) em que uma tarefa foi concluída. */
export function completionMonthKey(completedAt: string): string {
  return completionDayKey(completedAt).slice(0, 7)
}

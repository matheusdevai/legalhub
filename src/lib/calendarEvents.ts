import type { CalendarEvent } from '@/types'

export const CALENDAR_TYPE_LABELS: Record<string, string> = {
  hearing: 'Audiência', deadline: 'Prazo', meeting: 'Reunião', task: 'Tarefa',
}

export const CALENDAR_TYPE_DOT: Record<string, string> = {
  hearing: 'bg-red-500', deadline: 'bg-orange-500', meeting: 'bg-blue-500', task: 'bg-green-500',
}

/**
 * Compromissos de um dia (YYYY-MM-DD), como a visão de mês da Agenda mostra:
 * todos os eventos com aquela data, inclusive realizados. Ordem: dia inteiro
 * (sem horário) primeiro, depois por horário e título.
 */
export function dayAgenda<T extends Pick<CalendarEvent, 'date' | 'time' | 'title'>>(events: T[], day: string): T[] {
  return events
    .filter(e => (e.date || '').slice(0, 10) === day)
    .sort((a, b) => {
      if (!a.time !== !b.time) return a.time ? 1 : -1
      return (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title, 'pt-BR')
    })
}

/** Dias (YYYY-MM-DD) que têm ao menos um compromisso — para marcar no mini-calendário. */
export function daysWithEvents(events: Pick<CalendarEvent, 'date'>[]): Set<string> {
  return new Set(events.map(e => (e.date || '').slice(0, 10)).filter(Boolean))
}

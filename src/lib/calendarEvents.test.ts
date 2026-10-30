import { describe, expect, it } from 'vitest'
import { dayAgenda, daysWithEvents } from './calendarEvents'

const ev = (title: string, date: string, time: string | null) => ({ title, date, time })

describe('dayAgenda', () => {
  const events = [
    ev('Reunião com cliente', '2026-10-29', '16:00'),
    ev('Prazo: réplica', '2026-10-29', null),
    ev('Audiência', '2026-10-29', '09:30'),
    ev('Outro dia', '2026-10-30', '08:00'),
  ]

  it('mostra só os compromissos do dia, dia inteiro primeiro e depois por horário', () => {
    expect(dayAgenda(events, '2026-10-29').map(e => e.title)).toEqual(['Prazo: réplica', 'Audiência', 'Reunião com cliente'])
  })

  it('aceita data com horário embutido (timestamp)', () => {
    expect(dayAgenda([ev('X', '2026-10-30T00:00:00', null)], '2026-10-30')).toHaveLength(1)
  })

  it('dia sem compromissos devolve lista vazia', () => {
    expect(dayAgenda(events, '2026-11-01')).toEqual([])
  })

  it('mesmo horário: ordena pelo título', () => {
    expect(dayAgenda([ev('B', '2026-10-29', '10:00'), ev('A', '2026-10-29', '10:00')], '2026-10-29').map(e => e.title)).toEqual(['A', 'B'])
  })
})

describe('daysWithEvents', () => {
  it('lista os dias que têm compromisso', () => {
    expect([...daysWithEvents([ev('a', '2026-10-29', null), ev('b', '2026-10-29', '10:00'), ev('c', '2026-10-31', null)])].sort())
      .toEqual(['2026-10-29', '2026-10-31'])
  })
})

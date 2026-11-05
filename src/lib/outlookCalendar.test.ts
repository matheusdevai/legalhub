import { describe, expect, it } from 'vitest'
import { graphEventToRow, planOutlookImport, rowToGraphEvent, type GraphEvent } from './outlookCalendar'

// Formato do Microsoft Graph /me/calendarView pedido com
// Prefer: outlook.timezone="America/Sao_Paulo" (dateTime sem offset, já local).
const meeting: GraphEvent = {
  id: 'AAMk-1',
  subject: 'Audiência de conciliação',
  start: { dateTime: '2026-11-10T14:00:00.0000000', timeZone: 'America/Sao_Paulo' },
  end: { dateTime: '2026-11-10T15:30:00.0000000', timeZone: 'America/Sao_Paulo' },
  location: { displayName: 'Fórum Cível' },
  bodyPreview: 'Levar procuração',
}

describe('Graph → calendar_events', () => {
  it('evento com hora usa o horário local de Brasília', () => {
    expect(graphEventToRow(meeting)).toEqual({
      title: 'Audiência de conciliação', date: '2026-11-10', time: '14:00', end_date: '2026-11-10', end_time: '15:30',
      location: 'Fórum Cível', description: 'Levar procuração',
    })
  })

  it('dia inteiro: o fim do Graph é exclusivo (00:00 do dia seguinte)', () => {
    const r = graphEventToRow({ id: 'x', subject: 'Feriado', isAllDay: true, start: { dateTime: '2026-11-20T00:00:00.0000000' }, end: { dateTime: '2026-11-21T00:00:00.0000000' } })
    expect(r).toMatchObject({ date: '2026-11-20', time: null, end_date: null, end_time: null })
    const multi = graphEventToRow({ id: 'y', subject: 'Viagem', isAllDay: true, start: { dateTime: '2026-11-20T00:00:00' }, end: { dateTime: '2026-11-23T00:00:00' } })
    expect(multi).toMatchObject({ date: '2026-11-20', end_date: '2026-11-22' })
  })

  it('sem título / sem data', () => {
    expect(graphEventToRow({ id: 'z', subject: '  ', start: { dateTime: '2026-11-10T09:00:00' } })?.title).toBe('Sem título')
    expect(graphEventToRow({ id: 'z' })).toBeNull()
  })
})

describe('calendar_events → Graph', () => {
  it('com hora: fuso de Brasília e 1h de duração quando não há término', () => {
    const g = rowToGraphEvent({ title: 'Reunião', date: '2026-11-10', time: '09:30' })
    expect(g.start).toEqual({ dateTime: '2026-11-10T09:30:00', timeZone: 'America/Sao_Paulo' })
    expect(g.end).toEqual({ dateTime: '2026-11-10T10:30:00', timeZone: 'America/Sao_Paulo' })
    expect(g.isAllDay).toBe(false)
  })

  it('evento às 23h30 sem término termina no dia seguinte', () => {
    expect(rowToGraphEvent({ title: 'X', date: '2026-11-10', time: '23:30' }).end).toEqual({ dateTime: '2026-11-11T00:30:00', timeZone: 'America/Sao_Paulo' })
  })

  it('sem hora = dia inteiro, com fim exclusivo', () => {
    const g = rowToGraphEvent({ title: 'Prazo', date: '2026-11-27' })
    expect(g.isAllDay).toBe(true)
    expect(g.start.dateTime).toBe('2026-11-27T00:00:00')
    expect(g.end.dateTime).toBe('2026-11-28T00:00:00')
  })
})

describe('importação sem duplicar', () => {
  const existing = [
    { id: 'l1', title: 'Audiência de conciliação', date: '2026-11-10', time: '14:00', outlook_event_id: 'AAMk-1' },
    { id: 'l2', title: 'Reunião com cliente', date: '2026-11-12', time: '10:00', google_event_id: 'g-9' },
    { id: 'l3', title: 'Perícia', date: '2026-11-15', time: null, outlook_event_id: 'AAMk-3' },
  ]

  it('já importado e igual → nada; mudou no Outlook → atualiza; cancelado lá → remove aqui', () => {
    const plan = planOutlookImport(existing, [
      meeting,
      { id: 'AAMk-3', subject: 'Perícia', start: { dateTime: '2026-11-16T08:00:00' }, end: { dateTime: '2026-11-16T09:00:00' } },
    ])
    expect(plan.toInsert).toHaveLength(0)
    expect(plan.toUpdate).toEqual([{ id: 'l3', row: expect.objectContaining({ date: '2026-11-16', time: '08:00' }) }])
    expect(planOutlookImport(existing, [{ ...meeting, isCancelled: true }]).toDelete).toEqual(['l1'])
  })

  it('mesmo compromisso que já veio do Google (título/dia/hora, sem acento/caixa) não duplica', () => {
    const plan = planOutlookImport(existing, [{ id: 'AAMk-new', subject: 'REUNIÃO  com cliente', start: { dateTime: '2026-11-12T10:00:00' } }])
    expect(plan.toInsert).toHaveLength(0)
    expect(plan.duplicates).toBe(1)
  })

  it('evento novo entra uma vez só, mesmo se vier repetido na resposta', () => {
    const ev = { id: 'AAMk-9', subject: 'Despacho com juiz', start: { dateTime: '2026-11-18T11:00:00' } }
    const plan = planOutlookImport(existing, [ev, { ...ev, id: 'AAMk-9b' }])
    expect(plan.toInsert).toHaveLength(1)
    expect(plan.toInsert[0]).toMatchObject({ outlook_event_id: 'AAMk-9', date: '2026-11-18', time: '11:00' })
  })

  it('cancelado que nunca foi importado é ignorado', () => {
    expect(planOutlookImport(existing, [{ id: 'nunca', isCancelled: true, start: { dateTime: '2026-11-18T11:00:00' } }])).toMatchObject({ toInsert: [], toDelete: [] })
  })
})

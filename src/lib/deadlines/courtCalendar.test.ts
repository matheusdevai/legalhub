import { describe, expect, it } from 'vitest'
import { calendarForProcess, calendarVersion, type CourtCalendarRow } from './courtCalendar'
import { calculateDeadline } from './engine'

const row = (o: Partial<CourtCalendarRow>): CourtCalendarRow => ({
  scope: 'court', court: 'tjpb', county: null, date_from: '2026-11-05', date_to: '2026-11-05',
  kind: 'holiday', label: 'Feriado', source_ref: 'Portaria 1/2026', version: 1, ...o,
})

describe('calendarForProcess', () => {
  it('aplica o tribunal todo, a comarca do processo e o nacional — e ignora outros tribunais e comarcas', () => {
    const rows = [
      row({ label: 'tribunal todo' }),
      row({ county: 'João Pessoa', label: 'da comarca', date_from: '2026-11-06', date_to: '2026-11-06' }),
      row({ county: 'Campina Grande', label: 'outra comarca', date_from: '2026-11-09', date_to: '2026-11-09' }),
      row({ court: 'trt13', label: 'outro tribunal', date_from: '2026-11-10', date_to: '2026-11-10' }),
      row({ scope: 'national', court: null, label: 'nacional', date_from: '2026-11-11', date_to: '2026-11-11' }),
    ]
    const labels = calendarForProcess(rows, { court: 'TJPB', county: 'joão pessoa' }).map(e => e.label)
    expect(labels.sort()).toEqual(['da comarca', 'nacional', 'tribunal todo'])
  })

  it('abre períodos dia a dia (ex.: suspensão de 3 dias)', () => {
    const days = calendarForProcess([row({ kind: 'suspension', date_from: '2026-11-09', date_to: '2026-11-11' })], { court: 'tjpb' })
    expect(days.map(d => d.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11'])
  })

  it('entra no cálculo: feriado local do tribunal adia o vencimento', () => {
    const calendar = calendarForProcess([row({})], { court: 'tjpb' })
    expect(calculateDeadline({ regime: 'civel', startEvent: 'djen', eventDate: '2026-10-29', amount: 15, calendar }).fatalDate).toBe('2026-11-25')
  })
})

describe('calendarVersion', () => {
  it('muda quando o calendário muda e não depende da ordem', () => {
    const a = [row({}), row({ date_from: '2026-11-06', date_to: '2026-11-06' })]
    expect(calendarVersion(a)).toBe(calendarVersion([...a].reverse()))
    expect(calendarVersion(a)).not.toBe(calendarVersion([a[0]]))
    expect(calendarVersion(a)).not.toBe(calendarVersion([a[0], { ...a[1], version: 2 }]))
  })
})

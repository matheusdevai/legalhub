import { describe, it, expect } from 'vitest'
import { addBusinessDays, addCalendarDays, computePrazo } from './prazoUtils'

function iso(d: Date) { return d.toISOString().slice(0, 10) }

describe('addBusinessDays', () => {
  it('pula fim de semana ao somar dias úteis', () => {
    // 2026-07-24 é sexta-feira
    const r = addBusinessDays(new Date('2026-07-24T12:00:00'), 1)
    expect(iso(r)).toBe('2026-07-27') // segunda-feira
  })

  it('soma 15 dias úteis corretamente cruzando dois fins de semana', () => {
    // 2026-07-24 é sexta-feira
    const r = addBusinessDays(new Date('2026-07-24T12:00:00'), 15)
    expect(iso(r)).toBe('2026-08-14')
  })

  it('0 dias úteis retorna a mesma data', () => {
    const base = new Date('2026-07-24T12:00:00')
    expect(iso(addBusinessDays(base, 0))).toBe(iso(base))
  })

  it('partindo de um sábado, conta o próximo dia útil como segunda', () => {
    // 2026-07-25 é sábado
    const r = addBusinessDays(new Date('2026-07-25T12:00:00'), 1)
    expect(iso(r)).toBe('2026-07-27')
  })
})

describe('addCalendarDays', () => {
  it('soma dias corridos incluindo fins de semana', () => {
    const r = addCalendarDays(new Date('2026-07-24T12:00:00'), 15)
    expect(iso(r)).toBe('2026-08-08')
  })
})

describe('computePrazo', () => {
  it('unidade "uteis" delega para addBusinessDays', () => {
    const base = new Date('2026-07-24T12:00:00')
    expect(iso(computePrazo(base, 15, 'uteis'))).toBe(iso(addBusinessDays(base, 15)))
  })
  it('unidade "corridos" delega para addCalendarDays', () => {
    const base = new Date('2026-07-24T12:00:00')
    expect(iso(computePrazo(base, 15, 'corridos'))).toBe(iso(addCalendarDays(base, 15)))
  })
})

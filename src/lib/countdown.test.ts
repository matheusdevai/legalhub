import { describe, expect, it } from 'vitest'
import { timeLeft } from './countdown'
import { EBOOK_PROMO_END } from './promoUtils'

const end = new Date('2026-11-23T00:00:00.000Z')

describe('timeLeft', () => {
  it('faltando 13 dias exatos', () => {
    const r = timeLeft(end, new Date('2026-11-10T00:00:00.000Z'))
    expect(r).toMatchObject({ days: 13, hours: 0, minutes: 0, seconds: 0, expired: false })
    expect(r.totalMs).toBe(13 * 24 * 3600 * 1000)
  })

  it('quebra em dias, horas, minutos e segundos', () => {
    const r = timeLeft(end, new Date('2026-11-10T20:28:51.000Z'))
    expect(r).toMatchObject({ days: 12, hours: 3, minutes: 31, seconds: 9, expired: false })
  })

  it('falta 1 segundo', () => {
    expect(timeLeft(end, new Date('2026-11-22T23:59:59.000Z'))).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 1, expired: false })
  })

  it('fração de segundo ainda conta como 1 segundo (nunca mostra 0 enquanto não acabou)', () => {
    const r = timeLeft(end, new Date('2026-11-22T23:59:59.400Z'))
    expect(r.seconds).toBe(1)
    expect(r.expired).toBe(false)
  })

  it('no instante do fim: zerado e expirado', () => {
    expect(timeLeft(end, end)).toEqual({ totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, expired: true })
  })

  it('depois do fim nunca fica negativo', () => {
    const r = timeLeft(end, new Date('2026-12-25T10:00:00.000Z'))
    expect(r).toEqual({ totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, expired: true })
  })

  it('aceita string/número e trata data inválida como expirada', () => {
    expect(timeLeft(EBOOK_PROMO_END, Date.parse('2026-11-22T23:59:58.000Z')).seconds).toBe(2)
    expect(timeLeft('lixo', Date.now()).expired).toBe(true)
  })
})

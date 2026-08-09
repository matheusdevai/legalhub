import { describe, it, expect } from 'vitest'
import { nextRecurrenceDueDate } from './taskActions'

describe('nextRecurrenceDueDate', () => {
  it('soma 7 dias para recorrência semanal', () => {
    expect(nextRecurrenceDueDate('2026-07-20', 'weekly')).toBe('2026-07-27')
  })

  it('soma 1 mês para recorrência mensal', () => {
    expect(nextRecurrenceDueDate('2026-07-20', 'monthly')).toBe('2026-08-20')
  })

  it('lida com virada de ano na recorrência mensal', () => {
    expect(nextRecurrenceDueDate('2026-12-20', 'monthly')).toBe('2027-01-20')
  })

  it('retorna null para intervalo desconhecido', () => {
    expect(nextRecurrenceDueDate('2026-07-20', null)).toBeNull()
    expect(nextRecurrenceDueDate('2026-07-20', 'daily')).toBeNull()
  })

  it('retorna null para data inválida', () => {
    expect(nextRecurrenceDueDate('not-a-date', 'weekly')).toBeNull()
  })
})

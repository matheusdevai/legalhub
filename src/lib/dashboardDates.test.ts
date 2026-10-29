import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completionDayKey, completionMonthKey, startOfLocalDayISO } from './dashboardDates'

describe('dashboardDates (fuso de Brasília)', () => {
  beforeEach(() => { vi.stubEnv('TZ', 'America/Sao_Paulo') })
  afterEach(() => { vi.unstubAllEnvs() })

  it('conclusão às 22h de Brasília conta no próprio dia, não no dia UTC seguinte', () => {
    // 22h de 29/10 em Brasília = 01h de 30/10 em UTC
    expect(completionDayKey('2026-10-30T01:00:00.000Z')).toBe('2026-10-29')
  })

  it('conclusão às 22h do último dia do mês conta no mês certo', () => {
    expect(completionMonthKey('2026-11-01T01:00:00.000Z')).toBe('2026-10')
  })

  it('início do dia é a meia-noite local', () => {
    // 29/10 23h em Brasília → hoje começa 29/10 00:00 BRT = 03:00 UTC
    expect(startOfLocalDayISO(new Date('2026-10-30T02:00:00.000Z'))).toBe('2026-10-29T03:00:00.000Z')
  })
})

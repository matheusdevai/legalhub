import { describe, it, expect } from 'vitest'
import { tenantAccess } from './billingStatus'

const NOW = new Date('2026-10-26T12:00:00Z')

describe('tenantAccess', () => {
  it('escritório sem assinatura (anterior ao billing) fica liberado', () => {
    expect(tenantAccess(null, NOW)).toEqual({ readOnly: false, trialDaysLeft: null })
  })

  it('assinatura ativa ou com pagamento pendente fica liberada', () => {
    expect(tenantAccess({ status: 'active', current_period_end: '2026-01-01T00:00:00Z' }, NOW).readOnly).toBe(false)
    expect(tenantAccess({ status: 'past_due', current_period_end: '2026-01-01T00:00:00Z' }, NOW).readOnly).toBe(false)
  })

  it('teste em andamento informa os dias restantes arredondados pra cima', () => {
    expect(tenantAccess({ status: 'trialing', current_period_end: '2026-11-09T12:00:00Z' }, NOW)).toEqual({ readOnly: false, trialDaysLeft: 14 })
    expect(tenantAccess({ status: 'trialing', current_period_end: '2026-10-26T13:00:00Z' }, NOW)).toEqual({ readOnly: false, trialDaysLeft: 1 })
  })

  it('teste vencido vira somente leitura', () => {
    expect(tenantAccess({ status: 'trialing', current_period_end: '2026-10-26T11:59:00Z' }, NOW)).toEqual({ readOnly: true, trialDaysLeft: null })
  })

  it('assinatura cancelada ou incompleta vira somente leitura', () => {
    expect(tenantAccess({ status: 'canceled', current_period_end: null }, NOW).readOnly).toBe(true)
    expect(tenantAccess({ status: 'incomplete', current_period_end: null }, NOW).readOnly).toBe(true)
  })
})

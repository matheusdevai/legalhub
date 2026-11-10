import { describe, it, expect } from 'vitest'
import { tenantAccess, isTrialAwaitingFirstAccess, trialNotice, formatTrialEnd } from './billingStatus'

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

describe('teste que começa no primeiro acesso', () => {
  const pending = { status: 'trialing', current_period_end: null, trial_starts_on_first_access: true, trial_started_at: null }

  it('antes do 1º acesso o escritório fica liberado, sem contagem e sem aviso', () => {
    expect(isTrialAwaitingFirstAccess(pending)).toBe(true)
    expect(tenantAccess(pending, NOW)).toEqual({ readOnly: false, trialDaysLeft: null })
    expect(trialNotice(pending, NOW)).toEqual({ kind: 'none' })
  })

  it('só está "aguardando" se a marca está ligada, o teste não começou e ainda é trialing', () => {
    expect(isTrialAwaitingFirstAccess(null)).toBe(false)
    expect(isTrialAwaitingFirstAccess({ status: 'trialing', current_period_end: '2026-11-09T12:00:00Z' })).toBe(false)
    expect(isTrialAwaitingFirstAccess({ ...pending, trial_starts_on_first_access: false })).toBe(false)
    expect(isTrialAwaitingFirstAccess({ ...pending, trial_started_at: '2026-10-26T12:00:00Z' })).toBe(false)
    expect(isTrialAwaitingFirstAccess({ ...pending, status: 'active' })).toBe(false)
  })

  it('depois de começar, não avisa durante o teste (só no último dia)', () => {
    const started = (end: string) => ({ status: 'trialing', current_period_end: end, trial_starts_on_first_access: true, trial_started_at: '2026-10-12T12:00:00Z' })
    expect(trialNotice(started('2026-11-09T12:00:00Z'), NOW)).toEqual({ kind: 'none' }) // 14 dias
    expect(trialNotice(started('2026-10-28T12:00:00Z'), NOW)).toEqual({ kind: 'none' }) // 2 dias
  })

  it('avisa a partir de 1 dia antes do fim, com a data do fim', () => {
    const end = '2026-10-27T12:00:00Z' // exatamente 24h
    const sub = { status: 'trialing', current_period_end: end, trial_starts_on_first_access: true, trial_started_at: '2026-10-13T12:00:00Z' }
    expect(trialNotice(sub, NOW)).toEqual({ kind: 'ending', daysLeft: 1, endsAt: new Date(end) })
    expect(trialNotice({ ...sub, current_period_end: '2026-10-26T13:00:00Z' }, NOW).kind).toBe('ending')
  })

  it('teste vencido não é aviso: vira somente leitura', () => {
    const sub = { status: 'trialing', current_period_end: '2026-10-26T11:00:00Z', trial_starts_on_first_access: true, trial_started_at: '2026-10-12T12:00:00Z' }
    expect(tenantAccess(sub, NOW).readOnly).toBe(true)
    expect(trialNotice(sub, NOW)).toEqual({ kind: 'none' })
  })

  it('escritório já assinado nunca avisa', () => {
    expect(trialNotice({ status: 'active', current_period_end: '2026-10-27T00:00:00Z', trial_starts_on_first_access: true, trial_started_at: '2026-10-01T00:00:00Z' }, NOW)).toEqual({ kind: 'none' })
  })
})

describe('teste normal (14 dias do cadastro) não muda de comportamento', () => {
  it('mantém a contagem durante todo o teste, inclusive com a marca ausente ou false', () => {
    expect(trialNotice({ status: 'trialing', current_period_end: '2026-11-09T12:00:00Z' }, NOW)).toEqual({ kind: 'countdown', daysLeft: 14 })
    expect(trialNotice({ status: 'trialing', current_period_end: '2026-10-30T12:00:00Z', trial_starts_on_first_access: false, trial_started_at: null }, NOW)).toEqual({ kind: 'countdown', daysLeft: 4 })
    expect(trialNotice({ status: 'trialing', current_period_end: '2026-10-26T13:00:00Z' }, NOW)).toEqual({ kind: 'countdown', daysLeft: 1 })
  })

  it('sem assinatura, ativa ou vencida: nenhum aviso de contagem', () => {
    expect(trialNotice(null, NOW)).toEqual({ kind: 'none' })
    expect(trialNotice({ status: 'active', current_period_end: null }, NOW)).toEqual({ kind: 'none' })
    expect(trialNotice({ status: 'trialing', current_period_end: '2026-10-26T11:59:00Z' }, NOW)).toEqual({ kind: 'none' })
  })
})

describe('formatTrialEnd', () => {
  it('diz hoje/amanhã/data no fuso de Brasília', () => {
    const now = new Date('2026-10-26T15:00:00Z') // 12h em Brasília
    expect(formatTrialEnd(new Date('2026-10-26T20:30:00Z'), now)).toBe('hoje às 17:30')
    expect(formatTrialEnd(new Date('2026-10-27T15:00:00Z'), now)).toBe('amanhã às 12:00')
    expect(formatTrialEnd(new Date('2026-10-29T15:00:00Z'), now)).toBe('em 29/10 às 12:00')
  })
})

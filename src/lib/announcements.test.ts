import { describe, it, expect } from 'vitest'
import type { SystemAnnouncement } from '@/types'
import { isAnnouncementVisible, visibleAnnouncements, unreadAnnouncements, onboardingPending } from './announcements'

const NOW = new Date('2026-11-02T15:00:00Z')
const ctx = { role: 'lawyer', features: [] as string[], now: NOW }

function ann(over: Partial<SystemAnnouncement>): SystemAnnouncement {
  return {
    id: 'a', title: 't', message: 'm', type: 'info', category: 'novidade', link: null, link_label: null,
    audience_roles: null, requires_feature: null, published_at: '2026-11-01T12:00:00Z', expires_at: null,
    created_by: null, created_at: '2026-11-01T12:00:00Z', ...over,
  }
}

describe('isAnnouncementVisible', () => {
  it('toda a equipe vê; o portal do cliente nunca', () => {
    expect(isAnnouncementVisible(ann({}), ctx)).toBe(true)
    expect(isAnnouncementVisible(ann({}), { ...ctx, role: 'client' })).toBe(false)
    expect(isAnnouncementVisible(ann({}), { ...ctx, role: null })).toBe(false)
  })
  it('respeita agendamento e encerramento', () => {
    expect(isAnnouncementVisible(ann({ published_at: '2026-11-03T00:00:00Z' }), ctx)).toBe(false)
    expect(isAnnouncementVisible(ann({ expires_at: '2026-11-02T14:00:00Z' }), ctx)).toBe(false)
    expect(isAnnouncementVisible(ann({ expires_at: '2026-11-10T00:00:00Z' }), ctx)).toBe(true)
  })
  it('filtra por papel', () => {
    const soAdmin = ann({ audience_roles: ['admin', 'super_admin'] })
    expect(isAnnouncementVisible(soAdmin, ctx)).toBe(false)
    expect(isAnnouncementVisible(soAdmin, { ...ctx, role: 'admin' })).toBe(true)
  })
  it('recurso exigido só aparece para escritório com ele ligado', () => {
    const prazos = ann({ requires_feature: 'prazos' })
    expect(isAnnouncementVisible(prazos, ctx)).toBe(false)
    expect(isAnnouncementVisible(prazos, { ...ctx, features: ['prazos'] })).toBe(true)
  })
})

describe('listas', () => {
  const list = [
    ann({ id: 'velho', published_at: '2026-08-01T12:00:00Z' }),
    ann({ id: 'novo', published_at: '2026-11-01T12:00:00Z' }),
    ann({ id: 'lido', published_at: '2026-10-20T12:00:00Z' }),
  ]
  it('botão Novidades: tudo visível, mais recente primeiro', () => {
    expect(visibleAnnouncements(list, ctx).map(a => a.id)).toEqual(['novo', 'lido', 'velho'])
  })
  it('janela automática: só não lidos dos últimos 60 dias (quem chega não recebe o histórico inteiro)', () => {
    expect(unreadAnnouncements(list, ['lido'], ctx).map(a => a.id)).toEqual(['novo'])
  })
})

describe('onboardingPending', () => {
  it('espera o onboarding de quem acabou de chegar', () => {
    expect(onboardingPending({ onboarding_completed: false, oab_number: null }, false)).toBe(true)
    expect(onboardingPending({ onboarding_completed: false, oab_number: null }, true)).toBe(false)
    expect(onboardingPending({ onboarding_completed: true, oab_number: null }, false)).toBe(false)
    expect(onboardingPending({ onboarding_completed: false, oab_number: '123' }, false)).toBe(false)
  })
})

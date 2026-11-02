import type { SystemAnnouncement } from '@/types'

/**
 * Novidades e avisos para a equipe do escritório (tabela system_announcements,
 * publicados pelo super_admin). Quem vê: só a equipe (nunca o portal do
 * cliente), filtrado por papel e por recurso ligado no escritório. A janela que
 * abre sozinha mostra só o que não foi lido e é recente — quem acabou de chegar
 * vê os destaques dos últimos dias, não o histórico inteiro.
 */
export const RECENT_WINDOW_DAYS = 60

export interface AnnouncementContext {
  role: string | null | undefined
  /** Recursos ligados no escritório (ex.: 'prazos'). */
  features: string[]
  now: Date
}

export function isAnnouncementVisible(a: SystemAnnouncement, ctx: AnnouncementContext): boolean {
  if (!ctx.role || ctx.role === 'client') return false
  const published = new Date(a.published_at || a.created_at || 0)
  if (published > ctx.now) return false
  if (a.expires_at && new Date(a.expires_at) <= ctx.now) return false
  if (a.audience_roles?.length && !a.audience_roles.includes(ctx.role)) return false
  if (a.requires_feature && !ctx.features.includes(a.requires_feature)) return false
  return true
}

/** Lista do botão "Novidades": tudo que a pessoa pode ver, mais recente primeiro. */
export function visibleAnnouncements(list: SystemAnnouncement[], ctx: AnnouncementContext): SystemAnnouncement[] {
  return list
    .filter(a => isAnnouncementVisible(a, ctx))
    .sort((a, b) => (b.published_at || b.created_at || '').localeCompare(a.published_at || a.created_at || ''))
}

/** O que a janela automática mostra: visível, não lido e dos últimos RECENT_WINDOW_DAYS. */
export function unreadAnnouncements(list: SystemAnnouncement[], readIds: Iterable<string>, ctx: AnnouncementContext): SystemAnnouncement[] {
  const read = new Set(readIds)
  const cutoff = ctx.now.getTime() - RECENT_WINDOW_DAYS * 86_400_000
  return visibleAnnouncements(list, ctx).filter(a =>
    !read.has(a.id) && new Date(a.published_at || a.created_at || 0).getTime() >= cutoff)
}

/** Mesma regra do App.tsx para abrir o onboarding: enquanto ele estiver pendente, a janela espera. */
export function onboardingPending(profile: { onboarding_completed?: boolean | null; oab_number?: string | null } | null, skipped: boolean): boolean {
  return !!profile && !skipped && !profile.onboarding_completed && !profile.oab_number
}

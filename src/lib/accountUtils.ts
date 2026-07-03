// Pure utility functions for the Account/Users page

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  lawyer: 'Advogado',
  intern: 'Estagiário',
  financial: 'Financeiro',
  super_admin: 'Super Admin',
}

export const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
}

export const PLAN_LIMITS: Record<string, number> = {
  starter: 3,
  professional: 10,
  enterprise: 999,
}

/** Generates a random secure-ish password */
export function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/** Extracts up to 2 initials from a full name */
export function getInitials(name: string): string {
  if (!name.trim()) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

/** Returns Tailwind badge + avatar gradient classes for a role */
export function getRoleStyle(role: string): { badge: string; gradient: string } {
  const map: Record<string, { badge: string; gradient: string }> = {
    admin:      { badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', gradient: 'from-purple-600 to-purple-400' },
    lawyer:     { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',       gradient: 'from-blue-600 to-blue-400' },
    intern:     { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',   gradient: 'from-amber-500 to-amber-300' },
    financial:  { badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',   gradient: 'from-green-600 to-green-400' },
    super_admin:{ badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',           gradient: 'from-red-600 to-red-400' },
  }
  return map[role] ?? { badge: 'bg-slate-100 text-slate-600', gradient: 'from-slate-500 to-slate-400' }
}

interface ProfileLike {
  name?: string | null
  display_name?: string | null
  email?: string | null
  role: string
}

/** Counts how many profiles exist per role */
export function computeRoleCounts(profiles: ProfileLike[]): Record<string, number> {
  return profiles.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] || 0) + 1
    return acc
  }, {})
}

/** Filters profiles by search query (name, email) and optional role */
export function filterProfiles<T extends ProfileLike>(profiles: T[], search: string, role: string): T[] {
  const q = search.toLowerCase().trim()
  return profiles.filter(p => {
    const name = (p.name || p.display_name || '').toLowerCase()
    const email = (p.email || '').toLowerCase()
    const roleLabel = (ROLE_LABELS[p.role] || '').toLowerCase()
    const matchSearch = !q || name.includes(q) || email.includes(q) || roleLabel.includes(q)
    const matchRole = !role || p.role === role
    return matchSearch && matchRole
  })
}

/** Returns true if the given role is allowed to manage users */
export function canManageUsers(role: string): boolean {
  return role === 'admin' || role === 'super_admin'
}

/** Returns percentage of slots used: users / plan limit */
export function planUsagePercent(userCount: number, plan: string): number {
  const limit = PLAN_LIMITS[plan] ?? 999
  if (limit >= 999) return 0
  return Math.min(100, Math.round((userCount / limit) * 100))
}

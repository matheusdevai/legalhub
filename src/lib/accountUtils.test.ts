import { describe, it, expect } from 'vitest'
import {
  generatePassword,
  getInitials,
  getRoleStyle,
  computeRoleCounts,
  filterProfiles,
  canManageUsers,
  planUsagePercent,
  PLAN_LIMITS,
} from './accountUtils'

// ── generatePassword ──────────────────────────────────────────────────────────
describe('generatePassword', () => {
  it('gera senha com 12 caracteres', () => {
    expect(generatePassword()).toHaveLength(12)
  })

  it('gera senhas diferentes a cada chamada', () => {
    const a = generatePassword()
    const b = generatePassword()
    // probabilidade de colisão é astronomicamente baixa
    expect(a).not.toBe(b)
  })

  it('gera apenas caracteres permitidos (sem ambíguos)', () => {
    const ALLOWED = /^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$]+$/
    for (let i = 0; i < 20; i++) {
      expect(generatePassword()).toMatch(ALLOWED)
    }
  })
})

// ── getInitials ───────────────────────────────────────────────────────────────
describe('getInitials', () => {
  it('retorna "?" para string vazia', () => {
    expect(getInitials('')).toBe('?')
    expect(getInitials('   ')).toBe('?')
  })

  it('retorna 1 inicial para nome simples', () => {
    expect(getInitials('Matheus')).toBe('M')
  })

  it('retorna 2 iniciais para nome composto', () => {
    expect(getInitials('Matheus Augusto')).toBe('MA')
  })

  it('retorna no máximo 2 iniciais mesmo com nome longo', () => {
    expect(getInitials('João Paulo da Silva Santos')).toBe('JP')
  })

  it('retorna em maiúsculas', () => {
    expect(getInitials('ana beatriz')).toBe('AB')
  })

  it('lida com espaços extras', () => {
    expect(getInitials('  Carlos   Henrique  ')).toBe('CH')
  })
})

// ── getRoleStyle ──────────────────────────────────────────────────────────────
describe('getRoleStyle', () => {
  it('retorna estilos para admin', () => {
    const s = getRoleStyle('admin')
    expect(s.badge).toContain('purple')
    expect(s.gradient).toContain('purple')
  })

  it('retorna estilos para lawyer', () => {
    const s = getRoleStyle('lawyer')
    expect(s.badge).toContain('blue')
    expect(s.gradient).toContain('blue')
  })

  it('retorna estilos para intern', () => {
    const s = getRoleStyle('intern')
    expect(s.badge).toContain('amber')
  })

  it('retorna estilos para financial', () => {
    const s = getRoleStyle('financial')
    expect(s.badge).toContain('green')
  })

  it('retorna estilos para super_admin', () => {
    const s = getRoleStyle('super_admin')
    expect(s.badge).toContain('red')
  })

  it('retorna fallback para role desconhecido', () => {
    const s = getRoleStyle('unknown_role')
    expect(s.badge).toContain('slate')
  })
})

// ── computeRoleCounts ─────────────────────────────────────────────────────────
describe('computeRoleCounts', () => {
  it('retorna objeto vazio para lista vazia', () => {
    expect(computeRoleCounts([])).toEqual({})
  })

  it('conta um de cada role', () => {
    const profiles = [
      { role: 'admin' },
      { role: 'lawyer' },
      { role: 'intern' },
    ]
    const counts = computeRoleCounts(profiles)
    expect(counts.admin).toBe(1)
    expect(counts.lawyer).toBe(1)
    expect(counts.intern).toBe(1)
  })

  it('acumula contagens para mesmo role', () => {
    const profiles = [
      { role: 'lawyer' },
      { role: 'lawyer' },
      { role: 'lawyer' },
      { role: 'admin' },
    ]
    const counts = computeRoleCounts(profiles)
    expect(counts.lawyer).toBe(3)
    expect(counts.admin).toBe(1)
  })
})

// ── filterProfiles ────────────────────────────────────────────────────────────
describe('filterProfiles', () => {
  const profiles = [
    { name: 'Ana Silva', email: 'ana@adv.com', role: 'lawyer' },
    { name: 'Bruno Souza', email: 'bruno@adv.com', role: 'admin' },
    { name: 'Carla', email: 'carla@adv.com', role: 'intern' },
    { name: null, display_name: 'Denis', email: 'denis@adv.com', role: 'financial' },
  ]

  it('retorna todos sem filtros', () => {
    expect(filterProfiles(profiles, '', '')).toHaveLength(4)
  })

  it('filtra por nome (case-insensitive)', () => {
    const r = filterProfiles(profiles, 'ana', '')
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Ana Silva')
  })

  it('filtra por email', () => {
    const r = filterProfiles(profiles, 'bruno@', '')
    expect(r).toHaveLength(1)
    expect(r[0].role).toBe('admin')
  })

  it('filtra por label do role ("advogado")', () => {
    const r = filterProfiles(profiles, 'advogado', '')
    expect(r).toHaveLength(1)
    expect(r[0].role).toBe('lawyer')
  })

  it('filtra por role exato', () => {
    const r = filterProfiles(profiles, '', 'intern')
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Carla')
  })

  it('combina busca + filtro de role', () => {
    const r = filterProfiles(profiles, 'ana', 'lawyer')
    expect(r).toHaveLength(1)
  })

  it('retorna vazio quando nenhum corresponde', () => {
    expect(filterProfiles(profiles, 'zzz', '')).toHaveLength(0)
    expect(filterProfiles(profiles, '', 'super_admin')).toHaveLength(0)
  })

  it('funciona com display_name quando name é null', () => {
    const r = filterProfiles(profiles, 'denis', '')
    expect(r).toHaveLength(1)
    expect(r[0].role).toBe('financial')
  })
})

// ── canManageUsers ────────────────────────────────────────────────────────────
describe('canManageUsers', () => {
  it('admin pode gerenciar usuários', () => {
    expect(canManageUsers('admin')).toBe(true)
  })

  it('super_admin pode gerenciar usuários', () => {
    expect(canManageUsers('super_admin')).toBe(true)
  })

  it('lawyer NÃO pode gerenciar usuários', () => {
    expect(canManageUsers('lawyer')).toBe(false)
  })

  it('intern NÃO pode gerenciar usuários', () => {
    expect(canManageUsers('intern')).toBe(false)
  })

  it('financial NÃO pode gerenciar usuários', () => {
    expect(canManageUsers('financial')).toBe(false)
  })
})

// ── planUsagePercent ──────────────────────────────────────────────────────────
describe('planUsagePercent', () => {
  it('retorna 0 para plan enterprise (sem limite)', () => {
    expect(planUsagePercent(100, 'enterprise')).toBe(0)
  })

  it('retorna 0 para plano desconhecido (sem limite)', () => {
    expect(planUsagePercent(50, 'unknown')).toBe(0)
  })

  it('calcula percentual correto para starter (limite 3)', () => {
    expect(planUsagePercent(1, 'starter')).toBe(33)
    expect(planUsagePercent(2, 'starter')).toBe(67)
    expect(planUsagePercent(3, 'starter')).toBe(100)
  })

  it('nunca passa de 100% mesmo com overflow', () => {
    expect(planUsagePercent(99, 'starter')).toBe(100)
  })

  it('calcula percentual correto para professional (limite 10)', () => {
    expect(planUsagePercent(5, 'professional')).toBe(50)
    expect(planUsagePercent(10, 'professional')).toBe(100)
  })

  it('limites batem com PLAN_LIMITS', () => {
    expect(PLAN_LIMITS.starter).toBe(3)
    expect(PLAN_LIMITS.professional).toBe(10)
    expect(PLAN_LIMITS.enterprise).toBe(999)
  })
})

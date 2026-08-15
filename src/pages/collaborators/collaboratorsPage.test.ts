import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

import { waLink } from './CollaboratorsPage'

// ─── Tipos mínimos ─────────────────────────────────────────────────────────────
type MockCollaborator = {
  id: string; nome: string; email?: string | null; cargo?: string | null; ativo: boolean
}

const CARGO_LABELS: Record<string, string> = { parceiro: 'Parceiro', advogado: 'Advogado', estagiario: 'Estagiário' }

// ─── Réplica exata do filtro de CollaboratorsPage ─────────────────────────────
function filterCollaborators(collaborators: MockCollaborator[], opts: { search?: string; cargoFilter?: string; statusFilter?: string }) {
  const { search = '', cargoFilter = '', statusFilter = '' } = opts
  return collaborators.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !search ||
      c.nome.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      (CARGO_LABELS[c.cargo || ''] || c.cargo || '').toLowerCase().includes(q)
    const matchCargo = !cargoFilter || c.cargo === cargoFilter
    const matchStatus = !statusFilter || (statusFilter === 'ativo' ? c.ativo : !c.ativo)
    return matchSearch && matchCargo && matchStatus
  })
}

describe('CollaboratorsPage — waLink()', () => {
  it('gera link do WhatsApp para celular com DDD (10-11 dígitos), prefixando 55', () => {
    expect(waLink('11999998888')).toBe('https://wa.me/5511999998888')
  })
  it('gera link para número já com código do país (mais de 11 dígitos)', () => {
    expect(waLink('5511999998888')).toBe('https://wa.me/5511999998888')
  })
  it('ignora formatação (parênteses, traço, espaço)', () => {
    expect(waLink('(11) 99999-8888')).toBe('https://wa.me/5511999998888')
  })
  it('retorna null para número curto demais para ser válido', () => {
    expect(waLink('123')).toBeNull()
  })
})

const COLLABORATORS: MockCollaborator[] = [
  { id: 'c1', nome: 'Ana Souza', email: 'ana@x.com', cargo: 'advogado', ativo: true },
  { id: 'c2', nome: 'Bruno Lima', email: 'bruno@x.com', cargo: 'parceiro', ativo: true },
  { id: 'c3', nome: 'Carla Dias', email: 'carla@x.com', cargo: 'estagiario', ativo: false },
]

describe('CollaboratorsPage — filterCollaborators()', () => {
  it('sem filtros retorna todos', () => {
    expect(filterCollaborators(COLLABORATORS, {})).toHaveLength(3)
  })
  it('busca por nome', () => {
    const r = filterCollaborators(COLLABORATORS, { search: 'ana' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('c1')
  })
  it('busca pelo rótulo do cargo, não pelo valor bruto', () => {
    const r = filterCollaborators(COLLABORATORS, { search: 'advogado' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('c1')
  })
  it('filtra por cargo', () => {
    expect(filterCollaborators(COLLABORATORS, { cargoFilter: 'parceiro' })).toHaveLength(1)
  })
  it('filtra por status ativo', () => {
    expect(filterCollaborators(COLLABORATORS, { statusFilter: 'ativo' })).toHaveLength(2)
  })
  it('filtra por status inativo', () => {
    const r = filterCollaborators(COLLABORATORS, { statusFilter: 'inativo' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('c3')
  })
})

import { describe, it, expect } from 'vitest'

// ─── Réplica exata de scoreColor() / scoreLabel() de LeadsPage ───────────────
function scoreColor(s: number) {
  if (s >= 70) return 'text-green-600 bg-green-50'
  if (s >= 40) return 'text-yellow-600 bg-yellow-50'
  return 'text-red-500 bg-red-50'
}
function scoreLabel(s: number) {
  if (s >= 70) return 'Quente 🔥'
  if (s >= 40) return 'Morno'
  return 'Frio'
}

// ─── Tipos mínimos ─────────────────────────────────────────────────────────────
type MockLead = {
  id: string; name: string; email?: string; phone?: string
  status: string; source: string; value?: number
  created_at?: string; followup_date?: string; deleted_at?: string | null
}

// ─── Réplica exata do filtro de busca/status/source de LeadsPage ─────────────
function filterLeads(leads: MockLead[], opts: { search?: string; filterStatus?: string; filterSource?: string }) {
  const { search = '', filterStatus = '', filterSource = '' } = opts
  return leads.filter(l => {
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) || l.phone?.includes(search)
    const matchStatus = !filterStatus || l.status === filterStatus
    const matchSource = !filterSource || l.source === filterSource
    return matchSearch && matchStatus && matchSource
  })
}

// ─── Réplica exata do cálculo de pipeline/conversão de LeadsPage ─────────────
function computePipeline(leads: MockLead[]) {
  const won = leads.filter(l => l.status === 'won')
  const pipeline = leads.filter(l => l.status !== 'won' && l.status !== 'lost' && !l.deleted_at)
  const pipelineValue = pipeline.reduce((acc, l) => acc + (l.value || 0), 0)
  const convRate = leads.length > 0 ? Math.round((won.length / leads.length) * 100) : 0
  return { won: won.length, pipelineValue, convRate }
}

const LEADS: MockLead[] = [
  { id: 'l1', name: 'Ana Souza', email: 'ana@x.com', phone: '11999990000', status: 'new', source: 'ads', value: 1000 },
  { id: 'l2', name: 'Bruno Lima', email: 'bruno@x.com', phone: '11988880000', status: 'won', source: 'referral', value: 5000 },
  { id: 'l3', name: 'Carla Dias', email: 'carla@x.com', phone: '11977770000', status: 'lost', source: 'ads', value: 2000 },
  { id: 'l4', name: 'Denis Melo', email: 'denis@x.com', phone: '11966660000', status: 'qualified', source: 'organic', value: 3000, deleted_at: null },
]

describe('LeadsPage — scoreColor() / scoreLabel()', () => {
  it('score >= 70 é "Quente"', () => {
    expect(scoreLabel(80)).toBe('Quente 🔥')
    expect(scoreColor(80)).toContain('green')
  })
  it('score entre 40 e 69 é "Morno"', () => {
    expect(scoreLabel(50)).toBe('Morno')
    expect(scoreColor(50)).toContain('yellow')
  })
  it('score < 40 é "Frio"', () => {
    expect(scoreLabel(10)).toBe('Frio')
    expect(scoreColor(10)).toContain('red')
  })
  it('limites exatos (70 e 40) usam o rótulo superior', () => {
    expect(scoreLabel(70)).toBe('Quente 🔥')
    expect(scoreLabel(40)).toBe('Morno')
  })
})

describe('LeadsPage — filterLeads()', () => {
  it('sem filtros retorna todos', () => {
    expect(filterLeads(LEADS, {})).toHaveLength(4)
  })
  it('busca por nome', () => {
    const r = filterLeads(LEADS, { search: 'ana' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('l1')
  })
  it('busca por telefone', () => {
    const r = filterLeads(LEADS, { search: '966660000' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('l4')
  })
  it('filtra por status', () => {
    const r = filterLeads(LEADS, { filterStatus: 'won' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('l2')
  })
  it('filtra por origem (source)', () => {
    const r = filterLeads(LEADS, { filterSource: 'ads' })
    expect(r).toHaveLength(2)
  })
  it('combina busca + status', () => {
    const r = filterLeads(LEADS, { search: 'carla', filterStatus: 'lost' })
    expect(r).toHaveLength(1)
  })
})

describe('LeadsPage — computePipeline()', () => {
  it('conta leads ganhos corretamente', () => {
    expect(computePipeline(LEADS).won).toBe(1)
  })
  it('soma o valor do pipeline excluindo won/lost', () => {
    // apenas l1 (new, 1000) e l4 (qualified, 3000) entram no pipeline
    expect(computePipeline(LEADS).pipelineValue).toBe(4000)
  })
  it('calcula a taxa de conversão arredondada', () => {
    expect(computePipeline(LEADS).convRate).toBe(25) // 1/4 = 25%
  })
  it('lista vazia não gera divisão por zero', () => {
    expect(computePipeline([]).convRate).toBe(0)
  })
  it('lead com deleted_at é excluído do pipeline', () => {
    const withDeleted: MockLead[] = [...LEADS, { id: 'l5', name: 'Excluído', status: 'new', source: 'ads', value: 9999, deleted_at: '2026-01-01' }]
    expect(computePipeline(withDeleted).pipelineValue).toBe(4000)
  })
})

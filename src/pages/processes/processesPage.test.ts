import { describe, it, expect } from 'vitest'

// ─── Tipos mínimos ─────────────────────────────────────────────────────────────
type MockProcess = {
  id: string; title: string; number: string; client_name?: string | null
  status?: string | null; modalidade?: string | null; area?: string | null
  colaborador_id?: string | null; next_deadline?: string | null
  data_protocolo?: string | null; created_at?: string | null
}

// ─── Réplica exata do filtro + ordenação de ProcessesPage ────────────────────
function filterProcesses(processes: MockProcess[], opts: {
  search?: string; statusFilter?: string; modalidadeFilter?: string; areaFilter?: string; colaboradorFilter?: string
}) {
  const { search = '', statusFilter = '', modalidadeFilter = '', areaFilter = '', colaboradorFilter = '' } = opts
  return processes.filter(p => {
    const matchSearch = !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.number.toLowerCase().includes(search.toLowerCase()) ||
      p.client_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || p.status === statusFilter
    const matchModalidade = !modalidadeFilter || p.modalidade === modalidadeFilter
    const matchArea = !areaFilter || p.area === areaFilter
    const matchColaborador = !colaboradorFilter || (colaboradorFilter === '__sem__' ? !p.colaborador_id : p.colaborador_id === colaboradorFilter)
    return matchSearch && matchStatus && matchModalidade && matchArea && matchColaborador
  })
}

// ─── Réplica exata das stats (subconjunto sem dependência de "hoje") ──────────
function computeProcessStats(processes: MockProcess[]) {
  const total = processes.length
  const active = processes.filter(p => p.status === 'active').length
  const protocolados = processes.filter(p => p.data_protocolo).length
  const won = processes.filter(p => p.status === 'won').length
  const lost = processes.filter(p => p.status === 'lost').length
  const returned = processes.filter(p => p.status === 'returned').length
  const encerrados = won + lost + returned
  const judicial = processes.filter(p => p.modalidade === 'judicial').length
  const admin = processes.filter(p => p.modalidade === 'administrativo').length
  const taxa = encerrados > 0 ? Math.round((won / encerrados) * 100) : 0
  return { total, active, protocolados, encerrados, judicial, admin, taxa, won, lost, returned }
}

const PROCESSES: MockProcess[] = [
  { id: 'p1', title: 'Ação Trabalhista', number: '0001-2026', client_name: 'Ana Souza', status: 'active', modalidade: 'judicial', area: 'Trabalhista', colaborador_id: 'c1', data_protocolo: '2026-01-10' },
  { id: 'p2', title: 'Revisão Contratual', number: '0002-2026', client_name: 'Bruno Lima', status: 'won', modalidade: 'administrativo', area: 'Empresarial', colaborador_id: null, data_protocolo: '2026-02-01' },
  { id: 'p3', title: 'Inventário', number: '0003-2026', client_name: 'Carla Dias', status: 'lost', modalidade: 'judicial', area: 'Família', colaborador_id: 'c1', data_protocolo: null },
  { id: 'p4', title: 'Consultoria Tributária', number: '0004-2026', client_name: 'Denis Melo', status: 'active', modalidade: 'administrativo', area: 'Tributário', colaborador_id: 'c2', data_protocolo: '2026-03-05' },
]

describe('ProcessesPage — filterProcesses()', () => {
  it('sem filtros retorna todos', () => {
    expect(filterProcesses(PROCESSES, {})).toHaveLength(4)
  })
  it('busca por título', () => {
    const r = filterProcesses(PROCESSES, { search: 'inventário' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('p3')
  })
  it('busca por número do processo', () => {
    const r = filterProcesses(PROCESSES, { search: '0002' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('p2')
  })
  it('busca por nome do cliente', () => {
    const r = filterProcesses(PROCESSES, { search: 'denis' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('p4')
  })
  it('filtra por status', () => {
    expect(filterProcesses(PROCESSES, { statusFilter: 'active' })).toHaveLength(2)
  })
  it('filtra por modalidade', () => {
    expect(filterProcesses(PROCESSES, { modalidadeFilter: 'judicial' })).toHaveLength(2)
  })
  it('filtra por área', () => {
    const r = filterProcesses(PROCESSES, { areaFilter: 'Família' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('p3')
  })
  it('filtra por colaborador específico', () => {
    expect(filterProcesses(PROCESSES, { colaboradorFilter: 'c1' })).toHaveLength(2)
  })
  it('filtro especial "__sem__" retorna só processos sem colaborador', () => {
    const r = filterProcesses(PROCESSES, { colaboradorFilter: '__sem__' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('p2')
  })
})

describe('ProcessesPage — computeProcessStats()', () => {
  it('conta total, ativos e protocolados corretamente', () => {
    const s = computeProcessStats(PROCESSES)
    expect(s.total).toBe(4)
    expect(s.active).toBe(2)
    expect(s.protocolados).toBe(3)
  })
  it('soma encerrados (won + lost + returned)', () => {
    expect(computeProcessStats(PROCESSES).encerrados).toBe(2)
  })
  it('calcula a taxa de êxito arredondada', () => {
    expect(computeProcessStats(PROCESSES).taxa).toBe(50) // 1 won de 2 encerrados
  })
  it('lista vazia não gera divisão por zero na taxa', () => {
    expect(computeProcessStats([]).taxa).toBe(0)
  })
  it('conta por modalidade (judicial vs administrativo)', () => {
    const s = computeProcessStats(PROCESSES)
    expect(s.judicial).toBe(2)
    expect(s.admin).toBe(2)
  })
})

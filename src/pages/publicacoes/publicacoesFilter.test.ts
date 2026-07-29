import { describe, it, expect } from 'vitest'

// ─── Tipos mínimos para os testes ─────────────────────────────────────────────
type MockIntimacao = {
  id: string
  numero_processo: string
  partes: string
  tribunal: string
  publicacao: string
  conteudo: string
  responsavel: string
  situacao: 'Pendente' | 'Lida' | 'Cumprida'
}

type MockMovimento = { nome?: string; dataHora?: string }

// ─── Réplica exata de isIntimacao() de PublicacoesPage ────────────────────────
function isIntimacao(movimento: MockMovimento): boolean {
  const nome = (movimento.nome || '').toLowerCase()
  return nome.includes('intima') || nome.includes('citação') || nome.includes('citacao')
}

// ─── Réplica exata do predicado de filtro de PublicacoesPage ─────────────────
function applyFilters(
  items: MockIntimacao[],
  opts: {
    periodo?: string
    responsavelFilter?: string
    situacaoFilter?: '' | 'Pendente' | 'Lida' | 'Cumprida'
    search?: string
    now?: Date
  }
) {
  const { periodo = 'Todos', responsavelFilter = '', situacaoFilter = '', search = '', now = new Date() } = opts

  let cutoff: Date | null = null
  if (periodo === 'Hoje') cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  else if (periodo === 'Esta semana') { cutoff = new Date(now); cutoff.setDate(now.getDate() - 7) }
  else if (periodo === 'Este mês') cutoff = new Date(now.getFullYear(), now.getMonth(), 1)
  else if (periodo === 'Últimos 3 meses') { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 3) }

  let list = [...items]
  if (cutoff) list = list.filter(i => i.publicacao && new Date(i.publicacao) >= cutoff!)
  if (responsavelFilter) list = list.filter(i => i.responsavel === responsavelFilter)
  if (situacaoFilter) list = list.filter(i => i.situacao === situacaoFilter)
  if (search) {
    const q = search.toLowerCase()
    list = list.filter(i =>
      i.numero_processo?.toLowerCase().includes(q) ||
      i.partes?.toLowerCase().includes(q) ||
      i.conteudo?.toLowerCase().includes(q) ||
      i.tribunal?.toLowerCase().includes(q) ||
      i.responsavel?.toLowerCase().includes(q)
    )
  }
  return list
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────
const ITEMS: MockIntimacao[] = [
  { id: 'i1', numero_processo: '0001/2024', partes: 'João Silva', tribunal: 'TJSP', publicacao: '2026-07-20', conteudo: 'Intimação de audiência', responsavel: 'Ana', situacao: 'Pendente' },
  { id: 'i2', numero_processo: '0002/2024', partes: 'Maria Souza', tribunal: 'TJRJ', publicacao: '2026-06-01', conteudo: 'Citação inicial', responsavel: 'Bruno', situacao: 'Lida' },
  { id: 'i3', numero_processo: '0003/2024', partes: 'Carla Dias', tribunal: 'TJSP', publicacao: '2026-01-15', conteudo: 'Sentença proferida', responsavel: 'Ana', situacao: 'Cumprida' },
]

describe('PublicacoesPage — isIntimacao()', () => {
  it('reconhece "intimação" (com variações de caixa)', () => {
    expect(isIntimacao({ nome: 'Intimação Eletrônica' })).toBe(true)
  })
  it('reconhece "citação"', () => {
    expect(isIntimacao({ nome: 'Citação por edital' })).toBe(true)
  })
  it('reconhece "citacao" sem acento', () => {
    expect(isIntimacao({ nome: 'citacao postal' })).toBe(true)
  })
  it('rejeita movimentos que não são intimação/citação', () => {
    expect(isIntimacao({ nome: 'Juntada de petição' })).toBe(false)
  })
  it('nome ausente não quebra e retorna false', () => {
    expect(isIntimacao({})).toBe(false)
  })
})

describe('PublicacoesPage — filtro por responsável', () => {
  it('sem filtro retorna todos', () => {
    expect(applyFilters(ITEMS, {})).toHaveLength(3)
  })
  it('filtra apenas os de um responsável', () => {
    const r = applyFilters(ITEMS, { responsavelFilter: 'Ana' })
    expect(r).toHaveLength(2)
    expect(r.every(i => i.responsavel === 'Ana')).toBe(true)
  })
})

describe('PublicacoesPage — filtro por situação', () => {
  it('filtra apenas Pendente', () => {
    const r = applyFilters(ITEMS, { situacaoFilter: 'Pendente' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('i1')
  })
  it('filtra apenas Lida', () => {
    const r = applyFilters(ITEMS, { situacaoFilter: 'Lida' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('i2')
  })
  it('filtra apenas Cumprida', () => {
    const r = applyFilters(ITEMS, { situacaoFilter: 'Cumprida' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('i3')
  })
  it('sem filtro retorna todas as situações', () => {
    expect(applyFilters(ITEMS, { situacaoFilter: '' })).toHaveLength(3)
  })
})

describe('PublicacoesPage — filtro por busca textual', () => {
  it('busca por número do processo', () => {
    const r = applyFilters(ITEMS, { search: '0002/2024' })
    expect(r).toHaveLength(1)
    expect(r[0].partes).toBe('Maria Souza')
  })
  it('busca por parte (case-insensitive)', () => {
    const r = applyFilters(ITEMS, { search: 'joão' })
    expect(r).toHaveLength(1)
  })
  it('busca por tribunal', () => {
    const r = applyFilters(ITEMS, { search: 'tjrj' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('i2')
  })
  it('busca por conteúdo', () => {
    const r = applyFilters(ITEMS, { search: 'sentença' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('i3')
  })
})

describe('PublicacoesPage — filtro por período', () => {
  const NOW = new Date('2026-07-28T12:00:00')

  it('"Hoje" exclui itens de dias anteriores', () => {
    const r = applyFilters(ITEMS, { periodo: 'Hoje', now: NOW })
    expect(r).toHaveLength(0)
  })
  it('"Este mês" retorna apenas item de julho/2026', () => {
    const r = applyFilters(ITEMS, { periodo: 'Este mês', now: NOW })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('i1')
  })
  it('"Últimos 3 meses" inclui maio a julho', () => {
    const r = applyFilters(ITEMS, { periodo: 'Últimos 3 meses', now: NOW })
    expect(r.map(i => i.id).sort()).toEqual(['i1', 'i2'])
  })
  it('"Todos" não aplica corte de data', () => {
    expect(applyFilters(ITEMS, { periodo: 'Todos', now: NOW })).toHaveLength(3)
  })
})

describe('PublicacoesPage — filtros combinados', () => {
  it('responsável + situação', () => {
    const r = applyFilters(ITEMS, { responsavelFilter: 'Ana', situacaoFilter: 'Cumprida' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('i3')
  })
  it('busca + responsável sem resultado', () => {
    const r = applyFilters(ITEMS, { search: 'maria', responsavelFilter: 'Ana' })
    expect(r).toHaveLength(0)
  })
})

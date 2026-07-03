import { describe, it, expect } from 'vitest'

// ─── Tipos mínimos para os testes ─────────────────────────────────────────────
type MockClient = {
  id: string
  name: string
  email?: string
  cpf_cnpj?: string
  phone?: string
  cidade?: string
  status?: string
  type: 'pf' | 'pj'
  area_direito?: string
  created_at?: string
}

// ─── Réplica exata do predicado de filtro de ClientsPage ──────────────────────
function applyFilters(
  clients: MockClient[],
  opts: {
    search?: string
    statusFilter?: string
    typeFilter?: string
    areaFilter?: string
    cidadeFilter?: string
    activeProcessFilter?: 'all' | 'with' | 'without'
    processMap?: Record<string, unknown[]>
  }
) {
  const {
    search = '',
    statusFilter = '',
    typeFilter = '',
    areaFilter = '',
    cidadeFilter = '',
    activeProcessFilter = 'all',
    processMap = {},
  } = opts

  return clients.filter(c => {
    const q = search.toLowerCase()
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.cpf_cnpj?.includes(search) ||
      c.phone?.includes(search) ||
      c.cidade?.toLowerCase().includes(q)
    const matchStatus = !statusFilter || c.status === statusFilter
    const matchType = !typeFilter || c.type === typeFilter
    const matchArea = !areaFilter || c.area_direito === areaFilter
    const matchCidade = !cidadeFilter || c.cidade === cidadeFilter
    const hasProc = (processMap[c.id]?.length || 0) > 0
    const matchProc =
      activeProcessFilter === 'all' ||
      (activeProcessFilter === 'with' ? hasProc : !hasProc)
    return matchSearch && matchStatus && matchType && matchArea && matchCidade && matchProc
  })
}

// ─── Réplica exata do sort de ClientsPage ─────────────────────────────────────
function applySort(
  clients: MockClient[],
  sortField: 'name' | 'created_at' | 'cidade',
  sortDir: 'asc' | 'desc'
) {
  return [...clients].sort((a, b) => {
    let va = '', vb = ''
    if (sortField === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase() }
    else if (sortField === 'created_at') { va = a.created_at || ''; vb = b.created_at || '' }
    else if (sortField === 'cidade') { va = (a.cidade || '').toLowerCase(); vb = (b.cidade || '').toLowerCase() }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })
}

// ─── Réplica da geração de linhas CSV de exportAll() ─────────────────────────
const STATUS_LABELS: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', prospect: 'Prospect' }

function buildCsvRows(clients: MockClient[], processMap: Record<string, unknown[]> = {}) {
  return [
    'Nome,Tipo,CPF/CNPJ,Telefone,Email,Cidade,Status,Processos,Cadastro',
    ...clients.map(c => {
      const tipo = c.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'
      const status = STATUS_LABELS[c.status || 'active'] ?? ''
      const processos = processMap[c.id]?.length ?? 0
      return `"${c.name}","${tipo}","${c.cpf_cnpj || '—'}","${c.phone || '—'}","${c.email || '—'}","${c.cidade || '—'}","${status}","${processos}","—"`
    }),
  ].join('\n')
}

// ─── Dados de fixture ─────────────────────────────────────────────────────────
const CLIENTS: MockClient[] = [
  { id: 'c1', name: 'Ana Pereira', type: 'pf', status: 'active', cidade: 'São Paulo', area_direito: 'Trabalhista', email: 'ana@adv.com', created_at: '2025-01-10' },
  { id: 'c2', name: 'Bruno Costa', type: 'pj', status: 'inactive', cidade: 'Rio de Janeiro', area_direito: 'Tributário', email: 'bruno@emp.com', created_at: '2025-03-05' },
  { id: 'c3', name: 'Carla Souza', type: 'pf', status: 'prospect', cidade: 'São Paulo', area_direito: 'Previdenciário', email: 'carla@adv.com', created_at: '2024-11-20' },
  { id: 'c4', name: 'Denis Lima', type: 'pj', status: 'active', cidade: 'Curitiba', area_direito: 'Trabalhista', cpf_cnpj: '12.345.678/0001-90', created_at: '2025-06-01' },
]
const PROC_MAP: Record<string, unknown[]> = { c1: [{}], c3: [{}, {}] }

// ═════════════════════════════════════════════════════════════════════════════
// FILTRO — busca textual
// ═════════════════════════════════════════════════════════════════════════════
describe('ClientsPage — filtro por busca textual', () => {
  it('sem filtro retorna todos os clientes', () => {
    expect(applyFilters(CLIENTS, {})).toHaveLength(4)
  })

  it('busca por nome (case-insensitive)', () => {
    const r = applyFilters(CLIENTS, { search: 'ana' })
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Ana Pereira')
  })

  it('busca por email', () => {
    const r = applyFilters(CLIENTS, { search: 'carla@' })
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Carla Souza')
  })

  it('busca por cidade', () => {
    const r = applyFilters(CLIENTS, { search: 'curitiba' })
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Denis Lima')
  })

  it('busca por CPF/CNPJ', () => {
    const r = applyFilters(CLIENTS, { search: '12.345.678' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('c4')
  })

  it('retorna vazio quando nenhum corresponde', () => {
    expect(applyFilters(CLIENTS, { search: 'zzz_nao_existe' })).toHaveLength(0)
  })

  it('busca parcial funciona em nome', () => {
    const r = applyFilters(CLIENTS, { search: 'pereira' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('c1')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// FILTRO — status
// ═════════════════════════════════════════════════════════════════════════════
describe('ClientsPage — filtro por status', () => {
  it('filtra apenas ativos', () => {
    const r = applyFilters(CLIENTS, { statusFilter: 'active' })
    expect(r).toHaveLength(2)
    expect(r.every(c => c.status === 'active')).toBe(true)
  })

  it('filtra apenas inativos', () => {
    const r = applyFilters(CLIENTS, { statusFilter: 'inactive' })
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Bruno Costa')
  })

  it('filtra apenas prospects', () => {
    const r = applyFilters(CLIENTS, { statusFilter: 'prospect' })
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Carla Souza')
  })

  it('statusFilter vazio retorna todos', () => {
    expect(applyFilters(CLIENTS, { statusFilter: '' })).toHaveLength(4)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// FILTRO — tipo (PF / PJ) — novo filtro implementado
// ═════════════════════════════════════════════════════════════════════════════
describe('ClientsPage — filtro por tipo (PF/PJ)', () => {
  it('filtra apenas Pessoa Física', () => {
    const r = applyFilters(CLIENTS, { typeFilter: 'pf' })
    expect(r).toHaveLength(2)
    expect(r.every(c => c.type === 'pf')).toBe(true)
  })

  it('filtra apenas Pessoa Jurídica', () => {
    const r = applyFilters(CLIENTS, { typeFilter: 'pj' })
    expect(r).toHaveLength(2)
    expect(r.every(c => c.type === 'pj')).toBe(true)
  })

  it('typeFilter vazio retorna todos', () => {
    expect(applyFilters(CLIENTS, { typeFilter: '' })).toHaveLength(4)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// FILTRO — área do direito — novo filtro implementado
// ═════════════════════════════════════════════════════════════════════════════
describe('ClientsPage — filtro por área do direito', () => {
  it('filtra por Trabalhista (2 clientes)', () => {
    const r = applyFilters(CLIENTS, { areaFilter: 'Trabalhista' })
    expect(r).toHaveLength(2)
    expect(r.every(c => c.area_direito === 'Trabalhista')).toBe(true)
  })

  it('filtra por Tributário (1 cliente)', () => {
    const r = applyFilters(CLIENTS, { areaFilter: 'Tributário' })
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Bruno Costa')
  })

  it('areaFilter inexistente retorna vazio', () => {
    expect(applyFilters(CLIENTS, { areaFilter: 'Inexistente' })).toHaveLength(0)
  })

  it('areaFilter vazio retorna todos', () => {
    expect(applyFilters(CLIENTS, { areaFilter: '' })).toHaveLength(4)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// FILTRO — cidade — novo filtro implementado
// ═════════════════════════════════════════════════════════════════════════════
describe('ClientsPage — filtro por cidade', () => {
  it('filtra por São Paulo (2 clientes)', () => {
    const r = applyFilters(CLIENTS, { cidadeFilter: 'São Paulo' })
    expect(r).toHaveLength(2)
    expect(r.every(c => c.cidade === 'São Paulo')).toBe(true)
  })

  it('filtra por Curitiba (1 cliente)', () => {
    const r = applyFilters(CLIENTS, { cidadeFilter: 'Curitiba' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('c4')
  })

  it('cidadeFilter vazio retorna todos', () => {
    expect(applyFilters(CLIENTS, { cidadeFilter: '' })).toHaveLength(4)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// FILTRO — processos ativos
// ═════════════════════════════════════════════════════════════════════════════
describe('ClientsPage — filtro por presença de processos', () => {
  it('"with" retorna apenas clientes com processos (c1, c3)', () => {
    const r = applyFilters(CLIENTS, { activeProcessFilter: 'with', processMap: PROC_MAP })
    expect(r).toHaveLength(2)
    expect(r.map(c => c.id).sort()).toEqual(['c1', 'c3'])
  })

  it('"without" retorna apenas clientes sem processos (c2, c4)', () => {
    const r = applyFilters(CLIENTS, { activeProcessFilter: 'without', processMap: PROC_MAP })
    expect(r).toHaveLength(2)
    expect(r.map(c => c.id).sort()).toEqual(['c2', 'c4'])
  })

  it('"all" retorna todos independente de processos', () => {
    expect(applyFilters(CLIENTS, { activeProcessFilter: 'all', processMap: PROC_MAP })).toHaveLength(4)
  })

  it('sem processMap tratado como "sem processos" para todos', () => {
    const r = applyFilters(CLIENTS, { activeProcessFilter: 'without' })
    expect(r).toHaveLength(4)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// FILTRO — combinações de múltiplos filtros
// ═════════════════════════════════════════════════════════════════════════════
describe('ClientsPage — filtros combinados', () => {
  it('tipo PF + cidade São Paulo retorna 2', () => {
    const r = applyFilters(CLIENTS, { typeFilter: 'pf', cidadeFilter: 'São Paulo' })
    expect(r).toHaveLength(2)
  })

  it('tipo PF + status active + São Paulo retorna apenas Ana', () => {
    const r = applyFilters(CLIENTS, { typeFilter: 'pf', statusFilter: 'active', cidadeFilter: 'São Paulo' })
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Ana Pereira')
  })

  it('busca "ana" + tipo PJ retorna vazio', () => {
    const r = applyFilters(CLIENTS, { search: 'ana', typeFilter: 'pj' })
    expect(r).toHaveLength(0)
  })

  it('área Trabalhista + PJ retorna Denis', () => {
    const r = applyFilters(CLIENTS, { areaFilter: 'Trabalhista', typeFilter: 'pj' })
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Denis Lima')
  })

  it('área Trabalhista + com processo retorna apenas Ana (c1)', () => {
    const r = applyFilters(CLIENTS, { areaFilter: 'Trabalhista', activeProcessFilter: 'with', processMap: PROC_MAP })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('c1')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// ORDENAÇÃO — novo recurso implementado
// ═════════════════════════════════════════════════════════════════════════════
describe('ClientsPage — ordenação por nome', () => {
  it('nome A→Z ordena alfabeticamente', () => {
    const r = applySort(CLIENTS, 'name', 'asc')
    expect(r.map(c => c.name)).toEqual([
      'Ana Pereira',
      'Bruno Costa',
      'Carla Souza',
      'Denis Lima',
    ])
  })

  it('nome Z→A inverte a ordem', () => {
    const r = applySort(CLIENTS, 'name', 'desc')
    expect(r[0].name).toBe('Denis Lima')
    expect(r[3].name).toBe('Ana Pereira')
  })

  it('sort é estável — não altera clientes com mesmo nome', () => {
    const twins: MockClient[] = [
      { id: 'x1', name: 'Zé', type: 'pf', created_at: '2025-01-01' },
      { id: 'x2', name: 'Zé', type: 'pj', created_at: '2025-02-01' },
    ]
    const asc = applySort(twins, 'name', 'asc')
    const desc = applySort(twins, 'name', 'desc')
    expect(asc[0].id).toBe(desc[0].id)
  })
})

describe('ClientsPage — ordenação por data de cadastro', () => {
  it('mais recente primeiro (desc)', () => {
    const r = applySort(CLIENTS, 'created_at', 'desc')
    expect(r[0].created_at).toBe('2025-06-01')
    expect(r[r.length - 1].created_at).toBe('2024-11-20')
  })

  it('mais antigo primeiro (asc)', () => {
    const r = applySort(CLIENTS, 'created_at', 'asc')
    expect(r[0].created_at).toBe('2024-11-20')
    expect(r[r.length - 1].created_at).toBe('2025-06-01')
  })

  it('cliente sem created_at fica no início do asc', () => {
    const extras: MockClient[] = [
      { id: 'a', name: 'Alfa', type: 'pf', created_at: undefined },
      { id: 'b', name: 'Beta', type: 'pf', created_at: '2025-01-01' },
    ]
    const r = applySort(extras, 'created_at', 'asc')
    expect(r[0].id).toBe('a')
  })
})

describe('ClientsPage — ordenação por cidade', () => {
  it('cidade A→Z ordena corretamente', () => {
    const r = applySort(CLIENTS, 'cidade', 'asc')
    const cidades = r.map(c => c.cidade || '')
    expect(cidades).toEqual(['Curitiba', 'Rio de Janeiro', 'São Paulo', 'São Paulo'])
  })

  it('cidade Z→A inverte', () => {
    const r = applySort(CLIENTS, 'cidade', 'desc')
    expect(r[0].cidade).toContain('São Paulo')
    expect(r[r.length - 1].cidade).toBe('Curitiba')
  })

  it('cliente sem cidade vai antes no asc', () => {
    const extras: MockClient[] = [
      { id: 'sem', name: 'Sem Cidade', type: 'pf' },
      { id: 'sp', name: 'São Paulo', type: 'pf', cidade: 'São Paulo' },
    ]
    const r = applySort(extras, 'cidade', 'asc')
    expect(r[0].id).toBe('sem')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// EXPORTAÇÃO — geração do conteúdo CSV
// ═════════════════════════════════════════════════════════════════════════════
describe('ClientsPage — exportação CSV', () => {
  it('primeira linha é sempre o cabeçalho', () => {
    const csv = buildCsvRows(CLIENTS)
    expect(csv.split('\n')[0]).toBe(
      'Nome,Tipo,CPF/CNPJ,Telefone,Email,Cidade,Status,Processos,Cadastro'
    )
  })

  it('número de linhas = cabeçalho + 1 por cliente', () => {
    const csv = buildCsvRows(CLIENTS)
    expect(csv.split('\n')).toHaveLength(CLIENTS.length + 1)
  })

  it('Pessoa Física é representada como "Pessoa Física"', () => {
    const csv = buildCsvRows([CLIENTS[0]])
    expect(csv).toContain('"Pessoa Física"')
  })

  it('Pessoa Jurídica é representada como "Pessoa Jurídica"', () => {
    const csv = buildCsvRows([CLIENTS[1]])
    expect(csv).toContain('"Pessoa Jurídica"')
  })

  it('status active vira "Ativo"', () => {
    const csv = buildCsvRows([CLIENTS[0]])
    expect(csv).toContain('"Ativo"')
  })

  it('status inactive vira "Inativo"', () => {
    const csv = buildCsvRows([CLIENTS[1]])
    expect(csv).toContain('"Inativo"')
  })

  it('status prospect vira "Prospect"', () => {
    const csv = buildCsvRows([CLIENTS[2]])
    expect(csv).toContain('"Prospect"')
  })

  it('conta processos corretamente', () => {
    const csv = buildCsvRows([CLIENTS[2]], PROC_MAP) // c3 tem 2 processos
    expect(csv).toContain('"2"')
  })

  it('cliente sem processos exibe "0"', () => {
    const csv = buildCsvRows([CLIENTS[1]], PROC_MAP) // c2 sem processos
    expect(csv).toContain('"0"')
  })

  it('nome do cliente aparece entre aspas', () => {
    const csv = buildCsvRows([CLIENTS[0]])
    expect(csv).toContain('"Ana Pereira"')
  })

  it('email aparece no CSV', () => {
    const csv = buildCsvRows([CLIENTS[0]])
    expect(csv).toContain('"ana@adv.com"')
  })

  it('cidade aparece no CSV', () => {
    const csv = buildCsvRows([CLIENTS[0]])
    expect(csv).toContain('"São Paulo"')
  })

  it('cpf_cnpj aparece quando preenchido', () => {
    const csv = buildCsvRows([CLIENTS[3]])
    expect(csv).toContain('"12.345.678/0001-90"')
  })

  it('cpf_cnpj ausente exibe "—"', () => {
    const csv = buildCsvRows([CLIENTS[0]])
    expect(csv).toContain('"—"')
  })

  it('lista vazia gera apenas o cabeçalho', () => {
    const csv = buildCsvRows([])
    expect(csv.trim()).toBe('Nome,Tipo,CPF/CNPJ,Telefone,Email,Cidade,Status,Processos,Cadastro')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// CONTAGEM DE FILTROS ATIVOS — badge do botão Filtrar
// ═════════════════════════════════════════════════════════════════════════════
describe('ClientsPage — contagem de filtros ativos', () => {
  function countActive(opts: {
    statusFilter?: string
    typeFilter?: string
    areaFilter?: string
    cidadeFilter?: string
    activeProcessFilter?: 'all' | 'with' | 'without'
  }) {
    const { statusFilter = '', typeFilter = '', areaFilter = '', cidadeFilter = '', activeProcessFilter = 'all' } = opts
    return [
      statusFilter,
      typeFilter,
      areaFilter,
      cidadeFilter,
      activeProcessFilter !== 'all' ? activeProcessFilter : '',
    ].filter(Boolean).length
  }

  it('nenhum filtro → count 0', () => {
    expect(countActive({})).toBe(0)
  })

  it('só status → count 1', () => {
    expect(countActive({ statusFilter: 'active' })).toBe(1)
  })

  it('status + tipo → count 2', () => {
    expect(countActive({ statusFilter: 'active', typeFilter: 'pf' })).toBe(2)
  })

  it('todos os filtros → count 5', () => {
    expect(countActive({
      statusFilter: 'active', typeFilter: 'pf', areaFilter: 'Trabalhista',
      cidadeFilter: 'São Paulo', activeProcessFilter: 'with',
    })).toBe(5)
  })

  it('activeProcessFilter "all" não conta', () => {
    expect(countActive({ activeProcessFilter: 'all' })).toBe(0)
  })

  it('activeProcessFilter "with" conta como 1', () => {
    expect(countActive({ activeProcessFilter: 'with' })).toBe(1)
  })

  it('activeProcessFilter "without" conta como 1', () => {
    expect(countActive({ activeProcessFilter: 'without' })).toBe(1)
  })
})

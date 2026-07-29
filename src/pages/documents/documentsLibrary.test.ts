import { describe, it, expect } from 'vitest'

// ─── Tipos mínimos ─────────────────────────────────────────────────────────────
type MockDoc = { id: string; title: string; type: string; category?: string | null; is_library_public?: true }

// ─── Réplica do filtro de displayDocs (busca + tipo) de DocumentsPage ─────────
function filterDocs(docs: MockDoc[], opts: { search?: string; typeFilter?: string }) {
  const { search = '', typeFilter = '' } = opts
  return docs.filter(d => {
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase())
    const matchType = !typeFilter || d.type === typeFilter
    return matchSearch && matchType
  })
}

// ─── Réplica das regras de visibilidade dos botões de ação por documento ─────
function canEditDelete(doc: MockDoc, isSuperAdmin: boolean): boolean {
  if (doc.is_library_public) return isSuperAdmin
  return true
}
function showsUseTemplate(doc: MockDoc): boolean {
  return !!doc.is_library_public
}

const ESCRITORIO_DOCS: MockDoc[] = [
  { id: 'd1', title: 'Contrato Padrão', type: 'contract' },
  { id: 'd2', title: 'Petição Modelo Trabalhista', type: 'petition' },
]
const LIBRARY_DOCS: MockDoc[] = [
  { id: 'l1', title: 'Procuração Ad Judicia', type: 'template', is_library_public: true },
  { id: 'l2', title: 'Contestação Cível', type: 'petition', is_library_public: true },
]

describe('DocumentsPage — filtro de busca e tipo', () => {
  it('sem filtros retorna todos os documentos do escritório', () => {
    expect(filterDocs(ESCRITORIO_DOCS, {})).toHaveLength(2)
  })
  it('busca por título (case-insensitive)', () => {
    const r = filterDocs(ESCRITORIO_DOCS, { search: 'trabalhista' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('d2')
  })
  it('filtra por tipo', () => {
    const r = filterDocs(ESCRITORIO_DOCS, { typeFilter: 'contract' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('d1')
  })
  it('filtra a biblioteca pública do mesmo jeito', () => {
    const r = filterDocs(LIBRARY_DOCS, { search: 'procuração' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('l1')
  })
})

describe('DocumentsPage — permissões de edição/exclusão', () => {
  it('documento do escritório pode ser editado por qualquer usuário autenticado', () => {
    expect(canEditDelete(ESCRITORIO_DOCS[0], false)).toBe(true)
    expect(canEditDelete(ESCRITORIO_DOCS[0], true)).toBe(true)
  })
  it('modelo da biblioteca pública só pode ser editado por super_admin', () => {
    expect(canEditDelete(LIBRARY_DOCS[0], false)).toBe(false)
    expect(canEditDelete(LIBRARY_DOCS[0], true)).toBe(true)
  })
})

describe('DocumentsPage — botão "Usar modelo"', () => {
  it('aparece apenas para itens da biblioteca pública', () => {
    expect(showsUseTemplate(LIBRARY_DOCS[0])).toBe(true)
    expect(showsUseTemplate(ESCRITORIO_DOCS[0])).toBe(false)
  })
})

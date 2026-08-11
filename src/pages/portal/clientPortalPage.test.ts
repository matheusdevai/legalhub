import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock encadeável do supabase, um por tabela, pra inspecionar depois se
// cada consulta chamou .eq('client_id', ...) com o valor certo. Regride
// exatamente o bug já documentado: vazamento de dados entre clientes por
// falta desse filtro em alguma das três consultas do portal.
const eqCalls: Record<string, unknown[]> = {}

function makeChain(table: string) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn((...args: unknown[]) => { eqCalls[table] = args; return chain }),
    is: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: [] })),
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}))

const { loadPortalData } = await import('./ClientPortalPage')

describe('loadPortalData — isolamento por client_id', () => {
  beforeEach(() => {
    for (const key of Object.keys(eqCalls)) delete eqCalls[key]
  })

  it('filtra processos, financeiro e documentos pelo client_id do perfil logado', async () => {
    await loadPortalData('client-123')
    expect(eqCalls['processes']).toEqual(['client_id', 'client-123'])
    expect(eqCalls['financials']).toEqual(['client_id', 'client-123'])
    expect(eqCalls['documents']).toEqual(['client_id', 'client-123'])
  })

  it('usa o client_id de cada chamada — nunca mistura clientes diferentes', async () => {
    await loadPortalData('client-A')
    expect(eqCalls['processes']).toEqual(['client_id', 'client-A'])
    await loadPortalData('client-B')
    expect(eqCalls['processes']).toEqual(['client_id', 'client-B'])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CallerProfile } from './tools'
import type { ChatToolContext } from './router'

// Cobre o que generation.test.ts e tools.test.ts não cobrem: que o loop de
// tool-calling do chat (runChatTurn, em index.ts) realmente despacha cada
// nome de tool escolhido pelo Gemini para a função certa via runTool — em
// especial gerar_minuta/analisar_documento (milestone 4), que generation.test.ts
// só testa isoladas (chamando gerarMinuta/analisarDocumento diretamente, sem
// passar pelo `switch` de runTool). index.ts não pode ser importado direto
// aqui: usa Deno.serve/`jsr:` no top-level do módulo, que não existe sob
// Vitest/Node — por isso o roteamento foi extraído para router.ts.
vi.mock('./generation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./generation')>()
  return { ...actual, gerarMinuta: vi.fn(), analisarDocumento: vi.fn() }
})

import { runTool, type ToolName } from './router'
import { gerarMinuta, analisarDocumento } from './generation'

const gerarMinutaMock = vi.mocked(gerarMinuta)
const analisarDocumentoMock = vi.mocked(analisarDocumento)

function profile(overrides: Partial<CallerProfile> = {}): CallerProfile {
  return { id: 'profile-1', user_id: 'user-1', tenant_id: 'tenant-1', role: 'lawyer', name: 'Dra. Fulana', ...overrides }
}

function ctx(overrides: Partial<ChatToolContext> = {}): ChatToolContext {
  return { supabaseUrl: 'https://project.supabase.co', userToken: 'user-jwt-token', attachment: null, ...overrides }
}

// db fake mínimo: só as tools de consulta (tools.ts) o usam de verdade; aqui
// interessa só confirmar que runTool chega até a função certa, não repetir a
// cobertura de tools.test.ts.
function fakeDb() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ not: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) }) }),
    }),
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runTool — roteamento de gerar_minuta', () => {
  it('despacha para gerarMinuta com profile, supabaseUrl/userToken do ctx e os args do modelo', async () => {
    gerarMinutaMock.mockResolvedValue({ aviso: 'AVISO', minuta: 'MINUTA GERADA' })
    const p = profile({ name: 'Dr. Ciclano' })
    const c = ctx({ supabaseUrl: 'https://x.supabase.co', userToken: 'tok-abc' })
    const args = { tipo: 'peticao_inicial', contexto: { autor_nome: 'Fulano' } }

    const result = await runTool(fakeDb(), p, 'gerar_minuta' as ToolName, args, c)

    expect(gerarMinutaMock).toHaveBeenCalledTimes(1)
    expect(gerarMinutaMock).toHaveBeenCalledWith('https://x.supabase.co', 'tok-abc', p, args)
    expect(analisarDocumentoMock).not.toHaveBeenCalled()
    expect(result).toEqual({ aviso: 'AVISO', minuta: 'MINUTA GERADA' })
  })

  it('propaga o erro devolvido por gerarMinuta sem alterar o formato', async () => {
    gerarMinutaMock.mockResolvedValue({ error: 'tipo inválido. Valores aceitos: peticao_inicial, ...' })
    const result = await runTool(fakeDb(), profile(), 'gerar_minuta' as ToolName, { tipo: 'invalido' }, ctx())
    expect(result).toEqual({ error: 'tipo inválido. Valores aceitos: peticao_inicial, ...' })
  })
})

describe('runTool — roteamento de analisar_documento', () => {
  it('despacha para analisarDocumento com supabaseUrl/userToken/args/attachment do ctx', async () => {
    analisarDocumentoMock.mockResolvedValue({ aviso: 'AVISO', analise: 'ANÁLISE GERADA' })
    const attachment = { mime_type: 'application/pdf', data_base64: 'YWJj', filename: 'doc.pdf' }
    const c = ctx({ supabaseUrl: 'https://y.supabase.co', userToken: 'tok-xyz', attachment })
    const args = { texto: 'Cláusula 1...', titulo: 'Contrato' }

    const result = await runTool(fakeDb(), profile(), 'analisar_documento' as ToolName, args, c)

    expect(analisarDocumentoMock).toHaveBeenCalledTimes(1)
    expect(analisarDocumentoMock).toHaveBeenCalledWith('https://y.supabase.co', 'tok-xyz', args, attachment)
    expect(gerarMinutaMock).not.toHaveBeenCalled()
    expect(result).toEqual({ aviso: 'AVISO', analise: 'ANÁLISE GERADA' })
  })

  it('repassa attachment null do ctx quando não há anexo na mensagem', async () => {
    analisarDocumentoMock.mockResolvedValue({ error: 'Nenhum texto de documento ou anexo foi fornecido para análise.' })
    await runTool(fakeDb(), profile(), 'analisar_documento' as ToolName, {}, ctx({ attachment: null }))
    expect(analisarDocumentoMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), {}, null)
  })
})

describe('runTool — nomes desconhecidos', () => {
  it('lança erro para um nome de tool fora da lista conhecida', async () => {
    await expect(runTool(fakeDb(), profile(), 'ferramenta_inexistente' as ToolName, {}, ctx()))
      .rejects.toThrow('Ferramenta desconhecida')
    expect(gerarMinutaMock).not.toHaveBeenCalled()
    expect(analisarDocumentoMock).not.toHaveBeenCalled()
  })
})

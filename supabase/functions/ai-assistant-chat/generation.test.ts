import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  gerarMinuta, analisarDocumento, GERAR_MINUTA_TIPOS, MINUTA_DISCLAIMER, ANALISE_DOCUMENTO_DISCLAIMER,
  type AttachmentInput,
} from './generation'
import type { CallerProfile } from './tools'

// Mesma convenção de teste de tools.test.ts (ver CLAUDE.md "Testes"): estas
// duas funções não tocam o banco, só chamam `fetch` (server-to-server pra
// ai-gemini-assistant) — então o mock aqui é só `global.fetch`, sem precisar
// de vi.mock nem de um builder fake do Supabase.

const SUPABASE_URL = 'https://project.supabase.co'
const USER_TOKEN = 'user-jwt-token'

function profile(overrides: Partial<CallerProfile> = {}): CallerProfile {
  return { id: 'profile-1', user_id: 'user-1', tenant_id: 'tenant-1', role: 'lawyer', name: 'Dra. Fulana', ...overrides }
}

function mockFetchOnce(response: { ok: boolean; json: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    json: () => Promise.resolve(response.json),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gerarMinuta', () => {
  it('rejeita tipo inválido sem chamar a rede', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: { output_text: 'x' } })
    const result = await gerarMinuta(SUPABASE_URL, USER_TOKEN, profile(), { tipo: 'peticao_final_do_mundo', contexto: {} })
    expect(result).toEqual({ error: expect.stringContaining('tipo inválido') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(GERAR_MINUTA_TIPOS)('aceita o tipo válido %s e chama ai-gemini-assistant', async (tipo) => {
    const fetchMock = mockFetchOnce({ ok: true, json: { output_text: 'MINUTA GERADA' } })
    const result = await gerarMinuta(SUPABASE_URL, USER_TOKEN, profile(), { tipo, contexto: { processo_numero: '123' } })

    expect(result).toEqual({ aviso: MINUTA_DISCLAIMER, minuta: 'MINUTA GERADA' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/ai-gemini-assistant`)
    expect(init.headers.authorization).toBe(`Bearer ${USER_TOKEN}`)
    const sentBody = JSON.parse(init.body)
    expect(sentBody.tipo).toBe(tipo)
    expect(sentBody.input_context.processo_numero).toBe('123')
  })

  it('nunca envia tenant_id no corpo — isolamento vem só do Bearer token repassado, resolvido pelo ai-gemini-assistant', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: { output_text: 'MINUTA' } })
    await gerarMinuta(SUPABASE_URL, USER_TOKEN, profile({ tenant_id: 'tenant-secreto' }), { tipo: 'parecer_juridico', contexto: {} })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).not.toContain('tenant-secreto')
    expect(init.body).not.toContain('tenant_id')
    expect(init.headers.authorization).toBe(`Bearer ${USER_TOKEN}`)
  })

  it('preenche advogado_nome com o perfil de quem conversa quando o usuário não informou outro', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: { output_text: 'MINUTA' } })
    await gerarMinuta(SUPABASE_URL, USER_TOKEN, profile({ name: 'Dr. Ciclano' }), { tipo: 'peticao_inicial', contexto: {} })

    const [, init] = fetchMock.mock.calls[0]
    const sentBody = JSON.parse(init.body)
    expect(sentBody.input_context.advogado_nome).toBe('Dr. Ciclano')
  })

  it('não sobrescreve advogado_nome se o usuário já informou um na conversa', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: { output_text: 'MINUTA' } })
    await gerarMinuta(SUPABASE_URL, USER_TOKEN, profile({ name: 'Dr. Ciclano' }), {
      tipo: 'peticao_inicial', contexto: { advogado_nome: 'Dr. Outro Advogado' },
    })

    const [, init] = fetchMock.mock.calls[0]
    const sentBody = JSON.parse(init.body)
    expect(sentBody.input_context.advogado_nome).toBe('Dr. Outro Advogado')
  })

  it('devolve o erro de ai-gemini-assistant quando a resposta não é ok', async () => {
    mockFetchOnce({ ok: false, json: { error: 'Muitas gerações em pouco tempo. Aguarde e tente novamente.' } })
    const result = await gerarMinuta(SUPABASE_URL, USER_TOKEN, profile(), { tipo: 'peticao_inicial', contexto: {} })
    expect(result).toEqual({ error: 'Muitas gerações em pouco tempo. Aguarde e tente novamente.' })
  })

  it('devolve erro genérico quando output_text vem vazio', async () => {
    mockFetchOnce({ ok: true, json: {} })
    const result = await gerarMinuta(SUPABASE_URL, USER_TOKEN, profile(), { tipo: 'peticao_inicial', contexto: {} })
    expect(result).toEqual({ error: 'A IA retornou uma resposta vazia.' })
  })

  it('nunca vaza a mensagem de exceção interna se a chamada de rede falhar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:443 segredo-interno')))
    const result = await gerarMinuta(SUPABASE_URL, USER_TOKEN, profile(), { tipo: 'peticao_inicial', contexto: {} })
    expect(result).toEqual({ error: 'Erro ao chamar a IA Jurídica.' })
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED')
  })
})

describe('analisarDocumento', () => {
  it('recusa sem chamar a rede quando não há texto nem anexo', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: { output_text: 'x' } })
    const result = await analisarDocumento(SUPABASE_URL, USER_TOKEN, {}, null)
    expect(result).toEqual({ error: expect.stringContaining('Nenhum texto') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('analisa com base só no texto colado', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: { output_text: 'ANÁLISE' } })
    const result = await analisarDocumento(SUPABASE_URL, USER_TOKEN, { texto: 'Cláusula 1...', titulo: 'Contrato' }, null)

    expect(result).toEqual({ aviso: ANALISE_DOCUMENTO_DISCLAIMER, analise: 'ANÁLISE' })
    const [, init] = fetchMock.mock.calls[0]
    const sentBody = JSON.parse(init.body)
    expect(sentBody.tipo).toBe('analise_documento')
    expect(sentBody.input_context.documento_texto).toBe('Cláusula 1...')
    expect(sentBody.input_context.documento_titulo).toBe('Contrato')
    expect(sentBody.attachment).toBeUndefined()
  })

  it('analisa com base só no anexo quando não há texto colado', async () => {
    const attachment: AttachmentInput = { mime_type: 'application/pdf', data_base64: 'YWJj', filename: 'doc.pdf' }
    const fetchMock = mockFetchOnce({ ok: true, json: { output_text: 'ANÁLISE DO PDF' } })
    const result = await analisarDocumento(SUPABASE_URL, USER_TOKEN, {}, attachment)

    expect(result).toEqual({ aviso: ANALISE_DOCUMENTO_DISCLAIMER, analise: 'ANÁLISE DO PDF' })
    const [, init] = fetchMock.mock.calls[0]
    const sentBody = JSON.parse(init.body)
    expect(sentBody.attachment).toEqual(attachment)
    expect(sentBody.input_context.documento_texto).toBe('')
  })

  it('repassa o Bearer do usuário chamador, nunca um token/tenant à parte', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: { output_text: 'ANÁLISE' } })
    await analisarDocumento(SUPABASE_URL, USER_TOKEN, { texto: 'algo' }, null)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.authorization).toBe(`Bearer ${USER_TOKEN}`)
  })

  it('devolve o erro de ai-gemini-assistant quando a resposta não é ok', async () => {
    mockFetchOnce({ ok: false, json: { error: 'Tipo de arquivo não suportado. Anexe um PDF, JPEG ou PNG.' } })
    const result = await analisarDocumento(SUPABASE_URL, USER_TOKEN, {}, { mime_type: 'image/png', data_base64: 'YWJj', filename: 'f.png' })
    expect(result).toEqual({ error: 'Tipo de arquivo não suportado. Anexe um PDF, JPEG ou PNG.' })
  })

  it('nunca vaza a mensagem de exceção interna se a chamada de rede falhar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout ao segredo.internal:5432')))
    const result = await analisarDocumento(SUPABASE_URL, USER_TOKEN, { texto: 'algo' }, null)
    expect(result).toEqual({ error: 'Erro ao chamar a IA Jurídica.' })
    expect(JSON.stringify(result)).not.toContain('segredo.internal')
  })
})

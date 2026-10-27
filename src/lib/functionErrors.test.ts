import { describe, it, expect } from 'vitest'
import { extractFunctionErrorMessage } from './functionErrors'

describe('extractFunctionErrorMessage', () => {
  it('prefere o erro devolvido em data', async () => {
    expect(await extractFunctionErrorMessage(null, { error: 'Plano não encontrado' })).toBe('Plano não encontrado')
  })

  it('lê o { error } do corpo da resposta não-2xx', async () => {
    const fnErr = { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: 'Limite do plano atingido' })) }
    expect(await extractFunctionErrorMessage(fnErr, null)).toBe('Limite do plano atingido')
  })

  it('cai na mensagem do erro quando o corpo não é JSON', async () => {
    const fnErr = { message: 'Falha de rede', context: new Response('oops') }
    expect(await extractFunctionErrorMessage(fnErr, null)).toBe('Falha de rede')
  })
})

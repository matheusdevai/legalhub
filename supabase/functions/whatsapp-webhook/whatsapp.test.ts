import { describe, it, expect, vi } from 'vitest'
import { sendWhatsAppMessage } from './whatsapp'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch
}

describe('sendWhatsAppMessage', () => {
  const params = {
    phoneNumberId: '123456123',
    accessToken: 'EAAG-fake-permanent-token',
    to: '5511912345678',
    text: 'Olá! Recebemos sua mensagem.',
  }

  it('chama a Graph API com URL, método e corpo corretos (formato documentado da Meta)', async () => {
    const fetchImpl = mockFetch(200, { messaging_product: 'whatsapp', messages: [{ id: 'wamid.OUT1' }] })
    await sendWhatsAppMessage(params, fetchImpl)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, options] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v21.0/123456123/messages')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer EAAG-fake-permanent-token')
    expect(JSON.parse(options.body)).toEqual({
      messaging_product: 'whatsapp',
      to: '5511912345678',
      type: 'text',
      text: { body: 'Olá! Recebemos sua mensagem.' },
    })
  })

  it('retorna ok:true com o wa_message_id em caso de sucesso', async () => {
    const fetchImpl = mockFetch(200, { messages: [{ id: 'wamid.OUT1' }] })
    const result = await sendWhatsAppMessage(params, fetchImpl)
    expect(result).toEqual({ ok: true, waMessageId: 'wamid.OUT1' })
  })

  it('retorna ok:false com a mensagem de erro da Meta em caso de falha da API', async () => {
    const fetchImpl = mockFetch(401, { error: { message: 'Invalid OAuth access token' } })
    const result = await sendWhatsAppMessage(params, fetchImpl)
    expect(result).toEqual({ ok: false, error: 'Invalid OAuth access token' })
  })

  it('retorna ok:false em erro de rede (fetch rejeita)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    const result = await sendWhatsAppMessage(params, fetchImpl)
    expect(result).toEqual({ ok: false, error: 'network down' })
  })
})

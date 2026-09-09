import { describe, it, expect } from 'vitest'
import { parseInboundMessages } from './webhookParser'

// Fixture no formato documentado publicamente pela Meta (Cloud API > Webhooks
// > Example Payloads): https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
const TEXT_MESSAGE_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '16505551111',
              phone_number_id: '123456123',
            },
            contacts: [
              { profile: { name: 'Fulano da Silva' }, wa_id: '16315551234' },
            ],
            messages: [
              {
                from: '16315551234',
                id: 'wamid.ABGGFlCGg0cvAgo-sJQh43L5Pe4W',
                timestamp: '1603059201',
                text: { body: 'Olá, preciso de ajuda com meu processo' },
                type: 'text',
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
}

describe('parseInboundMessages', () => {
  it('extrai mensagem de texto do payload real da Meta', () => {
    const messages = parseInboundMessages(TEXT_MESSAGE_PAYLOAD)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      phoneNumberId: '123456123',
      wabaId: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      from: '16315551234',
      waMessageId: 'wamid.ABGGFlCGg0cvAgo-sJQh43L5Pe4W',
      timestamp: '1603059201',
      messageType: 'text',
      content: 'Olá, preciso de ajuda com meu processo',
    })
  })

  it('extrai caption de mensagem de imagem, sem quebrar em outros tipos', () => {
    const payload = {
      entry: [{ id: 'waba1', changes: [{ value: { metadata: { phone_number_id: 'p1' }, messages: [
        { from: '5511999998888', id: 'wamid.img1', timestamp: '1700000000', type: 'image', image: { id: 'media1', caption: 'Comprovante de pagamento' } },
      ] } }] }],
    }
    const messages = parseInboundMessages(payload)
    expect(messages[0].messageType).toBe('image')
    expect(messages[0].content).toBe('Comprovante de pagamento')
  })

  it('extrai localização', () => {
    const payload = {
      entry: [{ id: 'waba1', changes: [{ value: { metadata: { phone_number_id: 'p1' }, messages: [
        { from: '5511999998888', id: 'wamid.loc1', timestamp: '1700000000', type: 'location', location: { latitude: -23.5, longitude: -46.6, name: 'Escritório' } },
      ] } }] }],
    }
    const messages = parseInboundMessages(payload)
    expect(messages[0].content).toBe('Escritório')
  })

  it('processa múltiplas mensagens em múltiplos entries/changes', () => {
    const payload = {
      entry: [
        { id: 'waba1', changes: [{ value: { metadata: { phone_number_id: 'p1' }, messages: [
          { from: '5511111111111', id: 'wamid.1', timestamp: '1', type: 'text', text: { body: 'msg1' } },
        ] } }] },
        { id: 'waba1', changes: [{ value: { metadata: { phone_number_id: 'p1' }, messages: [
          { from: '5522222222222', id: 'wamid.2', timestamp: '2', type: 'text', text: { body: 'msg2' } },
        ] } }] },
      ],
    }
    const messages = parseInboundMessages(payload)
    expect(messages).toHaveLength(2)
    expect(messages.map(m => m.waMessageId)).toEqual(['wamid.1', 'wamid.2'])
  })

  it('ignora payload sem messages (ex: só statuses) sem quebrar', () => {
    const payload = {
      entry: [{ id: 'waba1', changes: [{ value: { metadata: { phone_number_id: 'p1' }, statuses: [{ id: 'wamid.x', status: 'delivered' }] } }] }],
    }
    expect(parseInboundMessages(payload)).toEqual([])
  })

  it('retorna array vazio para payload inválido/vazio', () => {
    expect(parseInboundMessages({})).toEqual([])
    expect(parseInboundMessages(null)).toEqual([])
    expect(parseInboundMessages(undefined)).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyMetaWebhookSignature } from './signature'

const APP_SECRET = 'test-app-secret-12345'
const BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [] }] })

function realMetaSignature(secret: string, body: string): string {
  // Reproduz exatamente o que a Meta faz: HMAC-SHA256 do corpo bruto com o
  // App Secret, hex digest, prefixado com "sha256=". Calculado com
  // node:crypto (independente da implementação em signature.ts, que usa Web
  // Crypto) pra não validar a função contra si mesma.
  const hex = createHmac('sha256', secret).update(body).digest('hex')
  return `sha256=${hex}`
}

describe('verifyMetaWebhookSignature', () => {
  it('aceita uma assinatura válida', async () => {
    const signature = realMetaSignature(APP_SECRET, BODY)
    expect(await verifyMetaWebhookSignature(BODY, signature, APP_SECRET)).toBe(true)
  })

  it('rejeita assinatura calculada com o secret errado', async () => {
    const signature = realMetaSignature('secret-errado', BODY)
    expect(await verifyMetaWebhookSignature(BODY, signature, APP_SECRET)).toBe(false)
  })

  it('rejeita assinatura de um corpo diferente (payload adulterado)', async () => {
    const signature = realMetaSignature(APP_SECRET, BODY)
    const tamperedBody = BODY.replace('"1"', '"2"')
    expect(await verifyMetaWebhookSignature(tamperedBody, signature, APP_SECRET)).toBe(false)
  })

  it('rejeita header ausente', async () => {
    expect(await verifyMetaWebhookSignature(BODY, null, APP_SECRET)).toBe(false)
  })

  it('rejeita header sem o prefixo sha256=', async () => {
    const hex = createHmac('sha256', APP_SECRET).update(BODY).digest('hex')
    expect(await verifyMetaWebhookSignature(BODY, hex, APP_SECRET)).toBe(false)
  })

  it('rejeita header mal formado', async () => {
    expect(await verifyMetaWebhookSignature(BODY, 'sha256=nao-e-hex-valido', APP_SECRET)).toBe(false)
  })
})

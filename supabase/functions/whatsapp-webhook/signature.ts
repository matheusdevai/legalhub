// Validação da assinatura do webhook da Meta (header `X-Hub-Signature-256`):
// HMAC-SHA256 do corpo bruto (raw bytes, ANTES de qualquer JSON.parse) usando
// o App Secret do app Meta for Developers (`WHATSAPP_APP_SECRET`). Formato do
// header: "sha256=<hex digest>".
//
// Usa Web Crypto (`crypto.subtle`) em vez de um módulo de hash externo — API
// padrão disponível tanto no runtime Deno das Edge Functions quanto no Node
// (>=19) que roda os testes via Vitest, sem precisar mockar nada.
const encoder = new TextEncoder()

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader) return false
  const prefix = 'sha256='
  if (!signatureHeader.startsWith(prefix)) return false
  const receivedHex = signatureHeader.slice(prefix.length)
  const expectedHex = await hmacSha256Hex(appSecret, rawBody)
  return timingSafeEqual(receivedHex, expectedHex)
}

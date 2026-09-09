// Parsing do payload de webhook de mensagem recebida da Meta Cloud API.
// Formato documentado publicamente (Cloud API > Webhooks > Example Payloads):
// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
//
// {
//   "object": "whatsapp_business_account",
//   "entry": [{
//     "id": "<WABA_ID>",
//     "changes": [{
//       "field": "messages",
//       "value": {
//         "messaging_product": "whatsapp",
//         "metadata": { "display_phone_number": "...", "phone_number_id": "..." },
//         "contacts": [{ "profile": { "name": "..." }, "wa_id": "..." }],
//         "messages": [{ "from": "...", "id": "wamid...", "timestamp": "...", "type": "text", "text": { "body": "..." } }]
//       }
//     }]
//   }]
// }
//
// Esta fatia (milestone 8) só trata `value.messages[]` (mensagem recebida).
// `value.statuses[]` (confirmação de entrega/leitura de mensagens que NÓS
// enviamos) fica fora de escopo por enquanto — não pedido nesta fatia.

export type ParsedInboundMessage = {
  phoneNumberId: string
  wabaId: string
  from: string
  waMessageId: string
  timestamp: string
  messageType: string
  content: string | null
  raw: unknown
}

type MetaTextMessage = { type: 'text'; text?: { body?: string } }
type MetaMediaMessage = { type: 'image' | 'video' | 'audio' | 'document' | 'sticker'; [key: string]: unknown }
type MetaLocationMessage = { type: 'location'; location?: { latitude?: number; longitude?: number; name?: string; address?: string } }
type MetaButtonMessage = { type: 'button'; button?: { text?: string } }
type MetaInteractiveMessage = { type: 'interactive'; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }
type MetaMessage = { from: string; id: string; timestamp: string; type: string } & Partial<
  MetaTextMessage & MetaMediaMessage & MetaLocationMessage & MetaButtonMessage & MetaInteractiveMessage
>

function extractContent(message: MetaMessage): string | null {
  switch (message.type) {
    case 'text':
      return message.text?.body ?? null
    case 'image':
    case 'video':
    case 'document':
    case 'sticker': {
      const media = (message as Record<string, { caption?: string; filename?: string }>)[message.type]
      return media?.caption ?? media?.filename ?? null
    }
    case 'location': {
      const loc = message.location
      if (!loc) return null
      return loc.name || loc.address || `${loc.latitude ?? ''},${loc.longitude ?? ''}`
    }
    case 'button':
      return message.button?.text ?? null
    case 'interactive':
      return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null
    default:
      return null
  }
}

export function parseInboundMessages(payload: unknown): ParsedInboundMessage[] {
  const result: ParsedInboundMessage[] = []
  const entries = (payload as { entry?: unknown[] })?.entry
  if (!Array.isArray(entries)) return result

  for (const entry of entries) {
    const wabaId = (entry as { id?: string })?.id ?? ''
    const changes = (entry as { changes?: unknown[] })?.changes
    if (!Array.isArray(changes)) continue

    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value
      if (!value) continue
      const metadata = value.metadata as { phone_number_id?: string } | undefined
      const phoneNumberId = metadata?.phone_number_id ?? ''
      const messages = value.messages as MetaMessage[] | undefined
      if (!Array.isArray(messages)) continue

      for (const message of messages) {
        if (!message?.from || !message?.id) continue
        result.push({
          phoneNumberId,
          wabaId,
          from: message.from,
          waMessageId: message.id,
          timestamp: message.timestamp ?? '',
          messageType: message.type ?? 'unknown',
          content: extractContent(message),
          raw: message,
        })
      }
    }
  }

  return result
}

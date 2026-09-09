// Envio de mensagem de texto via Meta Cloud API (Graph API).
// https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
//
// Função isolada e testável (mocka `fetch`) — a Milestone 9 (inbox) vai
// chamar `sendWhatsAppMessage` a partir da UI; aqui só a função pronta, sem
// UI de disparo ainda.

const GRAPH_API_VERSION = 'v21.0'

export type SendWhatsAppMessageParams = {
  phoneNumberId: string
  accessToken: string
  to: string
  text: string
}

export type SendWhatsAppMessageResult =
  | { ok: true; waMessageId: string }
  | { ok: false; error: string }

export async function sendWhatsAppMessage(
  params: SendWhatsAppMessageParams,
  fetchImpl: typeof fetch = fetch,
): Promise<SendWhatsAppMessageResult> {
  const { phoneNumberId, accessToken, to, text } = params
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro de rede ao chamar a Graph API'
    return { ok: false, error: message }
  }

  const body = await response.json().catch(() => null) as
    | { messages?: Array<{ id: string }>; error?: { message?: string } }
    | null

  if (!response.ok || !body?.messages?.[0]?.id) {
    const errorMessage = body?.error?.message || `Falha ao enviar mensagem (HTTP ${response.status})`
    return { ok: false, error: errorMessage }
  }

  return { ok: true, waMessageId: body.messages[0].id }
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { verifyMetaWebhookSignature } from './signature.ts'
import { parseInboundMessages } from './webhookParser.ts'
import { normalizePhone, findMatchingClient, type ClientMatch } from './phoneMatch.ts'

// ============================================================================
// whatsapp-webhook — Milestone 8 da Fase 2 (WhatsApp via Meta Cloud API).
//
// GET  → handshake de verificação do webhook (Meta exige isso ao configurar
//        a Callback URL no app: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests)
// POST → recepção de mensagem (`entry[].changes[].value.messages[]`).
//
// Escopo desta fatia: validar assinatura, identificar tenant (via
// whatsapp_integration_settings.phone_number_id) e client (via telefone),
// persistir em whatsapp_messages. SEM resposta automática, classificação ou
// notificação ao advogado (fica pra depois) e SEM `value.statuses[]`
// (confirmação de entrega/leitura de mensagens enviadas por nós).
//
// `sendWhatsAppMessage` (whatsapp.ts) está pronta e testada isoladamente, mas
// ainda não é chamada por nenhuma UI — a Milestone 9 (inbox) que vai usá-la.
//
// ⚠️ DEPLOY: esta function é um webhook público chamado pela Meta (server-to-
// server, sem JWT de usuário do Supabase) — igual a stripe-webhook. A
// autenticação real é a validação de assinatura HMAC abaixo (não há seção
// [functions.*] em supabase/config.toml neste projeto pra nenhuma function,
// nem pra stripe-webhook; o padrão aqui é configurar por flag no comando de
// deploy). Deploy com verify_jwt desligado:
//   supabase functions deploy whatsapp-webhook --no-verify-jwt
// (ou o equivalente no MCP `deploy_edge_function`). Deployar com o default
// (verify_jwt ligado) faz a Meta receber 401 em toda chamada, já que ela
// nunca manda um JWT do Supabase.
// ============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// Teto de tamanho de corpo aceito ANTES de bufferizar (`req.text()`) — uma
// mensagem de WhatsApp (mesmo com mídia, que só traz um `id` de referência no
// payload, nunca o arquivo em si) não deveria nem chegar perto disso. Rejeita
// cedo por Content-Length em vez de ler um corpo arbitrariamente grande pra
// só então calcular o HMAC.
const MAX_BODY_BYTES = 1 * 1024 * 1024

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function handleVerification(req: Request, verifyToken: string): Response {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200, headers: CORS })
  }
  return json({ error: 'Verificação do webhook falhou' }, 403)
}

type SupabaseAdmin = ReturnType<typeof createClient>

async function resolveTenantId(supabaseAdmin: SupabaseAdmin, phoneNumberId: string): Promise<string | null> {
  if (!phoneNumberId) return null
  const { data } = await supabaseAdmin
    .from('whatsapp_integration_settings')
    .select('tenant_id')
    .eq('phone_number_id', phoneNumberId)
    .is('deleted_at', null)
    .maybeSingle()
  return (data as { tenant_id: string } | null)?.tenant_id ?? null
}

async function resolveClientMatch(supabaseAdmin: SupabaseAdmin, tenantId: string, fromPhone: string): Promise<ClientMatch> {
  const { data } = await supabaseAdmin
    .from('clients')
    .select('id, phone')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .not('phone', 'is', null)
  const clients = (data as Array<{ id: string; phone: string | null }> | null) || []
  return findMatchingClient(fromPhone, clients)
}

async function handleIncomingMessages(rawBody: string, supabaseAdmin: SupabaseAdmin): Promise<Response> {
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const messages = parseInboundMessages(payload)

  for (const message of messages) {
    const tenantId = await resolveTenantId(supabaseAdmin, message.phoneNumberId)
    if (!tenantId) {
      // Nenhuma conta configurada em whatsapp_integration_settings para este
      // phone_number_id — não temos como saber de qual tenant é a mensagem,
      // então não persistimos (whatsapp_messages.tenant_id é NOT NULL, exigido
      // pela RLS por tenant). Loga pra investigação manual.
      console.error(`whatsapp-webhook: nenhum tenant configurado para phone_number_id=${message.phoneNumberId}`)
      continue
    }

    const phoneNumber = normalizePhone(message.from)
    const { clientId, confidence } = await resolveClientMatch(supabaseAdmin, tenantId, phoneNumber)

    const { error } = await supabaseAdmin.from('whatsapp_messages').insert({
      tenant_id: tenantId,
      client_id: clientId,
      client_match_confidence: confidence,
      phone_number: phoneNumber,
      direction: 'inbound',
      message_type: message.messageType,
      content: message.content,
      status: 'received',
      wa_message_id: message.waMessageId,
      raw_payload: message.raw,
    })

    if (error && error.code !== '23505') {
      // 23505 = unique_violation em (tenant_id, wa_message_id) — retry de
      // webhook da Meta reenviando a mesma mensagem. Ignora silenciosamente
      // (idempotência); qualquer outro erro é logado.
      console.error('whatsapp-webhook: erro ao gravar mensagem', error)
    }
  }

  // Responde 200 rápido e sempre — a Meta reinterpreta erro/timeout como
  // "não recebi" e reenvia o webhook. Falhas pontuais já foram logadas acima.
  return json({ received: true })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN')
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET')

  if (req.method === 'GET') {
    if (!verifyToken) {
      return json({ error: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN não configurado neste ambiente' }, 501)
    }
    return handleVerification(req, verifyToken)
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  if (!appSecret) {
    return json({ error: 'WHATSAPP_APP_SECRET não configurado neste ambiente' }, 501)
  }

  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: 'Corpo da requisição excede o tamanho máximo aceito' }, 413)
  }

  // Corpo bruto, sem parse — a verificação de assinatura precisa dos bytes
  // exatos enviados pela Meta. Nunca fazer req.json() antes disto.
  const rawBody = await req.text()
  const signatureHeader = req.headers.get('x-hub-signature-256')
  const validSignature = await verifyMetaWebhookSignature(rawBody, signatureHeader, appSecret)
  if (!validSignature) {
    return json({ error: 'Assinatura inválida' }, 401)
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  return handleIncomingMessages(rawBody, supabaseAdmin)
})

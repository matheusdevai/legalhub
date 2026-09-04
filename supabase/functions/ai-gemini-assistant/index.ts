import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildAnaliseProcessoAdministrativoPrompt, buildAnaliseProcessoJudicialPrompt } from './prompts/analiseProcesso.ts'
import { buildAnaliseDocumentoPrompt } from './prompts/analiseDocumento.ts'
import { buildPeticaoInicialPrompt } from './prompts/peticaoInicial.ts'
import { buildCumprimentoDespachoPrompt } from './prompts/cumprimentoDespacho.ts'
import { buildImpugnacaoRecursoPrompt } from './prompts/impugnacaoRecurso.ts'
import { buildParecerJuridicoPrompt } from './prompts/parecerJuridico.ts'
import { validateAttachment, type AttachmentInput } from './attachmentValidation.ts'

// ============================================================================
// ai-gemini-assistant — Edge Function compartilhada da "IA Jurídica" (fase 1/4)
//
// Contrato:
//   POST { tipo, processo_id?, input_context, attachment? } -> { id, output_text, status }
//   attachment (opcional): { mime_type, data_base64, filename } — PDF/JPEG/PNG,
//   até 15MB, revalidado no servidor (attachmentValidation.ts) e passado como
//   inlineData extra pro Gemini. Nunca salvo em bucket/tabela — efêmero à chamada.
//
// Esta função só cuida de auth/tenant/persistência/chamada à API do Gemini.
// A engenharia de prompt por `tipo` é responsabilidade da fase 2 — ver
// buildPrompt() abaixo, um TODO por tipo. Ver FOUNDATION_CONTRACT.md na raiz
// do work dir da missão para o guia completo de onde os builders da fase 2
// devem editar.
// ============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Mesmo modelo free-tier-friendly usado por ai-assistant (Copiloto do
// Dashboard). GEMINI_API_KEY é lida em tempo de chamada (nunca no boot) —
// a função sobe e faz deploy normalmente mesmo sem a chave configurada,
// e só falha (com erro claro) quando alguém de fato tenta gerar algo.
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash'

// Rate limit por usuário chamador, mesmo padrão de create-user/ai-assistant
// contra edge_function_rate_limits (só acessível via service role). Limite
// mais próximo do de create-user do que do de ai-assistant: cada geração
// aqui é uma chamada pesada (petição/parecer), não uma mensagem de chat.
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60 * 60 * 1000

const TIPOS_VALIDOS = [
  'analise_processo_administrativo',
  'analise_processo_judicial',
  'analise_documento',
  'peticao_inicial',
  'cumprimento_despacho',
  'impugnacao_recurso',
  'parecer_juridico',
] as const

type Tipo = typeof TIPOS_VALIDOS[number]

async function checkRateLimit(supabaseAdmin: ReturnType<typeof createClient>, key: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('edge_function_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('rate_key', key)
    .gte('created_at', windowStart)
  if ((count ?? 0) >= RATE_LIMIT) return false
  await supabaseAdmin.from('edge_function_rate_limits').insert({ rate_key: key })
  await supabaseAdmin.from('edge_function_rate_limits').delete().lt('created_at', new Date(Date.now() - 24 * RATE_WINDOW_MS).toISOString())
  return true
}

// ----------------------------------------------------------------------------
// buildPrompt: UM case por `tipo`. Fase 2 (dois builders, 3 tipos cada) edita
// SÓ o case do seu tipo — evita conflito de merge entre os dois. Cada case
// hoje devolve um placeholder óbvio; substituir por prompt real usando
// `context` (o input_context enviado pelo frontend) e, se precisar de mais
// dados do processo/cliente, buscar via supabaseAdmin (ver runGeneration).
// ----------------------------------------------------------------------------
function buildPrompt(tipo: Tipo, context: Record<string, unknown>): string {
  switch (tipo) {
    case 'analise_processo_administrativo':
      return buildAnaliseProcessoAdministrativoPrompt(context)

    case 'analise_processo_judicial':
      return buildAnaliseProcessoJudicialPrompt(context)

    case 'analise_documento':
      return buildAnaliseDocumentoPrompt(context)

    case 'peticao_inicial':
      return buildPeticaoInicialPrompt(context)

    case 'cumprimento_despacho':
      return buildCumprimentoDespachoPrompt(context)

    case 'impugnacao_recurso':
      return buildImpugnacaoRecursoPrompt(context)

    case 'parecer_juridico':
      return buildParecerJuridicoPrompt(context)

    default: {
      const _exhaustive: never = tipo
      throw new Error(`Tipo desconhecido: ${_exhaustive}`)
    }
  }
}

async function callGemini(prompt: string, apiKey: string, attachment?: { mimeType: string; data: string }): Promise<string> {
  // Gemini aceita PDF/imagem nativamente via inlineData como uma part extra —
  // nenhuma extração de texto no servidor, o modelo lê o arquivo direto.
  const parts: Record<string, unknown>[] = [{ text: prompt }]
  if (attachment) parts.push({ inlineData: { mimeType: attachment.mimeType, data: attachment.data } })

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.4 },
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    console.error('Gemini API error:', errText)
    throw new Error('Erro ao consultar a IA (Gemini)')
  }

  const data = await resp.json()
  const candidate = data.candidates?.[0]
  if (!candidate || candidate.finishReason === 'SAFETY') {
    throw new Error('A IA não pôde gerar uma resposta para essa solicitação.')
  }
  const parts = candidate.content?.parts || []
  const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n')
  if (!text) throw new Error('A IA retornou uma resposta vazia.')
  return text
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // --- Auth: token real via auth.getUser(), mesmo padrão de ai-assistant/create-user ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Token de autorização ausente' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // --- Tenant: SEMPRE derivado do profile do chamador, nunca de um campo enviado pelo cliente ---
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('id, role, tenant_id').eq('id', user.id).single()
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: 'Perfil sem escritório associado' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (profile.role === 'client') {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const withinLimit = await checkRateLimit(supabaseAdmin, `ai-gemini-assistant:${user.id}`)
    if (!withinLimit) {
      return new Response(JSON.stringify({ error: 'Muitas gerações em pouco tempo. Aguarde e tente novamente.' }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // --- Payload ---
    const body = await req.json().catch(() => null) as { tipo?: string; processo_id?: string; input_context?: Record<string, unknown>; attachment?: AttachmentInput } | null
    const tipo = body?.tipo
    if (!tipo || !TIPOS_VALIDOS.includes(tipo as Tipo)) {
      return new Response(JSON.stringify({ error: `tipo inválido. Valores aceitos: ${TIPOS_VALIDOS.join(', ')}` }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    const processoId = body?.processo_id ?? null
    const inputContext = body?.input_context ?? {}

    // Nunca confia na validação do cliente — tipo/tamanho revalidados aqui.
    const attachmentError = validateAttachment(body?.attachment)
    if (attachmentError) {
      return new Response(JSON.stringify({ error: attachmentError }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    const attachment = body?.attachment
      ? { mimeType: body.attachment.mime_type!, data: body.attachment.data_base64! }
      : undefined

    // Se um processo foi indicado, confirma que pertence ao tenant do chamador
    // antes de vincular (nunca confia no processo_id às cegas).
    if (processoId) {
      const { data: processo } = await supabaseAdmin
        .from('processes').select('id').eq('id', processoId).eq('tenant_id', profile.tenant_id).is('deleted_at', null).maybeSingle()
      if (!processo) {
        return new Response(JSON.stringify({ error: 'Processo não encontrado neste escritório' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
    }

    // Registra a geração como "pending" antes de chamar a IA, para sempre
    // termos rastro mesmo se a chamada ao Gemini falhar.
    const { data: generation, error: insertErr } = await supabaseAdmin
      .from('ai_generations')
      .insert({
        tenant_id: profile.tenant_id,
        created_by: user.id,
        processo_id: processoId,
        tipo,
        input_context: inputContext,
        status: 'pending',
      })
      .select('id')
      .single()
    if (insertErr || !generation) {
      console.error('ai_generations insert error:', insertErr)
      return new Response(JSON.stringify({ error: 'Erro ao registrar a geração' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // GEMINI_API_KEY só é exigida aqui — em tempo de chamada — não no boot da função.
    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_KEY) {
      await supabaseAdmin.from('ai_generations').update({ status: 'error', error_message: 'GEMINI_API_KEY não configurada' }).eq('id', generation.id)
      return new Response(JSON.stringify({ error: 'Excelência ainda não configurada neste ambiente (GEMINI_API_KEY ausente)' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    try {
      const prompt = buildPrompt(tipo as Tipo, inputContext)
      const outputText = await callGemini(prompt, GEMINI_KEY, attachment)

      await supabaseAdmin.from('ai_generations').update({ status: 'completed', output_text: outputText }).eq('id', generation.id)

      return new Response(JSON.stringify({ id: generation.id, output_text: outputText, status: 'completed' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    } catch (genErr: unknown) {
      const message = genErr instanceof Error ? genErr.message : 'Erro ao gerar conteúdo'
      await supabaseAdmin.from('ai_generations').update({ status: 'error', error_message: message }).eq('id', generation.id)
      return new Response(JSON.stringify({ id: generation.id, error: message, status: 'error' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('ai-gemini-assistant error:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

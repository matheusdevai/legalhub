import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { AI_SUGGESTION_PROMPT, parseAiSuggestion } from "../_shared/deadlines/suggest.ts"

// Controle de Prazos — segunda leitura da intimação pela IA (especificação, fase 5).
// Só é chamada quando a leitura por regras (suggestFromText) ficou com
// confiança baixa e a pessoa pede. Recebe o id da intimação — nunca texto
// solto — e lê o teor no banco já filtrando pelo escritório do chamador, para
// a função não virar um proxy aberto do Gemini. A resposta passa por
// parseAiSuggestion (validação + trecho tem que existir no texto) e volta como
// sugestão, nunca com confiança alta; quem cadastra confere e o conferente
// confere de novo. Mesmo modelo, chave e padrão de auth do ai-gemini-assistant.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash'
const RATE_LIMIT = 30
const RATE_WINDOW_SECONDS = 60 * 60
const MAX_TEXT = 20_000

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (!token) return json({ error: 'Token de autorização ausente' }, 401)
    const { data: { user }, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !user) return json({ error: 'Não autorizado' }, 401)

    const { data: profile } = await admin.from('profiles').select('id, role, tenant_id').eq('id', user.id).single()
    if (!profile?.tenant_id || profile.role === 'client') return json({ error: 'Não autorizado' }, 403)

    const { data: allowed, error: rlErr } = await admin.rpc('check_rate_limit', { p_key: `deadline-suggest:${user.id}`, p_limit: RATE_LIMIT, p_window_seconds: RATE_WINDOW_SECONDS })
    if (rlErr) return json({ error: 'Erro ao verificar limite de uso' }, 500)
    if (allowed !== true) return json({ error: 'Muitas leituras pela IA em pouco tempo. Aguarde e tente novamente.' }, 429)

    const body = await req.json().catch(() => null) as { communication_id?: string } | null
    if (!body?.communication_id) return json({ error: 'communication_id é obrigatório' }, 400)
    const { data: comm } = await admin.from('communications').select('id, title, content')
      .eq('id', body.communication_id).eq('tenant_id', profile.tenant_id).is('deleted_at', null).maybeSingle()
    if (!comm) return json({ error: 'Intimação não encontrada neste escritório' }, 404)
    const text = [comm.title, comm.content].filter(Boolean).join('\n').slice(0, MAX_TEXT)
    if (!text.trim()) return json({ error: 'A intimação não tem texto para ler' }, 422)

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return json({ error: 'IA ainda não configurada neste ambiente (GEMINI_API_KEY ausente)' }, 500)

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: AI_SUGGESTION_PROMPT.replace('{{TEXTO}}', text) }] }],
        // O raciocínio do modelo conta no limite de saída: com pouco espaço o JSON chega cortado.
        generationConfig: { maxOutputTokens: 8192, temperature: 0, responseMimeType: 'application/json' },
      }),
      // O modelo leva ~20 s nessa leitura; o limite das Edge Functions é bem maior que 55 s.
      signal: AbortSignal.timeout(55_000),
    }).catch(e => { if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) return null; throw e })
    if (!resp) return json({ error: 'A IA demorou demais para responder. Tente de novo em instantes ou preencha à mão.' }, 504)
    if (!resp.ok) {
      console.error('Gemini API error:', await resp.text())
      return json({ error: 'Erro ao consultar a IA' }, 502)
    }
    const data = await resp.json()
    const candidate = data.candidates?.[0]
    if (candidate?.finishReason === 'MAX_TOKENS') console.error('deadline-suggest: resposta cortada (MAX_TOKENS)')
    // Partes de raciocínio ("thought") não fazem parte da resposta.
    const raw = (candidate?.content?.parts || []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text || '').join('')
    return json({ suggestion: parseAiSuggestion(raw, text) })
  } catch (e) {
    console.error('deadline-suggest error:', e instanceof Error ? e.message : e)
    return json({ error: 'Erro interno' }, 500)
  }
})

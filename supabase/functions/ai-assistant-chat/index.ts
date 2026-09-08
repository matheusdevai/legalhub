import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  consultarPrazos, consultarTarefas, consultarAgenda, consultarProcessos,
  type CallerProfile,
} from './tools.ts'
import { type AttachmentInput, MAX_TEXT_INPUT_CHARS } from './generation.ts'
import {
  TOOL_DECLARATIONS, TOOL_NAMES, type ToolName, GENERATION_TOOL_NAMES, runTool, formatGenerationAnswer,
  type ChatToolContext,
} from './router.ts'

// ============================================================================
// ai-assistant-chat — Chat interno do LegalHub Assistente (milestones 2 e 4).
//
// Diferente de ai-gemini-assistant (prompt único, sem tools — usado pela "IA
// Jurídica" para gerar petições/pareceres), esta função usa function calling
// real do Gemini: o modelo só enxerga o que as ferramentas em tools.ts /
// generation.ts devolvem, nunca inventa processo/cliente/prazo/data
// (reforçado no SYSTEM_PROMPT abaixo).
//
// Duas famílias de ferramentas:
// - tools.ts (milestone 2): 5 consultas somente-leitura direto no banco.
// - generation.ts (milestone 4): gerar_minuta/analisar_documento, que geram
//   texto (nunca gravam nada) invocando ai-gemini-assistant via HTTP — mesma
//   chamada que a "Excelência" já faz no frontend, sem duplicar prompt.
// Nenhuma tool de ESCRITA no banco (criar tarefa/lembrete/protocolar minuta)
// existe nesta função ainda — se o usuário pedir isso, o modelo é instruído a
// dizer que ainda não consegue fazer isso automaticamente aqui.
//
// Reaproveita de ai-gemini-assistant: boilerplate de CORS, auth via
// auth.getUser(), resolução de tenant a partir do profile do chamador (nunca
// de um campo enviado pelo cliente) e o padrão de rate limit via RPC
// check_rate_limit (mesma tabela edge_function_rate_limits).
//
// Contrato:
//   POST { message?, slash_command?, attachment? } -> { answer, tools_called }
//   Exatamente um de `message` (linguagem natural) ou `slash_command` (um dos
//   atalhos da seção 55 do documento de spec) deve vir preenchido.
//   `attachment` (opcional, só com `message`): { mime_type, data_base64,
//   filename } — PDF/JPEG/PNG, mesmo formato de ai-gemini-assistant. Só é
//   usado se o modelo chamar analisar_documento nesta rodada; revalidado
//   inteiramente por ai-gemini-assistant (nunca salvo aqui).
// ============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash'

const RATE_LIMIT = 60
const RATE_WINDOW_SECONDS = 60 * 60

const SLASH_COMMANDS = [
  'hoje', 'prazos', 'urgente', 'pendencias', 'clientes', 'processos', 'tarefas', 'agenda', 'documentos', 'resumo',
] as const
type SlashCommand = typeof SLASH_COMMANDS[number]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function checkRateLimit(supabaseAdmin: ReturnType<typeof createClient>, key: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_key: key, p_limit: RATE_LIMIT, p_window_seconds: RATE_WINDOW_SECONDS,
  })
  if (error) {
    console.error('check_rate_limit RPC error:', error)
    throw new Error('Erro ao verificar limite de uso')
  }
  return data === true
}

// ----------------------------------------------------------------------------
// Ferramentas expostas ao Gemini (function calling): declarações, nomes,
// GENERATION_TOOL_NAMES, runTool e formatGenerationAnswer vêm de router.ts —
// extraído pra ser testável fora do runtime Deno/jsr: (ver router.test.ts).
// ----------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é o LegalHub Assistente, um assistente interno para advogados e equipes de escritórios de advocacia dentro do sistema LegalHub.

REGRAS INEGOCIÁVEIS:
1. Você NUNCA inventa processo, cliente, prazo, data, tarefa ou compromisso. Toda informação factual que você disser DEVE vir de uma chamada às ferramentas disponíveis (consultar_prazos, consultar_tarefas, consultar_agenda, consultar_processos, consultar_clientes). Se a pergunta exigir dado que nenhuma ferramenta cobre, diga claramente que não tem essa informação — nunca complete com um palpite.
2. Se a pergunta puder ser respondida com uma ferramenta, chame a ferramenta antes de responder. Não responda "deixa eu verificar" sem realmente chamar — chame e responda com o resultado.
3. Você pode gerar o TEXTO de minutas de peças jurídicas (gerar_minuta) e analisar documentos (analisar_documento) quando o usuário pedir. Fora isso, você é SOMENTE LEITURA: não pode protocolar, salvar, editar, excluir ou confirmar nenhuma ação real no sistema (tarefas, lembretes, prazos, documentos, mensagens de WhatsApp). Se o usuário pedir uma ação de escrita além de gerar um texto — "crie uma tarefa", "agende isso", "protocole essa petição" —, responda algo como "Ainda não consigo fazer isso automaticamente, mas você pode fazer isso na tela de [Tarefas/Agenda/Processos/Clientes] do sistema" — nunca finja que executou uma ação.
4. Seja direto e objetivo, em português do Brasil, com tom profissional e cordial. Use listas curtas quando fizer sentido. Evite textos longos (exceto o texto de uma minuta ou análise gerada por gerar_minuta/analisar_documento, que deve ser reproduzido na íntegra).
5. Nunca revele detalhes técnicos internos (nomes de tabelas, tenant_id, ids) — fale em termos de negócio (processo, cliente, prazo, tarefa).`

async function callGemini(
  apiKey: string,
  contents: Array<Record<string, unknown>>,
): Promise<{ parts: Array<Record<string, unknown>> }> {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
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
  return { parts: candidate.content?.parts || [] }
}

const MAX_TOOL_ROUNDS = 4

// Conduz o ciclo de function calling: manda a mensagem, se o modelo pedir
// tool(s), executa (com filtro de tenant/role já embutido em cada tool) e
// devolve o resultado pro modelo, até ele responder com texto final.
async function runChatTurn(
  apiKey: string,
  db: ReturnType<typeof createClient>,
  profile: CallerProfile,
  userMessage: string,
  ctx: ChatToolContext,
): Promise<{ answer: string; toolsCalled: string[] }> {
  const contents: Array<Record<string, unknown>> = [{ role: 'user', parts: [{ text: userMessage }] }]
  const toolsCalled: string[] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { parts } = await callGemini(apiKey, contents)
    const functionCalls = parts.filter((p: any) => p.functionCall) as Array<{ functionCall: { name: string; args?: Record<string, unknown> } }>

    if (functionCalls.length === 0) {
      const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n').trim()
      return { answer: text || 'Não consegui gerar uma resposta para essa pergunta.', toolsCalled }
    }

    contents.push({ role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc.functionCall })) })

    const responseParts: Array<Record<string, unknown>> = []
    let generationAnswer: string | null = null
    for (const fc of functionCalls) {
      const name = fc.functionCall.name
      if (!TOOL_NAMES.includes(name as ToolName)) {
        responseParts.push({ functionResponse: { name, response: { error: 'Ferramenta não disponível' } } })
        continue
      }
      toolsCalled.push(name)
      try {
        const result = await runTool(db, profile, name as ToolName, fc.functionCall.args || {}, ctx)
        responseParts.push({ functionResponse: { name, response: result as Record<string, unknown> } })
        if (GENERATION_TOOL_NAMES.has(name as ToolName) && generationAnswer === null) {
          generationAnswer = formatGenerationAnswer(result as Record<string, unknown>)
        }
      } catch (toolErr: unknown) {
        const message = toolErr instanceof Error ? toolErr.message : 'Erro ao executar a ferramenta'
        responseParts.push({ functionResponse: { name, response: { error: message } } })
      }
    }

    // gerar_minuta/analisar_documento já devolvem o texto final pronto (com o
    // aviso embutido) — não faz sentido mandar de volta pro Gemini "resumir"
    // dentro do maxOutputTokens de 1024 do chat (pensado pra respostas curtas
    // de consulta), o que cortaria ou parafrasearia uma petição inteira.
    // Responde direto com o texto gerado, sem mais uma volta ao modelo.
    if (generationAnswer !== null) return { answer: generationAnswer, toolsCalled }

    contents.push({ role: 'user', parts: responseParts })
  }

  return { answer: 'Não consegui concluir essa consulta — tente reformular a pergunta.', toolsCalled }
}

// ----------------------------------------------------------------------------
// Comandos de barra: atalho direto pras tools (sem passar pelo Gemini) —
// mais rápido e mais previsível para os 10 comandos fixos da seção 55.
// ----------------------------------------------------------------------------
function fmtDate(iso: string | null): string {
  if (!iso) return 'sem data'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

async function runSlashCommand(
  db: ReturnType<typeof createClient>,
  profile: CallerProfile,
  command: SlashCommand,
): Promise<{ answer: string; toolsCalled: string[] }> {
  switch (command) {
    case 'prazos': {
      const r = await consultarPrazos(db, profile, { escopo: 'todos' })
      const criticos = r.prazos_criticos as any[]
      const proximos = r.prazos_proximos as any[]
      if (criticos.length === 0 && proximos.length === 0) return { answer: 'Nenhum prazo crítico ou próximo no momento. 🎉', toolsCalled: ['consultar_prazos'] }
      const lines = [
        ...criticos.map(p => `🔴 ${p.processo} (${p.cliente || 'sem cliente'}) — prazo ${fmtDate(p.prazo)}`),
        ...proximos.map(p => `🟠 ${p.processo} (${p.cliente || 'sem cliente'}) — vence em ${p.dias} dia${p.dias === 1 ? '' : 's'}`),
      ]
      return { answer: lines.join('\n'), toolsCalled: ['consultar_prazos'] }
    }
    case 'urgente': {
      const [prazos, tarefas] = await Promise.all([
        consultarPrazos(db, profile, { escopo: 'criticos' }),
        consultarTarefas(db, profile, { status: 'atrasadas' }),
      ])
      const criticos = prazos.prazos_criticos as any[]
      const atrasadas = tarefas.tarefas_atrasadas as any[]
      if (criticos.length === 0 && atrasadas.length === 0) return { answer: 'Nada urgente no momento. 🎉', toolsCalled: ['consultar_prazos', 'consultar_tarefas'] }
      const lines = [
        ...criticos.map(p => `🔴 Prazo: ${p.processo} (${p.cliente || 'sem cliente'}) — ${fmtDate(p.prazo)}`),
        ...atrasadas.map(t => `🔴 Tarefa atrasada: ${t.tarefa}${t.responsavel ? ` (${t.responsavel})` : ''}`),
      ]
      return { answer: lines.join('\n'), toolsCalled: ['consultar_prazos', 'consultar_tarefas'] }
    }
    case 'pendencias': {
      const r = await consultarTarefas(db, profile, { status: 'pendentes' })
      const pendentes = r.tarefas_pendentes as any[]
      if (pendentes.length === 0) return { answer: 'Você não tem pendências no momento. 🎉', toolsCalled: ['consultar_tarefas'] }
      return { answer: pendentes.map(t => `• ${t.tarefa}${t.prazo ? ` — ${fmtDate(t.prazo)}` : ''}`).join('\n'), toolsCalled: ['consultar_tarefas'] }
    }
    case 'tarefas': {
      const r = await consultarTarefas(db, profile, { status: 'todas' })
      const all = [...(r.tarefas_atrasadas as any[]), ...(r.tarefas_pendentes as any[])]
      if (all.length === 0) return { answer: 'Nenhuma tarefa em aberto. 🎉', toolsCalled: ['consultar_tarefas'] }
      return { answer: all.map(t => `• ${t.tarefa}${t.prazo ? ` — ${fmtDate(t.prazo)}` : ' — sem prazo'}`).join('\n'), toolsCalled: ['consultar_tarefas'] }
    }
    case 'hoje':
    case 'agenda': {
      const r = await consultarAgenda(db, profile, { periodo: 'hoje' })
      const compromissos = r.compromissos as any[]
      if (compromissos.length === 0) return { answer: 'Nenhum compromisso na agenda de hoje.', toolsCalled: ['consultar_agenda'] }
      return { answer: compromissos.map(e => `• ${e.hora ? e.hora.slice(0, 5) + ' — ' : ''}${e.titulo}${e.cliente ? ` (${e.cliente})` : ''}`).join('\n'), toolsCalled: ['consultar_agenda'] }
    }
    case 'processos': {
      const r = await consultarProcessos(db, profile, { apenas_atencao: true })
      const processos = r.processos as any[]
      if (processos.length === 0) return { answer: 'Nenhum processo exigindo atenção no momento. 🎉', toolsCalled: ['consultar_processos'] }
      return { answer: processos.map(p => `• ${p.processo} (${p.cliente || 'sem cliente'})${p.prazo ? ` — prazo ${fmtDate(p.prazo)}` : ''}`).join('\n'), toolsCalled: ['consultar_processos'] }
    }
    case 'clientes':
      return { answer: 'Para buscar um cliente, digite algo como "cliente João Silva" ou pergunte livremente, ex.: "quais processos do cliente X?".', toolsCalled: [] }
    case 'documentos':
      return { answer: 'O controle de documentos pendentes ainda não está disponível no assistente — em breve.', toolsCalled: [] }
    case 'resumo': {
      const [prazos, tarefas, agenda, processos] = await Promise.all([
        consultarPrazos(db, profile, { escopo: 'criticos' }),
        consultarTarefas(db, profile, { status: 'atrasadas' }),
        consultarAgenda(db, profile, { periodo: 'hoje' }),
        consultarProcessos(db, profile, { apenas_atencao: true }),
      ])
      const criticos = (prazos.prazos_criticos as any[]).length
      const atrasadas = (tarefas.tarefas_atrasadas as any[]).length
      const compromissos = (agenda.compromissos as any[]).length
      const atencao = (processos.processos as any[]).length
      return {
        answer: [
          `📌 Resumo de hoje:`,
          `${criticos} prazo${criticos === 1 ? '' : 's'} crítico${criticos === 1 ? '' : 's'}`,
          `${atrasadas} tarefa${atrasadas === 1 ? '' : 's'} atrasada${atrasadas === 1 ? '' : 's'}`,
          `${compromissos} compromisso${compromissos === 1 ? '' : 's'} hoje`,
          `${atencao} processo${atencao === 1 ? '' : 's'} exigindo atenção`,
        ].join('\n'),
        toolsCalled: ['consultar_prazos', 'consultar_tarefas', 'consultar_agenda', 'consultar_processos'],
      }
    }
    default: {
      const _exhaustive: never = command
      throw new Error(`Comando desconhecido: ${_exhaustive}`)
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  let profile: CallerProfile | null = null
  let question = ''
  let slashCommand: string | null = null

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Token de autorização ausente' }, 401)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !user) return json({ error: 'Não autorizado' }, 401)

    const { data: profileRow } = await supabaseAdmin
      .from('profiles').select('id, user_id, role, tenant_id, name').eq('id', user.id).single()
    if (!profileRow?.tenant_id) return json({ error: 'Perfil sem escritório associado' }, 403)
    if (profileRow.role === 'client') return json({ error: 'Não autorizado' }, 403)
    profile = profileRow as CallerProfile

    const withinLimit = await checkRateLimit(supabaseAdmin, `ai-assistant-chat:${user.id}`)
    if (!withinLimit) return json({ error: 'Muitas perguntas em pouco tempo. Aguarde e tente novamente.' }, 429)

    const body = await req.json().catch(() => null) as {
      message?: string
      slash_command?: string
      attachment?: { mime_type?: string; data_base64?: string; filename?: string }
    } | null
    const message = (body?.message || '').trim()
    slashCommand = (body?.slash_command || '').trim().replace(/^\//, '') || null
    // Só o shape é checado aqui — mime type/tamanho são revalidados de verdade
    // por ai-gemini-assistant quando (e só quando) analisar_documento for
    // chamada; nunca gravado nesta função.
    const rawAttachment = body?.attachment
    const attachment: AttachmentInput | null =
      rawAttachment?.mime_type && rawAttachment?.data_base64 && rawAttachment?.filename
        ? { mime_type: rawAttachment.mime_type, data_base64: rawAttachment.data_base64, filename: rawAttachment.filename }
        : null

    if (!message && !slashCommand) return json({ error: 'Envie message ou slash_command' }, 400)
    if (slashCommand && !SLASH_COMMANDS.includes(slashCommand as SlashCommand)) {
      return json({ error: `Comando inválido. Válidos: ${SLASH_COMMANDS.map(c => '/' + c).join(', ')}` }, 400)
    }
    // Cap de tamanho da mensagem livre — sem isso um texto colado enorme (ex:
    // petição inteira dentro de `message`, em vez de usar `attachment`) vai
    // inteiro pro Gemini a cada rodada de function calling. Mesmo teto usado
    // por gerar_minuta/analisar_documento (MAX_TEXT_INPUT_CHARS, generation.ts)
    // — só o anexo tem cap próprio (15MB, revalidado em ai-gemini-assistant).
    if (message.length > MAX_TEXT_INPUT_CHARS) {
      return json({ error: `Mensagem muito longa (máx. ${MAX_TEXT_INPUT_CHARS.toLocaleString('pt-BR')} caracteres). Reduza o texto e tente novamente.` }, 400)
    }
    question = slashCommand ? `/${slashCommand}` : message

    let result: { answer: string; toolsCalled: string[] }
    if (slashCommand) {
      result = await runSlashCommand(supabaseAdmin, profile, slashCommand as SlashCommand)
    } else {
      const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
      if (!GEMINI_KEY) {
        await logInteraction(supabaseAdmin, profile, question, slashCommand, [], null, 'error', 'GEMINI_API_KEY não configurada')
        return json({ error: 'Assistente ainda não configurado neste ambiente (GEMINI_API_KEY ausente)' }, 500)
      }
      result = await runChatTurn(GEMINI_KEY, supabaseAdmin, profile, message, {
        supabaseUrl: Deno.env.get('SUPABASE_URL')!,
        userToken: token,
        attachment,
      })
    }

    await logInteraction(supabaseAdmin, profile, question, slashCommand, result.toolsCalled, result.answer, 'completed', null)
    return json({ answer: result.answer, tools_called: result.toolsCalled })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('ai-assistant-chat error:', message)
    if (profile) await logInteraction(supabaseAdmin, profile, question, slashCommand, [], null, 'error', message)
    return json({ error: message }, 500)
  }
})

async function logInteraction(
  db: ReturnType<typeof createClient>,
  profile: CallerProfile,
  question: string,
  slashCommand: string | null,
  toolsCalled: string[],
  answer: string | null,
  status: 'completed' | 'error',
  errorMessage: string | null,
) {
  const { error } = await db.from('ai_assistant_logs').insert({
    tenant_id: profile.tenant_id,
    user_id: profile.user_id,
    channel: slashCommand ? 'slash_command' : 'chat',
    question,
    slash_command: slashCommand,
    tools_called: toolsCalled,
    answer,
    status,
    error_message: errorMessage,
  })
  if (error) console.error('ai_assistant_logs insert error:', error)
}

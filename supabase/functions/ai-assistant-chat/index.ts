import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  consultarPrazos, consultarTarefas, consultarAgenda, consultarProcessos, consultarClientes,
  proporCriarTarefa, proporCriarLembrete, confirmarAcaoProposta,
  type CallerProfile, type ProposedAction,
} from './tools.ts'

// ============================================================================
// ai-assistant-chat — Chat interno do LegalHub Assistente (milestone 2 leitura
// + milestone 3 primeira capacidade de escrita, sempre com confirmação).
//
// Diferente de ai-gemini-assistant (prompt único, sem tools — usado pela "IA
// Jurídica" para gerar petições/pareceres), esta função usa function calling
// real do Gemini: o modelo só enxerga o que as ferramentas em tools.ts
// devolvem, nunca inventa processo/cliente/prazo/data (reforçado no
// SYSTEM_PROMPT abaixo).
//
// Escrita (milestone 3): as tools propor_criar_tarefa/propor_criar_lembrete
// NUNCA gravam nada no turno de chat — elas só devolvem uma "ação proposta"
// estruturada (ver ProposedAction em tools.ts), que esta função loga com
// status 'proposed' em ai_assistant_logs e devolve ao frontend como
// `proposed_action` pra renderizar um card de confirmação. A gravação de
// fato só acontece através de uma requisição SEPARADA e autenticada
// (`confirm_action` no body, abaixo), disparada somente quando o usuário
// clica em "Confirmar" (ou edita e confirma) na UI. Qualquer outra ação de
// escrita que o usuário peça (fora essas duas) é escalada: o modelo diz que
// ainda não consegue fazer isso automaticamente e aponta a tela do sistema
// correspondente — nunca finge executar, nunca inventa uma ferramenta.
//
// Reaproveita de ai-gemini-assistant: boilerplate de CORS, auth via
// auth.getUser(), resolução de tenant a partir do profile do chamador (nunca
// de um campo enviado pelo cliente) e o padrão de rate limit via RPC
// check_rate_limit (mesma tabela edge_function_rate_limits).
//
// Contrato:
//   POST { message? , slash_command? } -> { answer, tools_called, proposed_action, log_id }
//     Exatamente um de `message` (linguagem natural) ou `slash_command` (um
//     dos atalhos da seção 55 do documento de spec) deve vir preenchido.
//     `proposed_action` vem null exceto quando o modelo chamou uma das tools
//     de escrita nesse turno.
//   POST { confirm_action: { log_id, type, title, description?, due_date?, priority?, assigned_to } } -> { task_id }
//     Grava de fato a tarefa/lembrete proposto em `log_id`. Só o autor do log
//     original pode confirmar, e só enquanto o status daquele log ainda for
//     'proposed' (idempotente contra duplo clique).
//   POST { cancel_action: { log_id } } -> { cancelled: true }
//     Marca a proposta como cancelada, sem gravar nada em `tasks`.
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
// Ferramentas expostas ao Gemini (function calling). Descrições em pt-BR —
// o modelo responde em pt-BR e as descrições ajudam a escolher a tool certa.
// ----------------------------------------------------------------------------
const TOOL_DECLARATIONS = [
  {
    name: 'consultar_prazos',
    description: 'Consulta prazos processuais críticos (vencidos ou vencendo hoje) e próximos (até 7 dias) dos processos ativos do escritório.',
    parameters: {
      type: 'object',
      properties: {
        escopo: { type: 'string', enum: ['criticos', 'proximos', 'todos'], description: 'Qual recorte de prazos retornar. Padrão: todos.' },
      },
    },
  },
  {
    name: 'consultar_tarefas',
    description: 'Consulta tarefas pendentes e/ou atrasadas do usuário (ou do escritório, se ele for admin/financeiro/super_admin).',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pendentes', 'atrasadas', 'todas'], description: 'Qual recorte de tarefas retornar. Padrão: todas.' },
      },
    },
  },
  {
    name: 'consultar_agenda',
    description: 'Consulta compromissos da agenda (audiências, reuniões, prazos) de hoje, da semana ou do mês.',
    parameters: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'Janela de tempo a consultar. Padrão: hoje.' },
      },
    },
  },
  {
    name: 'consultar_processos',
    description: 'Consulta processos ativos que exigem atenção (prioridade alta/urgente ou prazo vencido/vencendo hoje).',
    parameters: {
      type: 'object',
      properties: {
        apenas_atencao: { type: 'boolean', description: 'Se true (padrão), retorna só os que exigem atenção; se false, retorna todos os processos ativos.' },
      },
    },
  },
  {
    name: 'consultar_clientes',
    description: 'Busca clientes pelo nome, ou processos por número/título, para responder perguntas sobre um cliente ou caso específico.',
    parameters: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Nome do cliente ou número/parte do título do processo a buscar.' },
      },
      required: ['busca'],
    },
  },
  {
    name: 'propor_criar_tarefa',
    description: 'Propõe a criação de uma nova tarefa. NÃO cria a tarefa de fato — apenas monta uma proposta que será exibida ao usuário em um card de confirmação. A tarefa só é gravada se o usuário clicar em "Confirmar" na tela.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título curto e claro da tarefa.' },
        descricao: { type: 'string', description: 'Detalhes adicionais da tarefa (opcional).' },
        data_vencimento: { type: 'string', description: 'Data de vencimento no formato AAAA-MM-DD (opcional).' },
        prioridade: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Prioridade da tarefa. Padrão: medium.' },
        atribuir_a_nome: { type: 'string', description: 'Nome da pessoa a quem atribuir a tarefa, SOMENTE se o usuário pedir isso explicitamente (ex: "crie uma tarefa para o João revisar isso"). Se omitido, a tarefa é atribuída ao próprio usuário que está conversando.' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'propor_criar_lembrete',
    description: 'Propõe a criação de um lembrete simples (um lembrete é uma tarefa rápida e informal, geralmente sem descrição longa nem vínculo com processo/cliente). NÃO cria nada de fato — apenas monta uma proposta para confirmação explícita do usuário.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'O que deve ser lembrado.' },
        data_vencimento: { type: 'string', description: 'Data do lembrete no formato AAAA-MM-DD (opcional).' },
        atribuir_a_nome: { type: 'string', description: 'Nome da pessoa a quem atribuir o lembrete, SOMENTE se pedido explicitamente. Padrão: o próprio usuário.' },
      },
      required: ['titulo'],
    },
  },
] as const

const TOOL_NAMES = TOOL_DECLARATIONS.map(t => t.name)
type ToolName = typeof TOOL_NAMES[number]

const SYSTEM_PROMPT = `Você é o LegalHub Assistente, um assistente interno para advogados e equipes de escritórios de advocacia dentro do sistema LegalHub.

REGRAS INEGOCIÁVEIS:
1. Você NUNCA inventa processo, cliente, prazo, data, tarefa ou compromisso. Toda informação factual que você disser DEVE vir de uma chamada às ferramentas disponíveis. Se a pergunta exigir dado que nenhuma ferramenta cobre, diga claramente que não tem essa informação — nunca complete com um palpite.
2. Se a pergunta puder ser respondida com uma ferramenta de consulta (consultar_prazos, consultar_tarefas, consultar_agenda, consultar_processos, consultar_clientes), chame a ferramenta antes de responder. Não responda "deixa eu verificar" sem realmente chamar — chame e responda com o resultado.
3. Você tem exatamente DUAS ferramentas de escrita: propor_criar_tarefa e propor_criar_lembrete. Elas NUNCA gravam nada sozinhas — apenas preparam uma proposta que aparece num card na tela para o usuário confirmar, editar ou cancelar. Depois de chamar uma delas, resuma a proposta em 1-2 frases e pergunte se o usuário confirma (ex: "Vou criar a tarefa 'Revisar contrato', atribuída a você, para 15/09. Deseja confirmar?"). NUNCA diga que a tarefa/lembrete já foi criada, agendada ou salva — ela só passa a existir de fato depois que o usuário clicar em "Confirmar" na tela. Nunca chame essas ferramentas mais de uma vez para o mesmo pedido do usuário.
4. Fora consultas e essas duas ferramentas de escrita, você não pode criar, editar, excluir ou executar nenhuma outra ação (prazos, documentos, mensagens de WhatsApp, minutas, protocolos, etc.). Se o usuário pedir algo assim, responda algo como "Ainda não consigo fazer isso automaticamente, mas você pode fazer isso na tela de [Tarefas/Agenda/Processos/Clientes/Financeiro] do sistema" — nunca finja que executou uma ação, nunca invente uma ferramenta que não existe.
5. Seja direto e objetivo, em português do Brasil, com tom profissional e cordial. Use listas curtas quando fizer sentido. Evite textos longos.
6. Nunca revele detalhes técnicos internos (nomes de tabelas, tenant_id, ids) — fale em termos de negócio (processo, cliente, prazo, tarefa).`

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

async function runTool(
  db: ReturnType<typeof createClient>,
  profile: CallerProfile,
  name: ToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'consultar_prazos': return consultarPrazos(db, profile, args as any)
    case 'consultar_tarefas': return consultarTarefas(db, profile, args as any)
    case 'consultar_agenda': return consultarAgenda(db, profile, args as any)
    case 'consultar_processos': return consultarProcessos(db, profile, args as any)
    case 'consultar_clientes': return consultarClientes(db, profile, args as any)
    case 'propor_criar_tarefa': return proporCriarTarefa(db, profile, args as any)
    case 'propor_criar_lembrete': return proporCriarLembrete(db, profile, args as any)
    default: {
      const _exhaustive: never = name
      throw new Error(`Ferramenta desconhecida: ${_exhaustive}`)
    }
  }
}

const WRITE_TOOL_NAMES = new Set<ToolName>(['propor_criar_tarefa', 'propor_criar_lembrete'])

const MAX_TOOL_ROUNDS = 4

// Conduz o ciclo de function calling: manda a mensagem, se o modelo pedir
// tool(s), executa (com filtro de tenant/role já embutido em cada tool) e
// devolve o resultado pro modelo, até ele responder com texto final. Se
// alguma das tools de escrita (propor_criar_tarefa/propor_criar_lembrete) for
// chamada, a ProposedAction resultante é capturada em `proposedAction` e
// devolvida junto da resposta — nunca gravada aqui.
async function runChatTurn(
  apiKey: string,
  db: ReturnType<typeof createClient>,
  profile: CallerProfile,
  userMessage: string,
): Promise<{ answer: string; toolsCalled: string[]; proposedAction: ProposedAction | null }> {
  const contents: Array<Record<string, unknown>> = [{ role: 'user', parts: [{ text: userMessage }] }]
  const toolsCalled: string[] = []
  let proposedAction: ProposedAction | null = null

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { parts } = await callGemini(apiKey, contents)
    const functionCalls = parts.filter((p: any) => p.functionCall) as Array<{ functionCall: { name: string; args?: Record<string, unknown> } }>

    if (functionCalls.length === 0) {
      const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n').trim()
      return { answer: text || 'Não consegui gerar uma resposta para essa pergunta.', toolsCalled, proposedAction }
    }

    contents.push({ role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc.functionCall })) })

    const responseParts: Array<Record<string, unknown>> = []
    for (const fc of functionCalls) {
      const name = fc.functionCall.name
      if (!TOOL_NAMES.includes(name as ToolName)) {
        responseParts.push({ functionResponse: { name, response: { error: 'Ferramenta não disponível' } } })
        continue
      }
      toolsCalled.push(name)
      try {
        const result = await runTool(db, profile, name as ToolName, fc.functionCall.args || {})
        if (WRITE_TOOL_NAMES.has(name as ToolName)) proposedAction = result as ProposedAction
        responseParts.push({ functionResponse: { name, response: result as Record<string, unknown> } })
      } catch (toolErr: unknown) {
        const message = toolErr instanceof Error ? toolErr.message : 'Erro ao executar a ferramenta'
        responseParts.push({ functionResponse: { name, response: { error: message } } })
      }
    }
    contents.push({ role: 'user', parts: responseParts })
  }

  return { answer: 'Não consegui concluir essa consulta — tente reformular a pergunta.', toolsCalled, proposedAction }
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

// ----------------------------------------------------------------------------
// Confirmação/cancelamento de ação proposta (milestone 3). Body shapes
// separadas do chat — nunca passam pelo Gemini.
// ----------------------------------------------------------------------------
interface ConfirmActionBody {
  log_id: string
  type: 'criar_tarefa' | 'criar_lembrete'
  title: string
  description?: string | null
  due_date?: string | null
  priority?: string | null
  assigned_to: string
}

function parseConfirmActionBody(raw: unknown): ConfirmActionBody | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (typeof b.log_id !== 'string' || !b.log_id) return null
  if (b.type !== 'criar_tarefa' && b.type !== 'criar_lembrete') return null
  if (typeof b.title !== 'string' || !b.title.trim()) return null
  if (typeof b.assigned_to !== 'string' || !b.assigned_to) return null
  return {
    log_id: b.log_id,
    type: b.type,
    title: b.title,
    description: typeof b.description === 'string' ? b.description : null,
    due_date: typeof b.due_date === 'string' ? b.due_date : null,
    priority: typeof b.priority === 'string' ? b.priority : null,
    assigned_to: b.assigned_to,
  }
}

async function handleConfirmAction(
  db: ReturnType<typeof createClient>,
  profile: CallerProfile,
  input: ConfirmActionBody,
): Promise<Response> {
  const { data: logRow, error: logErr } = await db
    .from('ai_assistant_logs')
    .select('id, user_id, tenant_id, status, action_type')
    .eq('id', input.log_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()
  if (logErr) return json({ error: 'Erro ao validar ação' }, 500)
  const log = logRow as { id: string; user_id: string; status: string; action_type: string | null } | null
  if (!log || log.user_id !== profile.user_id) return json({ error: 'Ação não encontrada' }, 404)
  if (log.status !== 'proposed') return json({ error: 'Esta ação já foi processada anteriormente' }, 409)
  if (log.action_type !== input.type) return json({ error: 'Tipo de ação inconsistente' }, 400)

  try {
    const result = await confirmarAcaoProposta(db, profile, input)
    const { error: insertErr } = await db.from('ai_assistant_logs').insert({
      tenant_id: profile.tenant_id,
      user_id: profile.user_id,
      channel: 'action',
      question: `Confirmar ação: ${input.type}`,
      action_type: input.type,
      action_payload: { ...input, assigned_to: result.assigned_to, assigned_name: result.assigned_name },
      answer: 'Ação confirmada pelo usuário.',
      status: 'confirmed',
      related_log_id: input.log_id,
      created_task_id: result.task_id,
    })
    if (insertErr) console.error('ai_assistant_logs insert error (confirm):', insertErr)
    return json({ task_id: result.task_id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao confirmar ação'
    const { error: insertErr } = await db.from('ai_assistant_logs').insert({
      tenant_id: profile.tenant_id,
      user_id: profile.user_id,
      channel: 'action',
      question: `Confirmar ação: ${input.type}`,
      action_type: input.type,
      action_payload: input,
      status: 'error',
      error_message: message,
      related_log_id: input.log_id,
    })
    if (insertErr) console.error('ai_assistant_logs insert error (confirm error):', insertErr)
    return json({ error: message }, 400)
  }
}

async function handleCancelAction(
  db: ReturnType<typeof createClient>,
  profile: CallerProfile,
  logId: string,
): Promise<Response> {
  const { data: logRow, error: logErr } = await db
    .from('ai_assistant_logs')
    .select('id, user_id, tenant_id, status, action_type, action_payload')
    .eq('id', logId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()
  if (logErr) return json({ error: 'Erro ao validar ação' }, 500)
  const log = logRow as { id: string; user_id: string; status: string; action_type: string | null; action_payload: unknown } | null
  if (!log || log.user_id !== profile.user_id) return json({ error: 'Ação não encontrada' }, 404)
  if (log.status !== 'proposed') return json({ error: 'Esta ação já foi processada anteriormente' }, 409)

  const { error: insertErr } = await db.from('ai_assistant_logs').insert({
    tenant_id: profile.tenant_id,
    user_id: profile.user_id,
    channel: 'action',
    question: `Cancelar ação: ${log.action_type}`,
    action_type: log.action_type,
    action_payload: log.action_payload,
    answer: 'Ação cancelada pelo usuário.',
    status: 'cancelled',
    related_log_id: logId,
  })
  if (insertErr) console.error('ai_assistant_logs insert error (cancel):', insertErr)
  return json({ cancelled: true })
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

    const body = await req.json().catch(() => null) as {
      message?: string; slash_command?: string
      confirm_action?: unknown; cancel_action?: { log_id?: string }
    } | null

    // Confirmação/cancelamento: chamada SEPARADA e autenticada, disparada só
    // pelo clique explícito do usuário na tela — nunca passa pelo Gemini,
    // então usa um bucket de rate limit próprio (não consome a cota de
    // perguntas ao assistente).
    if (body?.confirm_action || body?.cancel_action) {
      const withinLimit = await checkRateLimit(supabaseAdmin, `ai-assistant-action:${user.id}`)
      if (!withinLimit) return json({ error: 'Muitas ações em pouco tempo. Aguarde e tente novamente.' }, 429)

      if (body.confirm_action) {
        const confirmInput = parseConfirmActionBody(body.confirm_action)
        if (!confirmInput) return json({ error: 'confirm_action inválido' }, 400)
        return await handleConfirmAction(supabaseAdmin, profile, confirmInput)
      }
      const logId = body.cancel_action?.log_id
      if (!logId) return json({ error: 'cancel_action.log_id é obrigatório' }, 400)
      return await handleCancelAction(supabaseAdmin, profile, logId)
    }

    const withinLimit = await checkRateLimit(supabaseAdmin, `ai-assistant-chat:${user.id}`)
    if (!withinLimit) return json({ error: 'Muitas perguntas em pouco tempo. Aguarde e tente novamente.' }, 429)

    const message = (body?.message || '').trim()
    slashCommand = (body?.slash_command || '').trim().replace(/^\//, '') || null

    if (!message && !slashCommand) return json({ error: 'Envie message ou slash_command' }, 400)
    if (slashCommand && !SLASH_COMMANDS.includes(slashCommand as SlashCommand)) {
      return json({ error: `Comando inválido. Válidos: ${SLASH_COMMANDS.map(c => '/' + c).join(', ')}` }, 400)
    }
    question = slashCommand ? `/${slashCommand}` : message

    let result: { answer: string; toolsCalled: string[]; proposedAction: ProposedAction | null }
    if (slashCommand) {
      const slashResult = await runSlashCommand(supabaseAdmin, profile, slashCommand as SlashCommand)
      result = { ...slashResult, proposedAction: null }
    } else {
      const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
      if (!GEMINI_KEY) {
        await logInteraction(supabaseAdmin, profile, question, slashCommand, [], null, 'error', 'GEMINI_API_KEY não configurada')
        return json({ error: 'Assistente ainda não configurado neste ambiente (GEMINI_API_KEY ausente)' }, 500)
      }
      result = await runChatTurn(GEMINI_KEY, supabaseAdmin, profile, message)
    }

    const logId = await logInteraction(
      supabaseAdmin, profile, question, slashCommand, result.toolsCalled, result.answer,
      result.proposedAction ? 'proposed' : 'completed', null, result.proposedAction,
    )
    // Sem log_id não dá pra confirmar/cancelar depois com segurança (nada pra
    // validar dono/tipo/estado) — nesse caso raro (falha ao gravar o log),
    // preferimos omitir o card de confirmação a oferecer um botão que sempre
    // vai falhar.
    const proposedActionOut = result.proposedAction && logId ? { ...result.proposedAction, log_id: logId } : null
    return json({ answer: result.answer, tools_called: result.toolsCalled, proposed_action: proposedActionOut })
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
  status: 'completed' | 'error' | 'proposed',
  errorMessage: string | null,
  proposedAction?: ProposedAction | null,
): Promise<string | null> {
  const { data, error } = await db.from('ai_assistant_logs').insert({
    tenant_id: profile.tenant_id,
    user_id: profile.user_id,
    channel: slashCommand ? 'slash_command' : 'chat',
    question,
    slash_command: slashCommand,
    tools_called: toolsCalled,
    answer,
    status,
    error_message: errorMessage,
    action_type: proposedAction?.type ?? null,
    action_payload: proposedAction ?? null,
  }).select('id').single()
  if (error) { console.error('ai_assistant_logs insert error:', error); return null }
  return (data as { id: string } | null)?.id ?? null
}

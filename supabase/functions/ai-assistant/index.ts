import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
const MAX_TOOL_ROUNDS = 5

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function addDaysISO(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Claude-style JSON schema (lowercase types) converted to Gemini's Schema format (uppercase types)
function toGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema
  const out: any = {}
  if (schema.type) out.type = String(schema.type).toUpperCase()
  if (schema.description) out.description = schema.description
  if (schema.enum) out.enum = schema.enum
  if (schema.properties) {
    out.properties = {}
    for (const [k, v] of Object.entries(schema.properties)) out.properties[k] = toGeminiSchema(v)
  }
  if (schema.required) out.required = schema.required
  if (schema.items) out.items = toGeminiSchema(schema.items)
  return out
}

const TOOL_DEFS = [
  {
    name: 'visao_geral_escritorio',
    description: 'Retorna um raio-x rápido do escritório: clientes ativos, processos ativos, tarefas pendentes/atrasadas, financeiro pendente/vencido e eventos dos próximos 7 dias. Use como primeira chamada para perguntas gerais de desempenho.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'buscar_clientes',
    description: 'Busca contatos/clientes do escritório com filtros. Use para perguntas sobre clientes específicos, por área do direito, status ou sem processo ativo.',
    input_schema: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Texto livre para buscar no nome do cliente' },
        status: { type: 'string', enum: ['active', 'inactive', 'prospect'] },
        area_direito: { type: 'string', description: 'Ex: Previdenciário, Cível, Trabalhista' },
        sem_processo_ativo: { type: 'boolean', description: 'true para listar só clientes sem nenhum processo' },
        limite: { type: 'integer', description: 'Máximo de resultados (padrão 10, máx 30)' },
      },
    },
  },
  {
    name: 'buscar_processos',
    description: 'Busca processos jurídicos com filtros de status, fase, área ou prazo. Use para perguntas sobre prazos, andamento ou carga de trabalho.',
    input_schema: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Texto livre para buscar no número/título do processo ou nome do cliente' },
        status: { type: 'string', enum: ['active', 'suspended', 'archived', 'won', 'lost', 'returned'] },
        fase: { type: 'string', enum: ['NEGOCIAÇÃO', 'CONHECIMENTO', 'RECURSAL', 'EXECUÇÃO', 'ENCERRADO'] },
        area: { type: 'string' },
        prazo_proximo_dias: { type: 'integer', description: 'Filtra processos ativos com next_deadline nos próximos N dias' },
        limite: { type: 'integer', description: 'Máximo de resultados (padrão 10, máx 30)' },
      },
    },
  },
  {
    name: 'buscar_tarefas',
    description: 'Busca tarefas do escritório. Use para perguntas sobre pendências, atrasos ou o que precisa ser feito hoje.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'cancelled'] },
        atrasadas: { type: 'boolean', description: 'true para só tarefas com due_date no passado e não concluídas' },
        hoje: { type: 'boolean', description: 'true para tarefas com due_date igual a hoje' },
        responsavel: { type: 'string', description: 'Filtra por nome (parcial) do responsável' },
        limite: { type: 'integer', description: 'Máximo de resultados (padrão 15, máx 40)' },
      },
    },
  },
  {
    name: 'buscar_agenda',
    description: 'Lista eventos da agenda (audiências, reuniões, prazos) num período. Use para perguntas sobre a semana/próximos dias.',
    input_schema: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Janela de dias a partir de hoje (padrão 7)' },
        tipo: { type: 'string', description: 'Filtra por tipo de evento, se relevante' },
      },
    },
  },
  {
    name: 'resumo_financeiro',
    description: 'Resumo financeiro do escritório: totais a receber/pagar por status, e os itens vencidos mais relevantes. Use para perguntas sobre saúde financeira, inadimplência ou fluxo de caixa.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['receivable', 'payable'], description: 'receivable = a receber, payable = a pagar. Omitir para os dois.' },
      },
    },
  },
]

const GEMINI_TOOLS = [{ functionDeclarations: TOOL_DEFS.map(t => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.input_schema) })) }]

async function runTool(supabaseAdmin: any, tenantId: string, name: string, input: any): Promise<unknown> {
  const limit = (n: unknown, def: number, max: number) => Math.min(Math.max(Number(n) || def, 1), max)

  if (name === 'visao_geral_escritorio') {
    const today = todayISO()
    const [clientes, processos, tarefasPendentes, tarefasAtrasadas, eventos] = await Promise.all([
      supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active').is('deleted_at', null),
      supabaseAdmin.from('processes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active').is('deleted_at', null),
      supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['pending', 'in_progress']).is('deleted_at', null),
      supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['pending', 'in_progress']).lt('due_date', today).is('deleted_at', null),
      supabaseAdmin.from('calendar_events').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('date', today).lte('date', addDaysISO(7)).is('deleted_at', null),
    ])
    const { data: financeiro } = await supabaseAdmin
      .from('financials').select('type, status, amount').eq('tenant_id', tenantId).is('deleted_at', null)
      .in('status', ['pending', 'overdue'])

    let a_receber_pendente = 0, a_receber_vencido = 0, a_pagar_pendente = 0, a_pagar_vencido = 0
    for (const f of financeiro || []) {
      const v = Number(f.amount) || 0
      if (f.type === 'receivable' && f.status === 'pending') a_receber_pendente += v
      if (f.type === 'receivable' && f.status === 'overdue') a_receber_vencido += v
      if (f.type === 'payable' && f.status === 'pending') a_pagar_pendente += v
      if (f.type === 'payable' && f.status === 'overdue') a_pagar_vencido += v
    }

    return {
      clientes_ativos: clientes.count ?? 0,
      processos_ativos: processos.count ?? 0,
      tarefas_pendentes: tarefasPendentes.count ?? 0,
      tarefas_atrasadas: tarefasAtrasadas.count ?? 0,
      eventos_proximos_7_dias: eventos.count ?? 0,
      financeiro: {
        a_receber_pendente, a_receber_vencido, a_pagar_pendente, a_pagar_vencido,
      },
    }
  }

  if (name === 'buscar_clientes') {
    let q = supabaseAdmin.from('clients')
      .select('name, status, area_direito, cidade, entry_date, total_processes, total_billed')
      .eq('tenant_id', tenantId).is('deleted_at', null)
    if (input.busca) q = q.ilike('name', `%${input.busca}%`)
    if (input.status) q = q.eq('status', input.status)
    if (input.area_direito) q = q.ilike('area_direito', `%${input.area_direito}%`)
    if (input.sem_processo_ativo) q = q.eq('total_processes', 0)
    q = q.order('created_at', { ascending: false }).limit(limit(input.limite, 10, 30))
    const { data, error } = await q
    if (error) throw error
    return data
  }

  if (name === 'buscar_processos') {
    let q = supabaseAdmin.from('processes')
      .select('number, title, client_name, status, fase, area, next_deadline, next_hearing, assigned_lawyer')
      .eq('tenant_id', tenantId).is('deleted_at', null)
    if (input.busca) q = q.or(`title.ilike.%${input.busca}%,number.ilike.%${input.busca}%,client_name.ilike.%${input.busca}%`)
    if (input.status) q = q.eq('status', input.status)
    if (input.fase) q = q.eq('fase', input.fase)
    if (input.area) q = q.ilike('area', `%${input.area}%`)
    if (input.prazo_proximo_dias) {
      q = q.eq('status', 'active').not('next_deadline', 'is', null)
        .gte('next_deadline', todayISO()).lte('next_deadline', addDaysISO(input.prazo_proximo_dias))
        .order('next_deadline', { ascending: true })
    } else {
      q = q.order('created_at', { ascending: false })
    }
    q = q.limit(limit(input.limite, 10, 30))
    const { data, error } = await q
    if (error) throw error
    return data
  }

  if (name === 'buscar_tarefas') {
    let q = supabaseAdmin.from('tasks')
      .select('title, due_date, priority, status, assigned_name, type')
      .eq('tenant_id', tenantId).is('deleted_at', null)
    if (input.status) q = q.eq('status', input.status)
    if (input.atrasadas) q = q.in('status', ['pending', 'in_progress']).lt('due_date', todayISO())
    if (input.hoje) q = q.eq('due_date', todayISO())
    if (input.responsavel) q = q.ilike('assigned_name', `%${input.responsavel}%`)
    q = q.order('due_date', { ascending: true }).limit(limit(input.limite, 15, 40))
    const { data, error } = await q
    if (error) throw error
    return data
  }

  if (name === 'buscar_agenda') {
    const dias = limit(input.dias, 7, 60)
    let q = supabaseAdmin.from('calendar_events')
      .select('title, type, date, time, client_name, location, process_number')
      .eq('tenant_id', tenantId).is('deleted_at', null)
      .gte('date', todayISO()).lte('date', addDaysISO(dias))
    if (input.tipo) q = q.ilike('type', `%${input.tipo}%`)
    q = q.order('date', { ascending: true })
    const { data, error } = await q
    if (error) throw error
    return data
  }

  if (name === 'resumo_financeiro') {
    let q = supabaseAdmin.from('financials')
      .select('type, category, description, amount, status, due_date, client_name')
      .eq('tenant_id', tenantId).is('deleted_at', null)
    if (input.tipo) q = q.eq('type', input.tipo)
    const { data, error } = await q
    if (error) throw error

    const totals: Record<string, number> = {}
    for (const f of data || []) {
      const key = `${f.type}_${f.status}`
      totals[key] = (totals[key] || 0) + (Number(f.amount) || 0)
    }
    const vencidos = (data || [])
      .filter((f: any) => f.status === 'overdue')
      .sort((a: any, b: any) => (a.due_date || '').localeCompare(b.due_date || ''))
      .slice(0, 10)
      .map((f: any) => ({ descricao: f.description, cliente: f.client_name, valor: f.amount, vencimento: f.due_date, categoria: f.category }))

    return { totais_por_tipo_status: totals, itens_vencidos: vencidos }
  }

  throw new Error(`Ferramenta desconhecida: ${name}`)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  try {
    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY não configurada' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Token ausente' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('name, display_name, role, tenant_id').eq('user_id', user.id).single()
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: 'Perfil sem escritório associado' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: tenant } = await supabaseAdmin.from('tenants').select('name').eq('id', profile.tenant_id).single()

    const { messages } = (await req.json()) as { messages: ChatMessage[] }
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages é obrigatório' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const systemPrompt = `Você é o Copiloto Lawfy, um assistente de IA premium integrado ao sistema de gestão do escritório "${tenant?.name || 'do usuário'}", ajudando-o a atingir a mais alta performance operacional e estratégica.

Contexto do usuário: ${profile.name || profile.display_name || 'Usuário'} (papel: ${profile.role}).
Data de hoje: ${todayISO()}.

Regras:
- Você tem ferramentas para consultar dados reais do escritório (clientes, processos, tarefas, agenda, financeiro). SEMPRE use as ferramentas antes de afirmar qualquer número, prazo ou fato sobre o escritório — nunca invente ou estime dados.
- Responda em português do Brasil, direto ao ponto, com tom consultivo e proativo (como um sócio sênior de operações).
- Quando fizer sentido, aponte riscos e próximas ações concretas (ex: "3 processos vencem essa semana, priorize X").
- Se a pergunta for genérica sobre desempenho, comece pela ferramenta visao_geral_escritorio.
- Seja conciso: priorize listas curtas e números claros em vez de parágrafos longos.`

    // Gemini "contents" — map chat roles (assistant -> model) for the initial turns
    const contents: any[] = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

    let finalText = ''
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: GEMINI_TOOLS,
          generationConfig: { maxOutputTokens: 1536, temperature: 0.4 },
        }),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        console.error('Gemini API error:', errText)
        return new Response(JSON.stringify({ error: 'Erro ao consultar a IA' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }

      const data = await resp.json()
      const candidate = data.candidates?.[0]

      if (!candidate || candidate.finishReason === 'SAFETY') {
        return new Response(JSON.stringify({ reply: 'Não posso ajudar com essa solicitação específica.' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
      }

      const parts = candidate.content?.parts || []
      const functionCalls = parts.filter((p: any) => p.functionCall)
      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text)
      finalText = textParts.join('\n')

      if (functionCalls.length === 0) break

      contents.push({ role: 'model', parts })

      const responseParts = []
      for (const fc of functionCalls) {
        const { name, args } = fc.functionCall
        try {
          const result = await runTool(supabaseAdmin, profile.tenant_id, name, args || {})
          responseParts.push({ functionResponse: { name, response: { content: result } } })
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          responseParts.push({ functionResponse: { name, response: { error: msg } } })
        }
      }
      contents.push({ role: 'function', parts: responseParts })
    }

    return new Response(JSON.stringify({ reply: finalText || 'Não consegui gerar uma resposta agora. Tente novamente.' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('ai-assistant error:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

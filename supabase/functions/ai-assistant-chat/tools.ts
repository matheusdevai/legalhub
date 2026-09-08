import type { createClient } from 'jsr:@supabase/supabase-js@2'

// ============================================================================
// Ferramentas de consulta do LegalHub Assistente — Chat (milestone 2).
//
// SOMENTE LEITURA. Cada função aqui roda a query real contra o Supabase já
// filtrada por tenant_id + role do usuário autenticado, e devolve só dado que
// veio do banco — nunca o modelo (Gemini) decide o que filtrar, o filtro
// acontece inteiramente no código, antes do resultado virar contexto pra IA.
//
// Os limiares (prazo "próximo" em até 7 dias, "importante" em até 3 dias) e a
// definição de "processo que exige atenção" espelham deliberadamente
// src/lib/assistantEngine.ts (fundação do dashboard, milestone 1) — mesma
// classificação de urgência em dois lugares diferentes (o assistente de chat
// não pode achar "urgente" uma coisa que o dashboard classifica como normal).
// Não foi possível importar o módulo original: Edge Functions do Supabase
// rodam num bundle Deno isolado por diretório de função, sem acesso a
// arquivos fora de supabase/functions/ai-assistant-chat/.
// ============================================================================

type SupabaseAdmin = ReturnType<typeof createClient>

export interface CallerProfile {
  id: string
  user_id: string
  tenant_id: string
  role: string
  name: string | null
}

const UPCOMING_DEADLINE_WINDOW_DAYS = 7
const IMPORTANT_WITHIN_DAYS = 3

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO + 'T00:00:00')
  const to = new Date(toISO + 'T00:00:00')
  return Math.round((to.getTime() - from.getTime()) / 86400000)
}

// Roles que só podem ver as próprias tarefas — mesmo filtro de TasksPage.tsx
// (assigned_to === profile.user_id). Nunca expor tarefa de colega para quem
// não deveria ver.
const SELF_ONLY_TASK_ROLES = new Set(['lawyer', 'intern'])

// --- consultar_prazos --------------------------------------------------

export async function consultarPrazos(
  db: SupabaseAdmin,
  profile: CallerProfile,
  args: { escopo?: 'criticos' | 'proximos' | 'todos' },
) {
  const today = todayISO()
  const { data, error } = await db
    .from('processes')
    .select('id, number, title, client_name, next_deadline, priority, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .not('next_deadline', 'is', null)
    .order('next_deadline', { ascending: true })
  if (error) throw new Error('Erro ao consultar prazos')

  const rows = (data || []) as Array<{ id: string; number: string; title: string; client_name: string | null; next_deadline: string; priority: string | null; status: string }>
  const criticos = rows.filter(p => p.next_deadline <= today)
  const proximos = rows.filter(p => p.next_deadline > today && daysBetween(today, p.next_deadline) <= UPCOMING_DEADLINE_WINDOW_DAYS)

  const escopo = args?.escopo || 'todos'
  const shaped = (list: typeof rows) => list.map(p => ({
    processo: p.title || p.number,
    numero: p.number,
    cliente: p.client_name,
    prazo: p.next_deadline,
    dias: daysBetween(today, p.next_deadline),
    prioridade: p.priority,
  }))

  if (escopo === 'criticos') return { prazos_criticos: shaped(criticos) }
  if (escopo === 'proximos') return { prazos_proximos: shaped(proximos) }
  return { prazos_criticos: shaped(criticos), prazos_proximos: shaped(proximos) }
}

// --- consultar_tarefas ---------------------------------------------------

export async function consultarTarefas(
  db: SupabaseAdmin,
  profile: CallerProfile,
  args: { status?: 'pendentes' | 'atrasadas' | 'todas' },
) {
  const today = todayISO()
  let query = db
    .from('tasks')
    .select('id, title, due_date, priority, status, assigned_name, assigned_to')
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .neq('status', 'done')
    .neq('status', 'cancelled')

  // Mesmo filtro de TasksPage.tsx: lawyer/intern só veem as próprias tarefas.
  if (SELF_ONLY_TASK_ROLES.has(profile.role)) {
    query = query.eq('assigned_to', profile.user_id)
  }

  const { data, error } = await query.order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw new Error('Erro ao consultar tarefas')

  const rows = (data || []) as Array<{ id: string; title: string; due_date: string | null; priority: string | null; status: string; assigned_name: string | null }>
  const atrasadas = rows.filter(t => !!t.due_date && t.due_date < today)
  const pendentes = rows.filter(t => !(!!t.due_date && t.due_date < today))

  const shaped = (list: typeof rows) => list.map(t => ({
    tarefa: t.title,
    responsavel: t.assigned_name,
    prazo: t.due_date,
    prioridade: t.priority,
    status: t.status,
  }))

  const status = args?.status || 'todas'
  if (status === 'atrasadas') return { tarefas_atrasadas: shaped(atrasadas) }
  if (status === 'pendentes') return { tarefas_pendentes: shaped(pendentes) }
  return { tarefas_atrasadas: shaped(atrasadas), tarefas_pendentes: shaped(pendentes) }
}

// --- consultar_agenda -----------------------------------------------------

export async function consultarAgenda(
  db: SupabaseAdmin,
  profile: CallerProfile,
  args: { periodo?: 'hoje' | 'semana' | 'mes' },
) {
  const today = todayISO()
  const periodo = args?.periodo || 'hoje'
  const windowDays = periodo === 'mes' ? 30 : periodo === 'semana' ? 7 : 0
  const end = new Date(today + 'T00:00:00')
  end.setDate(end.getDate() + windowDays)
  const endISO = end.toISOString().slice(0, 10)

  const { data, error } = await db
    .from('calendar_events')
    .select('id, title, type, date, time, client_name, location, status')
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .gte('date', today)
    .lte('date', endISO)
    .order('date', { ascending: true })
    .order('time', { ascending: true })
  if (error) throw new Error('Erro ao consultar agenda')

  const rows = (data || []) as Array<{ id: string; title: string; type: string | null; date: string; time: string | null; client_name: string | null; location: string | null; status: string | null }>
  return {
    periodo,
    compromissos: rows.map(e => ({
      titulo: e.title,
      tipo: e.type,
      data: e.date,
      hora: e.time,
      cliente: e.client_name,
      local: e.location,
    })),
  }
}

// --- consultar_processos ---------------------------------------------------

export async function consultarProcessos(
  db: SupabaseAdmin,
  profile: CallerProfile,
  args: { apenas_atencao?: boolean },
) {
  const { data, error } = await db
    .from('processes')
    .select('id, number, title, client_name, next_deadline, priority, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'active')
    .is('deleted_at', null)
  if (error) throw new Error('Erro ao consultar processos')

  const rows = (data || []) as Array<{ id: string; number: string; title: string; client_name: string | null; next_deadline: string | null; priority: string | null; status: string }>
  const apenasAtencao = args?.apenas_atencao !== false

  // Mesmo critério de "processo que exige atenção" de assistantEngine.ts
  // (attentionProcesses, milestone 1): só prioridade alta/urgente — sem
  // checar prazo vencido aqui, senão o chat responderia um número diferente
  // do card "Processos que exigem atenção" do dashboard pro mesmo tenant no
  // mesmo momento. Prazo vencido já é coberto por consultar_prazos.
  const exigemAtencao = rows.filter(p => p.priority === 'high' || p.priority === 'urgent')
  const lista = apenasAtencao ? exigemAtencao : rows

  return {
    processos: lista.map(p => ({
      processo: p.title || p.number,
      numero: p.number,
      cliente: p.client_name,
      prazo: p.next_deadline,
      prioridade: p.priority,
    })),
  }
}

// --- consultar_clientes ---------------------------------------------------

export async function consultarClientes(
  db: SupabaseAdmin,
  profile: CallerProfile,
  args: { busca: string },
) {
  const busca = (args?.busca || '').trim()
  if (!busca) return { clientes: [] }

  const { data: clientRows, error: clientErr } = await db
    .from('clients')
    .select('id, name, email, phone, status, assigned_lawyer, total_processes')
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .ilike('name', `%${busca}%`)
    .limit(10)
  if (clientErr) throw new Error('Erro ao consultar clientes')

  const { data: processRows, error: procErr } = await db
    .from('processes')
    .select('id, number, title, client_name, status')
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .or(`number.ilike.%${busca}%,title.ilike.%${busca}%`)
    .limit(10)
  if (procErr) throw new Error('Erro ao consultar processos do cliente')

  return {
    clientes: (clientRows || []).map(c => ({
      nome: c.name, email: c.email, telefone: c.phone, status: c.status,
      advogado_responsavel: c.assigned_lawyer, total_processos: c.total_processes,
    })),
    processos_encontrados: (processRows || []).map(p => ({
      processo: p.title || p.number, numero: p.number, cliente: p.client_name, status: p.status,
    })),
  }
}

// ============================================================================
// propor_criar_tarefa / propor_criar_lembrete — milestone 3, primeira
// capacidade de ESCRITA do assistente.
//
// As duas funções abaixo NUNCA gravam em `tasks`: elas só resolvem o
// responsável e devolvem uma "ação proposta" estruturada, que a Edge Function
// (index.ts) loga com status 'proposed' e devolve pro frontend renderizar o
// card de confirmação. A gravação de fato só acontece em
// confirmarAcaoProposta(), chamada por uma requisição SEPARADA e autenticada,
// disparada somente quando o usuário clica em "Confirmar" (ou edita e
// confirma) na UI — nunca durante o turno de chat com o Gemini.
//
// Não existe um conceito de "lembrete" separado de "tarefa" no banco
// (ver src/types/index.ts Task — sem campo/tipo 'reminder'): um lembrete
// criado pelo assistente é uma linha normal em `tasks`, type 'custom',
// prioridade 'low' por padrão (tarefa usa 'medium'). A distinção é só de UX
// (o usuário pede "me lembra de X" vs "crie uma tarefa para X").
// ============================================================================

export interface ProposedAction {
  type: 'criar_tarefa' | 'criar_lembrete'
  title: string
  description: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assigned_to: string
  assigned_name: string | null
  /** Aviso não-bloqueante pro usuário (ex: nome não encontrado, data inválida) — some quando null. */
  note: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent'])

function normalizeDueDate(dueDate?: string | null): { value: string | null; invalid: boolean } {
  if (!dueDate) return { value: null, invalid: false }
  return DATE_RE.test(dueDate) ? { value: dueDate, invalid: false } : { value: null, invalid: true }
}

// Resolve pra quem a tarefa/lembrete vai. Por padrão o próprio usuário que
// está conversando (assigned_to = profile.user_id); só atribui a outra
// pessoa se o texto pedir isso explicitamente E o nome bater com exatamente
// 1 pessoa do tenant.
//
// IMPORTANTE — permissão replicada, não inventada: TasksPage.tsx (campo
// "Responsável" do modal de criação de tarefa) não impõe NENHUMA restrição
// de role sobre quem pode atribuir tarefa a quem — qualquer usuário
// autenticado do tenant (admin, lawyer, intern, financial) pode escolher
// qualquer colega no dropdown de responsável, sem checagem adicional. O
// assistente replica exatamente essa ausência de restrição (nem mais
// permissivo, nem mais restritivo) — ver investigação registrada no handoff
// desta fatia.
export async function resolveAssignee(
  db: SupabaseAdmin,
  profile: CallerProfile,
  nomeSolicitado?: string | null,
): Promise<{ assigned_to: string; assigned_name: string | null; note: string | null }> {
  const nome = (nomeSolicitado || '').trim()
  if (!nome) return { assigned_to: profile.user_id, assigned_name: profile.name, note: null }

  const { data, error } = await db
    .from('profiles')
    .select('user_id, name, display_name, role')
    .eq('tenant_id', profile.tenant_id)
    .neq('role', 'client')
    .or(`name.ilike.%${nome}%,display_name.ilike.%${nome}%`)
    .limit(5)
  if (error) throw new Error('Erro ao buscar responsável')

  const rows = (data || []) as Array<{ user_id: string; name: string | null; display_name: string | null; role: string }>
  if (rows.length === 1) {
    const match = rows[0]
    return { assigned_to: match.user_id, assigned_name: match.name || match.display_name || null, note: null }
  }
  const note = rows.length === 0
    ? `Não encontrei ninguém chamado "${nome}" no escritório — atribuí a você. Use "Editar" para corrigir.`
    : `Encontrei mais de uma pessoa chamada "${nome}" — atribuí a você. Use "Editar" para corrigir.`
  return { assigned_to: profile.user_id, assigned_name: profile.name, note }
}

export async function proporCriarTarefa(
  db: SupabaseAdmin,
  profile: CallerProfile,
  args: { titulo: string; descricao?: string; data_vencimento?: string; prioridade?: string; atribuir_a_nome?: string },
): Promise<ProposedAction> {
  const titulo = (args?.titulo || '').trim()
  if (!titulo) throw new Error('Título da tarefa é obrigatório')
  const { value: due_date, invalid } = normalizeDueDate(args?.data_vencimento)
  const priority = (PRIORITIES.has(args?.prioridade || '') ? args!.prioridade : 'medium') as ProposedAction['priority']
  const assignee = await resolveAssignee(db, profile, args?.atribuir_a_nome)
  const note = [
    assignee.note,
    invalid ? `Não entendi a data "${args?.data_vencimento}" — deixei sem prazo. Use "Editar" para corrigir.` : null,
  ].filter(Boolean).join(' ') || null

  return {
    type: 'criar_tarefa',
    title: titulo,
    description: (args?.descricao || '').trim() || null,
    due_date,
    priority,
    assigned_to: assignee.assigned_to,
    assigned_name: assignee.assigned_name,
    note,
  }
}

export async function proporCriarLembrete(
  db: SupabaseAdmin,
  profile: CallerProfile,
  args: { titulo: string; data_vencimento?: string; atribuir_a_nome?: string },
): Promise<ProposedAction> {
  const titulo = (args?.titulo || '').trim()
  if (!titulo) throw new Error('Título do lembrete é obrigatório')
  const { value: due_date, invalid } = normalizeDueDate(args?.data_vencimento)
  const assignee = await resolveAssignee(db, profile, args?.atribuir_a_nome)
  const note = [
    assignee.note,
    invalid ? `Não entendi a data "${args?.data_vencimento}" — deixei sem prazo. Use "Editar" para corrigir.` : null,
  ].filter(Boolean).join(' ') || null

  return {
    type: 'criar_lembrete',
    title: titulo,
    description: null,
    due_date,
    priority: 'low',
    assigned_to: assignee.assigned_to,
    assigned_name: assignee.assigned_name,
    note,
  }
}

// --- confirmação/cancelamento de ação proposta -----------------------------
// Chamado a partir da requisição SEPARADA de confirmação/cancelamento (nunca
// do turno de chat). Fica todo aqui em tools.ts — e não em index.ts — pelo
// mesmo motivo de todo o resto do arquivo: index.ts só tem imports "jsr:"
// (Deno) que não rodam sob vitest/Node, então qualquer lógica de decisão que
// precise de teste automatizado tem que morar num módulo importável (mesma
// convenção de CLAUDE.md: extrair pra src/lib antes de testar em vez de via
// integração). `processConfirmAction`/`processCancelAction` devolvem um
// `HttpResult` ({status, body}) HTTP-agnóstico — index.ts só faz
// `json(result.body, result.status)`.

export interface ConfirmActionInput {
  log_id: string
  type: 'criar_tarefa' | 'criar_lembrete'
  title: string
  description?: string | null
  due_date?: string | null
  priority?: string | null
  assigned_to: string
}

export function parseConfirmActionInput(raw: unknown): ConfirmActionInput | null {
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

interface ValidatedConfirmInput {
  title: string
  description: string | null
  due_date: string | null
  priority: string
  assignee: { user_id: string; name: string | null; display_name: string | null }
}

// Valida os campos que o usuário pode ter editado no card — nunca confia no
// payload que a UI manda de volta. Roda ANTES de reivindicar a proposta
// (claimProposedAction) de propósito: se o título/data/responsável estiver
// inválido, a proposta continua 'proposed' e o usuário pode corrigir e
// tentar confirmar de novo, em vez de perder a proposta por causa de um erro
// de digitação.
async function validarAcaoConfirmada(
  db: SupabaseAdmin,
  profile: CallerProfile,
  input: ConfirmActionInput,
): Promise<ValidatedConfirmInput> {
  const title = (input.title || '').trim()
  if (!title) throw new Error('Título é obrigatório')
  const { value: due_date, invalid } = normalizeDueDate(input.due_date)
  if (invalid) throw new Error('Data de vencimento inválida (use AAAA-MM-DD)')
  const priority = input.type === 'criar_lembrete'
    ? 'low'
    : (PRIORITIES.has(input.priority || '') ? (input.priority as string) : 'medium')

  const { data: assigneeRow, error: assigneeErr } = await db
    .from('profiles')
    .select('user_id, name, display_name, role')
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', input.assigned_to)
    .neq('role', 'client')
    .maybeSingle()
  if (assigneeErr) throw new Error('Erro ao validar responsável')
  if (!assigneeRow) throw new Error('Responsável inválido — selecione alguém do escritório.')

  return {
    title,
    description: (input.description || '').trim() || null,
    due_date,
    priority,
    assignee: assigneeRow as { user_id: string; name: string | null; display_name: string | null },
  }
}

// Grava a tarefa/lembrete de fato. Só deve ser chamada DEPOIS de
// claimProposedAction ter reivindicado a proposta com sucesso (senão duas
// chamadas concorrentes gravariam duas tarefas pro mesmo log_id).
async function gravarTarefaConfirmada(
  db: SupabaseAdmin,
  profile: CallerProfile,
  validated: ValidatedConfirmInput,
): Promise<{ task_id: string; assigned_to: string; assigned_name: string | null }> {
  const { data: taskRow, error: insertErr } = await db
    .from('tasks')
    .insert({
      tenant_id: profile.tenant_id,
      title: validated.title,
      description: validated.description,
      due_date: validated.due_date,
      priority: validated.priority,
      status: 'pending',
      type: 'custom',
      assigned_to: validated.assignee.user_id,
      assigned_name: validated.assignee.name || validated.assignee.display_name || null,
      created_by: profile.user_id,
    })
    .select('id')
    .single()
  if (insertErr || !taskRow) throw new Error('Erro ao criar tarefa')

  // Mesmo padrão de notificação de TasksPage.tsx (notifyTaskAssignment): só
  // notifica quando atribui a outra pessoa, nunca quando é a própria.
  if (validated.assignee.user_id !== profile.user_id) {
    await db.rpc('notify_user', {
      target_user_id: validated.assignee.user_id,
      p_type: 'task',
      p_title: 'Nova tarefa atribuída a você',
      p_message: validated.title,
      p_link: '/tarefas',
    })
  }

  return {
    task_id: (taskRow as { id: string }).id,
    assigned_to: validated.assignee.user_id,
    assigned_name: validated.assignee.name || validated.assignee.display_name || null,
  }
}

// Composição de validarAcaoConfirmada + gravarTarefaConfirmada, sem a
// reivindicação atômica no meio — usada pelos testes existentes que exercitam
// o fluxo completo de uma vez. O fluxo real (processConfirmAction, abaixo)
// SEMPRE reivindica a proposta com claimProposedAction entre as duas etapas.
export async function confirmarAcaoProposta(
  db: SupabaseAdmin,
  profile: CallerProfile,
  input: ConfirmActionInput,
): Promise<{ task_id: string; assigned_to: string; assigned_name: string | null }> {
  const validated = await validarAcaoConfirmada(db, profile, input)
  return gravarTarefaConfirmada(db, profile, validated)
}

export type ClaimResult =
  | { status: 'claimed'; action_type: string | null; action_payload: unknown }
  | { status: 'not_found' }
  | { status: 'already_processed' }
  | { status: 'type_mismatch' }

// Reivindica atomicamente uma proposta pra confirmação/cancelamento. Isto é
// o que garante idempotência: duplo clique, retry de rede, ou uma segunda
// requisição de propósito pro MESMO log_id nunca processam a ação duas
// vezes (o que criaria tarefas duplicadas). O UPDATE só afeta a linha se ela
// ainda estiver com status 'proposed' NO MOMENTO EXATO do UPDATE — no
// Postgres isso é atômico mesmo com duas requisições concorrentes batendo
// ao mesmo tempo: a segunda sempre vê 0 linhas afetadas, porque a primeira
// já tomou o lock da linha e mudou o status antes dela reavaliar o WHERE.
// Um SELECT-então-UPDATE separado (o que este código tinha antes) NÃO tem
// essa garantia — as duas requisições poderiam passar pelo SELECT antes de
// qualquer uma escrever.
export async function claimProposedAction(
  db: SupabaseAdmin,
  profile: CallerProfile,
  logId: string,
  newStatus: 'confirmed' | 'cancelled',
  actionType?: 'criar_tarefa' | 'criar_lembrete',
): Promise<ClaimResult> {
  let query = db
    .from('ai_assistant_logs')
    .update({ status: newStatus })
    .eq('id', logId)
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', profile.user_id)
    .eq('status', 'proposed')
  if (actionType) query = query.eq('action_type', actionType)

  const { data: claimed, error: claimErr } = await query.select('id, action_type, action_payload')
  if (claimErr) throw new Error('Erro ao validar ação')

  const claimedRows = (claimed || []) as Array<{ id: string; action_type: string | null; action_payload: unknown }>
  if (claimedRows.length > 0) {
    return { status: 'claimed', action_type: claimedRows[0].action_type, action_payload: claimedRows[0].action_payload }
  }

  // Não reivindicou — busca só pra dar um motivo melhor na mensagem de erro
  // (leitura pura, não afeta a atomicidade da checagem acima: o resultado
  // desta consulta nunca decide se a ação é executada ou não).
  const { data: existing } = await db
    .from('ai_assistant_logs')
    .select('id, action_type')
    .eq('id', logId)
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', profile.user_id)
    .maybeSingle()
  const existingRow = existing as { id: string; action_type: string | null } | null
  if (!existingRow) return { status: 'not_found' }
  if (actionType && existingRow.action_type !== actionType) return { status: 'type_mismatch' }
  return { status: 'already_processed' }
}

export interface HttpResult { status: number; body: Record<string, unknown> }

// Fluxo completo de confirmação: valida campos (sem tocar no banco além de
// checar o responsável) -> reivindica a proposta atomicamente -> só então
// grava a tarefa. Se a reivindicação falhar (já processada por outra
// requisição, não encontrada, ou tipo inconsistente), NADA é gravado.
export async function processConfirmAction(
  db: SupabaseAdmin,
  profile: CallerProfile,
  raw: unknown,
): Promise<HttpResult> {
  const input = parseConfirmActionInput(raw)
  if (!input) return { status: 400, body: { error: 'confirm_action inválido' } }

  let validated: ValidatedConfirmInput
  try {
    validated = await validarAcaoConfirmada(db, profile, input)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao confirmar ação'
    return { status: 400, body: { error: message } }
  }

  const claim = await claimProposedAction(db, profile, input.log_id, 'confirmed', input.type)
  if (claim.status === 'not_found') return { status: 404, body: { error: 'Ação não encontrada' } }
  if (claim.status === 'type_mismatch') return { status: 400, body: { error: 'Tipo de ação inconsistente' } }
  if (claim.status === 'already_processed') return { status: 409, body: { error: 'Esta ação já foi processada anteriormente' } }

  // claim.status === 'claimed': esta é a ÚNICA requisição que vai gravar a
  // tarefa pra este log_id — nenhuma outra confirmação/cancelamento
  // concorrente do mesmo log_id também pode ter "ganho a corrida" acima.
  try {
    const result = await gravarTarefaConfirmada(db, profile, validated)
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
    return { status: 200, body: { task_id: result.task_id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar tarefa'
    // Já reivindicamos o log (status virou 'confirmed') mas a gravação da
    // tarefa falhou de verdade (erro inesperado de banco, não erro de
    // validação — esse já teria sido barrado antes da reivindicação) —
    // corrige a linha pra não ficar "confirmed" sem tarefa nenhuma.
    await db.from('ai_assistant_logs').update({ status: 'error', error_message: message }).eq('id', input.log_id)
    return { status: 500, body: { error: message } }
  }
}

export async function processCancelAction(
  db: SupabaseAdmin,
  profile: CallerProfile,
  logId: unknown,
): Promise<HttpResult> {
  if (typeof logId !== 'string' || !logId) return { status: 400, body: { error: 'cancel_action.log_id é obrigatório' } }

  const claim = await claimProposedAction(db, profile, logId, 'cancelled')
  if (claim.status === 'not_found') return { status: 404, body: { error: 'Ação não encontrada' } }
  if (claim.status === 'already_processed') return { status: 409, body: { error: 'Esta ação já foi processada anteriormente' } }

  const { error: insertErr } = await db.from('ai_assistant_logs').insert({
    tenant_id: profile.tenant_id,
    user_id: profile.user_id,
    channel: 'action',
    question: `Cancelar ação: ${claim.action_type}`,
    action_type: claim.action_type,
    action_payload: claim.action_payload,
    answer: 'Ação cancelada pelo usuário.',
    status: 'cancelled',
    related_log_id: logId,
  })
  if (insertErr) console.error('ai_assistant_logs insert error (cancel):', insertErr)
  return { status: 200, body: { cancelled: true } }
}

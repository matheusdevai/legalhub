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
  const today = todayISO()
  const { data, error } = await db
    .from('processes')
    .select('id, number, title, client_name, next_deadline, priority, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'active')
    .is('deleted_at', null)
  if (error) throw new Error('Erro ao consultar processos')

  const rows = (data || []) as Array<{ id: string; number: string; title: string; client_name: string | null; next_deadline: string | null; priority: string | null; status: string }>
  const apenasAtencao = args?.apenas_atencao !== false

  const exigemAtencao = rows.filter(p =>
    p.priority === 'high' || p.priority === 'urgent' || (!!p.next_deadline && p.next_deadline <= today)
  )
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

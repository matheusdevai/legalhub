import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { brasiliaNow, dueDeadlineAlerts, dueTriageAlerts, type Audience, type DueAlert } from "../_shared/deadlines/alerts.ts"
import { calendarForProcess, type CourtCalendarRow } from "../_shared/deadlines/courtCalendar.ts"

// Controle de Prazos — rotina de alertas (especificação, seções 7 e 8).
// pg_cron chama a cada 15 min ('lawfy-deadline-alerts'). Para cada escritório
// com o Controle de Prazos ligado:
//   1. avalia o cronograma de cada prazo aberto e de cada intimação sem triagem
//      (regras puras em _shared/deadlines/alerts.ts, as mesmas testadas no Vitest);
//   2. grava cada aviso em deadline_alerts — a chave única (assunto, regra,
//      destinatário, canal) garante que cada aviso sai uma vez só, por mais que a
//      regra continue valendo nas execuções seguintes;
//   3. entrega: notificação no app sempre; e-mail via Resend quando
//      RESEND_API_KEY existe (senão fica registrado como não entregue, e a faixa
//      de saúde mostra "e-mail desligado");
//   4. a partir das 7h, o resumo diário de cada pessoa;
//   5. registra a própria execução e o estado do e-mail em health_checks.
// E-mails só saem entre 7h e 21h (Brasília); fora disso o aviso espera a
// próxima execução dentro da janela. O aviso no app de "prazo criado" sai a
// qualquer hora.
//
// Autenticação: segredo dos crons (Vault 'lawfy_cron_secret'), igual às outras
// rotinas. O corpo aceita { now, tenant_id } só para teste — e só quem tem o
// segredo chega aqui.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('DEADLINE_ALERTS_FROM') ?? 'LegalHub Prazos <prazos@legalhub.com.br>'
const APP_URL = 'https://legalhubgestor.vercel.app'
const CLOSED = ['protocolado', 'cancelado', 'perdido']

async function isCronAuthorized(req: Request, supabase: SupabaseClient): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret') || ''
  if (!secret) return false
  const { data, error } = await supabase.rpc('lawfy_cron_secret_matches', { p_secret: secret })
  if (error) console.error('lawfy_cron_secret_matches:', error.message)
  return !error && data === true
}

interface Person { id: string; name: string; email: string | null; role: string }
interface AlertRow {
  tenant_id: string; subject_id: string; deadline_id: string | null; communication_id: string | null
  rule: string; recipient_id: string; channel: 'app' | 'email'; critical: boolean; title: string
}
interface Pending { row: AlertRow; message: string; link: string }

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

async function sendEmail(to: string, subject: string, text: string, link: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY não configurada' }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: [to], subject,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">${esc(text).replace(/\n/g, '<br>')}<p><a href="${APP_URL}${link}">Abrir no LegalHub</a></p><p style="color:#64748b;font-size:12px">Controle de Prazos do LegalHub — aviso automático. Confira sempre com a fonte oficial.</p></div>`,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) return { ok: false, error: `Resend HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Grava os avisos (os repetidos são ignorados pela chave única) e entrega só os novos. */
async function deliver(supabase: SupabaseClient, items: Pending[], people: Map<string, Person>) {
  if (!items.length) return { app: 0, email: 0, emailFailed: 0 }
  const { data: inserted, error } = await supabase.from('deadline_alerts')
    .upsert(items.map(i => i.row), { onConflict: 'subject_id,rule,recipient_id,channel', ignoreDuplicates: true })
    .select('id, subject_id, rule, recipient_id, channel')
  if (error) throw new Error(`deadline_alerts: ${error.message}`)
  const key = (r: { subject_id: string; rule: string; recipient_id: string; channel: string }) => `${r.subject_id}|${r.rule}|${r.recipient_id}|${r.channel}`
  const fresh = new Map((inserted || []).map(r => [key(r), r.id as number]))
  let app = 0, email = 0, emailFailed = 0
  const events = new Map<string, { tenant_id: string; deadline_id: string | null; communication_id: string | null; kind: string; recipients: string[]; channels: Set<string> }>()

  for (const it of items) {
    const id = fresh.get(key(it.row))
    if (id === undefined) continue
    if (it.row.channel === 'app') {
      await supabase.from('notifications').insert({ user_id: it.row.recipient_id, type: 'deadline', title: it.row.title, message: it.message, read: false, link: it.link })
      await supabase.from('deadline_alerts').update({ delivered: true }).eq('id', id)
      app++
    } else {
      const to = people.get(it.row.recipient_id)?.email
      const res = to ? await sendEmail(to, it.row.title, `${it.row.title}\n\n${it.message}`, it.link) : { ok: false, error: 'Destinatário sem e-mail' }
      await supabase.from('deadline_alerts').update({ delivered: res.ok, error: res.error ?? null }).eq('id', id)
      if (res.ok) email++; else emailFailed++
    }
    // Histórico do prazo/intimação: um evento por regra, com quem recebeu e por onde.
    if (it.row.deadline_id || it.row.communication_id) {
      const ek = `${it.row.subject_id}|${it.row.rule}`
      const ev = events.get(ek) || { tenant_id: it.row.tenant_id, deadline_id: it.row.deadline_id, communication_id: it.row.communication_id, kind: `alerta:${it.row.rule}`, recipients: [], channels: new Set<string>() }
      if (!ev.recipients.includes(it.row.recipient_id)) ev.recipients.push(it.row.recipient_id)
      ev.channels.add(it.row.channel)
      events.set(ek, ev)
    }
  }
  if (events.size) {
    await supabase.from('deadline_events').insert([...events.values()].map(e => ({
      tenant_id: e.tenant_id, deadline_id: e.deadline_id, communication_id: e.communication_id, kind: e.kind, origin: 'rotina',
      after: { destinatarios: e.recipients.map(r => people.get(r)?.name || r), canais: [...e.channels] },
    })))
  }
  return { app, email, emailFailed }
}

function recipients(audience: Audience[], ctx: { responsible?: string | null; reviewer?: string | null; triage?: string | null; admins: string[] }): string[] {
  const ids = new Set<string>()
  for (const a of audience) {
    if (a === 'responsible' && ctx.responsible) ids.add(ctx.responsible)
    if (a === 'reviewer' && ctx.reviewer) ids.add(ctx.reviewer)
    if (a === 'triage') { if (ctx.triage) ids.add(ctx.triage); else ctx.admins.forEach(x => ids.add(x)) }
    if (a === 'admins') ctx.admins.forEach(x => ids.add(x))
  }
  return [...ids]
}

function toPending(tenantId: string, subject: { deadline_id?: string; communication_id?: string }, alert: DueAlert, who: string[], emailWindow: boolean, link: string): Pending[] {
  const out: Pending[] = []
  const subject_id = (subject.deadline_id || subject.communication_id)!
  for (const r of who) {
    const base = { tenant_id: tenantId, subject_id, deadline_id: subject.deadline_id ?? null, communication_id: subject.communication_id ?? null, rule: alert.rule, recipient_id: r, critical: alert.critical, title: alert.title }
    out.push({ row: { ...base, channel: 'app' }, message: alert.message, link })
    if (alert.email && emailWindow) out.push({ row: { ...base, channel: 'email' }, message: alert.message, link })
  }
  return out
}

async function runTenant(supabase: SupabaseClient, tenantId: string, settings: { escalation_hour: number; triage_owner_id: string | null }, now: { date: string; hour: number }, calendarRows: CourtCalendarRow[]) {
  const [{ data: profs }, { data: deadlines }, { data: comms }] = await Promise.all([
    supabase.from('profiles').select('id, name, display_name, email, role').eq('tenant_id', tenantId).neq('role', 'client'),
    supabase.from('deadlines').select('id, status, act_type, fatal_date, internal_date, created_at, responsible_id, reviewer_id, court, county, process_id')
      .eq('tenant_id', tenantId).is('deleted_at', null).not('status', 'in', `(${CLOSED.join(',')})`),
    supabase.from('communications').select('id, created_at, title, assigned_to, court').eq('tenant_id', tenantId).eq('triage_status', 'pending').is('deleted_at', null),
  ])
  const people = new Map<string, Person>((profs || []).map(p => [p.id, { id: p.id, name: p.display_name || p.name || p.email || p.id, email: p.email, role: p.role }]))
  const admins = (profs || []).filter(p => p.role === 'admin').map(p => p.id)
  const emailWindow = now.hour >= 7 && now.hour < 21
  const pending: Pending[] = []

  for (const d of deadlines || []) {
    const cal = calendarForProcess(calendarRows, { court: d.court, county: d.county })
    for (const a of dueDeadlineAlerts(d, now, cal, settings.escalation_hour)) {
      const who = recipients(a.audience, { responsible: d.responsible_id, reviewer: d.reviewer_id, admins })
      pending.push(...toPending(tenantId, { deadline_id: d.id }, a, who, emailWindow, `/prazos?prazo=${d.id}`))
    }
  }
  for (const c of comms || []) {
    const cal = calendarForProcess(calendarRows, { court: c.court })
    for (const a of dueTriageAlerts(c, now, cal)) {
      const who = recipients(a.audience, { triage: c.assigned_to || settings.triage_owner_id, admins })
      pending.push(...toPending(tenantId, { communication_id: c.id }, a, who, emailWindow, '/prazos?aba=triar'))
    }
  }

  // Resumo diário (7h): o que vence hoje e amanhã, internos vencidos e intimações sem triagem.
  if (now.hour >= 7) {
    const tomorrow = new Date(`${now.date}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    const tom = tomorrow.toISOString().slice(0, 10)
    const fmt = (d: { act_type: string; fatal_date: string }) => `• ${d.act_type} — fatal ${d.fatal_date.slice(8, 10)}/${d.fatal_date.slice(5, 7)}`
    const lines = (list: typeof deadlines) => {
      const L = list || []
      const hoje = L.filter(d => d.fatal_date === now.date), amanha = L.filter(d => d.fatal_date === tom)
      const internos = L.filter(d => d.internal_date < now.date && d.status !== 'pronto' && d.fatal_date >= now.date)
      const vencidos = L.filter(d => d.fatal_date < now.date)
      const parts: string[] = []
      if (vencidos.length) parts.push(`VENCIDOS SEM PROTOCOLO (${vencidos.length}):\n${vencidos.map(fmt).join('\n')}`)
      if (hoje.length) parts.push(`Vencem HOJE (${hoje.length}):\n${hoje.map(fmt).join('\n')}`)
      if (amanha.length) parts.push(`Vencem amanhã (${amanha.length}):\n${amanha.map(fmt).join('\n')}`)
      if (internos.length) parts.push(`Prazo interno vencido (${internos.length}):\n${internos.map(fmt).join('\n')}`)
      return parts
    }
    const forPerson = (id: string) => {
      const mine = (deadlines || []).filter(d => d.responsible_id === id || d.reviewer_id === id)
      const parts = lines(mine)
      const triage = (comms || []).filter(c => (c.assigned_to || settings.triage_owner_id) === id).length
      if (triage) parts.push(`Intimações sem triagem: ${triage}`)
      return parts
    }
    for (const p of people.values()) {
      const parts = admins.includes(p.id) ? (() => { const a = lines(deadlines); if ((comms || []).length) a.push(`Intimações sem triagem no escritório: ${(comms || []).length}`); return a })() : forPerson(p.id)
      if (!parts.length) continue
      const title = `Resumo de prazos — ${now.date.slice(8, 10)}/${now.date.slice(5, 7)}`
      const base = { tenant_id: tenantId, subject_id: tenantId, deadline_id: null, communication_id: null, rule: `resumo:${now.date}`, recipient_id: p.id, critical: false, title }
      const message = parts.join('\n\n')
      pending.push({ row: { ...base, channel: 'app' }, message, link: '/prazos' })
      if (emailWindow) pending.push({ row: { ...base, channel: 'email' }, message, link: '/prazos' })
    }
  }

  const res = await deliver(supabase, pending, people)
  return { open: (deadlines || []).length, pendingTriage: (comms || []).length, ...res }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (!(await isCronAuthorized(req, supabase))) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await req.json().catch(() => ({})) as { now?: string; tenant_id?: string }
  const now = brasiliaNow(body.now ? new Date(body.now) : new Date())

  let q = supabase.from('deadline_settings').select('tenant_id, escalation_hour, triage_owner_id').eq('enabled', true)
  if (body.tenant_id) q = q.eq('tenant_id', body.tenant_id)
  const [{ data: tenants, error }, { data: calendarRows }] = await Promise.all([
    q,
    supabase.from('court_calendar').select('scope, court, county, date_from, date_to, kind, label, source_ref, version').in('scope', ['national', 'court']).is('deleted_at', null),
  ])
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const results: unknown[] = []
  for (const t of tenants || []) {
    let ok = true, detail = ''
    try {
      const r = await runTenant(supabase, t.tenant_id, t, now, (calendarRows || []) as CourtCalendarRow[])
      results.push({ tenant_id: t.tenant_id, ...r })
      detail = `${r.open} prazo(s) aberto(s), ${r.pendingTriage} intimação(ões) a triar; avisos novos: ${r.app} no app, ${r.email} por e-mail` + (r.emailFailed ? `, ${r.emailFailed} e-mail(s) não entregue(s)` : '')
    } catch (e) {
      ok = false; detail = e instanceof Error ? e.message : String(e)
      results.push({ tenant_id: t.tenant_id, error: detail })
    }
    await supabase.from('health_checks').upsert([
      { tenant_id: t.tenant_id, check_key: 'alertas', checked_on: now.date, ok, detail },
      { tenant_id: t.tenant_id, check_key: 'email', checked_on: now.date, ok: !!RESEND_API_KEY, detail: RESEND_API_KEY ? 'Envio de e-mail configurado' : 'RESEND_API_KEY não configurada: alertas só pelo app' },
    ], { onConflict: 'tenant_id,check_key,checked_on' })
  }

  return new Response(JSON.stringify({ now, tenants: results.length, results }), { headers: { 'Content-Type': 'application/json' } })
})

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// A conta Resend está em modo de teste (sandbox): só aceita enviar para o
// próprio e-mail dono da conta. contatoraizdigitaltech@gmail.com é rejeitado
// (403) até um domínio próprio ser verificado em resend.com/domains — quando
// isso acontecer, trocar OWNER_EMAIL e FROM_EMAIL de volta.
const OWNER_EMAIL = 'matheus.advjp@gmail.com'
const FROM_EMAIL = 'LegalHub Segurança <onboarding@resend.dev>'

// Janela considerada horário de trabalho (horário de Brasília), seg-sex.
// Fora disso conta como acesso fora de horário.
const WORK_START_HOUR = 7
const WORK_END_HOUR = 20

// Nenhum login anterior encontrado nos últimos N dias conta como "nunca visto".
const HISTORY_WINDOW_DAYS = 90

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

const EVENT_TITLES: Record<string, string> = {
  login_anomaly: 'Entrada incomum detectada',
  email_changed: 'E-mail de acesso foi alterado',
  password_changed: 'Senha foi alterada',
  brute_force: 'Possível ataque de força bruta no login',
  mass_export: 'Exportação/consulta em massa de registros',
  admin_created: 'Novo usuário administrador criado',
  admin_promoted: 'Usuário promovido a administrador',
  mass_delete: 'Exclusão em massa de registros',
}

// Limites que definem "comportamento estranho" (Etapa 3). Sem indicação
// contrária do dono, usei os números que ele pediu explicitamente para
// força bruta e exportação; para exclusão em massa, o limite está na
// migração do banco (20 exclusões/10min), não aqui.
const BRUTE_FORCE_THRESHOLD = 20
const BRUTE_FORCE_WINDOW_MIN = 10
const MASS_ACCESS_THRESHOLD = 500

function formatDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' })
}

function isOffHours(iso: string): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hour12: false,
  }).formatToParts(new Date(iso))
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  return weekday === 'Sat' || weekday === 'Sun' || hour < WORK_START_HOUR || hour >= WORK_END_HOUR
}

function emailHtml(titulo: string, rows: [string, string][], corpo?: string) {
  const rowsHtml = rows.map(([label, value]) =>
    `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:140px">${label}</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${value}</td></tr>`
  ).join('')
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#7c2d12,#dc2626);padding:24px 32px;border-radius:12px 12px 0 0">
        <h2 style="color:#fff;margin:0;font-size:20px">⚠️ Alerta de segurança — LegalHub</h2>
      </div>
      <div style="background:#f8fafc;padding:24px 32px;border:1px solid #e2e8f0;border-top:none">
        <h3 style="color:#0f172a;margin:0 0 12px;font-size:16px">${titulo}</h3>
        <table style="width:100%;border-collapse:collapse">${rowsHtml}</table>
        ${corpo ? `<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"><p style="color:#374151;font-size:14px;line-height:1.6;margin:0">${corpo}</p>` : ''}
      </div>
      <div style="background:#fff;padding:16px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center">
        <p style="color:#94a3b8;font-size:12px;margin:0">LegalHub — Monitoramento de segurança automático</p>
      </div>
    </div>`
}

// RESEND_API_KEY não está configurada como env var das Edge Functions neste
// projeto — só existe hoje em lh_secrets (tabela do outro sistema hospedado
// aqui). Reaproveita o mesmo fallback que enviar-notificacao já usa, para não
// depender de configuração manual. O ideal a médio prazo é configurar
// RESEND_API_KEY como secret de projeto (corrige isso e o send-support-email
// de uma vez), mas isso exige acesso ao dashboard/CLI que não temos aqui.
async function getSecret(key: string): Promise<string | null> {
  const env = Deno.env.get(key)
  if (env) return env
  const { data } = await supabaseAdmin.from('lh_secrets').select('value').eq('key', key).maybeSingle()
  return data?.value ?? null
}

async function sendAlert(subject: string, html: string) {
  const RESEND_API_KEY = await getSecret('RESEND_API_KEY')
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY não configurada — alerta não enviado por e-mail')
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [OWNER_EMAIL], subject, html }),
  })
  const resBody = await res.text().catch(() => '')
  if (!res.ok) console.error('Resend error:', resBody)
  else console.log('Resend ok:', resBody)
}

async function recordEvent(input: {
  tenant_id: string; event_type: string; severity: string; user_id: string | null
  user_email: string | null; user_name: string | null; ip_address?: string | null
  user_agent?: string | null; detail?: Record<string, unknown>
}) {
  await supabaseAdmin.from('security_events').insert({
    tenant_id: input.tenant_id,
    event_type: input.event_type,
    severity: input.severity,
    user_id: input.user_id,
    user_email: input.user_email,
    user_name: input.user_name,
    ip_address: input.ip_address ?? null,
    user_agent: input.user_agent ?? null,
    detail: input.detail ?? {},
    notified_at: new Date().toISOString(),
  })
}

// Resolve o usuário autenticado (via JWT) e seu perfil do Lawfy. Retorna null
// se o token for inválido ou se o usuário não tiver perfil no Lawfy (este
// projeto Supabase hospeda outros sistemas com o mesmo auth.users).
async function resolveLawfyProfile(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, name, email')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.tenant_id) return null
  return { user, profile }
}

async function handleLogin(req: Request) {
  const resolved = await resolveLawfyProfile(req)
  if (!resolved) {
    return new Response(JSON.stringify({ tracked: false }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
  const { user, profile } = resolved

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconhecido'
  const userAgent = req.headers.get('user-agent') || 'desconhecido'
  const now = new Date().toISOString()

  const since = new Date(Date.now() - HISTORY_WINDOW_DAYS * 86400000).toISOString()
  const { data: history } = await supabaseAdmin
    .from('login_history')
    .select('ip_address, user_agent')
    .eq('user_id', user.id)
    .gte('occurred_at', since)

  const isFirstLogin = !history || history.length === 0
  const isNewDevice = !isFirstLogin && !history!.some(h => h.user_agent === userAgent)
  const isNewLocation = !isFirstLogin && !history!.some(h => h.ip_address === ip)
  const offHours = isOffHours(now)

  await supabaseAdmin.from('login_history').insert({
    tenant_id: profile.tenant_id, user_id: user.id, ip_address: ip, user_agent: userAgent, occurred_at: now,
  })

  // Primeiro login registrado nunca dispara alerta (não há histórico prévio para comparar).
  const shouldAlert = !isFirstLogin && (isNewDevice || isNewLocation || offHours)

  if (shouldAlert) {
    const motivos: string[] = []
    if (isNewDevice) motivos.push('dispositivo/navegador nunca usado por este usuário')
    if (isNewLocation) motivos.push('endereço IP nunca usado por este usuário')
    if (offHours) motivos.push('fora do horário de trabalho (seg-sex, 07h-20h, horário de Brasília)')

    await recordEvent({
      tenant_id: profile.tenant_id,
      event_type: 'login_anomaly',
      severity: 'warning',
      user_id: user.id,
      user_email: profile.email || user.email || null,
      user_name: profile.name,
      ip_address: ip,
      user_agent: userAgent,
      detail: { motivos },
    })

    await sendAlert(
      `⚠️ Entrada incomum — ${profile.name || profile.email}`,
      emailHtml(EVENT_TITLES.login_anomaly, [
        ['Data/hora', formatDataHora(now)],
        ['Usuário', `${profile.name || '—'} (${profile.email || user.email})`],
        ['Origem (IP)', ip],
        ['Dispositivo', userAgent],
        ['Motivo', motivos.join('; ')],
      ])
    )
  }

  return new Response(JSON.stringify({ tracked: true, alerted: shouldAlert }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Chamado pelo frontend quando uma exportação ou consulta busca mais de 500
// registros de uma vez (ver exportUtils.ts). Exige sessão autenticada — quem
// não está logado não tem como exportar nada pelo app.
async function handleBulkAccess(req: Request, body: Record<string, unknown>) {
  const resolved = await resolveLawfyProfile(req)
  if (!resolved) {
    return new Response(JSON.stringify({ tracked: false }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
  const { user, profile } = resolved
  const count = Number(body.count) || 0
  const context = typeof body.context === 'string' ? body.context : 'dados'

  if (count < MASS_ACCESS_THRESHOLD) {
    return new Response(JSON.stringify({ tracked: true, alerted: false }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  await recordEvent({
    tenant_id: profile.tenant_id,
    event_type: 'mass_export',
    severity: 'warning',
    user_id: user.id,
    user_email: profile.email || user.email || null,
    user_name: profile.name,
    detail: { quantidade: count, origem: context },
  })

  await sendAlert(
    `⚠️ Exportação em massa — ${profile.name || profile.email}`,
    emailHtml(EVENT_TITLES.mass_export, [
      ['Data/hora', formatDataHora(new Date().toISOString())],
      ['Usuário', `${profile.name || '—'} (${profile.email || user.email})`],
      ['Quantidade', String(count)],
      ['Origem', context],
    ])
  )

  return new Response(JSON.stringify({ tracked: true, alerted: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Chamado pelo frontend a cada tentativa de login com senha errada (sem
// sessão — o login falhou). Endpoint público por natureza: não há JWT para
// validar quando a senha está errada. O e-mail de alerta tem um cooldown de
// 10 minutos (via security_events) para não inundar a caixa de entrada
// mesmo que alguém tente abusar diretamente deste endpoint.
async function handleLoginFailed(req: Request, body: Record<string, unknown>) {
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : null
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconhecido'
  const now = new Date().toISOString()

  await supabaseAdmin.from('login_failures').insert({ email_attempted: email, ip_address: ip, occurred_at: now })

  const since = new Date(Date.now() - BRUTE_FORCE_WINDOW_MIN * 60000).toISOString()
  const { count: totalCount } = await supabaseAdmin
    .from('login_failures')
    .select('*', { count: 'exact', head: true })
    .gte('occurred_at', since)

  let sameUserCount = 0
  if (email) {
    const { count } = await supabaseAdmin
      .from('login_failures')
      .select('*', { count: 'exact', head: true })
      .eq('email_attempted', email)
      .gte('occurred_at', since)
    sameUserCount = count || 0
  }

  const triggeredByUser = sameUserCount > BRUTE_FORCE_THRESHOLD
  const triggeredByTotal = (totalCount || 0) > BRUTE_FORCE_THRESHOLD
  if (!triggeredByUser && !triggeredByTotal) {
    return new Response(JSON.stringify({ tracked: true, alerted: false }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // Alerta é sobre o sistema como um todo, não um escritório específico —
  // vai para o tenant "casa" (conta do dono), que é quem enxerga esse tipo
  // de evento no painel (ver policy de security_events).
  const HOUSE_TENANT_ID = '00000000-0000-0000-0000-000000000001'
  const { count: recentAlerts } = await supabaseAdmin
    .from('security_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'brute_force')
    .gte('occurred_at', since)
  if ((recentAlerts || 0) > 0) {
    return new Response(JSON.stringify({ tracked: true, alerted: false, cooldown: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  await recordEvent({
    tenant_id: HOUSE_TENANT_ID,
    event_type: 'brute_force',
    severity: 'critical',
    user_id: null,
    user_email: email,
    user_name: null,
    ip_address: ip,
    detail: {
      tentativas_mesmo_usuario: sameUserCount,
      tentativas_totais: totalCount || 0,
      janela_minutos: BRUTE_FORCE_WINDOW_MIN,
    },
  })

  await sendAlert(
    `⚠️ Possível força bruta no login`,
    emailHtml(EVENT_TITLES.brute_force, [
      ['Data/hora', formatDataHora(now)],
      ['E-mail alvo', email || '—'],
      ['Origem (IP)', ip],
      ['Tentativas (mesmo e-mail)', String(sameUserCount)],
      ['Tentativas (total, todo o sistema)', String(totalCount || 0)],
      ['Janela', `${BRUTE_FORCE_WINDOW_MIN} minutos`],
    ])
  )

  return new Response(JSON.stringify({ tracked: true, alerted: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function handleEvent(req: Request, body: Record<string, unknown>) {
  const signature = req.headers.get('x-signature') || ''
  const { data: expectedSecret } = await supabaseAdmin.rpc('lawfy_get_security_monitor_secret')
  if (!expectedSecret || !timingSafeEqual(signature, expectedSecret)) {
    return new Response(JSON.stringify({ error: 'Assinatura inválida' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const { event_type, severity, tenant_id, user_id, user_email, user_name, ip_address, user_agent, detail } = body as Record<string, string | Record<string, unknown> | null>

  await recordEvent({
    tenant_id: tenant_id as string,
    event_type: event_type as string,
    severity: (severity as string) || 'warning',
    user_id: (user_id as string) || null,
    user_email: (user_email as string) || null,
    user_name: (user_name as string) || null,
    ip_address: (ip_address as string) || null,
    user_agent: (user_agent as string) || null,
    detail: (detail as Record<string, unknown>) || {},
  })

  const now = new Date().toISOString()
  const title = EVENT_TITLES[event_type as string] || (event_type as string)
  const detailObj = (detail as Record<string, unknown>) || {}
  const extraRows: [string, string][] = Object.entries(detailObj).map(([k, v]) => [k, String(v)])

  await sendAlert(
    `⚠️ ${title} — ${user_name || user_email || 'Lawfy'}`,
    emailHtml(title, [
      ['Data/hora', formatDataHora(now)],
      ['Usuário', `${user_name || '—'} (${user_email || '—'})`],
      ...(ip_address ? [['Origem (IP)', ip_address as string] as [string, string]] : []),
      ...(user_agent ? [['Dispositivo', user_agent as string] as [string, string]] : []),
      ...extraRows,
    ])
  )

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  try {
    const body = await req.json().catch(() => ({}))
    if (body.acao === 'login') return await handleLogin(req)
    if (body.acao === 'login_failed') return await handleLoginFailed(req, body)
    if (body.acao === 'bulk_access') return await handleBulkAccess(req, body)
    if (body.acao === 'event') return await handleEvent(req, body)
    return new Response(JSON.stringify({ error: 'acao inválida' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

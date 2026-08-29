import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Job semanal (pg_cron, segunda 07h30) de resumo por e-mail do escritório —
// novos clientes/processos, tarefas concluídas/vencidas e financeiro da
// semana, um e-mail por tenant, para admin/financial/super_admin.
// Isolamento: cada iteração do loop de tenants só agrega dados daquele
// tenant_id, nunca mistura entre escritórios.
const CRON_SECRET = "c14b480a811db8b0e24711ceb5068d6eab4addfb5af9921b"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

function formatCurrencyBR(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Stats {
  novosClientes: number
  novosProcessos: number
  tarefasConcluidas: number
  tarefasVencidas: number
  recebidoSemana: number
  pagoSemana: number
  pendenteVencido: number
}

function emailHtml(tenantName: string, periodoStr: string, s: Stats) {
  const row = (label: string, value: string) => `<tr><td style="padding:8px 0;color:#64748b;font-size:13px">${label}</td><td style="padding:8px 0;font-weight:700;color:#0f172a;font-size:15px;text-align:right">${value}</td></tr>`
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:24px 32px;border-radius:12px 12px 0 0">
        <h2 style="color:#fff;margin:0;font-size:18px">Resumo semanal — ${tenantName}</h2>
        <p style="color:#dbeafe;margin:4px 0 0;font-size:12px">${periodoStr}</p>
      </div>
      <div style="background:#f8fafc;padding:24px 32px;border:1px solid #e2e8f0;border-top:none">
        <table style="width:100%;border-collapse:collapse">
          ${row('Novos clientes', String(s.novosClientes))}
          ${row('Novos processos', String(s.novosProcessos))}
          ${row('Tarefas concluídas na semana', String(s.tarefasConcluidas))}
          ${row('Tarefas vencidas (em aberto agora)', String(s.tarefasVencidas))}
        </table>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <table style="width:100%;border-collapse:collapse">
          ${row('Recebido na semana', `R$ ${formatCurrencyBR(s.recebidoSemana)}`)}
          ${row('Pago na semana', `R$ ${formatCurrencyBR(s.pagoSemana)}`)}
          ${row('Pendente vencido (em aberto agora)', `R$ ${formatCurrencyBR(s.pendenteVencido)}`)}
        </table>
      </div>
      <div style="background:#fff;padding:16px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center">
        <p style="color:#94a3b8;font-size:12px;margin:0">LegalHub — Sistema de Gestão Jurídica · Resumo gerado automaticamente toda segunda-feira</p>
      </div>
    </div>
  `
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const todayStr = now.toISOString().slice(0, 10)
  const weekAgoIso = weekAgo.toISOString()
  const periodoStr = `${weekAgo.toLocaleDateString('pt-BR')} a ${now.toLocaleDateString('pt-BR')}`

  const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id, name')
  if (tenantsError) return new Response(JSON.stringify({ error: tenantsError.message }), { status: 500 })

  const results: any[] = []

  for (const tenant of tenants || []) {
    try {
      const { data: recipients } = await supabase.from('profiles')
        .select('email')
        .eq('tenant_id', tenant.id)
        .in('role', ['admin', 'financial', 'super_admin'])
        .not('email', 'is', null)

      const to = (recipients || []).map(r => r.email).filter(Boolean) as string[]
      if (to.length === 0) { results.push({ tenant: tenant.name, skipped: 'sem destinatário' }); continue }

      const [
        { count: novosClientes },
        { count: novosProcessos },
        { count: tarefasConcluidas },
        { count: tarefasVencidas },
        { data: recebidos },
        { data: pagos },
        { data: pendentesVencidos },
      ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).is('deleted_at', null).gte('created_at', weekAgoIso),
        supabase.from('processes').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).is('deleted_at', null).gte('created_at', weekAgoIso),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).is('deleted_at', null).eq('status', 'done').gte('completed_at', weekAgoIso),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).is('deleted_at', null).in('status', ['pending', 'in_progress']).lt('due_date', todayStr),
        supabase.from('financials').select('amount').eq('tenant_id', tenant.id).is('deleted_at', null).eq('type', 'receivable').eq('status', 'paid').gte('paid_date', weekAgoIso.slice(0, 10)),
        supabase.from('financials').select('amount').eq('tenant_id', tenant.id).is('deleted_at', null).eq('type', 'payable').eq('status', 'paid').gte('paid_date', weekAgoIso.slice(0, 10)),
        supabase.from('financials').select('amount').eq('tenant_id', tenant.id).is('deleted_at', null).eq('status', 'pending').lt('due_date', todayStr),
      ])

      const stats: Stats = {
        novosClientes: novosClientes || 0,
        novosProcessos: novosProcessos || 0,
        tarefasConcluidas: tarefasConcluidas || 0,
        tarefasVencidas: tarefasVencidas || 0,
        recebidoSemana: (recebidos || []).reduce((s, r: any) => s + Number(r.amount || 0), 0),
        pagoSemana: (pagos || []).reduce((s, r: any) => s + Number(r.amount || 0), 0),
        pendenteVencido: (pendentesVencidos || []).reduce((s, r: any) => s + Number(r.amount || 0), 0),
      }

      if (!RESEND_API_KEY) {
        results.push({ tenant: tenant.name, sent: false, reason: 'RESEND_API_KEY não configurada', stats })
        continue
      }

      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'relatorios@legalhub.com.br',
          to,
          subject: `Resumo semanal — ${tenant.name}`,
          html: emailHtml(tenant.name, periodoStr, stats),
        }),
      })
      results.push({ tenant: tenant.name, sent: r.ok, status: r.status, recipients: to.length })
    } catch (e: any) {
      results.push({ tenant: tenant.name, error: e.message })
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), { headers: { 'Content-Type': 'application/json' } })
})

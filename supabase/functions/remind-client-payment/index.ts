import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Envia lembrete de pagamento por e-mail para o CLIENTE do escritório (não o
// time interno — isso já é coberto por lawfy_generate_notifications()).
// Disparada via net.http_post de dentro de lawfy_notify_clients_payment_due()
// (cron 06h30), uma chamada por lançamento financeiro vencendo em 3 dias.
//
// Autenticação por segredo fixo: quem chama é Postgres/pg_cron, não um usuário
// logado, e sem esse segredo qualquer um poderia usar este endpoint como
// relay pra mandar e-mail "em nome" do LegalHub pra qualquer destinatário.
const CRON_SECRET = "f2bedff373b29430a54cdcfeca0c9e6a5e9c0bb5d91a340b"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

function emailHtml(opts: { clientName: string; tenantName: string; description: string; amountStr: string; dueDateStr: string }) {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:24px 32px;border-radius:12px 12px 0 0">
        <h2 style="color:#fff;margin:0;font-size:18px">Lembrete de pagamento — ${opts.tenantName}</h2>
      </div>
      <div style="background:#f8fafc;padding:24px 32px;border:1px solid #e2e8f0;border-top:none">
        <p style="color:#374151;font-size:14px;line-height:1.6;margin-top:0">Olá, ${opts.clientName}.</p>
        <p style="color:#374151;font-size:14px;line-height:1.6">Este é um lembrete de que o lançamento abaixo vence em <strong>3 dias</strong>:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:110px">Descrição</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${opts.description}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Valor</td><td style="padding:6px 0;font-weight:600;color:#0f172a">R$ ${opts.amountStr}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Vencimento</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${opts.dueDateStr}</td></tr>
        </table>
        <p style="color:#64748b;font-size:13px;line-height:1.6">Em caso de dúvidas ou se o pagamento já foi realizado, entre em contato diretamente com ${opts.tenantName}.</p>
      </div>
      <div style="background:#fff;padding:16px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center">
        <p style="color:#94a3b8;font-size:12px;margin:0">LegalHub — Sistema de Gestão Jurídica · Lembrete gerado automaticamente</p>
      </div>
    </div>
  `
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  try {
    const { to, client_name, tenant_name, description, amount, due_date } = await req.json()
    if (!to || !description || amount == null || !due_date) {
      return new Response(JSON.stringify({ error: 'to, description, amount, due_date são obrigatórios' }), { status: 400 })
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ sent: false, reason: 'RESEND_API_KEY não configurada' }), { headers: { 'Content-Type': 'application/json' } })
    }

    const amountStr = Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const dueDateStr = new Date(due_date + 'T00:00:00').toLocaleDateString('pt-BR')

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'financeiro@legalhub.com.br',
        to: [to],
        subject: `Lembrete de pagamento — vence em 3 dias`,
        html: emailHtml({ clientName: client_name || 'Cliente', tenantName: tenant_name || 'Escritório', description, amountStr, dueDateStr }),
      }),
    })
    const resBody = await r.json().catch(() => ({}))
    return new Response(JSON.stringify({ sent: r.ok, status: r.status, id: resBody?.id, error: resBody?.message }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})

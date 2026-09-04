import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const TO_EMAIL = 'contatoraizdigitaltech@gmail.com'

// Rate limit simples por usuário chamador: no máximo RATE_LIMIT chamadas numa
// janela de RATE_WINDOW_SECONDS, contra a tabela edge_function_rate_limits (só
// acessível via service role). Limite mais baixo que create-user/delete-user
// porque esta função é chamada por QUALQUER usuário autenticado (não só
// admins) e dispara envio de e-mail externo via Resend a cada chamada.
const RATE_LIMIT = 5
const RATE_WINDOW_SECONDS = 60 * 60

// Count + insert atômicos via RPC (função Postgres com pg_advisory_xact_lock
// por rate_key) — um SELECT count() + INSERT separados aqui deixaria N
// chamadas concorrentes lerem o mesmo count() antes de qualquer INSERT
// comitar, passando todas juntas acima do limite (TOCTOU). Ver migration
// 20260903120000_fix_edge_function_rate_limit_race.sql.
async function checkRateLimit(supabaseAdmin: ReturnType<typeof createClient>, key: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  })
  if (error) {
    console.error('check_rate_limit RPC error:', error)
    throw new Error('Erro ao verificar limite de uso')
  }
  return data === true
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Token ausente' }), { headers: cors, status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { headers: cors, status: 401 })
    }

    const withinLimit = await checkRateLimit(supabaseAdmin, `send-support-email:${user.id}`)
    if (!withinLimit) {
      // Mesmo padrão de "sempre 200" das demais respostas desta função — o
      // ticket já foi salvo no banco separadamente, então isso só impede o
      // e-mail extra, sem quebrar o fluxo do widget.
      return new Response(JSON.stringify({ success: false, error: 'Muitos chamados de suporte em pouco tempo. Aguarde e tente novamente.' }), { headers: cors, status: 200 })
    }

    const { from_name, from_email, subject, message, tenant_name } = await req.json()

    if (RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'suporte@legalhub.com.br',
          to: [TO_EMAIL],
          reply_to: from_email || undefined,
          subject: `[LegalHub Suporte] ${escapeHtml(subject || '')}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:24px 32px;border-radius:12px 12px 0 0">
                <h2 style="color:#fff;margin:0;font-size:20px">Novo chamado de suporte — LegalHub</h2>
              </div>
              <div style="background:#f8fafc;padding:24px 32px;border:1px solid #e2e8f0;border-top:none">
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:120px">Solicitante</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${from_name ? escapeHtml(from_name) : '—'}</td></tr>
                  <tr><td style="padding:6px 0;color:#64748b;font-size:13px">E-mail</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${from_email ? escapeHtml(from_email) : '—'}</td></tr>
                  <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Escritório</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${tenant_name ? escapeHtml(tenant_name) : '—'}</td></tr>
                  <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Assunto</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${escapeHtml(subject || '')}</td></tr>
                </table>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
                <p style="color:#374151;font-size:14px;white-space:pre-wrap;line-height:1.6">${escapeHtml(message || '')}</p>
              </div>
              <div style="background:#fff;padding:16px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center">
                <p style="color:#94a3b8;font-size:12px;margin:0">LegalHub — Sistema de Gestão Jurídica · Chamado gerado automaticamente</p>
              </div>
            </div>
          `,
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        console.error('Resend error:', err)
      }
    } else {
      console.warn('RESEND_API_KEY not set — email not sent, ticket saved to DB only')
    }

    return new Response(JSON.stringify({ success: true }), { headers: cors, status: 200 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('send-support-email error:', msg)
    // Always return 200 so the widget shows success (ticket is saved to DB regardless)
    return new Response(JSON.stringify({ success: false, error: msg }), { headers: cors, status: 200 })
  }
})

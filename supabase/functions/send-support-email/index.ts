import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const TO_EMAIL = 'contatoraizdigitaltech@gmail.com'

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

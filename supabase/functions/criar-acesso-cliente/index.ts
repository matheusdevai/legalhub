import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

async function getSecret(admin: any, key: string): Promise<string | null> {
  const env = Deno.env.get(key);
  if (env) return env;
  const { data } = await admin.from('lh_secrets').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const { clienteId, email, senha, enviarEmail } = await req.json();

    if (!clienteId || !email || !senha) {
      return new Response(JSON.stringify({ error: 'Dados incompletos (clienteId, email, senha).' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (senha.length < 6) {
      return new Response(JSON.stringify({ error: 'A senha deve ter no mínimo 6 caracteres.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const asUser = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(URL, SERVICE);

    const { data: cliente, error: cErr } = await asUser
      .from('lh_clientes').select('id, tenant_id, empresa, responsavel').eq('id', clienteId).maybeSingle();
    if (cErr || !cliente) {
      return new Response(JSON.stringify({ error: 'Cliente não encontrado ou sem permissão.' }),
        { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { data: jaTem } = await admin.from('lh_client_users')
      .select('id').eq('cliente_id', clienteId).maybeSingle();
    if (jaTem) {
      return new Response(JSON.stringify({ error: 'Este cliente já possui um acesso cadastrado.' }),
        { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { data: created, error: uErr } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: cliente.empresa, role: 'client' },
    });
    if (uErr) {
      const msg = /already been registered|already exists/i.test(uErr.message)
        ? 'Este e-mail já está cadastrado no sistema.' : uErr.message;
      return new Response(JSON.stringify({ error: msg }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { error: linkErr } = await admin.from('lh_client_users').insert({
      user_id: created.user.id,
      cliente_id: clienteId,
      tenant_id: cliente.tenant_id,
    });
    if (linkErr) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return new Response(JSON.stringify({ error: 'Falha ao vincular acesso: ' + linkErr.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    let emailEnviado = false;
    if (enviarEmail) {
      const RESEND = await getSecret(admin, 'RESEND_API_KEY');
      if (RESEND) {
        const from = (await getSecret(admin, 'EMAIL_FROM')) || 'LicitaHub <onboarding@resend.dev>';
        const html = `<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="background:linear-gradient(135deg,#7C3AED,#2563EB,#06B6D4);padding:24px;text-align:center"><span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:1px">LicitaHub</span><div style="color:#dbeafe;font-size:10px;letter-spacing:2px;margin-top:4px">PORTAL DO CLIENTE</div></div><div style="padding:28px;background:#fff"><h2 style="color:#0f172a;font-size:18px">Olá, ${cliente.responsavel || cliente.empresa}!</h2><p style="color:#475569;font-size:14px;line-height:1.6">Seu acesso ao portal LicitaHub foi criado.</p><div style="background:#f1f5f9;border-radius:10px;padding:16px;margin:16px 0"><p style="margin:0;color:#0f172a;font-size:13px"><strong>E-mail:</strong> ${email}</p><p style="margin:8px 0 0;color:#0f172a;font-size:13px"><strong>Senha:</strong> ${senha}</p></div></div><div style="padding:16px;background:#f8fafc;text-align:center;color:#94a3b8;font-size:11px">© 2025 LicitaHub</div></div>`;
        const er = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [email], subject: 'Seu acesso ao Portal LicitaHub', html }),
        });
        emailEnviado = er.ok;
      }
    }

    return new Response(JSON.stringify({ ok: true, userId: created.user.id, emailEnviado }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});

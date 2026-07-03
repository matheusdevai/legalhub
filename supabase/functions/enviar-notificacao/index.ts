import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function getSecret(key: string): Promise<string | null> {
  const env = Deno.env.get(key);
  if (env) return env;
  const { data } = await supabase.from('lh_secrets').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

const LOGO_HTML = `<div style="background:linear-gradient(135deg,#7C3AED,#2563EB,#06B6D4);padding:24px;border-radius:12px 12px 0 0;text-align:center"><span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:1px">LicitaHub</span><div style="color:#dbeafe;font-size:10px;letter-spacing:2px;margin-top:4px">ASSESSORIA E CONSULTORIA EM LICITAÇÕES</div></div>`;

function emailHtml(titulo: string, corpo: string) {
  return `<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">${LOGO_HTML}<div style="padding:28px;background:#fff"><h2 style="color:#0f172a;font-size:18px;margin:0 0 12px">${titulo}</h2><div style="color:#475569;font-size:14px;line-height:1.6">${corpo}</div></div><div style="padding:16px;background:#f8fafc;text-align:center;color:#94a3b8;font-size:11px">© 2025 LicitaHub — Gestão Inteligente de Licitações e Contratos</div></div>`;
}

async function enviarEmail(para: string, assunto: string, html: string) {
  const RESEND = await getSecret('RESEND_API_KEY');
  if (!RESEND) return { sent: false, reason: 'RESEND_API_KEY não configurada' };
  const from = (await getSecret('EMAIL_FROM')) || 'LicitaHub <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [para], subject: assunto, html }),
  });
  const body = await r.json().catch(() => ({}));
  return { sent: r.ok, status: r.status, id: body?.id, error: body?.message };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const acao = body.acao || 'verificar_vencimentos';

    if (acao === 'email') {
      const res = await enviarEmail(body.para, body.assunto, emailHtml(body.titulo, body.corpo));
      return new Response(JSON.stringify(res), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const hoje = new Date();
    const limite = new Date(hoje.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const hojeStr = hoje.toISOString().slice(0, 10);

    const { data: certs } = await supabase.from('lh_certidoes')
      .select('id,tenant_id,cliente_id,nome,validade')
      .lte('validade', limite).gte('validade', hojeStr);

    let criadas = 0;
    for (const c of certs || []) {
      const dias = Math.ceil((new Date(c.validade).getTime() - hoje.getTime()) / 86400000);
      const { data: existe } = await supabase.from('lh_notificacoes')
        .select('id').eq('cliente_id', c.cliente_id)
        .ilike('titulo', '%' + c.nome.slice(0, 20) + '%').eq('lida', false).maybeSingle();
      if (!existe) {
        await supabase.from('lh_notificacoes').insert({
          tenant_id: c.tenant_id, cliente_id: c.cliente_id, tipo: 'alerta',
          titulo: `Certidão vencendo: ${c.nome.slice(0, 30)}`,
          mensagem: `A certidão vence em ${dias} dias (${c.validade}). Providencie a renovação.`,
        });
        criadas++;
      }
    }

    return new Response(JSON.stringify({ ok: true, certidoesVencendo: certs?.length || 0, notificacoesCriadas: criadas }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});

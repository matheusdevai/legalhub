-- Rotação do x-cron-secret: os crons que chamam Edge Functions
-- (lawfy-relatorio-semanal, lawfy-sync-processos-oab e
-- lawfy_notify_clients_payment_due) tinham o segredo escrito literalmente no
-- comando/corpo da função — e os valores antigos estão no histórico do git
-- (ver commit 0558f41). Agora os três leem do Vault, entrada
-- 'lawfy_cron_secret', criada fora desta migration (o valor nunca entra no
-- repo). Ela precisa ter o mesmo valor do secret CRON_SECRET das Edge
-- Functions — trocar um sem o outro faz as functions responderem 401.

CREATE OR REPLACE FUNCTION public.lawfy_cron_headers()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lawfy_cron_secret')
  )
$function$;

-- Interna: devolve o segredo, nunca pode ficar exposta via RPC.
REVOKE EXECUTE ON FUNCTION public.lawfy_cron_headers() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lawfy_notify_clients_payment_due()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f record;
begin
  for f in
    select fin.id, fin.description, fin.amount, fin.due_date,
           c.email as client_email, c.name as client_name,
           t.name as tenant_name
    from public.financials fin
    join public.clients c on c.id = fin.client_id and c.deleted_at is null
    join public.tenants t on t.id = fin.tenant_id
    where fin.deleted_at is null
      and fin.status = 'pending'
      and fin.type = 'receivable'
      and fin.due_date = current_date + 3
      and fin.client_reminder_sent_at is null
      and c.email is not null and c.email <> ''
  loop
    perform net.http_post(
      url := 'https://bdpkkacfsavmpumwftsf.supabase.co/functions/v1/remind-client-payment',
      headers := public.lawfy_cron_headers(),
      body := jsonb_build_object(
        'to', f.client_email,
        'client_name', f.client_name,
        'tenant_name', f.tenant_name,
        'description', f.description,
        'amount', f.amount,
        'due_date', f.due_date
      )
    );
    update public.financials set client_reminder_sent_at = now() where id = f.id;
  end loop;
end;
$function$;

SELECT cron.alter_job(jobid, command := $cmd$
  select net.http_post(
    url := 'https://bdpkkacfsavmpumwftsf.supabase.co/functions/v1/weekly-report-email',
    headers := public.lawfy_cron_headers(),
    body := '{}'::jsonb
  );
$cmd$)
FROM cron.job WHERE jobname = 'lawfy-relatorio-semanal';

SELECT cron.alter_job(jobid, command := $cmd$
  select net.http_post(
    url := 'https://bdpkkacfsavmpumwftsf.supabase.co/functions/v1/cron-sync-processes',
    headers := public.lawfy_cron_headers(),
    body := '{}'::jsonb
  );
$cmd$)
FROM cron.job WHERE jobname = 'lawfy-sync-processos-oab';

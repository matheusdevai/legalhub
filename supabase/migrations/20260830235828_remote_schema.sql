


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'staff'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."movement_type" AS ENUM (
    'entrada',
    'saida',
    'ajuste'
);


ALTER TYPE "public"."movement_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_set_tenant_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.tenant_id := current_tenant_id();
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem tenant válido ou não autenticado';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_set_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_trash"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM clients         WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '7 days';
  DELETE FROM processes       WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '7 days';
  DELETE FROM financials      WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '7 days';
  DELETE FROM calendar_events WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '7 days';
  DELETE FROM tasks           WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '7 days';
  DELETE FROM leads           WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '7 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_trash"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_tasks_for_process"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.next_deadline IS NOT NULL THEN
    INSERT INTO tasks (tenant_id, title, process_id, assigned_name, due_date, priority, type)
    VALUES (NEW.tenant_id, 'Verificar prazo processual -- ' || NEW.number, NEW.id, NEW.assigned_lawyer, NEW.next_deadline, 'high', 'deadline');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_default_tasks_for_process"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_client_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select client_id from public.profiles where id = auth.uid()
$$;


ALTER FUNCTION "public"."current_client_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."current_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, name, display_name, email, role, tenant_id, city, avatar, created_at)
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'lawyer'),
    NULLIF(NEW.raw_user_meta_data->>'tenant_id', 'default')::uuid,
    NEW.raw_user_meta_data->>'city',
    NULL,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id   = EXCLUDED.user_id,
    name      = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    email     = EXCLUDED.email,
    role      = EXCLUDED.role,
    tenant_id = EXCLUDED.tenant_id,
    city      = EXCLUDED.city;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca falhar o signup por erro no profile
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_client_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'client', false)
$$;


ALTER FUNCTION "public"."is_client_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lawfy_admin_role_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp', 'vault'
    AS $$
declare
  v_secret text;
  v_event_type text;
begin
  if NEW.tenant_id is null then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.role in ('admin','super_admin') then
      v_event_type := 'admin_created';
    else
      return NEW;
    end if;
  else
    if NEW.role in ('admin','super_admin') and OLD.role not in ('admin','super_admin') then
      v_event_type := 'admin_promoted';
    else
      return NEW;
    end if;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'security_monitor_secret';

  perform net.http_post(
    url := 'https://bdpkkacfsavmpumwftsf.supabase.co/functions/v1/security-monitor',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-signature', coalesce(v_secret, '')),
    body := jsonb_build_object(
      'acao', 'event',
      'event_type', v_event_type,
      'severity', 'critical',
      'tenant_id', NEW.tenant_id,
      'user_id', NEW.id,
      'user_email', NEW.email,
      'user_name', NEW.name,
      'detail', jsonb_build_object('novo_papel', NEW.role)
    )
  );

  return NEW;
end;
$$;


ALTER FUNCTION "public"."lawfy_admin_role_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lawfy_audit_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_user_name text;
  v_label text;
  v_changes jsonb;
  v_old jsonb;
  v_new jsonb;
  v_key text;
begin
  v_user_id := auth.uid();
  if v_user_id is not null then
    select name into v_user_name from public.profiles where user_id = v_user_id limit 1;
  end if;

  v_new := to_jsonb(NEW);
  -- Cada tabela tem um campo "nome" diferente (clients.name, processes.number,
  -- tasks.title, financials.description) — acesso por chave jsonb não falha
  -- se a coluna não existir na tabela que disparou o trigger.
  v_label := coalesce(v_new->>'name', v_new->>'number', v_new->>'title', v_new->>'description', '');

  if TG_OP = 'INSERT' then
    insert into public.audit_log (tenant_id, entity_type, entity_id, action, entity_label, user_id, user_name)
    values (NEW.tenant_id, TG_TABLE_NAME, NEW.id, 'create', v_label, v_user_id, v_user_name);
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);

    if OLD.deleted_at is null and NEW.deleted_at is not null then
      insert into public.audit_log (tenant_id, entity_type, entity_id, action, entity_label, user_id, user_name)
      values (NEW.tenant_id, TG_TABLE_NAME, NEW.id, 'delete', v_label, v_user_id, v_user_name);
      return NEW;
    end if;

    v_changes := '{}'::jsonb;
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at','created_at') and v_old->v_key is distinct from v_new->v_key then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('de', v_old->v_key, 'para', v_new->v_key));
      end if;
    end loop;

    if v_changes <> '{}'::jsonb then
      insert into public.audit_log (tenant_id, entity_type, entity_id, action, entity_label, changes, user_id, user_name)
      values (NEW.tenant_id, TG_TABLE_NAME, NEW.id, 'update', v_label, v_changes, v_user_id, v_user_name);
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."lawfy_audit_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lawfy_auth_credential_change_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp', 'vault'
    AS $$
declare
  v_tenant_id uuid;
  v_name text;
  v_secret text;
  v_event_type text;
  v_detail jsonb := '{}'::jsonb;
begin
  select tenant_id, name into v_tenant_id, v_name from public.profiles where user_id = NEW.id limit 1;
  if v_tenant_id is null then
    return NEW;
  end if;

  if NEW.email is distinct from OLD.email then
    v_event_type := 'email_changed';
    v_detail := jsonb_build_object('email_antigo', OLD.email, 'email_novo', NEW.email);
  elsif NEW.encrypted_password is distinct from OLD.encrypted_password then
    v_event_type := 'password_changed';
  else
    return NEW;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'security_monitor_secret';

  perform net.http_post(
    url := 'https://bdpkkacfsavmpumwftsf.supabase.co/functions/v1/security-monitor',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-signature', coalesce(v_secret, '')),
    body := jsonb_build_object(
      'acao', 'event',
      'event_type', v_event_type,
      'severity', 'critical',
      'tenant_id', v_tenant_id,
      'user_id', NEW.id,
      'user_email', NEW.email,
      'user_name', v_name,
      'detail', v_detail
    )
  );

  return NEW;
end;
$$;


ALTER FUNCTION "public"."lawfy_auth_credential_change_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lawfy_auto_assign_task"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_tenant_id uuid;
  v_chosen record;
begin
  -- Só distribui automaticamente quando a tarefa nasce sem responsável definido —
  -- nunca sobrescreve uma atribuição explícita feita pela tela ou por outro fluxo.
  if NEW.assigned_to is not null then
    return NEW;
  end if;

  v_tenant_id := coalesce(NEW.tenant_id, current_tenant_id());
  if v_tenant_id is null then
    return NEW;
  end if;

  -- Escolhe quem tem menos tarefas pendentes/em andamento no momento (balanceamento
  -- de carga simples), isolado por tenant. Empate desempatado por nome, pra
  -- determinismo (não é sorteio).
  select p.user_id, p.name into v_chosen
  from public.profiles p
  where p.tenant_id = v_tenant_id
    and p.role in ('admin', 'lawyer', 'intern')
  order by (
    select count(*) from public.tasks tk
    where tk.assigned_to = p.user_id
      and tk.deleted_at is null
      and tk.status in ('pending', 'in_progress')
  ) asc, p.name asc
  limit 1;

  if v_chosen.user_id is null then
    return NEW;
  end if;

  NEW.assigned_to := v_chosen.user_id;
  NEW.assigned_name := v_chosen.name;

  -- notify_user() é no-op silencioso se auth.uid() não resolver um tenant (ex.
  -- insert feito por processo interno sem sessão de usuário) — nunca falha o insert.
  perform public.notify_user(v_chosen.user_id, 'task', 'Nova tarefa atribuída a você', NEW.title, '/tarefas');

  return NEW;
end;
$$;


ALTER FUNCTION "public"."lawfy_auto_assign_task"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lawfy_generate_notifications"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  t record;
  f record;
  p record;
  u record;
  amount_str text;
begin
  -- Tarefas vencendo amanhã (aviso de 24h), para o responsável, se ele optou por receber
  for t in
    select tk.id, tk.title, tk.assigned_to
    from public.tasks tk
    join public.profiles pr on pr.user_id = tk.assigned_to
    where tk.deleted_at is null
      and tk.recurring = false
      and tk.status = 'pending'
      and tk.due_date = current_date + 1
      and tk.assigned_to is not null
      and coalesce((pr.notification_prefs->>'task_due')::boolean, true) = true
  loop
    if not exists (
      select 1 from public.notifications
      where user_id = t.assigned_to and type = 'task' and link = '/tarefas?highlight=' || t.id
        and created_at::date = current_date
    ) then
      insert into public.notifications (user_id, type, title, message, read, link)
      values (t.assigned_to, 'task', 'Tarefa vencendo amanhã', t.title, false, '/tarefas?highlight=' || t.id);
    end if;
  end loop;

  -- Lançamentos financeiros vencendo em 3 dias, para admin/financeiro/super_admin do tenant.
  -- Inclui recorrentes: o "template" (recurring = true) tem seu due_date sempre avançado pra
  -- a próxima ocorrência por lawfy_generate_recurring_items(), então ele É a referência real
  -- da próxima cobrança/recebimento futuro — a ocorrência concreta só é materializada no dia
  -- do vencimento (devido à trigger 06h), tarde demais pra avisar com 3 dias de antecedência.
  for f in
    select fin.id, fin.description, fin.amount, fin.type, fin.tenant_id
    from public.financials fin
    where fin.deleted_at is null
      and fin.status = 'pending'
      and fin.due_date = current_date + 3
  loop
    -- Formata em pt-BR (milhar '.', decimal ',') de forma independente do locale do servidor
    amount_str := replace(replace(replace(to_char(f.amount, 'FM999,999,999.00'), ',', '§'), '.', ','), '§', '.');

    for u in
      select user_id from public.profiles
      where tenant_id = f.tenant_id
        and role in ('admin', 'financial', 'super_admin')
        and coalesce((notification_prefs->>'financial_due')::boolean, true) = true
    loop
      if not exists (
        select 1 from public.notifications
        where user_id = u.user_id and type = 'payment' and link = '/financeiro?highlight=' || f.id
          and created_at::date = current_date
      ) then
        insert into public.notifications (user_id, type, title, message, read, link)
        values (
          u.user_id, 'payment',
          case when f.type = 'receivable' then 'Recebimento vencendo em 3 dias' else 'Pagamento vencendo em 3 dias' end,
          f.description || ' — R$ ' || amount_str,
          false, '/financeiro?highlight=' || f.id
        );
      end if;
    end loop;
  end loop;

  -- Prazo processual vencendo em 3 dias, para admin/lawyer/super_admin do tenant do processo.
  -- Não há coluna uuid ligando processes ao usuário responsável (assigned_lawyer é texto livre),
  -- então avisa o time todo do escritório — igual ao padrão já usado para financeiro acima.
  for p in
    select pc.id, pc.number, pc.title, pc.client_name, pc.tenant_id
    from public.processes pc
    where pc.deleted_at is null
      and pc.next_deadline = current_date + 3
  loop
    for u in
      select user_id from public.profiles
      where tenant_id = p.tenant_id
        and role in ('admin', 'lawyer', 'super_admin')
        and coalesce((notification_prefs->>'process_deadline')::boolean, true) = true
    loop
      if not exists (
        select 1 from public.notifications
        where user_id = u.user_id and type = 'deadline' and link = '/processos?highlight=' || p.id
          and created_at::date = current_date
      ) then
        insert into public.notifications (user_id, type, title, message, read, link)
        values (
          u.user_id, 'deadline', 'Prazo processual vencendo em 3 dias',
          coalesce(p.number, p.title, 'Processo') || case when p.client_name is not null then ' — ' || p.client_name else '' end,
          false, '/processos?highlight=' || p.id
        );
      end if;
    end loop;
  end loop;
end;
$_$;


ALTER FUNCTION "public"."lawfy_generate_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lawfy_generate_recurring_items"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  t record;
  f record;
  next_due date;
begin
  -- Inserir uma tarefa dispara trg_sync_task_calendar_event, que insere em
  -- calendar_events — cujo trg_auto_tenant_calendar_events também exige sessão
  -- autenticada. Desabilitamos os três triggers de tenant durante o batch.
  alter table public.tasks disable trigger trg_auto_tenant_tasks;
  alter table public.financials disable trigger trg_auto_tenant_financials;
  alter table public.calendar_events disable trigger trg_auto_tenant_calendar_events;

  -- Tarefas recorrentes
  for t in
    select * from public.tasks
    where recurring = true and deleted_at is null and due_date is not null and due_date <= current_date
  loop
    insert into public.tasks (
      tenant_id, title, description, process_id, assigned_to, assigned_name,
      due_date, priority, status, type, client_id, location, all_day, generated_from_id
    ) values (
      t.tenant_id, t.title, t.description, t.process_id, t.assigned_to, t.assigned_name,
      t.due_date, t.priority, 'pending', t.type, t.client_id, t.location, t.all_day, t.id
    );

    next_due := case t.recurrence_interval
      when 'weekly'  then t.due_date + interval '7 days'
      when 'monthly' then t.due_date + interval '1 month'
      when 'yearly'  then t.due_date + interval '1 year'
      else t.due_date + interval '1 month'
    end;

    if t.recurrence_end_date is not null and next_due > t.recurrence_end_date then
      update public.tasks set recurring = false where id = t.id;
    else
      update public.tasks set due_date = next_due where id = t.id;
    end if;
  end loop;

  -- Lançamentos financeiros recorrentes
  for f in
    select * from public.financials
    where recurring = true and deleted_at is null and due_date is not null and due_date <= current_date
  loop
    insert into public.financials (
      tenant_id, type, category, description, amount, due_date, status,
      client_id, client_name, process_id, process_number, notes, account_id, generated_from_id
    ) values (
      f.tenant_id, f.type, f.category, f.description, f.amount, f.due_date, 'pending',
      f.client_id, f.client_name, f.process_id, f.process_number, f.notes, f.account_id, f.id
    );

    next_due := case f.recurrence_interval
      when 'weekly'  then f.due_date + interval '7 days'
      when 'monthly' then f.due_date + interval '1 month'
      when 'yearly'  then f.due_date + interval '1 year'
      else f.due_date + interval '1 month'
    end;

    if f.recurrence_end_date is not null and next_due > f.recurrence_end_date then
      update public.financials set recurring = false where id = f.id;
    else
      update public.financials set due_date = next_due where id = f.id;
    end if;
  end loop;

  alter table public.tasks enable trigger trg_auto_tenant_tasks;
  alter table public.financials enable trigger trg_auto_tenant_financials;
  alter table public.calendar_events enable trigger trg_auto_tenant_calendar_events;
exception when others then
  alter table public.tasks enable trigger trg_auto_tenant_tasks;
  alter table public.financials enable trigger trg_auto_tenant_financials;
  alter table public.calendar_events enable trigger trg_auto_tenant_calendar_events;
  raise;
end;
$$;


ALTER FUNCTION "public"."lawfy_generate_recurring_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lawfy_get_security_monitor_secret"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp', 'vault'
    AS $$
  select decrypted_secret from vault.decrypted_secrets where name = 'security_monitor_secret'
$$;


ALTER FUNCTION "public"."lawfy_get_security_monitor_secret"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lawfy_notify_clients_payment_due"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
      headers := '{"Content-Type":"application/json","x-cron-secret":"REDACTED_ROTATE_BEFORE_USE"}'::jsonb,
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
$$;


ALTER FUNCTION "public"."lawfy_notify_clients_payment_due"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lawfy_track_deletion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp', 'vault'
    AS $$
declare
  v_tenant_id uuid;
  v_action text;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_actor_email text;
  v_count int;
  v_recent_alerts int;
  v_secret text;
begin
  if TG_OP = 'DELETE' then
    v_tenant_id := OLD.tenant_id;
    v_action := 'hard_delete';
  elsif TG_OP = 'UPDATE' and OLD.deleted_at is null and NEW.deleted_at is not null then
    v_tenant_id := NEW.tenant_id;
    v_action := 'soft_delete';
  else
    return coalesce(NEW, OLD);
  end if;

  insert into public.data_change_log(tenant_id, table_name, action, user_id, record_id, occurred_at)
  values (v_tenant_id, TG_TABLE_NAME, v_action, v_actor, coalesce(NEW.id, OLD.id), now());

  select name, email into v_actor_name, v_actor_email from public.profiles where id = v_actor limit 1;

  if v_action = 'hard_delete' then
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'security_monitor_secret';
    perform net.http_post(
      url := 'https://bdpkkacfsavmpumwftsf.supabase.co/functions/v1/security-monitor',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-signature', coalesce(v_secret, '')),
      body := jsonb_build_object(
        'acao', 'event', 'event_type', 'mass_delete', 'severity', 'critical',
        'tenant_id', v_tenant_id, 'user_id', v_actor, 'user_name', v_actor_name, 'user_email', v_actor_email,
        'detail', jsonb_build_object('tabela', TG_TABLE_NAME, 'motivo', 'exclusão definitiva (hard delete) — o sistema só deveria usar exclusão reversível (soft delete)')
      )
    );
    return coalesce(NEW, OLD);
  end if;

  select count(*) into v_count from public.data_change_log
    where tenant_id = v_tenant_id and action = 'soft_delete' and occurred_at > now() - interval '10 minutes';

  if v_count > 20 then
    select count(*) into v_recent_alerts from public.security_events
      where tenant_id = v_tenant_id and event_type = 'mass_delete' and occurred_at > now() - interval '10 minutes';
    if v_recent_alerts = 0 then
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'security_monitor_secret';
      perform net.http_post(
        url := 'https://bdpkkacfsavmpumwftsf.supabase.co/functions/v1/security-monitor',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-signature', coalesce(v_secret, '')),
        body := jsonb_build_object(
          'acao', 'event', 'event_type', 'mass_delete', 'severity', 'critical',
          'tenant_id', v_tenant_id, 'user_id', v_actor, 'user_name', v_actor_name, 'user_email', v_actor_email,
          'detail', jsonb_build_object('quantidade', v_count, 'janela_minutos', 10, 'tabela_do_disparo', TG_TABLE_NAME)
        )
      );
    end if;
  end if;

  return coalesce(NEW, OLD);
end;
$$;


ALTER FUNCTION "public"."lawfy_track_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lh_get_client_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT cliente_id FROM lh_client_users WHERE user_id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."lh_get_client_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lh_get_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT id FROM lh_tenants WHERE user_id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."lh_get_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lh_handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Usuários de cliente (criados pela função de acesso) não recebem tenant
  IF COALESCE(NEW.raw_user_meta_data->>'role','') = 'client' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lh_tenants WHERE user_id = NEW.id) THEN
    INSERT INTO lh_tenants (user_id, name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email);
    INSERT INTO lh_subscriptions (tenant_id) SELECT id FROM lh_tenants WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."lh_handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lh_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."lh_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_user"("target_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_tenant uuid;
  target_tenant uuid;
begin
  select tenant_id into caller_tenant from public.profiles where user_id = auth.uid() limit 1;
  select tenant_id into target_tenant from public.profiles where user_id = target_user_id limit 1;
  if caller_tenant is null or target_tenant is null or caller_tenant <> target_tenant then
    return;
  end if;
  insert into public.notifications (user_id, type, title, message, read, link)
  values (target_user_id, p_type, p_title, p_message, false, p_link);
end;
$$;


ALTER FUNCTION "public"."notify_user"("target_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_pje_queue_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := current_tenant_id();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_pje_queue_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_tenant_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    -- Tenta pegar do perfil do usuário autenticado
    SELECT tenant_id INTO v_tenant_id
      FROM public.profiles
      WHERE id = auth.uid()
      LIMIT 1;

    -- Fallback: usa o tenant principal do sistema
    IF v_tenant_id IS NULL THEN
      v_tenant_id := '00000000-0000-0000-0000-000000000001'::UUID;
    END IF;

    NEW.tenant_id := v_tenant_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_client_process_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- INSERT: incrementa novo cliente
  IF TG_OP = 'INSERT' THEN
    IF NEW.client_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE clients SET total_processes = (
        SELECT COUNT(*) FROM processes WHERE client_id = NEW.client_id AND deleted_at IS NULL
      ) WHERE id = NEW.client_id;
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE físico
  IF TG_OP = 'DELETE' THEN
    IF OLD.client_id IS NOT NULL THEN
      UPDATE clients SET total_processes = (
        SELECT COUNT(*) FROM processes WHERE client_id = OLD.client_id AND deleted_at IS NULL
      ) WHERE id = OLD.client_id;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE (soft-delete, troca de cliente, etc.)
  IF TG_OP = 'UPDATE' THEN
    -- Se trocou o cliente, corrige o antigo
    IF OLD.client_id IS NOT NULL AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
      UPDATE clients SET total_processes = (
        SELECT COUNT(*) FROM processes WHERE client_id = OLD.client_id AND deleted_at IS NULL
      ) WHERE id = OLD.client_id;
    END IF;
    -- Corrige o cliente atual (ou novo)
    IF NEW.client_id IS NOT NULL THEN
      UPDATE clients SET total_processes = (
        SELECT COUNT(*) FROM processes WHERE client_id = NEW.client_id AND deleted_at IS NULL
      ) WHERE id = NEW.client_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sync_client_process_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_task_calendar_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.due_date is not null and NEW.status not in ('done','cancelled') and NEW.deleted_at is null and NEW.assigned_to is not null then
    insert into calendar_events (tenant_id, title, type, date, description, status, user_id, task_id, deleted_at)
    values (NEW.tenant_id, NEW.title, 'task', NEW.due_date, NEW.description, 'scheduled', NEW.assigned_to, NEW.id, null)
    on conflict (task_id) where task_id is not null do update set
      title = excluded.title,
      date = excluded.date,
      description = excluded.description,
      user_id = excluded.user_id,
      tenant_id = excluded.tenant_id,
      deleted_at = null;
  else
    update calendar_events set deleted_at = now() where task_id = NEW.id and deleted_at is null;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."sync_task_calendar_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_atualizado_em"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_atualizado_em"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_documents_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_documents_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_pje_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_pje_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tenant_storage_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.tenants set storage_used_bytes = storage_used_bytes + coalesce(new.file_size,0) where id = new.tenant_id;
  elsif tg_op = 'DELETE' then
    update public.tenants set storage_used_bytes = storage_used_bytes - coalesce(old.file_size,0) where id = old.tenant_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."update_tenant_storage_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
                                  BEGIN
                                    NEW.updated_at = NOW();
                                      RETURN NEW;
                                      END;
                                      $$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agent_appointments" (
    "id" bigint NOT NULL,
    "phone" "text" NOT NULL,
    "client_name" "text",
    "area" "text",
    "start_time" timestamp with time zone NOT NULL,
    "google_event_id" "text",
    "meet_link" "text",
    "status" "text" DEFAULT 'confirmado'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agent_appointments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."agent_appointments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."agent_appointments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."agent_appointments_id_seq" OWNED BY "public"."agent_appointments"."id";



CREATE TABLE IF NOT EXISTS "public"."agent_clients" (
    "id" bigint NOT NULL,
    "phone" "text" NOT NULL,
    "name" "text",
    "area" "text",
    "description" "text",
    "city" "text",
    "status" "text" DEFAULT 'lead'::"text",
    "case_status" "text",
    "last_update" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agent_clients" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."agent_clients_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."agent_clients_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."agent_clients_id_seq" OWNED BY "public"."agent_clients"."id";



CREATE TABLE IF NOT EXISTS "public"."agent_escalations" (
    "id" bigint NOT NULL,
    "phone" "text" NOT NULL,
    "client_name" "text",
    "reason" "text",
    "message_preview" "text",
    "resolved" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agent_escalations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."agent_escalations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."agent_escalations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."agent_escalations_id_seq" OWNED BY "public"."agent_escalations"."id";



CREATE TABLE IF NOT EXISTS "public"."agent_messages" (
    "id" bigint NOT NULL,
    "phone" "text" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "agent_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."agent_messages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."agent_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."agent_messages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."agent_messages_id_seq" OWNED BY "public"."agent_messages"."id";



CREATE TABLE IF NOT EXISTS "public"."atividades" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "escritorio_id" "uuid" NOT NULL,
    "cliente_id" "uuid",
    "usuario_id" "uuid",
    "tipo" "text" NOT NULL,
    "descricao" "text" NOT NULL,
    "metadata" "jsonb",
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."atividades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "entity_label" "text",
    "changes" "jsonb",
    "user_id" "uuid",
    "user_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_log_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'update'::"text", 'delete'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."autocomplete_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."autocomplete_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "title" "text" NOT NULL,
    "type" "text",
    "date" "date" NOT NULL,
    "time" "text",
    "process_id" "uuid",
    "process_number" "text",
    "client_name" "text",
    "location" "text",
    "description" "text",
    "status" "text" DEFAULT 'scheduled'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "google_event_id" "text",
    "user_id" "uuid",
    "sync_google" boolean DEFAULT false,
    "end_date" "date",
    "end_time" "text",
    "recurrence" "text",
    "task_id" "uuid",
    CONSTRAINT "calendar_events_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "calendar_events_type_check" CHECK (("type" = ANY (ARRAY['hearing'::"text", 'deadline'::"text", 'meeting'::"text", 'task'::"text"])))
);


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "escritorio_id" "uuid" NOT NULL,
    "contador_id" "uuid",
    "tipo" "text" DEFAULT 'pj'::"text" NOT NULL,
    "nome" "text" NOT NULL,
    "cpf_cnpj" "text",
    "email" "text",
    "telefone" "text",
    "celular" "text",
    "regime_tributario" "text",
    "cnae" "text",
    "cnae_descricao" "text",
    "endereco_logradouro" "text",
    "endereco_numero" "text",
    "endereco_complemento" "text",
    "endereco_bairro" "text",
    "endereco_cidade" "text",
    "endereco_uf" "text",
    "endereco_cep" "text",
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "data_inicio" "date",
    "honorarios" numeric(10,2),
    "observacoes" "text",
    "tags" "text"[],
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "atualizado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "clientes_regime_tributario_check" CHECK (("regime_tributario" = ANY (ARRAY['simples_nacional'::"text", 'lucro_presumido'::"text", 'lucro_real'::"text", 'mei'::"text", 'isento'::"text"]))),
    CONSTRAINT "clientes_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'pendente'::"text", 'em_risco'::"text", 'inativo'::"text"]))),
    CONSTRAINT "clientes_tipo_check" CHECK (("tipo" = ANY (ARRAY['pf'::"text", 'pj'::"text"])))
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "cpf_cnpj" "text",
    "email" "text",
    "phone" "text",
    "address" "text",
    "status" "text" DEFAULT 'active'::"text",
    "assigned_lawyer" "text",
    "total_processes" integer DEFAULT 0,
    "total_billed" numeric DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "colaborador_id" "uuid",
    "deleted_at" timestamp with time zone,
    "assunto" "text",
    "cidade" "text",
    "entry_date" "date",
    "modalidade" "text",
    "area_direito" "text",
    "colaborador_pago" boolean DEFAULT false NOT NULL,
    "colaborador_pago_data" "date",
    "colaborador_pago_valor" numeric(10,2),
    "origem" "text",
    "pais" "text" DEFAULT 'BRASIL'::"text",
    "rg" "text",
    "birth_date" "date",
    "marital_status" "text",
    "profession" "text",
    "gender" "text",
    "nationality" "text",
    "celular" "text",
    "cep" "text",
    "state" "text",
    "bairro" "text",
    "pis_pasep" "text",
    "ctps" "text",
    "cid" "text",
    "nome_mae" "text",
    "avatar_url" "text",
    "beneficio_previdenciario" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "lgpd_consent" boolean DEFAULT false NOT NULL,
    "lgpd_consent_date" "date",
    "senha_gov" "text",
    CONSTRAINT "clients_modalidade_check" CHECK (("modalidade" = ANY (ARRAY['judicial'::"text", 'administrativo'::"text"]))),
    CONSTRAINT "clients_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'prospect'::"text"]))),
    CONSTRAINT "clients_type_check" CHECK (("type" = ANY (ARRAY['pf'::"text", 'pj'::"text"])))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."colaboradores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid",
    "nome" "text" NOT NULL,
    "email" "text",
    "telefone" "text",
    "cargo" "text" DEFAULT 'parceiro'::"text",
    "comissao_percent" numeric(5,2) DEFAULT 0,
    "ativo" boolean DEFAULT true,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "cidade" "text",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."colaboradores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_columns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "column_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."custom_columns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_change_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "table_name" "text" NOT NULL,
    "action" "text" NOT NULL,
    "user_id" "uuid",
    "record_id" "uuid",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "data_change_log_action_check" CHECK (("action" = ANY (ARRAY['soft_delete'::"text", 'hard_delete'::"text"])))
);


ALTER TABLE "public"."data_change_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_library_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "type" "text" DEFAULT 'template'::"text" NOT NULL,
    "category" "text",
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "area_direito" "text",
    "auto_doc_kind" "text",
    CONSTRAINT "document_library_templates_auto_doc_kind_check" CHECK ((("auto_doc_kind" IS NULL) OR ("auto_doc_kind" = ANY (ARRAY['procuracao'::"text", 'contrato_honorarios'::"text"]))))
);


ALTER TABLE "public"."document_library_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documentos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "escritorio_id" "uuid" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "uploader_id" "uuid",
    "nome" "text" NOT NULL,
    "descricao" "text",
    "categoria" "text" NOT NULL,
    "arquivo_url" "text" NOT NULL,
    "arquivo_nome" "text" NOT NULL,
    "arquivo_tipo" "text",
    "arquivo_tamanho" bigint,
    "competencia" "date",
    "tags" "text"[],
    "criado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "documentos_categoria_check" CHECK (("categoria" = ANY (ARRAY['fiscal'::"text", 'trabalhista'::"text", 'contabil'::"text", 'societario'::"text", 'outros'::"text"])))
);


ALTER TABLE "public"."documentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "title" "text" NOT NULL,
    "type" "text" DEFAULT 'other'::"text" NOT NULL,
    "category" "text",
    "content" "text",
    "tags" "text"[],
    "is_template" boolean DEFAULT false NOT NULL,
    "client_id" "uuid",
    "process_id" "uuid",
    "file_url" "text",
    "file_name" "text",
    "file_size" bigint,
    "file_mime" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "area_direito" "text",
    "auto_doc_kind" "text",
    "folder_id" "uuid",
    CONSTRAINT "documents_auto_doc_kind_check" CHECK ((("auto_doc_kind" IS NULL) OR ("auto_doc_kind" = ANY (ARRAY['procuracao'::"text", 'contrato_honorarios'::"text", 'peticao_inicial'::"text"])))),
    CONSTRAINT "documents_type_check" CHECK (("type" = ANY (ARRAY['template'::"text", 'contract'::"text", 'petition'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."edge_function_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rate_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."edge_function_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escritorios" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text" NOT NULL,
    "cnpj" "text",
    "email" "text",
    "telefone" "text",
    "plano" "text" DEFAULT 'basico'::"text" NOT NULL,
    "logo_url" "text",
    "cor_primaria" "text" DEFAULT '#3B82F6'::"text",
    "cor_secundaria" "text" DEFAULT '#8B5CF6'::"text",
    "ativo" boolean DEFAULT true,
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "atualizado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "escritorios_plano_check" CHECK (("plano" = ANY (ARRAY['basico'::"text", 'profissional'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."escritorios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "monthly_limit" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expense_budgets_category_check" CHECK (("category" = ANY (ARRAY['process'::"text", 'travel'::"text", 'food'::"text", 'transport'::"text", 'accommodation'::"text", 'other'::"text"]))),
    CONSTRAINT "expense_budgets_monthly_limit_check" CHECK (("monthly_limit" >= (0)::numeric))
);


ALTER TABLE "public"."expense_budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."financial_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."current_tenant_id"() NOT NULL,
    "type" "text" NOT NULL,
    "category" "text",
    "description" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "due_date" "date",
    "paid_date" "date",
    "status" "text" DEFAULT 'pending'::"text",
    "client_id" "uuid",
    "client_name" "text",
    "process_id" "uuid",
    "process_number" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "installment_group_id" "uuid",
    "installment_number" integer,
    "installment_total" integer,
    "account_id" "uuid",
    "recurring" boolean DEFAULT false NOT NULL,
    "recurrence_interval" "text",
    "recurrence_end_date" "date",
    "generated_from_id" "uuid",
    "reconciled" boolean DEFAULT false NOT NULL,
    "reconciled_in_id" "uuid",
    "client_reminder_sent_at" timestamp with time zone,
    CONSTRAINT "financials_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "financials_category_check" CHECK (("category" = ANY (ARRAY['fees'::"text", 'costs'::"text", 'salary'::"text", 'rent'::"text", 'subscription'::"text", 'tax'::"text", 'other'::"text", 'comissao'::"text"]))),
    CONSTRAINT "financials_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'overdue'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "financials_type_check" CHECK (("type" = ANY (ARRAY['receivable'::"text", 'payable'::"text"])))
);


ALTER TABLE "public"."financials" OWNER TO "postgres";


COMMENT ON COLUMN "public"."financials"."installment_group_id" IS 'Agrupa as linhas (entrada + parcelas) de um mesmo parcelamento de honorarios';



COMMENT ON COLUMN "public"."financials"."installment_number" IS '0 = entrada, 1..N = numero da parcela dentro do grupo';



COMMENT ON COLUMN "public"."financials"."installment_total" IS 'Numero total de parcelas do grupo (sem contar a entrada)';



COMMENT ON COLUMN "public"."financials"."recurring" IS 'true = este registro é um template recorrente (due_date = próxima geração), não um lançamento real';



COMMENT ON COLUMN "public"."financials"."reconciled" IS 'true quando este gasto (payable) já foi descontado de um honorário (receivable) lançado';



COMMENT ON COLUMN "public"."financials"."reconciled_in_id" IS 'aponta para o lançamento (receivable) onde este gasto foi descontado';



COMMENT ON COLUMN "public"."financials"."client_reminder_sent_at" IS 'Quando o lembrete automatico de pagamento (e-mail via remind-client-payment) foi disparado para o cliente. Null = ainda nao enviado.';



CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "folders_no_self_parent" CHECK (("id" <> "parent_id"))
);


ALTER TABLE "public"."folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "expires_at" timestamp with time zone,
    "account_id" "text",
    "account_name" "text",
    "scopes" "text"[],
    "is_active" boolean DEFAULT true,
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" DEFAULT 'kg'::"text" NOT NULL,
    "min_stock" numeric DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."current_tenant_id"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'note'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "area" "text",
    "source" "text",
    "status" "text" DEFAULT 'new'::"text",
    "assigned_to" "uuid",
    "value" numeric,
    "notes" "text",
    "last_contact" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_term" "text",
    "ad_campaign" "text",
    "ad_set" "text",
    "ad_name" "text",
    "lead_score" integer DEFAULT 0,
    "followup_date" "date",
    "meta_account_id" "uuid",
    "whatsapp_account_id" "uuid",
    "converted_at" timestamp with time zone,
    "converted_client_id" "uuid",
    CONSTRAINT "leads_source_check" CHECK (("source" = ANY (ARRAY['website'::"text", 'referral'::"text", 'social'::"text", 'ads'::"text", 'other'::"text"]))),
    CONSTRAINT "leads_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'qualified'::"text", 'proposal'::"text", 'won'::"text", 'lost'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_certidoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "categoria" "text" DEFAULT 'federal'::"text" NOT NULL,
    "emissao" "date",
    "validade" "date",
    "orgao_emissor" "text",
    "numero" "text",
    "arquivo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lh_certidoes_categoria_check" CHECK (("categoria" = ANY (ARRAY['federal'::"text", 'estadual'::"text", 'municipal'::"text", 'trabalhista'::"text", 'fgts'::"text", 'falencia'::"text"])))
);


ALTER TABLE "public"."lh_certidoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_client_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "cliente_id" "uuid",
    "tenant_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lh_client_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "empresa" "text" NOT NULL,
    "cnpj" "text",
    "responsavel" "text",
    "telefone" "text",
    "email" "text",
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "desde" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lh_clientes_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'inativo'::"text"])))
);


ALTER TABLE "public"."lh_clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_comentarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "licitacao_id" "uuid",
    "contrato_id" "uuid",
    "autor" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "interno" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lh_comentarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_contrato_aditivos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contrato_id" "uuid" NOT NULL,
    "numero" "text" NOT NULL,
    "descricao" "text",
    "valor" numeric(15,2) DEFAULT 0,
    "data" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lh_contrato_aditivos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_contratos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "licitacao_id" "uuid",
    "numero" "text" NOT NULL,
    "objeto" "text",
    "orgao" "text",
    "valor" numeric(15,2) DEFAULT 0,
    "data_inicio" "date",
    "data_fim" "date",
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lh_contratos_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'vencendo'::"text", 'encerrado'::"text"])))
);


ALTER TABLE "public"."lh_contratos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_documentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "text" DEFAULT 'juridico'::"text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "validade" "date",
    "arquivo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lh_documentos_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_analise'::"text", 'aprovado'::"text"]))),
    CONSTRAINT "lh_documentos_tipo_check" CHECK (("tipo" = ANY (ARRAY['juridico'::"text", 'fiscal'::"text", 'tecnico'::"text"])))
);


ALTER TABLE "public"."lh_documentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "cliente_id" "uuid",
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "data" "date" NOT NULL,
    "hora" time without time zone,
    "tipo" "text" DEFAULT 'licitacao'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lh_eventos_tipo_check" CHECK (("tipo" = ANY (ARRAY['licitacao'::"text", 'prazo'::"text", 'contrato'::"text", 'reuniao'::"text", 'outro'::"text"])))
);


ALTER TABLE "public"."lh_eventos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_licitacao_anexos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "licitacao_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "url" "text",
    "tamanho" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lh_licitacao_anexos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_licitacao_timeline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "licitacao_id" "uuid" NOT NULL,
    "evento" "text" NOT NULL,
    "tipo" "text" DEFAULT 'info'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lh_licitacao_timeline_tipo_check" CHECK (("tipo" = ANY (ARRAY['info'::"text", 'success'::"text", 'error'::"text", 'warning'::"text"])))
);


ALTER TABLE "public"."lh_licitacao_timeline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_licitacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "edital" "text" NOT NULL,
    "orgao" "text" NOT NULL,
    "objeto" "text",
    "valor_estimado" numeric(15,2) DEFAULT 0,
    "status" "text" DEFAULT 'em_analise'::"text" NOT NULL,
    "data_abertura" "date",
    "data_resultado" "date",
    "modalidade" "text" DEFAULT 'Pregão Eletrônico'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lh_licitacoes_status_check" CHECK (("status" = ANY (ARRAY['em_analise'::"text", 'participando'::"text", 'ganha'::"text", 'perdida'::"text"])))
);


ALTER TABLE "public"."lh_licitacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_notificacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "cliente_id" "uuid",
    "tipo" "text" DEFAULT 'info'::"text",
    "titulo" "text" NOT NULL,
    "mensagem" "text",
    "lida" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lh_notificacoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['info'::"text", 'alerta'::"text", 'sucesso'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."lh_notificacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_secrets" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lh_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "plan" "text" DEFAULT 'basico'::"text" NOT NULL,
    "status" "text" DEFAULT 'trial'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval),
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lh_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'cancelled'::"text", 'past_due'::"text"])))
);


ALTER TABLE "public"."lh_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lh_tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "plan" "text" DEFAULT 'basico'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lh_tenants_plan_check" CHECK (("plan" = ANY (ARRAY['basico'::"text", 'profissional'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."lh_tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_failures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_attempted" "text",
    "ip_address" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."login_failures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."login_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mensagens" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "escritorio_id" "uuid" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "remetente_id" "uuid" NOT NULL,
    "conteudo" "text" NOT NULL,
    "tipo" "text" DEFAULT 'texto'::"text",
    "lida" boolean DEFAULT false,
    "criado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mensagens_tipo_check" CHECK (("tipo" = ANY (ARRAY['texto'::"text", 'arquivo'::"text", 'sistema'::"text"])))
);


ALTER TABLE "public"."mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."current_tenant_id"() NOT NULL,
    "name" "text" NOT NULL,
    "account_id" "text",
    "business_manager" "text",
    "status" "text" DEFAULT 'active'::"text",
    "daily_budget" numeric(12,2),
    "monthly_budget" numeric(12,2),
    "total_spend" numeric(12,2) DEFAULT 0,
    "campaigns_count" integer DEFAULT 0,
    "pixel_id" "text",
    "access_token" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."meta_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notificacoes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "tipo" "text" DEFAULT 'info'::"text",
    "lida" boolean DEFAULT false,
    "link" "text",
    "criado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notificacoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['info'::"text", 'aviso'::"text", 'erro'::"text", 'sucesso'::"text"])))
);


ALTER TABLE "public"."notificacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text",
    "title" "text" NOT NULL,
    "message" "text",
    "read" boolean DEFAULT false,
    "link" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['deadline'::"text", 'hearing'::"text", 'task'::"text", 'payment'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."obrigacoes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "escritorio_id" "uuid" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "tipo_obrigacao_id" "uuid",
    "nome" "text" NOT NULL,
    "descricao" "text",
    "competencia" "date" NOT NULL,
    "vencimento" "date" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "responsavel_id" "uuid",
    "concluida_em" timestamp with time zone,
    "concluida_por" "uuid",
    "observacoes" "text",
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "atualizado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "obrigacoes_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_andamento'::"text", 'concluida'::"text", 'atrasada'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."obrigacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfis" (
    "id" "uuid" NOT NULL,
    "escritorio_id" "uuid",
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "telefone" "text",
    "avatar_url" "text",
    "cargo" "text",
    "perfil" "text" DEFAULT 'contador'::"text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "atualizado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "perfis_perfil_check" CHECK (("perfil" = ANY (ARRAY['admin'::"text", 'contador'::"text", 'assistente'::"text", 'cliente'::"text"])))
);


ALTER TABLE "public"."perfis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pje_movimentacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "processo_id" "uuid",
    "data" timestamp with time zone NOT NULL,
    "tipo" "text",
    "descricao" "text" NOT NULL,
    "complemento" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pje_movimentacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pje_partes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "processo_id" "uuid",
    "nome" "text" NOT NULL,
    "tipo" "text",
    "polo" "text",
    "cpf_cnpj" "text",
    "oab" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pje_partes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pje_prazos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "processo_id" "uuid",
    "tenant_id" "uuid",
    "responsible_id" "uuid",
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "data_prazo" timestamp with time zone NOT NULL,
    "data_fatal" timestamp with time zone,
    "tipo" "text" DEFAULT 'processual'::"text",
    "status" "text" DEFAULT 'pendente'::"text",
    "alerta_antecipacao" integer DEFAULT 3,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pje_prazos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pje_processos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "numero" "text" NOT NULL,
    "numero_cnj" "text",
    "tribunal" "text" DEFAULT ''::"text" NOT NULL,
    "tribunal_id" "uuid",
    "classe" "text",
    "assunto" "text",
    "data_ajuizamento" timestamp with time zone,
    "ultima_atualizacao" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "client_id" "uuid",
    "responsible_id" "uuid",
    "dados_completos" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pje_processos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pje_search_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero" "text" NOT NULL,
    "tribunal" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "result" "jsonb",
    "error_msg" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."pje_search_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pje_tribunais" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "sigla" "text" NOT NULL,
    "tipo" "text" DEFAULT 'estadual'::"text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pje_tribunais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid" NOT NULL,
    "type" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "date" "date" DEFAULT CURRENT_DATE,
    "author" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "process_updates_type_check" CHECK (("type" = ANY (ARRAY['andamento'::"text", 'decisao'::"text", 'despacho'::"text", 'sentenca'::"text", 'recurso'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."process_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "number" "text" NOT NULL,
    "title" "text" NOT NULL,
    "client_id" "uuid",
    "client_name" "text",
    "area" "text",
    "type" "text",
    "status" "text" DEFAULT 'active'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "assigned_lawyer" "text",
    "court" "text",
    "judge" "text",
    "counterparty" "text",
    "description" "text",
    "next_hearing" timestamp with time zone,
    "next_deadline" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "gcal_event_id" "text",
    "gcal_synced_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "data_protocolo" "date",
    "modalidade" "text",
    "colaborador_id" "uuid",
    "cnj_source" boolean DEFAULT false NOT NULL,
    "cnj_synced_at" timestamp with time zone,
    "movimentos" "jsonb",
    "grupo_acao" "text" DEFAULT ''::"text",
    "fase" "text" DEFAULT 'NEGOCIAÇÃO'::"text",
    "etapa" "text" DEFAULT 'ANÁLISE DO CASO'::"text",
    "numero_protocolo" "text" DEFAULT ''::"text",
    "processo_originario" "text" DEFAULT ''::"text",
    "pasta_caso" "text" DEFAULT ''::"text",
    "data_requerimento" "date",
    "valor_causa" "text" DEFAULT ''::"text",
    "valor_honorarios" "text" DEFAULT ''::"text",
    "percentual_honorarios" "text" DEFAULT ''::"text",
    "contingenciamento" "text" DEFAULT ''::"text",
    CONSTRAINT "processes_modalidade_check" CHECK (("modalidade" = ANY (ARRAY['judicial'::"text", 'administrativo'::"text"]))),
    CONSTRAINT "processes_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "processes_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'archived'::"text", 'won'::"text", 'lost'::"text"])))
);


ALTER TABLE "public"."processes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid",
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT 'lawyer'::"text",
    "avatar" "text",
    "city" "text",
    "subscription_status" "text" DEFAULT 'inactive'::"text",
    "subscription_plan" "text",
    "oab_number" "text",
    "oab_seccional" "text",
    "onboarding_completed" boolean DEFAULT false,
    "phone" "text",
    "notification_prefs" "jsonb" DEFAULT '{"task_due": true, "new_tasks": true, "new_clients": false, "financial_due": true, "new_processes": false, "new_publications": true, "process_deadline": true}'::"jsonb" NOT NULL,
    "client_id" "uuid",
    "oab_tribunais" "text"[],
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'lawyer'::"text", 'intern'::"text", 'financial'::"text", 'super_admin'::"text", 'client'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."oab_tribunais" IS 'Codigos de tribunal (ex: tjsp, trf3) marcados pelo usuario no sync manual via OAB, usados tambem pelo cron noturno de sincronizacao automatica.';



CREATE TABLE IF NOT EXISTS "public"."security_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "event_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'warning'::"text" NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "user_name" "text",
    "ip_address" "text",
    "user_agent" "text",
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "security_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['login_anomaly'::"text", 'email_changed'::"text", 'password_changed'::"text", 'brute_force'::"text", 'mass_export'::"text", 'mass_query'::"text", 'admin_created'::"text", 'admin_promoted'::"text", 'mass_delete'::"text"]))),
    CONSTRAINT "security_events_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."security_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "expiry_date" "date",
    "counted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "counted_by" "uuid" NOT NULL,
    "counted_by_name" "text" DEFAULT ''::"text" NOT NULL,
    "custom_values" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unit_price" numeric
);


ALTER TABLE "public"."stock_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "movement_type" "public"."movement_type" DEFAULT 'entrada'::"public"."movement_type" NOT NULL,
    "observation" "text",
    "moved_by" "uuid" NOT NULL,
    "moved_by_name" "text" DEFAULT ''::"text" NOT NULL,
    "moved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "tenant_id" "uuid",
    "email" "text" NOT NULL,
    "plano" "text" NOT NULL,
    "status" "text" DEFAULT 'inactive'::"text" NOT NULL,
    "expira_em" timestamp with time zone,
    "nexano_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "sender_name" "text" NOT NULL,
    "sender_role" "text" DEFAULT 'user'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."support_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "user_email" "text",
    "user_name" "text",
    "subject" "text",
    "status" "text" DEFAULT 'open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "message" "text"
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarefas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "escritorio_id" "uuid" NOT NULL,
    "cliente_id" "uuid",
    "obrigacao_id" "uuid",
    "criador_id" "uuid",
    "responsavel_id" "uuid",
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "status" "text" DEFAULT 'a_fazer'::"text" NOT NULL,
    "prioridade" "text" DEFAULT 'media'::"text" NOT NULL,
    "prazo" "date",
    "concluida_em" timestamp with time zone,
    "ordem" integer DEFAULT 0,
    "tags" "text"[],
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "atualizado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tarefas_prioridade_check" CHECK (("prioridade" = ANY (ARRAY['baixa'::"text", 'media'::"text", 'alta'::"text", 'urgente'::"text"]))),
    CONSTRAINT "tarefas_status_check" CHECK (("status" = ANY (ARRAY['a_fazer'::"text", 'em_andamento'::"text", 'em_revisao'::"text", 'concluida'::"text"])))
);


ALTER TABLE "public"."tarefas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "process_id" "uuid",
    "assigned_to" "uuid",
    "assigned_name" "text",
    "due_date" "date",
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "type" "text" DEFAULT 'custom'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "client_id" "uuid",
    "location" "text",
    "all_day" boolean DEFAULT false NOT NULL,
    "deadline_date" "date",
    "recurring" boolean DEFAULT false NOT NULL,
    "recurrence_interval" "text",
    "updated_at" timestamp with time zone,
    "recurrence_end_date" "date",
    "generated_from_id" "uuid",
    "created_by" "uuid",
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "tasks_recurrence_interval_check" CHECK ((("recurrence_interval" IS NULL) OR ("recurrence_interval" = ANY (ARRAY['weekly'::"text", 'monthly'::"text"])))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'done'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "tasks_type_check" CHECK (("type" = ANY (ARRAY['deadline'::"text", 'hearing'::"text", 'document'::"text", 'meeting'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tasks"."recurring" IS 'true = este registro é um template recorrente (due_date = próxima geração), não uma tarefa acionável';



CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "plan" "text" DEFAULT 'starter'::"text",
    "logo" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "meta_fechamentos_mensal" integer,
    "storage_used_bytes" bigint DEFAULT 0 NOT NULL,
    "storage_quota_bytes" bigint DEFAULT '5368709120'::bigint NOT NULL,
    CONSTRAINT "tenants_plan_check" CHECK (("plan" = ANY (ARRAY['starter'::"text", 'professional'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tipos_obrigacao" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "periodicidade" "text" NOT NULL,
    "dia_vencimento" integer,
    "regimes" "text"[],
    "cor" "text" DEFAULT '#3B82F6'::"text",
    "icone" "text",
    CONSTRAINT "tipos_obrigacao_periodicidade_check" CHECK (("periodicidade" = ANY (ARRAY['mensal'::"text", 'trimestral'::"text", 'semestral'::"text", 'anual'::"text", 'eventual'::"text"])))
);


ALTER TABLE "public"."tipos_obrigacao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."current_tenant_id"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "process_id" "uuid",
    "process_number" "text",
    "trip_destination" "text",
    "reimbursable" boolean DEFAULT true,
    "reimbursed" boolean DEFAULT false,
    "notes" "text",
    "receipt_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "user_expenses_category_check" CHECK (("category" = ANY (ARRAY['process'::"text", 'travel'::"text", 'food'::"text", 'transport'::"text", 'accommodation'::"text", 'other'::"text", 'office'::"text"])))
);


ALTER TABLE "public"."user_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'staff'::"public"."app_role" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."current_tenant_id"() NOT NULL,
    "name" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "provider" "text" DEFAULT 'evolution'::"text",
    "status" "text" DEFAULT 'disconnected'::"text",
    "api_url" "text",
    "api_key" "text",
    "instance_name" "text",
    "webhook_url" "text",
    "last_message_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."whatsapp_accounts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_appointments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_appointments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agent_clients" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_clients_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agent_escalations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_escalations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agent_messages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_messages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agent_appointments"
    ADD CONSTRAINT "agent_appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_clients"
    ADD CONSTRAINT "agent_clients_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."agent_clients"
    ADD CONSTRAINT "agent_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_escalations"
    ADD CONSTRAINT "agent_escalations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atividades"
    ADD CONSTRAINT "atividades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."autocomplete_lists"
    ADD CONSTRAINT "autocomplete_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."autocomplete_lists"
    ADD CONSTRAINT "autocomplete_lists_tenant_id_category_value_key" UNIQUE ("tenant_id", "category", "value");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."colaboradores"
    ADD CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_columns"
    ADD CONSTRAINT "custom_columns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_change_log"
    ADD CONSTRAINT "data_change_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_library_templates"
    ADD CONSTRAINT "document_library_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."edge_function_rate_limits"
    ADD CONSTRAINT "edge_function_rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escritorios"
    ADD CONSTRAINT "escritorios_cnpj_key" UNIQUE ("cnpj");



ALTER TABLE ONLY "public"."escritorios"
    ADD CONSTRAINT "escritorios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_budgets"
    ADD CONSTRAINT "expense_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_budgets"
    ADD CONSTRAINT "expense_budgets_user_id_category_key" UNIQUE ("user_id", "category");



ALTER TABLE ONLY "public"."financial_accounts"
    ADD CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financials"
    ADD CONSTRAINT "financials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_tenant_id_platform_key" UNIQUE ("tenant_id", "platform");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_interactions"
    ADD CONSTRAINT "lead_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_certidoes"
    ADD CONSTRAINT "lh_certidoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_client_users"
    ADD CONSTRAINT "lh_client_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_client_users"
    ADD CONSTRAINT "lh_client_users_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."lh_clientes"
    ADD CONSTRAINT "lh_clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_comentarios"
    ADD CONSTRAINT "lh_comentarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_contrato_aditivos"
    ADD CONSTRAINT "lh_contrato_aditivos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_contratos"
    ADD CONSTRAINT "lh_contratos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_documentos"
    ADD CONSTRAINT "lh_documentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_eventos"
    ADD CONSTRAINT "lh_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_licitacao_anexos"
    ADD CONSTRAINT "lh_licitacao_anexos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_licitacao_timeline"
    ADD CONSTRAINT "lh_licitacao_timeline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_licitacoes"
    ADD CONSTRAINT "lh_licitacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_notificacoes"
    ADD CONSTRAINT "lh_notificacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_secrets"
    ADD CONSTRAINT "lh_secrets_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."lh_subscriptions"
    ADD CONSTRAINT "lh_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_subscriptions"
    ADD CONSTRAINT "lh_subscriptions_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."lh_tenants"
    ADD CONSTRAINT "lh_tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lh_tenants"
    ADD CONSTRAINT "lh_tenants_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."login_failures"
    ADD CONSTRAINT "login_failures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_history"
    ADD CONSTRAINT "login_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_accounts"
    ADD CONSTRAINT "meta_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."obrigacoes"
    ADD CONSTRAINT "obrigacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pje_movimentacoes"
    ADD CONSTRAINT "pje_movimentacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pje_partes"
    ADD CONSTRAINT "pje_partes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pje_prazos"
    ADD CONSTRAINT "pje_prazos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pje_processos"
    ADD CONSTRAINT "pje_processos_numero_tribunal_unique" UNIQUE ("numero", "tribunal");



ALTER TABLE ONLY "public"."pje_processos"
    ADD CONSTRAINT "pje_processos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pje_search_queue"
    ADD CONSTRAINT "pje_search_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pje_tribunais"
    ADD CONSTRAINT "pje_tribunais_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."pje_tribunais"
    ADD CONSTRAINT "pje_tribunais_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_updates"
    ADD CONSTRAINT "process_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processes"
    ADD CONSTRAINT "processes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_entries"
    ADD CONSTRAINT "stock_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_announcements"
    ADD CONSTRAINT "system_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."tipos_obrigacao"
    ADD CONSTRAINT "tipos_obrigacao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_expenses"
    ADD CONSTRAINT "user_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."whatsapp_accounts"
    ADD CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "calendar_events_task_id_key" ON "public"."calendar_events" USING "btree" ("task_id") WHERE ("task_id" IS NOT NULL);



CREATE INDEX "data_change_log_tenant_idx" ON "public"."data_change_log" USING "btree" ("tenant_id", "action", "occurred_at" DESC);



CREATE INDEX "documents_auto_doc_kind_idx" ON "public"."documents" USING "btree" ("tenant_id", "area_direito", "auto_doc_kind") WHERE (("auto_doc_kind" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "edge_function_rate_limits_key_created_idx" ON "public"."edge_function_rate_limits" USING "btree" ("rate_key", "created_at");



CREATE INDEX "idx_agent_clients_phone" ON "public"."agent_clients" USING "btree" ("phone");



CREATE INDEX "idx_agent_messages_created" ON "public"."agent_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_agent_messages_phone" ON "public"."agent_messages" USING "btree" ("phone");



CREATE INDEX "idx_announcements_created" ON "public"."system_announcements" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_atividades_cliente" ON "public"."atividades" USING "btree" ("cliente_id");



CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_audit_log_tenant_created" ON "public"."audit_log" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_calendar_events_process_id" ON "public"."calendar_events" USING "btree" ("process_id");



CREATE INDEX "idx_calendar_events_tenant_id" ON "public"."calendar_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_clientes_escritorio" ON "public"."clientes" USING "btree" ("escritorio_id");



CREATE INDEX "idx_clientes_status" ON "public"."clientes" USING "btree" ("status");



CREATE INDEX "idx_clients_colaborador" ON "public"."clients" USING "btree" ("colaborador_id");



CREATE INDEX "idx_clients_tenant_id" ON "public"."clients" USING "btree" ("tenant_id");



CREATE INDEX "idx_colaboradores_tenant" ON "public"."colaboradores" USING "btree" ("tenant_id");



CREATE INDEX "idx_documentos_cliente" ON "public"."documentos" USING "btree" ("cliente_id");



CREATE INDEX "idx_documents_folder" ON "public"."documents" USING "btree" ("tenant_id", "folder_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_documents_tenant" ON "public"."documents" USING "btree" ("tenant_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_financial_accounts_tenant_id" ON "public"."financial_accounts" USING "btree" ("tenant_id");



CREATE INDEX "idx_financials_account_id" ON "public"."financials" USING "btree" ("account_id");



CREATE INDEX "idx_financials_client_id" ON "public"."financials" USING "btree" ("client_id");



CREATE INDEX "idx_financials_generated_from_id" ON "public"."financials" USING "btree" ("generated_from_id");



CREATE INDEX "idx_financials_installment_group_id" ON "public"."financials" USING "btree" ("installment_group_id") WHERE ("installment_group_id" IS NOT NULL);



CREATE INDEX "idx_financials_process_id" ON "public"."financials" USING "btree" ("process_id");



CREATE INDEX "idx_financials_reconciled_in_id" ON "public"."financials" USING "btree" ("reconciled_in_id");



CREATE INDEX "idx_financials_tenant_id" ON "public"."financials" USING "btree" ("tenant_id");



CREATE INDEX "idx_folders_client" ON "public"."folders" USING "btree" ("client_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_folders_tenant_parent" ON "public"."folders" USING "btree" ("tenant_id", "parent_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_integrations_tenant" ON "public"."integrations" USING "btree" ("tenant_id");



CREATE INDEX "idx_leads_assigned_to" ON "public"."leads" USING "btree" ("assigned_to");



CREATE INDEX "idx_leads_converted_client_id" ON "public"."leads" USING "btree" ("converted_client_id");



CREATE INDEX "idx_leads_meta_account_id" ON "public"."leads" USING "btree" ("meta_account_id");



CREATE INDEX "idx_leads_tenant_id" ON "public"."leads" USING "btree" ("tenant_id");



CREATE INDEX "idx_leads_whatsapp_account_id" ON "public"."leads" USING "btree" ("whatsapp_account_id");



CREATE INDEX "idx_lh_certidoes_validade" ON "public"."lh_certidoes" USING "btree" ("validade");



CREATE INDEX "idx_lh_clientes_tenant" ON "public"."lh_clientes" USING "btree" ("tenant_id");



CREATE INDEX "idx_lh_contratos_cliente" ON "public"."lh_contratos" USING "btree" ("cliente_id");



CREATE INDEX "idx_lh_contratos_tenant" ON "public"."lh_contratos" USING "btree" ("tenant_id");



CREATE INDEX "idx_lh_documentos_cliente" ON "public"."lh_documentos" USING "btree" ("cliente_id");



CREATE INDEX "idx_lh_eventos_data" ON "public"."lh_eventos" USING "btree" ("data");



CREATE INDEX "idx_lh_licitacoes_cliente" ON "public"."lh_licitacoes" USING "btree" ("cliente_id");



CREATE INDEX "idx_lh_licitacoes_status" ON "public"."lh_licitacoes" USING "btree" ("status");



CREATE INDEX "idx_lh_licitacoes_tenant" ON "public"."lh_licitacoes" USING "btree" ("tenant_id");



CREATE INDEX "idx_lh_notifs_lida" ON "public"."lh_notificacoes" USING "btree" ("lida") WHERE (NOT "lida");



CREATE INDEX "idx_notificacoes_usuario" ON "public"."notificacoes" USING "btree" ("usuario_id", "lida");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_obrigacoes_cliente" ON "public"."obrigacoes" USING "btree" ("cliente_id");



CREATE INDEX "idx_obrigacoes_status" ON "public"."obrigacoes" USING "btree" ("status");



CREATE INDEX "idx_obrigacoes_vencimento" ON "public"."obrigacoes" USING "btree" ("vencimento");



CREATE INDEX "idx_pje_mov_processo" ON "public"."pje_movimentacoes" USING "btree" ("processo_id");



CREATE INDEX "idx_pje_partes_processo" ON "public"."pje_partes" USING "btree" ("processo_id");



CREATE INDEX "idx_pje_prazos_processo" ON "public"."pje_prazos" USING "btree" ("processo_id");



CREATE INDEX "idx_pje_processos_numero" ON "public"."pje_processos" USING "btree" ("numero");



CREATE INDEX "idx_pje_processos_tenant" ON "public"."pje_processos" USING "btree" ("tenant_id");



CREATE INDEX "idx_process_updates_process_id" ON "public"."process_updates" USING "btree" ("process_id");



CREATE INDEX "idx_processes_client_id" ON "public"."processes" USING "btree" ("client_id");



CREATE INDEX "idx_processes_cnj" ON "public"."processes" USING "btree" ("tenant_id", "cnj_source") WHERE (("cnj_source" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_processes_colaborador_id" ON "public"."processes" USING "btree" ("colaborador_id");



CREATE INDEX "idx_processes_deadline" ON "public"."processes" USING "btree" ("next_deadline") WHERE ("next_deadline" IS NOT NULL);



CREATE INDEX "idx_processes_hearing" ON "public"."processes" USING "btree" ("next_hearing") WHERE ("next_hearing" IS NOT NULL);



CREATE INDEX "idx_profiles_client_id" ON "public"."profiles" USING "btree" ("client_id");



CREATE INDEX "idx_stock_movements_item" ON "public"."stock_movements" USING "btree" ("item_id");



CREATE INDEX "idx_stock_movements_moved_at" ON "public"."stock_movements" USING "btree" ("moved_at" DESC);



CREATE INDEX "idx_stock_movements_type" ON "public"."stock_movements" USING "btree" ("movement_type");



CREATE INDEX "idx_subscriptions_email" ON "public"."subscriptions" USING "btree" ("email");



CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status");



CREATE INDEX "idx_subscriptions_user_id" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_support_messages_ticket" ON "public"."support_messages" USING "btree" ("ticket_id");



CREATE INDEX "idx_support_tickets_status" ON "public"."support_tickets" USING "btree" ("status");



CREATE INDEX "idx_support_tickets_tenant_id" ON "public"."support_tickets" USING "btree" ("tenant_id");



CREATE INDEX "idx_support_tickets_user" ON "public"."support_tickets" USING "btree" ("user_id");



CREATE INDEX "idx_system_announcements_created_by" ON "public"."system_announcements" USING "btree" ("created_by");



CREATE INDEX "idx_tarefas_responsavel" ON "public"."tarefas" USING "btree" ("responsavel_id");



CREATE INDEX "idx_tarefas_status" ON "public"."tarefas" USING "btree" ("status");



CREATE INDEX "idx_tasks_assigned_to" ON "public"."tasks" USING "btree" ("assigned_to");



CREATE INDEX "idx_tasks_client_id" ON "public"."tasks" USING "btree" ("client_id");



CREATE INDEX "idx_tasks_generated_from_id" ON "public"."tasks" USING "btree" ("generated_from_id");



CREATE INDEX "idx_tasks_process_id" ON "public"."tasks" USING "btree" ("process_id");



CREATE INDEX "idx_tasks_tenant_id" ON "public"."tasks" USING "btree" ("tenant_id");



CREATE INDEX "idx_user_expenses_tenant" ON "public"."user_expenses" USING "btree" ("tenant_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_user_expenses_user" ON "public"."user_expenses" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "login_failures_email_idx" ON "public"."login_failures" USING "btree" ("email_attempted", "occurred_at" DESC);



CREATE INDEX "login_failures_time_idx" ON "public"."login_failures" USING "btree" ("occurred_at" DESC);



CREATE INDEX "login_history_tenant_idx" ON "public"."login_history" USING "btree" ("tenant_id", "occurred_at" DESC);



CREATE INDEX "login_history_user_idx" ON "public"."login_history" USING "btree" ("user_id", "occurred_at" DESC);



CREATE INDEX "security_events_tenant_idx" ON "public"."security_events" USING "btree" ("tenant_id", "occurred_at" DESC);



CREATE UNIQUE INDEX "uniq_folder_name_per_location" ON "public"."folders" USING "btree" ("tenant_id", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("client_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE OR REPLACE TRIGGER "expense_budgets_set_updated_at" BEFORE UPDATE ON "public"."expense_budgets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "lawfy_on_admin_role" AFTER INSERT OR UPDATE OF "role" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_admin_role_alert"();



CREATE OR REPLACE TRIGGER "lawfy_on_deletion" AFTER DELETE OR UPDATE OF "deleted_at" ON "public"."calendar_events" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_track_deletion"();



CREATE OR REPLACE TRIGGER "lawfy_on_deletion" AFTER DELETE OR UPDATE OF "deleted_at" ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_track_deletion"();



CREATE OR REPLACE TRIGGER "lawfy_on_deletion" AFTER DELETE OR UPDATE OF "deleted_at" ON "public"."colaboradores" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_track_deletion"();



CREATE OR REPLACE TRIGGER "lawfy_on_deletion" AFTER DELETE OR UPDATE OF "deleted_at" ON "public"."financials" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_track_deletion"();



CREATE OR REPLACE TRIGGER "lawfy_on_deletion" AFTER DELETE OR UPDATE OF "deleted_at" ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_track_deletion"();



CREATE OR REPLACE TRIGGER "lawfy_on_deletion" AFTER DELETE OR UPDATE OF "deleted_at" ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_track_deletion"();



CREATE OR REPLACE TRIGGER "lawfy_on_deletion" AFTER DELETE OR UPDATE OF "deleted_at" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_track_deletion"();



CREATE OR REPLACE TRIGGER "lawfy_on_deletion" AFTER DELETE OR UPDATE OF "deleted_at" ON "public"."user_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_track_deletion"();



CREATE OR REPLACE TRIGGER "lh_upd_certidoes" BEFORE UPDATE ON "public"."lh_certidoes" FOR EACH ROW EXECUTE FUNCTION "public"."lh_set_updated_at"();



CREATE OR REPLACE TRIGGER "lh_upd_clientes" BEFORE UPDATE ON "public"."lh_clientes" FOR EACH ROW EXECUTE FUNCTION "public"."lh_set_updated_at"();



CREATE OR REPLACE TRIGGER "lh_upd_contratos" BEFORE UPDATE ON "public"."lh_contratos" FOR EACH ROW EXECUTE FUNCTION "public"."lh_set_updated_at"();



CREATE OR REPLACE TRIGGER "lh_upd_documentos" BEFORE UPDATE ON "public"."lh_documentos" FOR EACH ROW EXECUTE FUNCTION "public"."lh_set_updated_at"();



CREATE OR REPLACE TRIGGER "lh_upd_licitacoes" BEFORE UPDATE ON "public"."lh_licitacoes" FOR EACH ROW EXECUTE FUNCTION "public"."lh_set_updated_at"();



CREATE OR REPLACE TRIGGER "lh_upd_tenants" BEFORE UPDATE ON "public"."lh_tenants" FOR EACH ROW EXECUTE FUNCTION "public"."lh_set_updated_at"();



CREATE OR REPLACE TRIGGER "on_process_created" AFTER INSERT ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_tasks_for_process"();



CREATE OR REPLACE TRIGGER "pje_processos_updated_at" BEFORE UPDATE ON "public"."pje_processos" FOR EACH ROW EXECUTE FUNCTION "public"."update_pje_updated_at"();



CREATE OR REPLACE TRIGGER "processes_updated_at" BEFORE UPDATE ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_tenant_id_calendar_events" BEFORE INSERT ON "public"."calendar_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_clients" BEFORE INSERT ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_colaboradores" BEFORE INSERT ON "public"."colaboradores" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_financial_accounts" BEFORE INSERT ON "public"."financial_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_financials" BEFORE INSERT ON "public"."financials" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_leads" BEFORE INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_processes" BEFORE INSERT ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_tasks" BEFORE INSERT ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "tasks_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_audit_clients" AFTER INSERT OR UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_financials" AFTER INSERT OR UPDATE ON "public"."financials" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_processes" AFTER INSERT OR UPDATE ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_tasks" AFTER INSERT OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_auto_assign_task" BEFORE INSERT ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."lawfy_auto_assign_task"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_calendar_events" BEFORE INSERT ON "public"."calendar_events" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_clients" BEFORE INSERT ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_financial_accounts" BEFORE INSERT ON "public"."financial_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_financials" BEFORE INSERT ON "public"."financials" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_leads" BEFORE INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_processes" BEFORE INSERT ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_auto_tenant_tasks" BEFORE INSERT ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();



CREATE OR REPLACE TRIGGER "trg_clientes_atualizado" BEFORE UPDATE ON "public"."clientes" FOR EACH ROW EXECUTE FUNCTION "public"."update_atualizado_em"();



CREATE OR REPLACE TRIGGER "trg_documents_storage_usage" AFTER INSERT OR DELETE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_tenant_storage_usage"();



CREATE OR REPLACE TRIGGER "trg_documents_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_documents_updated_at"();



CREATE OR REPLACE TRIGGER "trg_escritorios_atualizado" BEFORE UPDATE ON "public"."escritorios" FOR EACH ROW EXECUTE FUNCTION "public"."update_atualizado_em"();



CREATE OR REPLACE TRIGGER "trg_obrigacoes_atualizado" BEFORE UPDATE ON "public"."obrigacoes" FOR EACH ROW EXECUTE FUNCTION "public"."update_atualizado_em"();



CREATE OR REPLACE TRIGGER "trg_perfis_atualizado" BEFORE UPDATE ON "public"."perfis" FOR EACH ROW EXECUTE FUNCTION "public"."update_atualizado_em"();



CREATE OR REPLACE TRIGGER "trg_pje_queue_tenant" BEFORE INSERT ON "public"."pje_search_queue" FOR EACH ROW EXECUTE FUNCTION "public"."set_pje_queue_tenant"();



CREATE OR REPLACE TRIGGER "trg_sync_client_process_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_client_process_count"();



CREATE OR REPLACE TRIGGER "trg_sync_task_calendar_event" AFTER INSERT OR UPDATE OF "due_date", "status", "title", "description", "assigned_to", "deleted_at", "tenant_id" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."sync_task_calendar_event"();



CREATE OR REPLACE TRIGGER "trg_tarefas_atualizado" BEFORE UPDATE ON "public"."tarefas" FOR EACH ROW EXECUTE FUNCTION "public"."update_atualizado_em"();



CREATE OR REPLACE TRIGGER "update_categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_items_updated_at" BEFORE UPDATE ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_stock_entries_updated_at" BEFORE UPDATE ON "public"."stock_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."atividades"
    ADD CONSTRAINT "atividades_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id");



ALTER TABLE ONLY "public"."atividades"
    ADD CONSTRAINT "atividades_escritorio_id_fkey" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atividades"
    ADD CONSTRAINT "atividades_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id");



ALTER TABLE ONLY "public"."autocomplete_lists"
    ADD CONSTRAINT "autocomplete_lists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_contador_id_fkey" FOREIGN KEY ("contador_id") REFERENCES "public"."perfis"("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_escritorio_id_fkey" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_columns"
    ADD CONSTRAINT "custom_columns_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_change_log"
    ADD CONSTRAINT "data_change_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_escritorio_id_fkey" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "public"."perfis"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_accounts"
    ADD CONSTRAINT "financial_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."financials"
    ADD CONSTRAINT "financials_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id");



ALTER TABLE ONLY "public"."financials"
    ADD CONSTRAINT "financials_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financials"
    ADD CONSTRAINT "financials_generated_from_id_fkey" FOREIGN KEY ("generated_from_id") REFERENCES "public"."financials"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financials"
    ADD CONSTRAINT "financials_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financials"
    ADD CONSTRAINT "financials_reconciled_in_id_fkey" FOREIGN KEY ("reconciled_in_id") REFERENCES "public"."financials"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financials"
    ADD CONSTRAINT "financials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_interactions"
    ADD CONSTRAINT "lead_interactions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_converted_client_id_fkey" FOREIGN KEY ("converted_client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_meta_account_id_fkey" FOREIGN KEY ("meta_account_id") REFERENCES "public"."meta_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_whatsapp_account_id_fkey" FOREIGN KEY ("whatsapp_account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lh_certidoes"
    ADD CONSTRAINT "lh_certidoes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."lh_clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_certidoes"
    ADD CONSTRAINT "lh_certidoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."lh_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_client_users"
    ADD CONSTRAINT "lh_client_users_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."lh_clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_client_users"
    ADD CONSTRAINT "lh_client_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."lh_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_client_users"
    ADD CONSTRAINT "lh_client_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_clientes"
    ADD CONSTRAINT "lh_clientes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."lh_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_comentarios"
    ADD CONSTRAINT "lh_comentarios_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."lh_contratos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_comentarios"
    ADD CONSTRAINT "lh_comentarios_licitacao_id_fkey" FOREIGN KEY ("licitacao_id") REFERENCES "public"."lh_licitacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_comentarios"
    ADD CONSTRAINT "lh_comentarios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."lh_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_contrato_aditivos"
    ADD CONSTRAINT "lh_contrato_aditivos_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."lh_contratos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_contratos"
    ADD CONSTRAINT "lh_contratos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."lh_clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_contratos"
    ADD CONSTRAINT "lh_contratos_licitacao_id_fkey" FOREIGN KEY ("licitacao_id") REFERENCES "public"."lh_licitacoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lh_contratos"
    ADD CONSTRAINT "lh_contratos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."lh_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_documentos"
    ADD CONSTRAINT "lh_documentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."lh_clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_documentos"
    ADD CONSTRAINT "lh_documentos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."lh_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_eventos"
    ADD CONSTRAINT "lh_eventos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."lh_clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lh_eventos"
    ADD CONSTRAINT "lh_eventos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."lh_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_licitacao_anexos"
    ADD CONSTRAINT "lh_licitacao_anexos_licitacao_id_fkey" FOREIGN KEY ("licitacao_id") REFERENCES "public"."lh_licitacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_licitacao_timeline"
    ADD CONSTRAINT "lh_licitacao_timeline_licitacao_id_fkey" FOREIGN KEY ("licitacao_id") REFERENCES "public"."lh_licitacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_licitacoes"
    ADD CONSTRAINT "lh_licitacoes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."lh_clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_licitacoes"
    ADD CONSTRAINT "lh_licitacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."lh_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_notificacoes"
    ADD CONSTRAINT "lh_notificacoes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."lh_clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lh_notificacoes"
    ADD CONSTRAINT "lh_notificacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."lh_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_subscriptions"
    ADD CONSTRAINT "lh_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."lh_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lh_tenants"
    ADD CONSTRAINT "lh_tenants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."login_history"
    ADD CONSTRAINT "login_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_escritorio_id_fkey" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensagens"
    ADD CONSTRAINT "mensagens_remetente_id_fkey" FOREIGN KEY ("remetente_id") REFERENCES "public"."perfis"("id");



ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."obrigacoes"
    ADD CONSTRAINT "obrigacoes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."obrigacoes"
    ADD CONSTRAINT "obrigacoes_concluida_por_fkey" FOREIGN KEY ("concluida_por") REFERENCES "public"."perfis"("id");



ALTER TABLE ONLY "public"."obrigacoes"
    ADD CONSTRAINT "obrigacoes_escritorio_id_fkey" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."obrigacoes"
    ADD CONSTRAINT "obrigacoes_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "public"."perfis"("id");



ALTER TABLE ONLY "public"."obrigacoes"
    ADD CONSTRAINT "obrigacoes_tipo_obrigacao_id_fkey" FOREIGN KEY ("tipo_obrigacao_id") REFERENCES "public"."tipos_obrigacao"("id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_escritorio_id_fkey" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pje_movimentacoes"
    ADD CONSTRAINT "pje_movimentacoes_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."pje_processos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pje_partes"
    ADD CONSTRAINT "pje_partes_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."pje_processos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pje_prazos"
    ADD CONSTRAINT "pje_prazos_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."pje_processos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pje_prazos"
    ADD CONSTRAINT "pje_prazos_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pje_processos"
    ADD CONSTRAINT "pje_processos_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pje_processos"
    ADD CONSTRAINT "pje_processos_tribunal_id_fkey" FOREIGN KEY ("tribunal_id") REFERENCES "public"."pje_tribunais"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pje_search_queue"
    ADD CONSTRAINT "pje_search_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."process_updates"
    ADD CONSTRAINT "process_updates_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."processes"
    ADD CONSTRAINT "processes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."processes"
    ADD CONSTRAINT "processes_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."processes"
    ADD CONSTRAINT "processes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stock_entries"
    ADD CONSTRAINT "stock_entries_counted_by_fkey" FOREIGN KEY ("counted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stock_entries"
    ADD CONSTRAINT "stock_entries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."system_announcements"
    ADD CONSTRAINT "system_announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id");



ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_criador_id_fkey" FOREIGN KEY ("criador_id") REFERENCES "public"."perfis"("id");



ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_escritorio_id_fkey" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_obrigacao_id_fkey" FOREIGN KEY ("obrigacao_id") REFERENCES "public"."obrigacoes"("id");



ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "public"."perfis"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_generated_from_id_fkey" FOREIGN KEY ("generated_from_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete categories" ON "public"."categories" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete custom_columns" ON "public"."custom_columns" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete items" ON "public"."items" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete stock_movements" ON "public"."stock_movements" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert settings" ON "public"."settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update roles" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update settings" ON "public"."settings" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update stock_movements" ON "public"."stock_movements" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Authenticated can delete stock_entries" ON "public"."stock_entries" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Authenticated can insert categories" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated can insert custom_columns" ON "public"."custom_columns" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated can insert items" ON "public"."items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated can insert stock_entries" ON "public"."stock_entries" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "counted_by"));



CREATE POLICY "Authenticated can insert stock_movements" ON "public"."stock_movements" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "moved_by"));



CREATE POLICY "Authenticated can update categories" ON "public"."categories" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated can update custom_columns" ON "public"."custom_columns" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated can update items" ON "public"."items" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated can view categories" ON "public"."categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can view custom_columns" ON "public"."custom_columns" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can view items" ON "public"."items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can view roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can view stock_entries" ON "public"."stock_entries" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can view stock_movements" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read settings" ON "public"."settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Movimentações via processo" ON "public"."pje_movimentacoes" USING (((EXISTS ( SELECT 1
   FROM "public"."pje_processos" "p"
  WHERE (("p"."id" = "pje_movimentacoes"."processo_id") AND ("p"."tenant_id" IN ( SELECT "profiles"."tenant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) AND (NOT "public"."is_client_user"())));



CREATE POLICY "Owner or admin can update stock_entries" ON "public"."stock_entries" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "counted_by") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Partes via processo" ON "public"."pje_partes" USING (((EXISTS ( SELECT 1
   FROM "public"."pje_processos" "p"
  WHERE (("p"."id" = "pje_partes"."processo_id") AND ("p"."tenant_id" IN ( SELECT "profiles"."tenant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) AND (NOT "public"."is_client_user"())));



CREATE POLICY "Service role acesso total" ON "public"."subscriptions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role processos" ON "public"."pje_processos" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role queue" ON "public"."pje_search_queue" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Tenant isolation on documents" ON "public"."documents" USING ((("tenant_id" = ( SELECT "profiles"."tenant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())
 LIMIT 1)) AND (NOT "public"."is_client_user"())));



CREATE POLICY "Tenant isolation on folders" ON "public"."folders" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



CREATE POLICY "Tipos de obrigação são públicos" ON "public"."tipos_obrigacao" FOR SELECT USING (true);



CREATE POLICY "Tribunais leitura pública" ON "public"."pje_tribunais" FOR SELECT USING (true);



CREATE POLICY "Usuário gerencia processos do tenant" ON "public"."pje_processos" USING ((("tenant_id" IN ( SELECT "profiles"."tenant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (NOT "public"."is_client_user"())));



CREATE POLICY "Usuário vê própria assinatura" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários veem atividades do escritório" ON "public"."atividades" USING (("escritorio_id" IN ( SELECT "perfis"."escritorio_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));



CREATE POLICY "Usuários veem clientes do escritório" ON "public"."clientes" USING (("escritorio_id" IN ( SELECT "perfis"."escritorio_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));



CREATE POLICY "Usuários veem documentos do escritório" ON "public"."documentos" USING (("escritorio_id" IN ( SELECT "perfis"."escritorio_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));



CREATE POLICY "Usuários veem mensagens do escritório" ON "public"."mensagens" USING (("escritorio_id" IN ( SELECT "perfis"."escritorio_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));



CREATE POLICY "Usuários veem obrigações do escritório" ON "public"."obrigacoes" USING (("escritorio_id" IN ( SELECT "perfis"."escritorio_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));



CREATE POLICY "Usuários veem perfis do escritório" ON "public"."perfis" USING (("escritorio_id" IN ( SELECT "perfis_1"."escritorio_id"
   FROM "public"."perfis" "perfis_1"
  WHERE ("perfis_1"."id" = "auth"."uid"()))));



CREATE POLICY "Usuários veem seu escritório" ON "public"."escritorios" USING (("id" IN ( SELECT "perfis"."escritorio_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));



CREATE POLICY "Usuários veem suas notificações" ON "public"."notificacoes" USING (("usuario_id" = "auth"."uid"()));



CREATE POLICY "Usuários veem tarefas do escritório" ON "public"."tarefas" USING (("escritorio_id" IN ( SELECT "perfis"."escritorio_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));



CREATE POLICY "aditivos_admin" ON "public"."lh_contrato_aditivos" USING (("contrato_id" IN ( SELECT "lh_contratos"."id"
   FROM "public"."lh_contratos"
  WHERE ("lh_contratos"."tenant_id" = "public"."lh_get_tenant_id"()))));



ALTER TABLE "public"."agent_appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_escalations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anexos_admin" ON "public"."lh_licitacao_anexos" USING (("licitacao_id" IN ( SELECT "lh_licitacoes"."id"
   FROM "public"."lh_licitacoes"
  WHERE ("lh_licitacoes"."tenant_id" = "public"."lh_get_tenant_id"()))));



CREATE POLICY "announcements_insert_admin" ON "public"."system_announcements" FOR INSERT WITH CHECK (true);



CREATE POLICY "announcements_select_all" ON "public"."system_announcements" FOR SELECT USING (true);



ALTER TABLE "public"."atividades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_select_admin" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."autocomplete_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calendar_events_tenant_isolation" ON "public"."calendar_events" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_portal_own_documents" ON "public"."documents" FOR SELECT TO "authenticated" USING (("public"."is_client_user"() AND ("client_id" = "public"."current_client_id"())));



CREATE POLICY "client_portal_own_financials" ON "public"."financials" FOR SELECT TO "authenticated" USING (("public"."is_client_user"() AND ("client_id" = "public"."current_client_id"())));



CREATE POLICY "client_portal_own_folders" ON "public"."folders" FOR SELECT USING (("public"."is_client_user"() AND ("client_id" = "public"."current_client_id"())));



CREATE POLICY "client_portal_own_processes" ON "public"."processes" FOR SELECT TO "authenticated" USING (("public"."is_client_user"() AND ("client_id" = "public"."current_client_id"())));



CREATE POLICY "client_users_admin" ON "public"."lh_client_users" USING (("tenant_id" = "public"."lh_get_tenant_id"()));



CREATE POLICY "client_users_self" ON "public"."lh_client_users" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clientes_admin" ON "public"."lh_clientes" USING (("tenant_id" = "public"."lh_get_tenant_id"()));



CREATE POLICY "clientes_client" ON "public"."lh_clientes" FOR SELECT USING (("id" = "public"."lh_get_client_id"()));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_tenant_isolation" ON "public"."clients" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



ALTER TABLE "public"."colaboradores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "colaboradores_tenant_isolation" ON "public"."colaboradores" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



CREATE POLICY "comentarios_admin" ON "public"."lh_comentarios" USING (("tenant_id" = "public"."lh_get_tenant_id"()));



ALTER TABLE "public"."custom_columns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_change_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_library_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documentos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."edge_function_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."escritorios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_budgets_owner_isolation" ON "public"."expense_budgets" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."financial_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financial_accounts_tenant_isolation" ON "public"."financial_accounts" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



ALTER TABLE "public"."financials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financials_tenant_isolation" ON "public"."financials" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



ALTER TABLE "public"."folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integrations_delete" ON "public"."integrations" FOR DELETE USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



CREATE POLICY "integrations_insert" ON "public"."integrations" FOR INSERT WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



CREATE POLICY "integrations_select" ON "public"."integrations" FOR SELECT USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



CREATE POLICY "integrations_update" ON "public"."integrations" FOR UPDATE USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



ALTER TABLE "public"."items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_interactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_interactions_tenant_isolation" ON "public"."lead_interactions" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_tenant_isolation" ON "public"."leads" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



ALTER TABLE "public"."lh_certidoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lh_certidoes_admin" ON "public"."lh_certidoes" USING (("tenant_id" = "public"."lh_get_tenant_id"()));



CREATE POLICY "lh_certidoes_client" ON "public"."lh_certidoes" FOR SELECT USING (("cliente_id" = "public"."lh_get_client_id"()));



ALTER TABLE "public"."lh_client_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lh_clientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lh_comentarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lh_contrato_aditivos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lh_contratos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lh_contratos_admin" ON "public"."lh_contratos" USING (("tenant_id" = "public"."lh_get_tenant_id"()));



CREATE POLICY "lh_contratos_client" ON "public"."lh_contratos" FOR SELECT USING (("cliente_id" = "public"."lh_get_client_id"()));



ALTER TABLE "public"."lh_documentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lh_documentos_admin" ON "public"."lh_documentos" USING (("tenant_id" = "public"."lh_get_tenant_id"()));



CREATE POLICY "lh_documentos_client" ON "public"."lh_documentos" FOR SELECT USING (("cliente_id" = "public"."lh_get_client_id"()));



ALTER TABLE "public"."lh_eventos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lh_eventos_admin" ON "public"."lh_eventos" USING (("tenant_id" = "public"."lh_get_tenant_id"()));



CREATE POLICY "lh_eventos_client" ON "public"."lh_eventos" FOR SELECT USING (("cliente_id" = "public"."lh_get_client_id"()));



ALTER TABLE "public"."lh_licitacao_anexos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lh_licitacao_timeline" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lh_licitacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lh_licitacoes_admin" ON "public"."lh_licitacoes" USING (("tenant_id" = "public"."lh_get_tenant_id"()));



CREATE POLICY "lh_licitacoes_client" ON "public"."lh_licitacoes" FOR SELECT USING (("cliente_id" = "public"."lh_get_client_id"()));



ALTER TABLE "public"."lh_notificacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lh_notificacoes_admin" ON "public"."lh_notificacoes" USING (("tenant_id" = "public"."lh_get_tenant_id"()));



CREATE POLICY "lh_notificacoes_client" ON "public"."lh_notificacoes" FOR SELECT USING (("cliente_id" = "public"."lh_get_client_id"()));



ALTER TABLE "public"."lh_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lh_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lh_tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "library_templates_select_authenticated" ON "public"."document_library_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "library_templates_write_super_admin" ON "public"."document_library_templates" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'super_admin'::"text")))));



ALTER TABLE "public"."login_failures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "login_history_select_admin" ON "public"."login_history" FOR SELECT USING ((("tenant_id" = "public"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_insert" ON "public"."support_messages" FOR INSERT WITH CHECK (true);



CREATE POLICY "messages_select" ON "public"."support_messages" FOR SELECT USING (true);



CREATE POLICY "messages_update" ON "public"."support_messages" FOR UPDATE USING (true);



ALTER TABLE "public"."meta_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meta_accounts_tenant_isolation" ON "public"."meta_accounts" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



ALTER TABLE "public"."notificacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."obrigacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pje_movimentacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pje_partes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pje_prazos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pje_processos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pje_queue_insert" ON "public"."pje_search_queue" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "pje_queue_select" ON "public"."pje_search_queue" FOR SELECT USING ((("tenant_id" = "public"."current_tenant_id"()) OR ("auth"."role"() = 'service_role'::"text")));



ALTER TABLE "public"."pje_search_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pje_tribunais" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."processes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "processes_tenant_isolation" ON "public"."processes" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR (("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ((( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = ( SELECT "auth"."uid"() AS "uid"))) = ANY (ARRAY['admin'::"text", 'superadmin'::"text", 'super_admin'::"text"])) AND ("tenant_id" = ( SELECT "profiles_1"."tenant_id"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."security_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "security_events_select_admin" ON "public"."security_events" FOR SELECT USING (((("public"."current_tenant_id"() = '00000000-0000-0000-0000-000000000001'::"uuid") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) OR (("tenant_id" = "public"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))));



ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subs_own" ON "public"."lh_subscriptions" USING (("tenant_id" = "public"."lh_get_tenant_id"()));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tarefas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_tenant_isolation" ON "public"."tasks" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));



CREATE POLICY "tenant_autocomplete_isolation" ON "public"."autocomplete_lists" USING (("tenant_id" IN ( SELECT "profiles"."tenant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "profiles"."tenant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_notifications" ON "public"."notifications" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tenant_isolation_process_updates" ON "public"."process_updates" USING ((("process_id" IN ( SELECT "processes"."id"
   FROM "public"."processes"
  WHERE ("processes"."tenant_id" = "public"."current_tenant_id"()))) AND (NOT "public"."is_client_user"())));



CREATE POLICY "tenant_own" ON "public"."lh_tenants" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "tenant_read_own" ON "public"."tenants" FOR SELECT USING (("id" = "public"."current_tenant_id"()));



ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tickets_insert" ON "public"."support_tickets" FOR INSERT WITH CHECK (true);



CREATE POLICY "tickets_select" ON "public"."support_tickets" FOR SELECT USING (true);



CREATE POLICY "tickets_update" ON "public"."support_tickets" FOR UPDATE USING (true);



CREATE POLICY "timeline_admin" ON "public"."lh_licitacao_timeline" USING (("licitacao_id" IN ( SELECT "lh_licitacoes"."id"
   FROM "public"."lh_licitacoes"
  WHERE ("lh_licitacoes"."tenant_id" = "public"."lh_get_tenant_id"()))));



ALTER TABLE "public"."tipos_obrigacao" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_expenses_admin_read" ON "public"."user_expenses" FOR SELECT USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "user_expenses_owner_isolation" ON "public"."user_expenses" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_accounts_tenant_isolation" ON "public"."whatsapp_accounts" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pje_search_queue";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."auto_set_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_set_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_set_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_trash"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_trash"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_trash"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_tasks_for_process"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_tasks_for_process"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_tasks_for_process"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_client_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_client_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_client_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_client_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_client_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_client_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lawfy_admin_role_alert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lawfy_admin_role_alert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lawfy_audit_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."lawfy_audit_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lawfy_audit_trigger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lawfy_auth_credential_change_alert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lawfy_auth_credential_change_alert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lawfy_auto_assign_task"() TO "anon";
GRANT ALL ON FUNCTION "public"."lawfy_auto_assign_task"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lawfy_auto_assign_task"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lawfy_generate_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."lawfy_generate_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lawfy_generate_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lawfy_generate_recurring_items"() TO "anon";
GRANT ALL ON FUNCTION "public"."lawfy_generate_recurring_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lawfy_generate_recurring_items"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lawfy_get_security_monitor_secret"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lawfy_get_security_monitor_secret"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lawfy_notify_clients_payment_due"() TO "anon";
GRANT ALL ON FUNCTION "public"."lawfy_notify_clients_payment_due"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lawfy_notify_clients_payment_due"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lawfy_track_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lawfy_track_deletion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lh_get_client_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lh_get_client_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lh_get_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lh_get_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lh_handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."lh_handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lh_handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lh_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."lh_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lh_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_user"("target_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_user"("target_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_user"("target_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_pje_queue_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_pje_queue_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_pje_queue_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_client_process_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_client_process_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_client_process_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_task_calendar_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_task_calendar_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_task_calendar_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_atualizado_em"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_atualizado_em"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_atualizado_em"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_documents_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_documents_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_documents_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_pje_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_pje_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_pje_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tenant_storage_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenant_storage_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_storage_usage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























GRANT ALL ON TABLE "public"."agent_appointments" TO "anon";
GRANT ALL ON TABLE "public"."agent_appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_appointments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agent_appointments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agent_appointments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agent_appointments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."agent_clients" TO "anon";
GRANT ALL ON TABLE "public"."agent_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_clients" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agent_clients_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agent_clients_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agent_clients_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."agent_escalations" TO "anon";
GRANT ALL ON TABLE "public"."agent_escalations" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_escalations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agent_escalations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agent_escalations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agent_escalations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."agent_messages" TO "anon";
GRANT ALL ON TABLE "public"."agent_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agent_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agent_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agent_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."atividades" TO "anon";
GRANT ALL ON TABLE "public"."atividades" TO "authenticated";
GRANT ALL ON TABLE "public"."atividades" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."autocomplete_lists" TO "anon";
GRANT ALL ON TABLE "public"."autocomplete_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."autocomplete_lists" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."colaboradores" TO "anon";
GRANT ALL ON TABLE "public"."colaboradores" TO "authenticated";
GRANT ALL ON TABLE "public"."colaboradores" TO "service_role";



GRANT ALL ON TABLE "public"."custom_columns" TO "anon";
GRANT ALL ON TABLE "public"."custom_columns" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_columns" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."data_change_log" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."data_change_log" TO "authenticated";
GRANT ALL ON TABLE "public"."data_change_log" TO "service_role";



GRANT ALL ON TABLE "public"."document_library_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."document_library_templates" TO "service_role";



GRANT ALL ON TABLE "public"."documentos" TO "anon";
GRANT ALL ON TABLE "public"."documentos" TO "authenticated";
GRANT ALL ON TABLE "public"."documentos" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."edge_function_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."edge_function_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."edge_function_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."escritorios" TO "anon";
GRANT ALL ON TABLE "public"."escritorios" TO "authenticated";
GRANT ALL ON TABLE "public"."escritorios" TO "service_role";



GRANT ALL ON TABLE "public"."expense_budgets" TO "anon";
GRANT ALL ON TABLE "public"."expense_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."financial_accounts" TO "anon";
GRANT ALL ON TABLE "public"."financial_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."financials" TO "anon";
GRANT ALL ON TABLE "public"."financials" TO "authenticated";
GRANT ALL ON TABLE "public"."financials" TO "service_role";



GRANT ALL ON TABLE "public"."folders" TO "anon";
GRANT ALL ON TABLE "public"."folders" TO "authenticated";
GRANT ALL ON TABLE "public"."folders" TO "service_role";



GRANT ALL ON TABLE "public"."integrations" TO "anon";
GRANT ALL ON TABLE "public"."integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."integrations" TO "service_role";



GRANT ALL ON TABLE "public"."items" TO "anon";
GRANT ALL ON TABLE "public"."items" TO "authenticated";
GRANT ALL ON TABLE "public"."items" TO "service_role";



GRANT ALL ON TABLE "public"."lead_interactions" TO "anon";
GRANT ALL ON TABLE "public"."lead_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_interactions" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."lh_certidoes" TO "anon";
GRANT ALL ON TABLE "public"."lh_certidoes" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_certidoes" TO "service_role";



GRANT ALL ON TABLE "public"."lh_client_users" TO "anon";
GRANT ALL ON TABLE "public"."lh_client_users" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_client_users" TO "service_role";



GRANT ALL ON TABLE "public"."lh_clientes" TO "anon";
GRANT ALL ON TABLE "public"."lh_clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_clientes" TO "service_role";



GRANT ALL ON TABLE "public"."lh_comentarios" TO "anon";
GRANT ALL ON TABLE "public"."lh_comentarios" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_comentarios" TO "service_role";



GRANT ALL ON TABLE "public"."lh_contrato_aditivos" TO "anon";
GRANT ALL ON TABLE "public"."lh_contrato_aditivos" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_contrato_aditivos" TO "service_role";



GRANT ALL ON TABLE "public"."lh_contratos" TO "anon";
GRANT ALL ON TABLE "public"."lh_contratos" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_contratos" TO "service_role";



GRANT ALL ON TABLE "public"."lh_documentos" TO "anon";
GRANT ALL ON TABLE "public"."lh_documentos" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_documentos" TO "service_role";



GRANT ALL ON TABLE "public"."lh_eventos" TO "anon";
GRANT ALL ON TABLE "public"."lh_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_eventos" TO "service_role";



GRANT ALL ON TABLE "public"."lh_licitacao_anexos" TO "anon";
GRANT ALL ON TABLE "public"."lh_licitacao_anexos" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_licitacao_anexos" TO "service_role";



GRANT ALL ON TABLE "public"."lh_licitacao_timeline" TO "anon";
GRANT ALL ON TABLE "public"."lh_licitacao_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_licitacao_timeline" TO "service_role";



GRANT ALL ON TABLE "public"."lh_licitacoes" TO "anon";
GRANT ALL ON TABLE "public"."lh_licitacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_licitacoes" TO "service_role";



GRANT ALL ON TABLE "public"."lh_notificacoes" TO "anon";
GRANT ALL ON TABLE "public"."lh_notificacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_notificacoes" TO "service_role";



GRANT ALL ON TABLE "public"."lh_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."lh_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."lh_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."lh_tenants" TO "anon";
GRANT ALL ON TABLE "public"."lh_tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."lh_tenants" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."login_failures" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."login_failures" TO "authenticated";
GRANT ALL ON TABLE "public"."login_failures" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."login_history" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."login_history" TO "authenticated";
GRANT ALL ON TABLE "public"."login_history" TO "service_role";



GRANT ALL ON TABLE "public"."mensagens" TO "anon";
GRANT ALL ON TABLE "public"."mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."mensagens" TO "service_role";



GRANT ALL ON TABLE "public"."meta_accounts" TO "anon";
GRANT ALL ON TABLE "public"."meta_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."meta_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."notificacoes" TO "anon";
GRANT ALL ON TABLE "public"."notificacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."notificacoes" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."obrigacoes" TO "anon";
GRANT ALL ON TABLE "public"."obrigacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."obrigacoes" TO "service_role";



GRANT ALL ON TABLE "public"."perfis" TO "anon";
GRANT ALL ON TABLE "public"."perfis" TO "authenticated";
GRANT ALL ON TABLE "public"."perfis" TO "service_role";



GRANT ALL ON TABLE "public"."pje_movimentacoes" TO "anon";
GRANT ALL ON TABLE "public"."pje_movimentacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."pje_movimentacoes" TO "service_role";



GRANT ALL ON TABLE "public"."pje_partes" TO "anon";
GRANT ALL ON TABLE "public"."pje_partes" TO "authenticated";
GRANT ALL ON TABLE "public"."pje_partes" TO "service_role";



GRANT ALL ON TABLE "public"."pje_prazos" TO "anon";
GRANT ALL ON TABLE "public"."pje_prazos" TO "authenticated";
GRANT ALL ON TABLE "public"."pje_prazos" TO "service_role";



GRANT ALL ON TABLE "public"."pje_processos" TO "anon";
GRANT ALL ON TABLE "public"."pje_processos" TO "authenticated";
GRANT ALL ON TABLE "public"."pje_processos" TO "service_role";



GRANT ALL ON TABLE "public"."pje_search_queue" TO "anon";
GRANT ALL ON TABLE "public"."pje_search_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."pje_search_queue" TO "service_role";



GRANT ALL ON TABLE "public"."pje_tribunais" TO "anon";
GRANT ALL ON TABLE "public"."pje_tribunais" TO "authenticated";
GRANT ALL ON TABLE "public"."pje_tribunais" TO "service_role";



GRANT ALL ON TABLE "public"."process_updates" TO "anon";
GRANT ALL ON TABLE "public"."process_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."process_updates" TO "service_role";



GRANT ALL ON TABLE "public"."processes" TO "anon";
GRANT ALL ON TABLE "public"."processes" TO "authenticated";
GRANT ALL ON TABLE "public"."processes" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."security_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."security_events" TO "authenticated";
GRANT ALL ON TABLE "public"."security_events" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."stock_entries" TO "anon";
GRANT ALL ON TABLE "public"."stock_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_entries" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."support_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_messages" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."system_announcements" TO "anon";
GRANT ALL ON TABLE "public"."system_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."system_announcements" TO "service_role";



GRANT ALL ON TABLE "public"."tarefas" TO "anon";
GRANT ALL ON TABLE "public"."tarefas" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefas" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_obrigacao" TO "anon";
GRANT ALL ON TABLE "public"."tipos_obrigacao" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_obrigacao" TO "service_role";



GRANT ALL ON TABLE "public"."user_expenses" TO "anon";
GRANT ALL ON TABLE "public"."user_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."user_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_accounts" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_accounts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

revoke delete on table "public"."data_change_log" from "anon";

revoke insert on table "public"."data_change_log" from "anon";

revoke select on table "public"."data_change_log" from "anon";

revoke update on table "public"."data_change_log" from "anon";

revoke delete on table "public"."data_change_log" from "authenticated";

revoke insert on table "public"."data_change_log" from "authenticated";

revoke select on table "public"."data_change_log" from "authenticated";

revoke update on table "public"."data_change_log" from "authenticated";

revoke delete on table "public"."document_library_templates" from "anon";

revoke insert on table "public"."document_library_templates" from "anon";

revoke references on table "public"."document_library_templates" from "anon";

revoke select on table "public"."document_library_templates" from "anon";

revoke trigger on table "public"."document_library_templates" from "anon";

revoke truncate on table "public"."document_library_templates" from "anon";

revoke update on table "public"."document_library_templates" from "anon";

revoke delete on table "public"."lh_secrets" from "anon";

revoke insert on table "public"."lh_secrets" from "anon";

revoke references on table "public"."lh_secrets" from "anon";

revoke select on table "public"."lh_secrets" from "anon";

revoke trigger on table "public"."lh_secrets" from "anon";

revoke truncate on table "public"."lh_secrets" from "anon";

revoke update on table "public"."lh_secrets" from "anon";

revoke delete on table "public"."lh_secrets" from "authenticated";

revoke insert on table "public"."lh_secrets" from "authenticated";

revoke references on table "public"."lh_secrets" from "authenticated";

revoke select on table "public"."lh_secrets" from "authenticated";

revoke trigger on table "public"."lh_secrets" from "authenticated";

revoke truncate on table "public"."lh_secrets" from "authenticated";

revoke update on table "public"."lh_secrets" from "authenticated";

revoke delete on table "public"."login_failures" from "anon";

revoke insert on table "public"."login_failures" from "anon";

revoke select on table "public"."login_failures" from "anon";

revoke update on table "public"."login_failures" from "anon";

revoke delete on table "public"."login_failures" from "authenticated";

revoke insert on table "public"."login_failures" from "authenticated";

revoke select on table "public"."login_failures" from "authenticated";

revoke update on table "public"."login_failures" from "authenticated";

revoke delete on table "public"."login_history" from "anon";

revoke insert on table "public"."login_history" from "anon";

revoke update on table "public"."login_history" from "anon";

revoke delete on table "public"."login_history" from "authenticated";

revoke insert on table "public"."login_history" from "authenticated";

revoke update on table "public"."login_history" from "authenticated";

revoke delete on table "public"."security_events" from "anon";

revoke insert on table "public"."security_events" from "anon";

revoke update on table "public"."security_events" from "anon";

revoke delete on table "public"."security_events" from "authenticated";

revoke insert on table "public"."security_events" from "authenticated";

revoke update on table "public"."security_events" from "authenticated";

CREATE TRIGGER lawfy_on_credential_change AFTER UPDATE OF email, encrypted_password ON auth.users FOR EACH ROW EXECUTE FUNCTION public.lawfy_auth_credential_change_alert();

CREATE TRIGGER lh_on_new_user AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.lh_handle_new_user();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Avatars delete"
  on "storage"."objects"
  as permissive
  for delete
  to public
using ((bucket_id = 'avatars'::text));



  create policy "Avatars insert"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'avatars'::text));



  create policy "Avatars public select"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'avatars'::text));



  create policy "Avatars update"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'avatars'::text));



  create policy "docs_admin_all"
  on "storage"."objects"
  as permissive
  for all
  to authenticated
using (((bucket_id = 'documentos'::text) AND ((storage.foldername(name))[1] = (public.lh_get_tenant_id())::text)))
with check (((bucket_id = 'documentos'::text) AND ((storage.foldername(name))[1] = (public.lh_get_tenant_id())::text)));



  create policy "docs_client_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'documentos'::text) AND ((storage.foldername(name))[2] = (public.lh_get_client_id())::text)));



  create policy "documents_bucket_tenant_isolation"
  on "storage"."objects"
  as permissive
  for all
  to authenticated
using (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[1] = ( SELECT (profiles.tenant_id)::text AS tenant_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))))
with check (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[1] = ( SELECT (profiles.tenant_id)::text AS tenant_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));




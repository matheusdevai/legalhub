-- Autocadastro + teste grátis + somente leitura após o teste.
--
-- Antes: quem se cadastrava pela landing (signUp ou Google/Microsoft) ficava
-- com profiles.tenant_id NULL — nenhum código criava o escritório — e toda
-- escrita falhava em auto_set_tenant_id() ("Usuário sem tenant válido").
--
-- Agora:
-- 1. handle_new_user(): usuário sem tenant em raw_app_meta_data (ou seja, não
--    criado pela Edge Function create-user) ganha um escritório novo, vira
--    admin dele e recebe 14 dias de teste no plano Pro
--    (billing_subscriptions.status = 'trialing', current_period_end = fim do
--    teste).
-- 2. tenant_is_active(): 'trialing' só conta como ativo até
--    current_period_end. 'past_due' continua ativo (Stripe ainda está
--    tentando cobrar; o banner já avisa). Tenant sem linha em
--    billing_subscriptions (escritórios anteriores ao billing) segue ativo.
-- 3. Trigger de escrita nas tabelas de dados do escritório (e policy
--    RESTRICTIVE no bucket documents): tenant inativo vira somente leitura (consegue ver e
--    exportar, não cria/edita/exclui). Leitura, perfil, notificações e
--    suporte continuam liberados.

-- ─── 1. tenant_is_active() ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_is_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(
    (SELECT CASE
              WHEN s.status IN ('active', 'past_due') THEN true
              WHEN s.status = 'trialing' THEN s.current_period_end IS NULL OR s.current_period_end > now()
              ELSE false
            END
       FROM public.billing_subscriptions s
      WHERE s.tenant_id = public.current_tenant_id()),
    true
  )
$$;

-- ─── 2. handle_new_user(): cria escritório no autocadastro ──────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name        text := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''), NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1));
  v_role        text := NEW.raw_app_meta_data->>'role';
  v_tenant_id   uuid := NULLIF(NEW.raw_app_meta_data->>'tenant_id', '')::uuid;
  v_office_name text;
  v_slug        text;
  v_plan_id     uuid;
BEGIN
  -- role/tenant_id vêm de raw_app_meta_data (só o service role define — ver
  -- create-user). raw_user_meta_data é controlado pelo próprio usuário no
  -- signUp() e serve só para nome/cidade/nome do escritório.
  IF v_tenant_id IS NULL THEN
    v_office_name := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'office_name'), ''), 'Escritório ' || v_name);
    v_slug := trim(both '-' from lower(regexp_replace(v_office_name, '[^a-zA-Z0-9]+', '-', 'g')));
    v_slug := COALESCE(NULLIF(v_slug, ''), 'escritorio') || '-' || substr(md5(random()::text || NEW.id::text), 1, 6);

    INSERT INTO public.tenants (name, slug) VALUES (v_office_name, v_slug) RETURNING id INTO v_tenant_id;

    SELECT id INTO v_plan_id FROM public.plans WHERE slug = 'pro';
    INSERT INTO public.billing_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (v_tenant_id, v_plan_id, 'trialing', now(), now() + interval '14 days');

    v_role := 'admin';
    -- Dono criando o próprio escritório não é "admin novo" suspeito: avisa
    -- lawfy_admin_role_alert() para não disparar alerta de segurança.
    PERFORM set_config('lawfy.self_signup', '1', true);
  END IF;

  INSERT INTO public.profiles (id, user_id, name, display_name, email, role, tenant_id, city, avatar, created_at)
  VALUES (
    NEW.id,
    NEW.id,
    v_name,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''), v_name),
    NEW.email,
    COALESCE(v_role, 'lawyer'),
    v_tenant_id,
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

  PERFORM set_config('lawfy.self_signup', '', true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca falhar o signup por erro no profile
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lawfy_admin_role_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'vault'
AS $function$
declare
  v_secret text;
  v_event_type text;
begin
  if NEW.tenant_id is null then
    return NEW;
  end if;

  -- Autocadastro (handle_new_user criou o escritório agora): o dono vira
  -- admin do próprio tenant, não é escalada.
  if TG_OP = 'INSERT' and current_setting('lawfy.self_signup', true) = '1' then
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
$function$;

-- ─── 3. Somente leitura para tenant inativo ─────────────────────────────
-- Trigger (e não policy RESTRICTIVE) nas tabelas: um UPDATE barrado por
-- policy só afeta 0 linhas, sem erro, e a tela acharia que salvou. O trigger
-- devolve uma mensagem clara que withErrorFeedback() mostra no toast.
-- Só age em requisição de usuário final; service_role (Edge Functions,
-- stripe-webhook) e cron seguem livres.
CREATE OR REPLACE FUNCTION public.enforce_tenant_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' AND NOT public.tenant_is_active() THEN
    RAISE EXCEPTION 'Escritório em modo somente leitura: o período de teste terminou ou a assinatura não está ativa. Assine um plano em Configurações > Plano para voltar a editar.'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_tenant_active() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients', 'processes', 'process_updates', 'tasks', 'financials', 'financial_accounts',
    'calendar_events', 'colaboradores', 'leads', 'lead_interactions', 'user_expenses',
    'expense_budgets', 'documents', 'folders', 'ai_generations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_tenant_active ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_enforce_tenant_active BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_active()', t);
  END LOOP;
END $$;

-- Bucket documents: mesmo bloqueio, sem tocar nos outros buckets (o projeto
-- hospeda outro sistema — ver CLAUDE.md).
DROP POLICY IF EXISTS documents_bucket_tenant_active_insert ON storage.objects;
DROP POLICY IF EXISTS documents_bucket_tenant_active_update ON storage.objects;
DROP POLICY IF EXISTS documents_bucket_tenant_active_delete ON storage.objects;
CREATE POLICY documents_bucket_tenant_active_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'documents' OR public.tenant_is_active());
CREATE POLICY documents_bucket_tenant_active_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'documents' OR public.tenant_is_active());
CREATE POLICY documents_bucket_tenant_active_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'documents' OR public.tenant_is_active());

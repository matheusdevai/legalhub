-- Escalada de privilégio via profiles (crítico).
--
-- A policy profiles_update deixava o próprio usuário editar a própria linha
-- sem restrição de coluna, e authenticated/anon têm UPDATE em todas as
-- colunas. Resultado: qualquer usuário (inclusive login do Portal do Cliente)
-- conseguia, direto pela API REST, fazer
--   update profiles set role = 'super_admin', tenant_id = '<outro escritório>'
-- e passar a ler/escrever os dados de qualquer tenant (current_tenant_id() e
-- is_admin_user() leem exatamente essas colunas). Trocar client_id dava a um
-- cliente do Portal acesso aos processos de outro cliente.
--
-- handle_new_user() tinha o mesmo buraco no cadastro: lia role/tenant_id de
-- raw_user_meta_data, que é o `options.data` livre do supabase.auth.signUp().
--
-- Correção:
-- 1. Trigger BEFORE INSERT/UPDATE em profiles que só deixa requisições de
--    usuário final (JWT authenticated/anon) mexerem em role/client_id quando o
--    chamador é admin do mesmo escritório, e nunca em tenant_id /
--    subscription_status. Chamadas server-side (service_role nas Edge
--    Functions, triggers do GoTrue) seguem livres.
-- 2. handle_new_user() passa a ler role/tenant_id de raw_app_meta_data, que só
--    o service role consegue definir (create-user foi ajustada junto).

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role   text;
  v_caller_tenant uuid;
BEGIN
  -- Só restringe requisições de usuário final via PostgREST. service_role e
  -- conexões diretas (GoTrue/handle_new_user, cron, migrations) não têm
  -- claim 'authenticated'/'anon'.
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- profiles_insert permite id = auth.uid(); o perfil normal já nasce via
    -- handle_new_user, então um INSERT vindo do cliente nunca escolhe
    -- escritório nem papel.
    NEW.tenant_id := NULL;
    NEW.client_id := NULL;
    NEW.role := 'lawyer';
    NEW.subscription_status := NULL;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    RAISE EXCEPTION 'Alteração de escritório/assinatura do perfil não permitida'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
      FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'super_admin', 'superadmin') THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o perfil de acesso'
        USING ERRCODE = '42501';
    END IF;

    IF v_caller_role NOT IN ('super_admin', 'superadmin') THEN
      IF OLD.tenant_id IS DISTINCT FROM v_caller_tenant THEN
        RAISE EXCEPTION 'Usuário de outro escritório' USING ERRCODE = '42501';
      END IF;
      IF NEW.role IN ('super_admin', 'superadmin') OR OLD.role IN ('super_admin', 'superadmin') THEN
        RAISE EXCEPTION 'Apenas super administradores podem conceder ou alterar esse papel'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Login do Portal do Cliente entra/sai só pela Edge Function create-user
    -- (que valida que o client_id é do mesmo escritório).
    IF (NEW.role = 'client') IS DISTINCT FROM (OLD.role = 'client')
       OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'Acesso de Portal do Cliente só pode ser alterado pela tela de clientes'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
-- Nome começa com "trg_p..." para rodar antes de trg_plan_limit_profiles
-- (ordem alfabética), já com o INSERT higienizado.
CREATE TRIGGER trg_protect_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- role/tenant_id vêm de raw_app_meta_data (só o service role define — ver
  -- create-user). raw_user_meta_data é controlado pelo próprio usuário no
  -- signUp() e serve só para nome/cidade.
  INSERT INTO public.profiles (id, user_id, name, display_name, email, role, tenant_id, city, avatar, created_at)
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'role', 'lawyer'),
    NULLIF(NEW.raw_app_meta_data->>'tenant_id', '')::uuid,
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
$function$;

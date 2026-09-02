-- Correção de revisão de qualidade (branch feat/stripe-billing) sobre
-- supabase/functions/create-user/index.ts: a checagem de plans.max_users
-- adicionada em 20260902180000 era um SELECT count(*) sem lock, então dois
-- create-user concorrentes no mesmo tenant no limite podiam ambos passar
-- antes de qualquer INSERT comitar — mesma classe de TOCTOU já fechada para
-- clients/processes via pg_advisory_xact_lock() em enforce_plan_limit().
--
-- Fix: move a checagem para um trigger BEFORE INSERT em `profiles`, mesmo
-- padrão de lock. A checagem manual em create-user/index.ts foi removida no
-- mesmo commit desta migration — o trigger abaixo é a única fonte de
-- verdade agora, e create-user traduz a exceção dele numa resposta 403
-- amigável em vez do 500 genérico de "erro ao criar perfil".
--
-- Cobertura: create-user grava o perfil via
-- `.from('profiles').upsert({...}, {onConflict: 'id'})` — um INSERT ... ON
-- CONFLICT DO UPDATE. Nesse caso o Postgres sempre dispara os triggers
-- BEFORE INSERT antes de resolver o conflito (documentado em "Rules" do
-- INSERT), então esta checagem roda tanto no caminho de INSERT puro quanto
-- no upsert com conflito — não precisa de um trigger BEFORE UPDATE também.
CREATE OR REPLACE FUNCTION "public"."enforce_user_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  -- tenant_id NULL cobre o INSERT feito por handle_new_user() logo após o
  -- signup (auth.users -> profiles, tenant_id só é atribuído depois, pelo
  -- upsert do create-user) — nada a checar ainda. Login de Portal do
  -- Cliente (role 'client') não conta como "usuário" do escritório.
  IF NEW.tenant_id IS NULL OR NEW.role = 'client' THEN
    RETURN NEW;
  END IF;

  -- Mesma serialização por (tenant, recurso) de enforce_plan_limit(): lock
  -- de transação, some sozinho no commit/rollback do INSERT que disparou o
  -- trigger, não trava linhas de outros tenants.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text), hashtext('profiles'));

  SELECT p.max_users INTO v_limit
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.tenant_id = NEW.tenant_id;

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.profiles
   WHERE tenant_id = NEW.tenant_id AND role <> 'client';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite do plano atingido: seu plano permite no máximo % usuário(s). Faça upgrade em Configurações > Plano.', v_limit;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."enforce_user_limit"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "trg_plan_limit_profiles" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_user_limit"();

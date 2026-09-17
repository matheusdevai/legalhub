-- profiles_update tinha uma subquery correlacionada direta em "profiles" (profiles_1)
-- dentro da própria policy de UPDATE de "profiles". Como essa subquery também é
-- avaliada sob RLS, o planner entra em recursão infinita (42P17) sempre que o
-- branch do admin precisa ser avaliado, mesmo quando o usuário está atualizando
-- a própria linha (id = auth.uid()) — Postgres não garante short-circuit da OR
-- aqui. Isso quebrava silenciosamente qualquer UPDATE em profiles (ex.: salvar a
-- OAB no onboarding), porque supabase-js não trata 42P17 como algo que o app
-- precise mostrar, e o onboarding engolia o erro.
--
-- Corrigido replicando o mesmo padrão já usado por current_tenant_id()/is_client_user():
-- uma função SECURITY DEFINER (owner postgres) para checar o papel do usuário,
-- que roda bypassando RLS em profiles em vez de reconsultar a tabela sob a
-- policy do chamador.

CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = ANY (ARRAY['admin', 'superadmin', 'super_admin']),
    false
  )
$$;

ALTER FUNCTION "public"."is_admin_user"() OWNER TO "postgres";

DROP POLICY IF EXISTS "profiles_update" ON "public"."profiles";

CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE
USING (
  ("id" = ( SELECT auth.uid() AS "uid"))
  OR ("public"."is_admin_user"() AND ("tenant_id" = "public"."current_tenant_id"()))
);

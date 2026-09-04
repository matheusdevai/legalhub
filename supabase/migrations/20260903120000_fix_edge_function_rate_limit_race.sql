-- Achado de auditoria de segurança MÉDIO (branch feat/ai-juridica-uploads-rebrand):
-- checkRateLimit() em toda Edge Function que usa edge_function_rate_limits
-- (create-user, create-checkout-session, create-customer-portal-session,
-- ai-gemini-assistant) fazia um SELECT count(*) sem lock seguido de um INSERT
-- separado — mesma classe de TOCTOU já fechada para clients/processes
-- (enforce_plan_limit(), 20260902180000) e profiles (enforce_user_limit(),
-- 20260902190000) via pg_advisory_xact_lock(). Sem lock, N chamadas
-- concorrentes/em burst da mesma rate_key liam o mesmo count() antes de
-- qualquer INSERT comitar, passando todas juntas acima do limite — ficou
-- mais relevante em ai-gemini-assistant agora que aceita anexos de até 15MB
-- (cada geração em burst é uma chamada mais cara à API do Gemini).
--
-- Fix: move o count+insert pra uma função Postgres SECURITY DEFINER única
-- (check_rate_limit), serializada por rate_key via pg_advisory_xact_lock,
-- chamada via RPC por QUALQUER Edge Function que precise de rate limit —
-- não só ai-gemini-assistant. O código das 4 Edge Functions (checkRateLimit
-- local duplicado em cada uma) foi substituído por uma chamada a essa RPC no
-- mesmo commit desta migration.
CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_window_start timestamptz := now() - (p_window_seconds || ' seconds')::interval;
  v_count integer;
BEGIN
  -- Serializa por rate_key: sem isso, N chamadas concorrentes da mesma chave
  -- liam o mesmo count() antes de qualquer INSERT comitar (TOCTOU), passando
  -- todas juntas mesmo acima do limite. Lock de transação — some sozinho no
  -- commit/rollback, nunca trava outras rate_key.
  PERFORM pg_advisory_xact_lock(hashtext(p_key), hashtext('edge_function_rate_limits'));

  SELECT count(*) INTO v_count
    FROM public.edge_function_rate_limits
   WHERE rate_key = p_key AND created_at >= v_window_start;

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.edge_function_rate_limits (rate_key) VALUES (p_key);

  -- Mesma limpeza de linhas antigas que cada Edge Function fazia sozinha
  -- (janelas de retenção maiores que qualquer p_window_seconds usado hoje
  -- não acumulam lixo indefinidamente na tabela compartilhada).
  DELETE FROM public.edge_function_rate_limits
   WHERE created_at < now() - (24 * p_window_seconds || ' seconds')::interval;

  RETURN true;
END;
$$;

ALTER FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";

-- Só as Edge Functions (service role) chamam isso via RPC — nunca
-- anon/authenticated direto, senão qualquer usuário logado conseguiria
-- forjar rate_key de outro usuário/tenant e poluir a contagem dele.
REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";

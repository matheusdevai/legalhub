-- Correções de auditoria de segurança (branch feat/stripe-billing, achados
-- MÉDIOS — burla de limite de plano, sem vazamento cross-tenant) sobre
-- 20260902160000_stripe_billing_foundation.sql:
--
-- 1. TOCTOU em enforce_plan_limit(): SELECT count(*) sem lock atômico
--    deixava N INSERTs concorrentes do mesmo tenant lerem o mesmo count()
--    antes de qualquer um comitar, passando todos juntos no limite.
-- 2. O trigger só cobria BEFORE INSERT — dava pra "reviver" registros
--    soft-deletados (deleted_at NOT NULL -> NULL via UPDATE direto) sem
--    passar pelo limite: deletar N antigos, inserir N novos, reviver os N
--    antigos = 2N ativos.
--
-- Fix de ambos na mesma função (substituída via CREATE OR REPLACE, o que já
-- atualiza os triggers de INSERT existentes automaticamente — não precisa
-- recriá-los) + 2 triggers novos de BEFORE UPDATE.

CREATE OR REPLACE FUNCTION "public"."enforce_plan_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_table  text := TG_ARGV[0];
  v_limit  integer;
  v_count  integer;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Em UPDATE só nos importa a "revivência" de um registro soft-deletado
  -- (deleted_at NOT NULL -> NULL): é o único caminho de UPDATE que aumenta a
  -- contagem de ativos. Uma edição normal (deleted_at inalterado) ou um
  -- soft-delete (NULL -> NOT NULL, que DIMINUI a contagem) segue sem
  -- checagem — nunca bloqueia quem está só editando ou arquivando.
  IF TG_OP = 'UPDATE' AND NOT (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Serializa por (tenant, tabela): sem isso, N INSERTs/revivals
  -- concorrentes do mesmo tenant podiam ler o mesmo count() antes de
  -- qualquer um comitar e passar todos juntos no limite (TOCTOU). Lock de
  -- transação — some sozinho no commit/rollback do INSERT/UPDATE que
  -- disparou o trigger, nunca trava linhas de outros tenants nem precisa de
  -- tabela de lock própria.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text), hashtext(v_table));

  SELECT (CASE v_table
            WHEN 'clients'   THEN p.max_clients
            WHEN 'processes' THEN p.max_processes
          END)
    INTO v_limit
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.tenant_id = NEW.tenant_id;

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1 AND deleted_at IS NULL', v_table)
    INTO v_count
    USING NEW.tenant_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite do plano atingido: seu plano permite no máximo % registro(s) em %. Faça upgrade em Configurações > Plano.', v_limit, v_table;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."enforce_plan_limit"() OWNER TO "postgres";

-- Novo: cobre a revivência via UPDATE (item 2). Os triggers de BEFORE INSERT
-- já existentes (trg_plan_limit_clients/trg_plan_limit_processes) continuam
-- valendo sem alteração, já apontam para a função acima.
CREATE OR REPLACE TRIGGER "trg_plan_limit_clients_update" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_plan_limit"('clients');
CREATE OR REPLACE TRIGGER "trg_plan_limit_processes_update" BEFORE UPDATE ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_plan_limit"('processes');

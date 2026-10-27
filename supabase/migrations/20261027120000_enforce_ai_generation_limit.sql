-- Limite mensal da Excelência (IA) por plano.
--
-- A Landing Page vende "até 30 gerações/mês" (Básico) e "até 200/mês" (Pro),
-- e plans.max_ai_generations_month existe, mas nada aplicava o limite: a
-- Edge Function ai-gemini-assistant só tinha rate limit por minuto. Cada
-- geração além do contratado era custo de Gemini sem receita.
--
-- Mesmo padrão de enforce_user_limit(): trigger BEFORE INSERT com advisory
-- lock por tenant (sem TOCTOU entre gerações simultâneas). Roda também para
-- inserts via service role — ai-gemini-assistant grava ai_generations com
-- service role, então enforce_tenant_active() (que só olha requisições de
-- usuário final) não barrava IA de escritório em somente leitura; este
-- trigger barra.
--
-- Gerações com status 'error' não contam (falha do Gemini não consome a
-- cota). Mês = mês civil no fuso de Brasília.

-- tenant_is_active() com tenant explícito, para quem roda sem JWT de usuário
-- (service role). tenant_is_active() passa a delegar para esta.
CREATE OR REPLACE FUNCTION public.tenant_is_active_for(p_tenant_id uuid) RETURNS boolean
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
      WHERE s.tenant_id = p_tenant_id),
    true
  )
$$;

REVOKE EXECUTE ON FUNCTION public.tenant_is_active_for(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tenant_is_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT public.tenant_is_active_for(public.current_tenant_id())
$$;

CREATE OR REPLACE FUNCTION public.enforce_ai_generation_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_limit       integer;
  v_count       integer;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.tenant_is_active_for(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Escritório em modo somente leitura: o período de teste terminou ou a assinatura não está ativa. Assine um plano em Configurações > Plano para voltar a usar a Excelência (IA).'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text), hashtext('ai_generations'));

  SELECT p.max_ai_generations_month INTO v_limit
    FROM public.billing_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.tenant_id = NEW.tenant_id;

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.ai_generations
   WHERE tenant_id = NEW.tenant_id
     AND created_at >= v_month_start
     AND status <> 'error';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite do plano atingido: seu plano permite % geração(ões) da Excelência (IA) por mês. Faça upgrade em Configurações > Plano.', v_limit;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_ai_generation_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_plan_limit_ai_generations
  BEFORE INSERT ON public.ai_generations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ai_generation_limit();

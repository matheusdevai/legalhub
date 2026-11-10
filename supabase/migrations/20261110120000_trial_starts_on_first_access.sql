-- Teste grátis que começa no PRIMEIRO ACESSO (opt-in por escritório).
--
-- Regra geral não muda: quem se cadastra pela landing (handle_new_user) segue
-- com 14 dias contados do cadastro. Esta migration só adiciona uma marca por
-- escritório para os casos em que a conta é criada antes de a pessoa usar o
-- sistema (ex.: conta de teste criada pelo dono para um advogado convidado).
--
-- Como funciona:
--   billing_subscriptions.trial_starts_on_first_access = true  (marca, só service role grava)
--   billing_subscriptions.trial_started_at             = null  (ainda não acessou)
--   status = 'trialing', current_period_end = null
--
-- Enquanto o teste não começou, o escritório fica ATIVO e sem data final:
-- tenant_is_active_for() já trata 'trialing' com current_period_end NULL como
-- ativo ("s.current_period_end IS NULL OR s.current_period_end > now()"), então
-- tenant_is_active(), enforce_tenant_active() e enforce_ai_generation_limit()
-- NÃO mudam e não bloqueiam antes do 1º acesso.
--
-- No primeiro acesso, o app chama start_trial_on_first_access(), que grava
-- current_period_end = now() + 14 dias. A função é idempotente: só age uma vez,
-- só se a marca estiver ligada, só enquanto a assinatura estiver em 'trialing'
-- e nunca para usuário do Portal do Cliente (que não é "o escritório" usando).
--
-- Escritórios existentes e novos autocadastros ficam com a marca false (default)
-- e não são tocados por nada aqui.

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS trial_starts_on_first_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;

COMMENT ON COLUMN public.billing_subscriptions.trial_starts_on_first_access IS
  'true = o teste grátis só começa no primeiro acesso de um usuário da equipe (start_trial_on_first_access). Só service role liga.';
COMMENT ON COLUMN public.billing_subscriptions.trial_started_at IS
  'Quando o teste de 14 dias começou (primeiro acesso). NULL = ainda não começou (escritório ativo, sem data final).';

-- Nenhuma policy de escrita existe nesta tabela (só SELECT por tenant): a marca
-- não pode ser ligada/desligada por usuário final. Quem liga é o service role.

CREATE OR REPLACE FUNCTION public.start_trial_on_first_access()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := public.current_tenant_id();
  v_end       timestamptz;
BEGIN
  IF v_tenant_id IS NULL OR auth.uid() IS NULL OR public.is_client_user() THEN
    RETURN NULL;
  END IF;

  UPDATE public.billing_subscriptions s
     SET trial_started_at     = now(),
         current_period_start = now(),
         current_period_end   = now() + interval '14 days'
   WHERE s.tenant_id = v_tenant_id
     AND s.trial_starts_on_first_access
     AND s.trial_started_at IS NULL
     AND s.status = 'trialing'
  RETURNING s.current_period_end INTO v_end;

  -- NULL = nada a fazer (marca desligada, teste já começou ou já assinou).
  RETURN v_end;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_trial_on_first_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_trial_on_first_access() TO authenticated;

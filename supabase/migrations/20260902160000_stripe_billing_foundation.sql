-- Billing Stripe (fundação): planos, assinatura por tenant e idempotência de
-- webhook. Aprovado pelo dono: 3 planos (Básico/Pro/Enterprise), cartão de
-- crédito apenas (sem Pix/Boleto), chaves de teste até o dono criar a conta
-- Stripe (ver checklist de go-live no README).
--
-- Nomenclatura: `plans`/`subscriptions` são tabelas NOVAS e não têm nenhuma
-- relação com `lh_subscriptions`/`lh_tenants` (LicitaHub, já dropadas em
-- 20260831001217_remove_licitahub_tables.sql) nem com as colunas legadas
-- `profiles.subscription_status`/`profiles.subscription_plan` (billing por
-- usuário — modelo errado, mantidas por ora sem uso; a fonte de verdade do
-- plano do tenant passa a ser `subscriptions`, nunca `profiles`).

-- ─── plans ───────────────────────────────────────────────────────────────
-- Catálogo de planos. `stripe_price_id` fica NULL até o dono criar o Product
-- no Dashboard do Stripe (ver checklist no README) — create-checkout-session
-- falha com erro claro enquanto isso não for preenchido.
-- NULL nas colunas de limite (max_*) significa "sem limite" (plano Enterprise).
CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price_cents" integer NOT NULL,
    "stripe_price_id" "text",
    "max_users" integer,
    "max_clients" integer,
    "max_processes" integer,
    "max_storage_bytes" bigint,
    "max_ai_generations_month" integer,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plans_slug_key" UNIQUE ("slug"),
    CONSTRAINT "plans_slug_check" CHECK (("slug" = ANY (ARRAY['basico'::"text", 'pro'::"text", 'enterprise'::"text"])))
);

ALTER TABLE "public"."plans" OWNER TO "postgres";

INSERT INTO "public"."plans"
    ("slug", "name", "price_cents", "max_users", "max_clients", "max_processes", "max_storage_bytes", "max_ai_generations_month")
VALUES
    ('basico',     'Básico',     14900, 3,  150, 300,  5368709120,   30),
    ('pro',        'Pro',        34900, 10, 750, 1500, 26843545600,  200),
    ('enterprise', 'Enterprise', 79900, 25, NULL, NULL, 107374182400, NULL)
ON CONFLICT ("slug") DO NOTHING;

-- ─── subscriptions ───────────────────────────────────────────────────────
-- 1 linha por tenant. Só é criada/atualizada pela Edge Function stripe-webhook
-- (service_role, bypassa RLS) — nunca por escrita direta do cliente.
CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscriptions_tenant_id_key" UNIQUE ("tenant_id"),
    CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id"),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'incomplete'::"text"])))
);

ALTER TABLE "public"."subscriptions" OWNER TO "postgres";

CREATE INDEX "idx_subscriptions_stripe_customer" ON "public"."subscriptions" USING "btree" ("stripe_customer_id");

CREATE OR REPLACE TRIGGER "subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

-- ─── stripe_events ───────────────────────────────────────────────────────
-- Idempotência do webhook: Stripe pode reenviar o mesmo evento mais de uma
-- vez (retry em timeout/5xx). stripe-webhook grava o event id ANTES de
-- aplicar qualquer efeito e ignora reprocessar um id já visto.
CREATE TABLE IF NOT EXISTS "public"."stripe_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stripe_event_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stripe_events_stripe_event_id_key" UNIQUE ("stripe_event_id")
);

ALTER TABLE "public"."stripe_events" OWNER TO "postgres";

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;

-- Catálogo de planos é leitura pública para qualquer usuário autenticado
-- (tela de billing precisa mostrar os 3 planos para montar upgrade/downgrade).
CREATE POLICY "plans_select_authenticated" ON "public"."plans" FOR SELECT TO "authenticated" USING (true);

-- Só membros do próprio tenant (equipe, não Portal do Cliente) enxergam a
-- própria assinatura. Sem policy de escrita: só service_role grava aqui
-- (stripe-webhook), e service_role sempre bypassa RLS.
CREATE POLICY "subscriptions_tenant_isolation" ON "public"."subscriptions" FOR SELECT USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));

-- stripe_events não tem NENHUMA policy de propósito: é log interno do
-- webhook (pode conter payload sensível), só service_role deve tocar nele.

-- ─── tenant_is_active() ──────────────────────────────────────────────────
-- Mesmo padrão de current_tenant_id()/is_client_user(): SECURITY DEFINER,
-- lê subscriptions do tenant da sessão atual. Retorna true (não bloqueia)
-- quando o tenant ainda não tem linha em subscriptions — cobre tenants
-- criados antes do billing existir e o período de teste/onboarding.
--
-- NÃO está referenciada em nenhuma policy de RLS ainda — o bloqueio de
-- inadimplentes hoje é só o soft-gate (banner) no frontend. Esta função é a
-- peça pronta para um hard-gate futuro (adicionar "AND tenant_is_active()"
-- no WITH CHECK das policies de escrita), decisão que fica para depois do
-- período de carência ser definido com o dono.
CREATE OR REPLACE FUNCTION "public"."tenant_is_active"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(
    (SELECT status IN ('trialing', 'active') FROM public.subscriptions WHERE tenant_id = public.current_tenant_id()),
    true
  )
$$;

ALTER FUNCTION "public"."tenant_is_active"() OWNER TO "postgres";

-- ─── enforce_plan_limit() ────────────────────────────────────────────────
-- Trigger genérico (mesmo espírito de auto_set_tenant_id()) que bloqueia
-- INSERT em clients/processes quando o tenant já atingiu o limite do plano
-- contratado. Recebe o nome da tabela via argumento do trigger (TG_ARGV) para
-- não duplicar a função por tabela. NULL no limite = sem limite (Enterprise
-- ou tenant sem subscriptions ainda, ex: pré-Stripe) — nunca bloqueia.
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

-- Roda DEPOIS de trg_auto_tenant_clients/trg_auto_tenant_processes (ordem
-- alfabética de nome de trigger dentro do mesmo BEFORE INSERT: "trg_auto_..."
-- vem antes de "trg_plan_limit_..."), então NEW.tenant_id já está resolvido
-- para o tenant da sessão quando este trigger roda.
CREATE OR REPLACE TRIGGER "trg_plan_limit_clients" BEFORE INSERT ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_plan_limit"('clients');
CREATE OR REPLACE TRIGGER "trg_plan_limit_processes" BEFORE INSERT ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_plan_limit"('processes');

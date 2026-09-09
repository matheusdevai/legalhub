-- Milestone 8 do LegalHub Assistente (Fase 2 — WhatsApp via Meta Cloud API).
--
-- Decisão: NÃO reaproveitar `whatsapp_accounts`. Essa tabela é uma ficha
-- cadastral cosmética/manual (name, phone_number, status, provider default
-- 'evolution', api_url/api_key/instance_name — campos de uma API não-oficial
-- self-hosted) usada só por LeadsPage.tsx pra rotular a origem de um lead
-- (`leads.whatsapp_account_id`). Um tenant pode ter várias linhas nela sem
-- nenhuma corresponder de fato a um número Meta conectado. Guardar
-- phone_number_id/waba_id ali criaria ambiguidade (qual das N linhas
-- cosméticas é "a real"?) e misturaria dois conceitos diferentes. Em vez
-- disso: tabela nova `whatsapp_integration_settings`, 1 linha por tenant,
-- fonte de verdade pra resolver qual tenant é dono de um `phone_number_id`
-- que chega no payload do webhook da Meta. Token/secret NUNCA aqui — sempre
-- Edge Function secret (WHATSAPP_ACCESS_TOKEN).
CREATE TABLE IF NOT EXISTS "public"."whatsapp_integration_settings" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid DEFAULT public.current_tenant_id() NOT NULL,
    "phone_number_id" text NOT NULL,
    "waba_id" text,
    "display_phone_number" text,
    "status" text DEFAULT 'disconnected'::text NOT NULL,
    "connected_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "whatsapp_integration_settings_status_check" CHECK (("status" = ANY (ARRAY['disconnected'::text, 'connected'::text, 'error'::text])))
);

ALTER TABLE "public"."whatsapp_integration_settings" OWNER TO "postgres";

ALTER TABLE ONLY "public"."whatsapp_integration_settings"
    ADD CONSTRAINT "whatsapp_integration_settings_pkey" PRIMARY KEY ("id");

-- 1 configuração ativa por tenant; permite reconfigurar (soft-delete a antiga
-- e criar outra) sem violar unicidade.
CREATE UNIQUE INDEX "whatsapp_integration_settings_tenant_active_idx"
    ON "public"."whatsapp_integration_settings" USING btree ("tenant_id")
    WHERE ("deleted_at" IS NULL);

-- phone_number_id é o que chega em `value.metadata.phone_number_id` no
-- payload do webhook — é por ele que resolvemos o tenant_id de uma mensagem
-- recebida (ver supabase/functions/whatsapp-webhook).
CREATE UNIQUE INDEX "whatsapp_integration_settings_phone_number_id_idx"
    ON "public"."whatsapp_integration_settings" USING btree ("phone_number_id")
    WHERE ("deleted_at" IS NULL);

ALTER TABLE "public"."whatsapp_integration_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_integration_settings_tenant_isolation" ON "public"."whatsapp_integration_settings"
    USING ((("tenant_id" = public.current_tenant_id()) AND (NOT public.is_client_user())))
    WITH CHECK ((("tenant_id" = public.current_tenant_id()) AND (NOT public.is_client_user())));

GRANT ALL ON TABLE "public"."whatsapp_integration_settings" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_integration_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_integration_settings" TO "service_role";


-- Mensagens trocadas via WhatsApp (Meta Cloud API), inbound e outbound.
-- Nesta fatia (milestone 8): só recepção + persistência + tentativa de
-- identificação de cliente. Sem resposta automática/classificação/notificação
-- (milestone 9+) e sem UI de inbox ainda.
CREATE TABLE IF NOT EXISTS "public"."whatsapp_messages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "client_id" uuid,
    "phone_number" text NOT NULL,
    "direction" text NOT NULL,
    "message_type" text DEFAULT 'text'::text NOT NULL,
    "content" text,
    "status" text DEFAULT 'received'::text NOT NULL,
    "wa_message_id" text,
    "raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "whatsapp_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT "whatsapp_messages_status_check" CHECK (("status" = ANY (ARRAY['received'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);

ALTER TABLE "public"."whatsapp_messages" OWNER TO "postgres";

ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;

-- Idempotência: a Meta reenvia o mesmo webhook em retry de timeout/5xx. Sem
-- isso, um retry duplicaria a mensagem na conversa.
CREATE UNIQUE INDEX "whatsapp_messages_tenant_wa_message_id_idx"
    ON "public"."whatsapp_messages" USING btree ("tenant_id", "wa_message_id")
    WHERE ("wa_message_id" IS NOT NULL);

CREATE INDEX "whatsapp_messages_tenant_client_idx"
    ON "public"."whatsapp_messages" USING btree ("tenant_id", "client_id", "created_at" DESC);

CREATE INDEX "whatsapp_messages_tenant_phone_idx"
    ON "public"."whatsapp_messages" USING btree ("tenant_id", "phone_number", "created_at" DESC);

ALTER TABLE "public"."whatsapp_messages" ENABLE ROW LEVEL SECURITY;

-- Sem acesso do portal do cliente (role 'client') — mensagens de WhatsApp são
-- uma ferramenta interna do escritório, não um canal exposto no Portal.
CREATE POLICY "whatsapp_messages_tenant_isolation" ON "public"."whatsapp_messages"
    USING ((("tenant_id" = public.current_tenant_id()) AND (NOT public.is_client_user())))
    WITH CHECK ((("tenant_id" = public.current_tenant_id()) AND (NOT public.is_client_user())));

GRANT ALL ON TABLE "public"."whatsapp_messages" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "service_role";

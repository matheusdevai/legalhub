-- Correções pós-review da migration 20260908140000 (milestone 8, WhatsApp
-- via Meta Cloud API), antes de qualquer deploy/uso real.

-- ----------------------------------------------------------------------------
-- 1) [BLOQUEANTE] RLS de whatsapp_messages/whatsapp_integration_settings
--
-- As policies criadas em 20260908140000 usavam USING/WITH CHECK sem `FOR
-- SELECT` — isso as aplica a TODO comando (SELECT/INSERT/UPDATE/DELETE), não
-- só leitura. Resultado: qualquer usuário `authenticated` do tenant (não só
-- admin) conseguiria, via supabase-js direto (sem passar pela Edge Function
-- nem pela validação de assinatura HMAC), inserir mensagem falsa,
-- alterar/apagar mensagem existente, ou reconfigurar
-- whatsapp_integration_settings. A intenção sempre foi: só a Edge Function
-- (service_role, que já bypassa RLS) escreve; usuários autenticados só leem.
--
-- Corrigido seguindo o mesmo padrão já usado em audit_log/security_events
-- neste projeto: policy só de SELECT para `authenticated`, sem nenhuma policy
-- de INSERT/UPDATE/DELETE (GRANT ALL nas tabelas continua largo, como em
-- todas as outras tabelas do projeto — RLS é o gate real, não o GRANT).
DROP POLICY IF EXISTS "whatsapp_integration_settings_tenant_isolation" ON "public"."whatsapp_integration_settings";

CREATE POLICY "whatsapp_integration_settings_select_tenant" ON "public"."whatsapp_integration_settings"
    FOR SELECT TO "authenticated"
    USING ((("tenant_id" = public.current_tenant_id()) AND (NOT public.is_client_user())));

DROP POLICY IF EXISTS "whatsapp_messages_tenant_isolation" ON "public"."whatsapp_messages";

CREATE POLICY "whatsapp_messages_select_tenant" ON "public"."whatsapp_messages"
    FOR SELECT TO "authenticated"
    USING ((("tenant_id" = public.current_tenant_id()) AND (NOT public.is_client_user())));


-- ----------------------------------------------------------------------------
-- 2) Confiança do match de telefone → client (correção do review de código)
--
-- O match de cliente por telefone em whatsapp-webhook/phoneMatch.ts é
-- automático (sem confirmação humana), diferente da mesma estratégia em
-- ClientsPage.tsx (onde é só uma SUGESTÃO que o usuário confirma). Comparar
-- só os últimos 9 dígitos pode juntar dois clientes de DDDs diferentes com o
-- mesmo final de número, atribuindo a mensagem ao cliente errado
-- silenciosamente. Este campo guarda o nível de confiança do match feito, pra
-- a Milestone 9 (inbox) poder mostrar "cliente identificado" (exact) vs
-- "possível cliente — confirme" (partial) em vez de tratar tudo como certeza.
ALTER TABLE "public"."whatsapp_messages"
    ADD COLUMN "client_match_confidence" text;

ALTER TABLE "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_client_match_confidence_check"
    CHECK (("client_match_confidence" IS NULL) OR ("client_match_confidence" = ANY (ARRAY['exact'::text, 'partial'::text])));

-- client_id e client_match_confidence sempre andam juntos: os dois nulos (sem
-- match) ou os dois preenchidos (com match e sua confiança) — nunca um só.
ALTER TABLE "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_client_match_consistency_check"
    CHECK (("client_id" IS NULL) = ("client_match_confidence" IS NULL));

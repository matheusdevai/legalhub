-- Bug (confirmado ao vivo): auto_set_tenant_id() sempre sobrescreve
-- NEW.tenant_id com current_tenant_id() (que lê profiles por auth.uid()).
-- Sob uma conexão service-role pura, auth.uid() é NULL (o JWT de
-- service-role não tem claim `sub`), então current_tenant_id() retorna
-- NULL e a trigger levanta 'Usuário sem tenant válido ou não autenticado'
-- mesmo quando o chamador já informou um tenant_id explícito e válido
-- (ex.: Edge Function ai-gemini-assistant, que resolve o tenant do próprio
-- usuário autenticado e insere via supabaseAdmin). O mesmo padrão de
-- trigger afeta calendar_events, clients, financial_accounts, financials,
-- leads, processes, tasks e ai_generations — cron-sync-processes insere em
-- `processes` do mesmo jeito (service-role) e provavelmente sofre do mesmo
-- bug em produção, independente desta feature.
--
-- Fix: WHEN clause por trigger, sem tocar na função compartilhada
-- auto_set_tenant_id() nem no caminho normal autenticado (RLS). A trigger
-- só deixa de disparar quando auth.uid() é NULL (chamada service-role) E
-- NEW.tenant_id já veio preenchido pelo chamador — nesse único caso o
-- valor explícito é preservado como está. Em qualquer outro cenário
-- (usuário autenticado normal, ou service-role sem tenant_id explícito) o
-- comportamento é idêntico ao de hoje, incluindo o RAISE EXCEPTION quando
-- não há tenant válido.

CREATE OR REPLACE TRIGGER "trg_auto_tenant_calendar_events" BEFORE INSERT ON "public"."calendar_events" FOR EACH ROW WHEN (("auth"."uid"() IS NOT NULL) OR (NEW."tenant_id" IS NULL)) EXECUTE FUNCTION "public"."auto_set_tenant_id"();

CREATE OR REPLACE TRIGGER "trg_auto_tenant_clients" BEFORE INSERT ON "public"."clients" FOR EACH ROW WHEN (("auth"."uid"() IS NOT NULL) OR (NEW."tenant_id" IS NULL)) EXECUTE FUNCTION "public"."auto_set_tenant_id"();

CREATE OR REPLACE TRIGGER "trg_auto_tenant_financial_accounts" BEFORE INSERT ON "public"."financial_accounts" FOR EACH ROW WHEN (("auth"."uid"() IS NOT NULL) OR (NEW."tenant_id" IS NULL)) EXECUTE FUNCTION "public"."auto_set_tenant_id"();

CREATE OR REPLACE TRIGGER "trg_auto_tenant_financials" BEFORE INSERT ON "public"."financials" FOR EACH ROW WHEN (("auth"."uid"() IS NOT NULL) OR (NEW."tenant_id" IS NULL)) EXECUTE FUNCTION "public"."auto_set_tenant_id"();

CREATE OR REPLACE TRIGGER "trg_auto_tenant_leads" BEFORE INSERT ON "public"."leads" FOR EACH ROW WHEN (("auth"."uid"() IS NOT NULL) OR (NEW."tenant_id" IS NULL)) EXECUTE FUNCTION "public"."auto_set_tenant_id"();

CREATE OR REPLACE TRIGGER "trg_auto_tenant_processes" BEFORE INSERT ON "public"."processes" FOR EACH ROW WHEN (("auth"."uid"() IS NOT NULL) OR (NEW."tenant_id" IS NULL)) EXECUTE FUNCTION "public"."auto_set_tenant_id"();

CREATE OR REPLACE TRIGGER "trg_auto_tenant_tasks" BEFORE INSERT ON "public"."tasks" FOR EACH ROW WHEN (("auth"."uid"() IS NOT NULL) OR (NEW."tenant_id" IS NULL)) EXECUTE FUNCTION "public"."auto_set_tenant_id"();

CREATE OR REPLACE TRIGGER "trg_auto_tenant_ai_generations" BEFORE INSERT ON "public"."ai_generations" FOR EACH ROW WHEN (("auth"."uid"() IS NOT NULL) OR (NEW."tenant_id" IS NULL)) EXECUTE FUNCTION "public"."auto_set_tenant_id"();

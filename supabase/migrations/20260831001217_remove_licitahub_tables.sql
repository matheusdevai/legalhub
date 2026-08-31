-- Remove LicitaHub-owned tables and their dedicated helper functions/trigger.
-- Continuation of PR #2 (which removed the LicitaHub Edge Functions). LicitaHub
-- never had real production use; confirmed via repo-wide grep that no LegalHub
-- app code (src/, supabase/functions/) references any of these tables or
-- functions, and no FK constraint from a real LegalHub table points into this
-- group (verified against supabase/migrations/20260830235828_remote_schema.sql).
--
-- Drop the auth.users trigger first: it depends on lh_handle_new_user(), and
-- auth.users is outside the CASCADE scope we want for the function drops below.
DROP TRIGGER IF EXISTS "lh_on_new_user" ON "auth"."users";

-- agent_* (WhatsApp/appointment agent prototype, standalone, no FKs in or out)
DROP TABLE IF EXISTS "public"."agent_appointments" CASCADE;
DROP TABLE IF EXISTS "public"."agent_clients" CASCADE;
DROP TABLE IF EXISTS "public"."agent_escalations" CASCADE;
DROP TABLE IF EXISTS "public"."agent_messages" CASCADE;

-- lh_* (LicitaHub core: tenants/clients/licitacoes/contratos/etc.)
DROP TABLE IF EXISTS "public"."lh_certidoes" CASCADE;
DROP TABLE IF EXISTS "public"."lh_client_users" CASCADE;
DROP TABLE IF EXISTS "public"."lh_clientes" CASCADE;
DROP TABLE IF EXISTS "public"."lh_comentarios" CASCADE;
DROP TABLE IF EXISTS "public"."lh_contrato_aditivos" CASCADE;
DROP TABLE IF EXISTS "public"."lh_contratos" CASCADE;
DROP TABLE IF EXISTS "public"."lh_documentos" CASCADE;
DROP TABLE IF EXISTS "public"."lh_eventos" CASCADE;
DROP TABLE IF EXISTS "public"."lh_licitacao_anexos" CASCADE;
DROP TABLE IF EXISTS "public"."lh_licitacao_timeline" CASCADE;
DROP TABLE IF EXISTS "public"."lh_licitacoes" CASCADE;
DROP TABLE IF EXISTS "public"."lh_notificacoes" CASCADE;
DROP TABLE IF EXISTS "public"."lh_secrets" CASCADE;
DROP TABLE IF EXISTS "public"."lh_subscriptions" CASCADE;
DROP TABLE IF EXISTS "public"."lh_tenants" CASCADE;

-- pje_* (LicitaHub's PJe/tribunal integration)
DROP TABLE IF EXISTS "public"."pje_movimentacoes" CASCADE;
DROP TABLE IF EXISTS "public"."pje_partes" CASCADE;
DROP TABLE IF EXISTS "public"."pje_prazos" CASCADE;
DROP TABLE IF EXISTS "public"."pje_processos" CASCADE;
DROP TABLE IF EXISTS "public"."pje_search_queue" CASCADE;
DROP TABLE IF EXISTS "public"."pje_tribunais" CASCADE;

-- Storage RLS policies scoped to the LicitaHub 'documentos' bucket (distinct
-- from the real app's 'documents' bucket) that call the functions below.
-- These live outside the public schema, so DROP TABLE ... CASCADE above never
-- reached them; they must be dropped explicitly before the functions.
DROP POLICY IF EXISTS "docs_admin_all" ON "storage"."objects";
DROP POLICY IF EXISTS "docs_client_read" ON "storage"."objects";

-- LicitaHub-only helper/trigger functions (used exclusively by the tables above;
-- current_tenant_id()/is_client_user()/current_client_id() and other shared
-- LegalHub functions are untouched).
DROP FUNCTION IF EXISTS "public"."lh_get_client_id"();
DROP FUNCTION IF EXISTS "public"."lh_get_tenant_id"();
DROP FUNCTION IF EXISTS "public"."lh_handle_new_user"();
DROP FUNCTION IF EXISTS "public"."lh_set_updated_at"();
DROP FUNCTION IF EXISTS "public"."set_pje_queue_tenant"();
DROP FUNCTION IF EXISTS "public"."update_pje_updated_at"();

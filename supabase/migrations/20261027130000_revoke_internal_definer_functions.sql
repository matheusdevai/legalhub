-- Funções SECURITY DEFINER internas expostas via RPC (/rest/v1/rpc/...) para
-- anon e authenticated. Qualquer pessoa com a anon key (pública, vai no
-- bundle do frontend) podia, sem login:
--   - cleanup_trash()                     → apagar de vez itens da lixeira de TODOS os escritórios
--   - lawfy_generate_notifications()      → disparar notificações fora de hora
--   - lawfy_generate_recurring_items()    → materializar recorrências fora de hora
--   - lawfy_notify_clients_payment_due()  → disparar e-mails de cobrança para clientes
-- Os crons rodam como postgres (dono), e nenhum código chama essas funções
-- por RPC — só check_rate_limit, notify_user e lawfy_get_security_monitor_secret.
--
-- Funções de trigger: EXECUTE só é checado no CREATE TRIGGER, não quando o
-- trigger dispara, então revogar não muda comportamento — só tira da API.
--
-- Mantidas de propósito: current_tenant_id, current_client_id, is_admin_user,
-- is_client_user, tenant_is_active, has_role (usadas dentro de policies RLS —
-- sem EXECUTE a query do usuário falharia) e notify_user (chamada pelo app).

REVOKE EXECUTE ON FUNCTION public.cleanup_trash() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lawfy_generate_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lawfy_generate_recurring_items() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lawfy_notify_clients_payment_due() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.auto_set_tenant_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_plan_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lawfy_audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lawfy_auto_assign_task() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_tenant_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_process_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_task_calendar_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_tenant_storage_usage() FROM PUBLIC, anon, authenticated;

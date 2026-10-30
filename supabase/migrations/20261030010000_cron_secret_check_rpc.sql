-- As Edge Functions chamadas pelos crons (remind-client-payment,
-- weekly-report-email, cron-sync-processes) validavam o x-cron-secret contra
-- a env var CRON_SECRET — que nunca foi configurada no projeto, então todas
-- respondiam 401 (a sincronização das 5h falhava em silêncio). Agora validam
-- contra o mesmo segredo do Vault que os crons mandam (lawfy_cron_headers(),
-- migration 20261029120000): uma fonte só, sem env var para manter à mão.
--
-- Compara hashes SHA-256 (tamanho fixo) em vez do texto, para a comparação
-- não vazar prefixo por tempo de resposta.

CREATE OR REPLACE FUNCTION public.lawfy_cron_secret_matches(p_secret text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select extensions.digest(decrypted_secret, 'sha256') = extensions.digest(coalesce(p_secret, ''), 'sha256')
       from vault.decrypted_secrets where name = 'lawfy_cron_secret'),
    false)
$function$;

-- Só as Edge Functions (service_role) podem perguntar.
REVOKE EXECUTE ON FUNCTION public.lawfy_cron_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lawfy_cron_secret_matches(text) TO service_role;

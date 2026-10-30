-- Primeiro acesso com senha temporária: contas criadas pela equipe do LegalHub
-- (ou por um admin) nascem com must_change_password = true. Enquanto estiver
-- ligado, o app mostra só a tela de primeiro acesso (src/components/auth/
-- FirstAccessScreen.tsx), que troca a senha via supabase.auth.updateUser() e
-- depois chama complete_first_access() para salvar nome/escritório e desligar
-- a marcação.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Salva o nome da pessoa e, se ela for admin do escritório, o nome do
-- escritório (tenants não tem policy de UPDATE para usuários — é por aqui que o
-- nome é definido no primeiro acesso). Só mexe no próprio perfil/escritório.
CREATE OR REPLACE FUNCTION public.complete_first_access(p_name text, p_office_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_tenant uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_office text := nullif(trim(coalesce(p_office_name, '')), '');
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select role, tenant_id into v_role, v_tenant from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Perfil não encontrado' using errcode = 'P0002';
  end if;

  if v_office is not null and v_role = 'admin' and v_tenant is not null then
    if length(v_office) > 120 then
      raise exception 'Nome do escritório muito longo' using errcode = '22001';
    end if;
    update public.tenants set name = v_office where id = v_tenant;
  end if;

  update public.profiles
     set name = coalesce(v_name, name),
         display_name = coalesce(v_name, display_name),
         must_change_password = false
   where id = v_uid;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_first_access(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_first_access(text, text) TO authenticated;

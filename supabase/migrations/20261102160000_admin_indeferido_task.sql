-- Administrativo indeferido → tarefa "PROTOCOLAR JFPB - <CLIENTE>" em Atividades,
-- para judicializar. Um por processo: se já existe (não excluída), não cria outra,
-- nem quando a situação vai e volta para indeferido.
-- A description leva o prefixo client_id:<uuid> | que requestComplete() (TasksPage)
-- lê para abrir "criar processo" com o cliente já escolhido ao concluir a tarefa.
-- Sem responsável: trg_auto_assign_task distribui e notifica.
create or replace function public.processes_indeferido_task()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_client_name text;
  v_title text;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.admin_status is distinct from 'indeferido'
     or new.modalidade is distinct from 'administrativo'
     or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.admin_status is not distinct from 'indeferido' then
    return new;
  end if;

  v_client_name := coalesce(
    nullif(btrim(new.client_name), ''),
    (select c.name from clients c where c.id = new.client_id),
    'CLIENTE'
  );
  v_title := 'PROTOCOLAR JFPB - ' || upper(v_client_name);

  if exists (
    select 1 from tasks t
     where t.process_id = new.id
       and t.title like 'PROTOCOLAR JFPB - %'
       and t.deleted_at is null
  ) then
    return new;
  end if;

  insert into tasks (tenant_id, title, description, process_id, client_id, due_date, priority, status, type, created_by)
  values (
    new.tenant_id,
    v_title,
    case when new.client_id is not null then 'client_id:' || new.client_id || ' | ' else '' end
      || 'Requerimento ' || coalesce(nullif(btrim(new.numero_protocolo), ''), 's/ nº')
      || coalesce(' (' || nullif(btrim(new.type), '') || ')', '')
      || ' indeferido em ' || to_char(v_today, 'DD/MM/YYYY')
      || '. Protocolar a ação na Justiça Federal (JFPB).',
    new.id,
    new.client_id,
    v_today + 7,
    'high',
    'pending',
    'custom',
    auth.uid()
  );
  return new;
end;
$$;

revoke execute on function public.processes_indeferido_task() from public, anon, authenticated;

drop trigger if exists trg_processes_indeferido_task on public.processes;
create trigger trg_processes_indeferido_task
  after insert or update of admin_status on public.processes
  for each row execute function public.processes_indeferido_task();

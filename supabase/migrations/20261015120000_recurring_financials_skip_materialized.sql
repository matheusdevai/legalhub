-- Planilha do Financeiro: recorrências pagas/editadas antes do vencimento.
--
-- A planilha (FinancialsPage → FinancialSheet) mostra as ocorrências futuras
-- de cada template recorrente e permite marcar como paga / editar uma delas
-- antes do cron gerá-la — nesse momento o front grava a ocorrência real
-- (generated_from_id = template.id, due_date = data da ocorrência). Duas
-- mudanças no cron para isso não duplicar nada:
--
-- 1. Antes de inserir a ocorrência de `f.due_date`, verifica se ela já existe
--    (gravada adiantada pela planilha). Se existir, só avança o template.
-- 2. Ao passar do fim da recorrência, o template passa a ser soft-deleted além
--    de `recurring = false`. Antes ele ficava como um lançamento comum no
--    mesmo dia da última ocorrência gerada — duplicando o último mês.
--
-- Parte de tarefas recorrentes: inalterada.

CREATE OR REPLACE FUNCTION public.lawfy_generate_recurring_items()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t record;
  f record;
  next_due date;
begin
  -- Inserir uma tarefa dispara trg_sync_task_calendar_event, que insere em
  -- calendar_events — cujo trg_auto_tenant_calendar_events também exige sessão
  -- autenticada. Desabilitamos os três triggers de tenant durante o batch.
  alter table public.tasks disable trigger trg_auto_tenant_tasks;
  alter table public.financials disable trigger trg_auto_tenant_financials;
  alter table public.calendar_events disable trigger trg_auto_tenant_calendar_events;

  -- Tarefas recorrentes
  for t in
    select * from public.tasks
    where recurring = true and deleted_at is null and due_date is not null and due_date <= current_date
  loop
    insert into public.tasks (
      tenant_id, title, description, process_id, assigned_to, assigned_name,
      due_date, priority, status, type, client_id, location, all_day, generated_from_id
    ) values (
      t.tenant_id, t.title, t.description, t.process_id, t.assigned_to, t.assigned_name,
      t.due_date, t.priority, 'pending', t.type, t.client_id, t.location, t.all_day, t.id
    );

    next_due := case t.recurrence_interval
      when 'weekly'  then t.due_date + interval '7 days'
      when 'monthly' then t.due_date + interval '1 month'
      when 'yearly'  then t.due_date + interval '1 year'
      else t.due_date + interval '1 month'
    end;

    if t.recurrence_end_date is not null and next_due > t.recurrence_end_date then
      update public.tasks set recurring = false where id = t.id;
    else
      update public.tasks set due_date = next_due where id = t.id;
    end if;
  end loop;

  -- Lançamentos financeiros recorrentes
  for f in
    select * from public.financials
    where recurring = true and deleted_at is null and due_date is not null and due_date <= current_date
  loop
    if not exists (
      select 1 from public.financials c
      where c.generated_from_id = f.id and c.due_date = f.due_date and c.deleted_at is null
    ) then
      insert into public.financials (
        tenant_id, type, category, description, amount, due_date, status,
        client_id, client_name, process_id, process_number, notes, account_id, generated_from_id
      ) values (
        f.tenant_id, f.type, f.category, f.description, f.amount, f.due_date, 'pending',
        f.client_id, f.client_name, f.process_id, f.process_number, f.notes, f.account_id, f.id
      );
    end if;

    next_due := case f.recurrence_interval
      when 'weekly'  then f.due_date + interval '7 days'
      when 'monthly' then f.due_date + interval '1 month'
      when 'yearly'  then f.due_date + interval '1 year'
      else f.due_date + interval '1 month'
    end;

    if f.recurrence_end_date is not null and next_due > f.recurrence_end_date then
      update public.financials set recurring = false, deleted_at = now() where id = f.id;
    else
      update public.financials set due_date = next_due where id = f.id;
    end if;
  end loop;

  alter table public.tasks enable trigger trg_auto_tenant_tasks;
  alter table public.financials enable trigger trg_auto_tenant_financials;
  alter table public.calendar_events enable trigger trg_auto_tenant_calendar_events;
exception when others then
  alter table public.tasks enable trigger trg_auto_tenant_tasks;
  alter table public.financials enable trigger trg_auto_tenant_financials;
  alter table public.calendar_events enable trigger trg_auto_tenant_calendar_events;
  raise;
end;
$function$;

-- Limpeza dos templates já encerrados que ficaram duplicando a última
-- ocorrência (encerrados pelo cron antigo): soft-delete, nada é apagado.
update public.financials t
set deleted_at = now()
where coalesce(t.recurring, false) = false
  and t.recurrence_interval is not null
  and t.deleted_at is null
  and exists (
    select 1 from public.financials c
    where c.generated_from_id = t.id and c.due_date = t.due_date and c.deleted_at is null
  );

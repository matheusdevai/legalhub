-- Situação do processo administrativo (INSS e afins): em análise, em exigência,
-- deferido ou indeferido. Processo judicial não usa — o andamento dele vem da
-- sincronização (CNJ/DJEN).
alter table public.processes
  add column if not exists admin_status text
    check (admin_status in ('em_analise', 'em_exigencia', 'deferido', 'indeferido')),
  add column if not exists admin_status_at date;

comment on column public.processes.admin_status is
  'Situação do processo administrativo: em_analise | em_exigencia | deferido | indeferido. Nulo = ainda não informada.';
comment on column public.processes.admin_status_at is
  'Dia (Brasília) em que a situação administrativa mudou pela última vez — mantido pelo trigger processes_admin_status_stamp.';

-- Mantém admin_status_at e, no cadastro de um administrativo já protocolado,
-- começa como "em análise" (é a situação de todo requerimento recém-protocolado).
create or replace function public.processes_admin_status_stamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.admin_status is null
       and new.modalidade = 'administrativo'
       and coalesce(btrim(new.numero_protocolo), '') <> '' then
      new.admin_status := 'em_analise';
    end if;
    if new.admin_status is not null and new.admin_status_at is null then
      new.admin_status_at := (now() at time zone 'America/Sao_Paulo')::date;
    end if;
  elsif new.admin_status is distinct from old.admin_status
        and new.admin_status_at is not distinct from old.admin_status_at then
    new.admin_status_at := case when new.admin_status is null then null
                                else (now() at time zone 'America/Sao_Paulo')::date end;
  end if;
  return new;
end;
$$;

revoke execute on function public.processes_admin_status_stamp() from public, anon, authenticated;

drop trigger if exists trg_processes_admin_status_stamp on public.processes;
create trigger trg_processes_admin_status_stamp
  before insert or update of admin_status, admin_status_at on public.processes
  for each row execute function public.processes_admin_status_stamp();

-- Já encerrados: ganho = deferido, perdido = indeferido. Os ativos ficam sem
-- situação (o escritório informa) — não dá para adivinhar quem está em exigência.
update public.processes
   set admin_status = case status when 'won' then 'deferido' else 'indeferido' end,
       admin_status_at = coalesce(updated_at at time zone 'America/Sao_Paulo', now() at time zone 'America/Sao_Paulo')::date
 where modalidade = 'administrativo'
   and admin_status is null
   and status in ('won', 'lost')
   and deleted_at is null;

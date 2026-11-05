-- ============================================================================
-- Sincronização OAB — correções (05/11/2026)
--
-- 1. processes.number_digits: número só em dígitos, para a sincronização achar
--    o processo cadastrado à mão com máscara. A busca antiga, por texto exato,
--    criava uma cópia sem cliente para receber as intimações (31 casos).
-- 2. profiles.oab_inscricoes: inscrições suplementares (outros estados). O DJEN
--    filtra pela UF da INSCRIÇÃO — sem isso, quem atua noutro estado com outra
--    inscrição só via os processos da inscrição principal.
-- 3. oab_sync_runs: registro de cada sincronização (tela + suporte).
-- 4. processes.datajud_checked_at: controle do complemento pelo DataJud.
-- 5. Funde as cópias criadas pela sincronização no processo cadastrado à mão.
-- 6. Cron: uma requisição por advogado (a execução única morria em 150 s).
-- ============================================================================

-- 1 ─ número só em dígitos
alter table public.processes
  add column if not exists number_digits text
  generated always as (regexp_replace(coalesce(number, ''), '\D', '', 'g')) stored;
create index if not exists processes_tenant_number_digits_idx
  on public.processes (tenant_id, number_digits) where deleted_at is null;

-- 4 ─ complemento DataJud
alter table public.processes add column if not exists datajud_checked_at timestamptz;

-- 2 ─ inscrições suplementares: [{ "numero": "12345", "uf": "PE" }, ...]
alter table public.profiles
  add column if not exists oab_inscricoes jsonb not null default '[]'::jsonb;
do $$ begin
  alter table public.profiles add constraint profiles_oab_inscricoes_array
    check (jsonb_typeof(oab_inscricoes) = 'array' and jsonb_array_length(oab_inscricoes) <= 10);
exception when duplicate_object then null; end $$;
comment on column public.profiles.oab_inscricoes is
  'Inscrições suplementares na OAB [{numero, uf}] — a sincronização DJEN consulta a principal (oab_number/oab_seccional) e todas estas.';

-- 3 ─ registro das sincronizações
create table if not exists public.oab_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  trigger text not null check (trigger in ('manual', 'cron', 'onboarding')),
  source text not null default 'djen',
  inscricoes text[] not null default '{}',
  period_start date,
  period_end date,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  found integer not null default 0,
  imported integer not null default 0,
  updated integer not null default 0,
  truncated boolean not null default false,
  skipped_plan_limit integer not null default 0,
  detail jsonb,
  errors jsonb
);
create index if not exists oab_sync_runs_user_idx on public.oab_sync_runs (user_id, started_at desc);
create index if not exists oab_sync_runs_tenant_idx on public.oab_sync_runs (tenant_id, started_at desc);
alter table public.oab_sync_runs enable row level security;
-- Só leitura pelo app (quem grava é a Edge Function, com service role): o
-- próprio advogado vê as dele; admin vê as do escritório.
drop policy if exists oab_sync_runs_select on public.oab_sync_runs;
create policy oab_sync_runs_select on public.oab_sync_runs for select to authenticated
  using (tenant_id = public.current_tenant_id() and (user_id = auth.uid() or public.is_admin_user()));

-- 5 ─ funde as cópias da sincronização no processo cadastrado à mão.
-- Só quando é inequívoco: exatamente 1 processo manual (cnj_source = false) com
-- aquele número e a(s) cópia(s) sem nada ligado a elas (tarefa, prazo,
-- intimação triada, documento, financeiro, agenda, andamento). As intimações
-- passam para o processo manual e a cópia vai para a lixeira (soft-delete).
do $$
declare
  g record;
  merged jsonb;
begin
  for g in
    with d as (
      select tenant_id, number_digits n
        from public.processes
       where deleted_at is null and number_digits <> ''
       group by 1, 2
      having count(*) filter (where not coalesce(cnj_source, false)) = 1
         and count(*) filter (where coalesce(cnj_source, false)) >= 1
    )
    select d.tenant_id, d.n,
           (select id from public.processes p where p.tenant_id = d.tenant_id and p.number_digits = d.n
              and p.deleted_at is null and not coalesce(p.cnj_source, false)) keep_id,
           array(select id from public.processes p where p.tenant_id = d.tenant_id and p.number_digits = d.n
              and p.deleted_at is null and coalesce(p.cnj_source, false)) dup_ids
      from d
  loop
    if exists (select 1 from public.tasks where process_id = any(g.dup_ids))
       or exists (select 1 from public.deadlines where process_id = any(g.dup_ids))
       or exists (select 1 from public.communications where process_id = any(g.dup_ids))
       or exists (select 1 from public.documents where process_id = any(g.dup_ids))
       or exists (select 1 from public.financials where process_id = any(g.dup_ids))
       or exists (select 1 from public.calendar_events where process_id = any(g.dup_ids))
       or exists (select 1 from public.process_updates where process_id = any(g.dup_ids)) then
      continue;
    end if;

    -- União dos movimentos sem repetir (mesma comunicação do DJEN = mesmo id).
    select coalesce(jsonb_agg(m order by ord), '[]'::jsonb) into merged from (
      select distinct on (k) m, ord from (
        select m, ord,
               coalesce(case when m->>'fonte' = 'pje' then 'pje:' || coalesce(m->>'idComunicacao', m->>'hash') end,
                        'x:' || md5(m::text)) k
          from (
            select e.m, (src.o * 100000 + e.i) ord
              from (select 0 o, id from public.processes where id = g.keep_id
                    union all select 1, unnest(g.dup_ids)) src
              join public.processes p on p.id = src.id
             cross join lateral jsonb_array_elements(coalesce(p.movimentos, '[]'::jsonb)) with ordinality e(m, i)
          ) x
      ) y order by k, ord
    ) z;

    update public.processes
       set movimentos = case when jsonb_array_length(merged) > 0 then merged else movimentos end,
           cnj_synced_at = coalesce((select max(cnj_synced_at) from public.processes where id = any(g.dup_ids)), cnj_synced_at)
     where id = g.keep_id;

    update public.processes set deleted_at = now() where id = any(g.dup_ids);
  end loop;
end $$;

-- 6 ─ disparo do cron: uma requisição por advogado com OAB (uma por OAB por
-- escritório — dois usuários com a mesma OAB no mesmo escritório não duplicam).
create or replace function public.lawfy_dispatch_oab_sync()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select distinct on (p.tenant_id, ltrim(regexp_replace(coalesce(p.oab_number, ''), '\D', '', 'g'), '0'), upper(coalesce(p.oab_seccional, '')))
           p.user_id
      from public.profiles p
     where p.role <> 'client' and p.tenant_id is not null
       and ((coalesce(p.oab_number, '') <> '' and coalesce(p.oab_seccional, '') <> '') or jsonb_array_length(p.oab_inscricoes) > 0)
     order by p.tenant_id, ltrim(regexp_replace(coalesce(p.oab_number, ''), '\D', '', 'g'), '0'), upper(coalesce(p.oab_seccional, '')), p.created_at
  loop
    -- x-region: a API do DJEN (CNJ) responde 403 a chamadas de fora do Brasil
    -- (verificado em 05/11/2026); sem isso a Edge Function roda na região do
    -- banco e o cron nunca consegue consultar — só a sincronização manual, feita
    -- do navegador no Brasil, funcionava.
    perform net.http_post(
      url := 'https://bdpkkacfsavmpumwftsf.supabase.co/functions/v1/cron-sync-processes',
      headers := public.lawfy_cron_headers() || jsonb_build_object('x-region', 'sa-east-1'),
      body := jsonb_build_object('user_id', r.user_id),
      timeout_milliseconds := 150000
    );
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.lawfy_dispatch_oab_sync() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('lawfy-sync-processos-oab');
exception when others then null; end $$;
select cron.schedule('lawfy-sync-processos-oab', '0 5 * * *', $$ select public.lawfy_dispatch_oab_sync(); $$);

-- 7 ─ marca as execuções que cobriram (quase) um ano: o cron dá o ano inteiro
-- a quem ainda não teve nenhuma completa (advogado novo que não abriu a tela).
alter table public.oab_sync_runs
  add column if not exists full_backfill boolean
  generated always as (coalesce(period_end - period_start >= 300, false)) stored;

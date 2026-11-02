-- "Novidades" para os usuários: system_announcements passa a ser exibido no app
-- (antes só era cadastrado no painel do super_admin e não aparecia para ninguém).
-- Ver src/lib/announcements.ts (quem vê o quê) e WhatsNewModal no Layout.

alter table public.system_announcements
  add column if not exists category text not null default 'novidade'
    check (category in ('novidade', 'aviso')),
  add column if not exists link text,
  add column if not exists link_label text,
  -- Papéis que veem (nulo = toda a equipe do escritório; portal do cliente nunca vê).
  add column if not exists audience_roles text[],
  -- Recurso que o escritório precisa ter ligado (ex.: 'prazos' = deadline_settings.enabled).
  add column if not exists requires_feature text check (requires_feature in ('prazos')),
  add column if not exists published_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz;

update public.system_announcements set published_at = coalesce(created_at, now()) where published_at > coalesce(created_at, now());

-- O único aviso existente ("Bem-vindo ao Lawfy!", maio/2026) usa o nome antigo da marca:
-- encerrado em vez de publicado para todos.
update public.system_announcements set expires_at = now()
 where title like 'Bem-vindo ao Lawfy%' and expires_at is null;

-- Segurança: antes qualquer um (até sem login) podia INSERIR anúncio, e a leitura era
-- pública. Agora: equipe logada lê o que está publicado; só super_admin escreve.
drop policy if exists announcements_insert_admin on public.system_announcements;
drop policy if exists announcements_select_all on public.system_announcements;

create policy announcements_select_published on public.system_announcements
  for select to authenticated
  using (
    published_at <= now()
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'super_admin')
  );

create policy announcements_write_super_admin on public.system_announcements
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'super_admin'));

-- Quem já leu cada novidade (uma linha por usuário e anúncio).
create table if not exists public.announcement_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  announcement_id uuid not null references public.system_announcements(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

alter table public.announcement_reads enable row level security;

create policy announcement_reads_own on public.announcement_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Novidades já entregues hoje (02/11/2026).
insert into public.system_announcements (title, message, type, category, link, link_label, published_at)
values
  ('Situação dos processos administrativos',
   'Na tela de Processos, a nova aba "Administrativos" mostra em cada linha se o requerimento está em análise, em exigência, deferido ou indeferido. Troque a situação clicando no selo. Em exigência, informe o prazo de cumprimento: ele vira tarefa e entra na Agenda. A tela avisa quando a exigência está vencendo ou quando a análise passa de 90 dias.',
   'info', 'novidade', '/processos', 'Ver processos', now()),
  ('Indeferido? A tarefa de protocolar na JFPB já é criada',
   'Ao marcar um processo administrativo como indeferido, o sistema cria em Atividades a tarefa "PROTOCOLAR JFPB - NOME DO CLIENTE", com prioridade alta e prazo de 7 dias. Ao concluí-la, o cadastro do processo judicial já vem com o cliente preenchido.',
   'success', 'novidade', '/tarefas', 'Ver atividades', now());

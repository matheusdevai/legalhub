-- Agenda: integração com Outlook / Hotmail (Microsoft Graph), ao lado do Google.
-- outlook_event_id = id do evento no calendário do Outlook do usuário. Único por
-- usuário entre os eventos ativos: importar duas vezes nunca duplica.
alter table public.calendar_events add column if not exists outlook_event_id text;
alter table public.calendar_events add column if not exists sync_outlook boolean not null default false;
create unique index if not exists calendar_events_user_outlook_uniq
  on public.calendar_events (user_id, outlook_event_id)
  where outlook_event_id is not null and deleted_at is null;

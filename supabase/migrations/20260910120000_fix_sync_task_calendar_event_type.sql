-- Corrige sync_task_calendar_event(): o trigger gravava sempre type='task' em
-- calendar_events, ignorando o type real da task de origem. Isso fazia, por
-- exemplo, uma task type='deadline' (como as tarefas de prazo criadas a partir
-- de uma intimação em PublicacoesPage.tsx) aparecer na Agenda como "Tarefa"
-- genérica (verde) em vez de "Prazo" (laranja) — perdendo a categorização.
--
-- tasks.type aceita ('deadline'|'hearing'|'document'|'meeting'|'custom'), mas
-- calendar_events.type só aceita ('hearing'|'deadline'|'meeting'|'task') via
-- CHECK constraint (calendar_events_type_check). Por isso o mapeamento abaixo:
-- propaga o type da task quando ele é um dos aceitos por calendar_events, e
-- cai em 'task' como fallback seguro nos demais casos (document, custom, ou
-- type nulo) — nunca deixa o INSERT/UPDATE violar o CHECK. Para tasks comuns
-- (a maioria, sem type ou com type='document'/'custom'), o comportamento fica
-- idêntico ao de antes (sempre 'task') — só tasks com type já compatível com
-- calendar_events passam a ser corretamente categorizadas.
--
-- Também adiciona `type = excluded.type` no ON CONFLICT DO UPDATE, que faltava
-- (o UPDATE de um evento já existente nunca atualizava o type, só title/date/
-- description/user_id/tenant_id/deleted_at).
CREATE OR REPLACE FUNCTION "public"."sync_task_calendar_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  mapped_type text;
begin
  mapped_type := case when NEW.type in ('hearing', 'deadline', 'meeting') then NEW.type else 'task' end;

  if NEW.due_date is not null and NEW.status not in ('done','cancelled') and NEW.deleted_at is null and NEW.assigned_to is not null then
    insert into calendar_events (tenant_id, title, type, date, description, status, user_id, task_id, deleted_at)
    values (NEW.tenant_id, NEW.title, mapped_type, NEW.due_date, NEW.description, 'scheduled', NEW.assigned_to, NEW.id, null)
    on conflict (task_id) where task_id is not null do update set
      title = excluded.title,
      type = excluded.type,
      date = excluded.date,
      description = excluded.description,
      user_id = excluded.user_id,
      tenant_id = excluded.tenant_id,
      deleted_at = null;
  else
    update calendar_events set deleted_at = now() where task_id = NEW.id and deleted_at is null;
  end if;
  return NEW;
end;
$$;

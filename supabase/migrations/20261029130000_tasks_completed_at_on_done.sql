-- tasks.completed_at só era preenchido por markTaskDone() (src/lib/taskActions.ts).
-- Concluir pelo formulário de edição (status → 'done') deixava completed_at
-- nulo, e o painel contava conclusões por updated_at — qualquer edição numa
-- tarefa já concluída a fazia reaparecer como "concluída hoje".
-- Agora o banco garante completed_at sempre que a tarefa vira 'done' (e limpa
-- se ela for reaberta), e o painel conta por completed_at.

CREATE OR REPLACE FUNCTION public.set_task_completed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status is distinct from 'done' and tg_op = 'UPDATE' and old.status = 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$function$;

-- Função de trigger: não precisa ficar exposta via RPC (ver 20261027130000).
REVOKE EXECUTE ON FUNCTION public.set_task_completed_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_task_completed_at ON public.tasks;
CREATE TRIGGER trg_set_task_completed_at
  BEFORE INSERT OR UPDATE OF status, completed_at ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_completed_at();

-- Retroativo: tarefas concluídas sem completed_at recebem a melhor estimativa
-- disponível (última alteração). Sem disparar triggers, para não mexer em
-- updated_at nem gerar auditoria/sincronização de agenda à toa.
SET LOCAL session_replication_role = replica;
UPDATE public.tasks SET completed_at = updated_at
 WHERE status = 'done' AND completed_at IS NULL;
SET LOCAL session_replication_role = origin;

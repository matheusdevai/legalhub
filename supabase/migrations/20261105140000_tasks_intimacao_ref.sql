-- Tarefa de prazo criada na tela Intimações ligada à intimação de origem.
-- Antes o vínculo ficava só no localStorage do navegador (por posição do
-- movimento): sumia em outro computador e podia apontar para a intimação
-- errada quando a lista de movimentos mudava. Formato: 'djen:<idComunicacao>'
-- (ou 'djen:h:<hash>' / 'mov:<process_id>:<índice>' quando não há id).
alter table public.tasks add column if not exists intimacao_ref text;

-- Uma tarefa ativa por intimação no escritório (protege contra duplo clique).
create unique index if not exists tasks_intimacao_ref_uniq
  on public.tasks (tenant_id, intimacao_ref)
  where intimacao_ref is not null and deleted_at is null;

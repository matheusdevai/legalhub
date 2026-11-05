-- Novidades (regra do projeto: toda funcionalidade entregue ganha uma).
-- A do Outlook/Hotmail NÃO entra aqui: só depois de configurado o app na
-- Microsoft (VITE_MS_CLIENT_ID) — publicar pelo painel Admin → Novidades.
-- Em produção foram gravadas com published_at = now() + 2 dias (agendadas),
-- porque o frontend ainda não tinha sido publicado: ao publicar, ajustar a
-- data no painel Admin para não anunciar antes da tela existir.
insert into public.system_announcements (title, message, type, category, link, link_label, published_at)
values
  ('Processos de todos os tribunais pela sua OAB',
   'A sincronização pela OAB agora busca suas intimações do último ano em todos os tribunais do país que publicam no Diário de Justiça Eletrônico Nacional — estaduais, federais e do trabalho, inclusive de outros estados. Advoga com inscrição suplementar? Cadastre-a em "Sincronizar via OAB" para trazer também esses processos. Intimações de processos que você já tinha cadastrado agora vão para o próprio processo, sem criar cópia.',
   'success', 'novidade', '/processos', 'Sincronizar agora', now() + interval '2 days'),
  ('Prazo da intimação com feriados, recesso e responsável',
   'Em Intimações, "Criar tarefa de prazo" agora conta a partir da publicação (dia útil seguinte à disponibilização), considera feriados nacionais, o recesso de 20/12 a 20/01 e o calendário do tribunal, e sugere a regra certa para cada tipo de processo (cível, juizado, trabalhista ou penal). Escolha quem é o responsável — ele é avisado e o prazo entra na Agenda dele. Dá para trocar ou remover o responsável depois, direto na intimação.',
   'info', 'novidade', '/publicacoes', 'Ver intimações', now() + interval '2 days');

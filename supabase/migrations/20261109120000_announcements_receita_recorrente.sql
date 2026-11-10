-- Novidade (regra do projeto: toda funcionalidade entregue ganha uma):
-- cadastro de Receita recorrente em Financeiro → Recorrentes.
-- Para toda a equipe do escritório (audience_roles nulo, como as demais novidades;
-- o portal do cliente nunca vê). Idempotente: não duplica se a migration rodar de novo.
-- Se for aplicada antes do deploy do frontend, ajustar published_at no painel
-- Admin → Novidades para não anunciar antes de a tela existir.
insert into public.system_announcements (title, message, type, category, link, link_label, published_at)
select
  'Receitas recorrentes no Financeiro',
  'Em Financeiro → Recorrentes, o novo botão "Receita recorrente" cadastra honorários mensais de clientes e outras entradas fixas. Elas aparecem previstas nos meses seguintes e, quando o pagamento chegar, basta clicar no mês para marcar como recebida.',
  'success', 'novidade', '/financeiro', 'Ver Financeiro', now()
where not exists (
  select 1 from public.system_announcements where title = 'Receitas recorrentes no Financeiro'
);

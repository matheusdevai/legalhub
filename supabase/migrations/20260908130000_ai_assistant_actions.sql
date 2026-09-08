-- LegalHub Assistente (milestone 3): primeira capacidade de ESCRITA da IA —
-- propor criação de tarefa/lembrete, sempre com confirmação explícita do
-- usuário. Estende ai_assistant_logs (mesma tabela da milestone 2, ver
-- 20260908120000_ai_assistant_logs.sql) em vez de criar tabela nova: já tem
-- o isolamento por tenant+dono aprovado naquela migration e o objetivo aqui
-- é só distinguir 3 momentos da MESMA jornada (proposta -> confirmação ou
-- cancelamento), não um domínio de dado novo.
--
-- Cada clique gera uma linha própria (a Edge Function nunca faz UPDATE numa
-- linha 'proposed' já existente): a linha da proposta permanece com status
-- 'proposed' para sempre, e uma segunda linha é inserida com status
-- 'confirmed'/'cancelled'/'error', apontando de volta via related_log_id.
-- Isso preserva o histórico de auditoria completo (inclusive propostas que o
-- usuário nunca confirmou nem cancelou) em vez de perder o estado anterior.

ALTER TABLE "public"."ai_assistant_logs"
  ADD COLUMN "action_type" "text",
  ADD COLUMN "action_payload" "jsonb",
  ADD COLUMN "related_log_id" "uuid",
  ADD COLUMN "created_task_id" "uuid";

ALTER TABLE ONLY "public"."ai_assistant_logs"
  ADD CONSTRAINT "ai_assistant_logs_action_type_check"
  CHECK (("action_type" IS NULL) OR ("action_type" = ANY (ARRAY['criar_tarefa'::"text", 'criar_lembrete'::"text"])));

ALTER TABLE ONLY "public"."ai_assistant_logs"
  ADD CONSTRAINT "ai_assistant_logs_related_log_id_fkey"
  FOREIGN KEY ("related_log_id") REFERENCES "public"."ai_assistant_logs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."ai_assistant_logs"
  ADD CONSTRAINT "ai_assistant_logs_created_task_id_fkey"
  FOREIGN KEY ("created_task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;

-- 'action' = linha gerada pela chamada separada de confirmação/cancelamento
-- (nunca pelo turno de chat com o Gemini).
ALTER TABLE "public"."ai_assistant_logs" DROP CONSTRAINT "ai_assistant_logs_channel_check";
ALTER TABLE ONLY "public"."ai_assistant_logs"
  ADD CONSTRAINT "ai_assistant_logs_channel_check"
  CHECK (("channel" = ANY (ARRAY['chat'::"text", 'slash_command'::"text", 'action'::"text"])));

-- 'proposed' = ação de escrita proposta pelo modelo, ainda não decidida.
-- 'confirmed'/'cancelled' = decisão do usuário sobre uma proposta.
ALTER TABLE "public"."ai_assistant_logs" DROP CONSTRAINT "ai_assistant_logs_status_check";
ALTER TABLE ONLY "public"."ai_assistant_logs"
  ADD CONSTRAINT "ai_assistant_logs_status_check"
  CHECK (("status" = ANY (ARRAY['completed'::"text", 'error'::"text", 'proposed'::"text", 'confirmed'::"text", 'cancelled'::"text"])));

CREATE INDEX "idx_ai_assistant_logs_related_log_id" ON "public"."ai_assistant_logs" USING "btree" ("related_log_id");

-- RLS: nenhuma policy nova necessária. A policy de SELECT já existente
-- (ai_assistant_logs_select_own_or_admin — dono ou admin/super_admin do
-- tenant, ver migration da milestone 2) cobre as colunas e os valores novos
-- sem precisar de alteração: mesmo padrão de isolamento por dono+tenant já
-- auditado. Continua sem policy de INSERT/UPDATE/DELETE para
-- `authenticated` — toda escrita (proposta, confirmação e cancelamento) é
-- feita pela Edge Function via service role, que bypassa RLS.

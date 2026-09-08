-- LegalHub Assistente (milestone 2/N): registro de cada pergunta respondida
-- pelo chat interno (linguagem natural ou comando de barra).
--
-- `audit_log` (ver 20260830235828_remote_schema.sql) foi avaliada e descartada
-- para este caso de uso: seu CHECK constraint só aceita action IN
-- ('create','update','delete') — uma pergunta ao assistente não é nenhuma das
-- três — e seu entity_id é NOT NULL amarrado a uma entidade de negócio
-- específica (cliente/processo/tarefa), o que não existe para "usuário
-- perguntou algo". Além disso audit_log_select_admin só permite leitura para
-- admin/super_admin; aqui queremos poder no futuro deixar o próprio usuário
-- ver seu histórico. Por isso uma tabela nova, seguindo o mesmo padrão de
-- isolamento por tenant de ai_generations.sql (RLS desde o primeiro commit).

CREATE TABLE IF NOT EXISTS "public"."ai_assistant_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."current_tenant_id"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL DEFAULT 'chat',
    "question" "text" NOT NULL,
    "slash_command" "text",
    "tools_called" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "answer" "text",
    "status" "text" DEFAULT 'completed' NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_assistant_logs_channel_check" CHECK (("channel" = ANY (ARRAY['chat'::"text", 'slash_command'::"text"]))),
    CONSTRAINT "ai_assistant_logs_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'error'::"text"])))
);

ALTER TABLE "public"."ai_assistant_logs" OWNER TO "postgres";

ALTER TABLE ONLY "public"."ai_assistant_logs"
    ADD CONSTRAINT "ai_assistant_logs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."ai_assistant_logs"
    ADD CONSTRAINT "ai_assistant_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE INDEX "idx_ai_assistant_logs_tenant_created" ON "public"."ai_assistant_logs" USING "btree" ("tenant_id", "created_at" DESC);

CREATE INDEX "idx_ai_assistant_logs_user" ON "public"."ai_assistant_logs" USING "btree" ("user_id");

CREATE OR REPLACE TRIGGER "trg_auto_tenant_ai_assistant_logs" BEFORE INSERT ON "public"."ai_assistant_logs" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();

ALTER TABLE "public"."ai_assistant_logs" ENABLE ROW LEVEL SECURITY;

-- Isolamento por tenant NÃO É SUFICIENTE aqui: a linha de log pode conter,
-- em `question`/`answer`, dado de tarefa que `consultar_tarefas` já filtrou
-- por dono (lawyer/intern só veem as próprias tarefas — ver tools.ts). Se
-- qualquer usuário do tenant pudesse ler todas as linhas, esse filtro de
-- role seria anulado pelo próprio log. Por isso, igual ao padrão de
-- `user_expenses` (isolamento por tenant E por dono, ver CLAUDE.md):
-- usuário comum só lê as PRÓPRIAS linhas; admin/super_admin leem todas as
-- linhas do tenant (mesmo padrão de "audit_log_select_admin").
--
-- Só existe policy de SELECT — de propósito. A Edge Function grava via
-- service role, que bypassa RLS, então nenhuma policy de INSERT é necessária
-- para `authenticated`. Não há policy de UPDATE/DELETE: log de auditoria é
-- append-only, ninguém (nem admin) deve poder alterar ou apagar uma linha
-- pela API.
CREATE POLICY "ai_assistant_logs_select_own_or_admin" ON "public"."ai_assistant_logs" FOR SELECT TO "authenticated" USING (
  ("tenant_id" = "public"."current_tenant_id"())
  AND (NOT "public"."is_client_user"())
  AND (
    "user_id" = ( SELECT "auth"."uid"() )
    OR EXISTS ( SELECT 1 FROM "public"."profiles" "p"
      WHERE ("p"."user_id" = ( SELECT "auth"."uid"() )) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) )
  )
);

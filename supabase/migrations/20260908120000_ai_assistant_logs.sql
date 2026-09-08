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

-- Mesmo padrão de "ai_generations_tenant_isolation": isolamento total por
-- tenant_id, sem acesso do portal do cliente. A Edge Function grava via
-- service role (bypassa RLS); esta policy cobre leitura futura pela própria
-- UI (ex.: um admin revisando o uso do assistente no tenant).
CREATE POLICY "ai_assistant_logs_tenant_isolation" ON "public"."ai_assistant_logs" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));

GRANT ALL ON TABLE "public"."ai_assistant_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_assistant_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_assistant_logs" TO "service_role";

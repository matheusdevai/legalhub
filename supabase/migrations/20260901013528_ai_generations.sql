-- IA Jurídica (foundation, fase 1/4): tabela compartilhada onde o Edge
-- Function ai-gemini-assistant grava toda geração de IA (análise, parecer,
-- petição, etc.), independente do `tipo`. Fase 2 preenche os prompts reais
-- por `tipo`; esta migration só estabelece o contrato de dados.

CREATE TABLE IF NOT EXISTS "public"."ai_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."current_tenant_id"() NOT NULL,
    "created_by" "uuid",
    "processo_id" "uuid",
    "tipo" "text" NOT NULL,
    "input_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_text" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_generations_tipo_check" CHECK (("tipo" = ANY (ARRAY[
        'analise_processo_administrativo'::"text",
        'analise_processo_judicial'::"text",
        'analise_documento'::"text",
        'peticao_inicial'::"text",
        'cumprimento_despacho'::"text",
        'impugnacao_recurso'::"text"
    ]))),
    CONSTRAINT "ai_generations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'error'::"text"])))
);

ALTER TABLE "public"."ai_generations" OWNER TO "postgres";

ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."processes"("id") ON DELETE SET NULL;

CREATE INDEX "idx_ai_generations_tenant" ON "public"."ai_generations" USING "btree" ("tenant_id");

CREATE INDEX "idx_ai_generations_processo" ON "public"."ai_generations" USING "btree" ("processo_id") WHERE ("processo_id" IS NOT NULL);

CREATE INDEX "idx_ai_generations_created_by" ON "public"."ai_generations" USING "btree" ("created_by");

CREATE OR REPLACE TRIGGER "ai_generations_updated_at" BEFORE UPDATE ON "public"."ai_generations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

CREATE OR REPLACE TRIGGER "trg_auto_tenant_ai_generations" BEFORE INSERT ON "public"."ai_generations" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_tenant_id"();

ALTER TABLE "public"."ai_generations" ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de "processes_tenant_isolation" / "clients_tenant_isolation":
-- isolamento total por tenant_id via current_tenant_id(), sem acesso do
-- portal do cliente (is_client_user()) — IA Jurídica é uma ferramenta interna
-- do escritório, não do portal.
CREATE POLICY "ai_generations_tenant_isolation" ON "public"."ai_generations" USING ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"()))) WITH CHECK ((("tenant_id" = "public"."current_tenant_id"()) AND (NOT "public"."is_client_user"())));

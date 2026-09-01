-- IA Jurídica (fase 2, ação extra): adiciona "parecer_juridico" (parecer
-- jurídico) ao conjunto de `tipo` aceitos em ai_generations. Ficou de fora
-- da migration de fundação (20260901013528_ai_generations.sql) por engano —
-- estava no escopo original do pedido. Nova migration em vez de editar a
-- já aplicada/commitada, para não reescrever histórico de migration já
-- rodada no projeto live.

ALTER TABLE "public"."ai_generations"
    DROP CONSTRAINT "ai_generations_tipo_check";

ALTER TABLE "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_tipo_check" CHECK (("tipo" = ANY (ARRAY[
        'analise_processo_administrativo'::"text",
        'analise_processo_judicial'::"text",
        'analise_documento'::"text",
        'peticao_inicial'::"text",
        'cumprimento_despacho'::"text",
        'impugnacao_recurso'::"text",
        'parecer_juridico'::"text"
    ])));

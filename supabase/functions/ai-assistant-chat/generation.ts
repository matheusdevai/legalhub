import type { CallerProfile } from './tools.ts'

// ============================================================================
// Ferramentas de geração do LegalHub Assistente — Chat (milestone 4).
//
// Diferente de tools.ts (consultas somente-leitura direto no banco), estas
// duas ferramentas (gerar_minuta, analisar_documento) NÃO reimplementam
// nenhuma engenharia de prompt: elas invocam a Edge Function
// ai-gemini-assistant via HTTP, servidor-a-servidor, repassando o MESMO
// Bearer token do usuário que chamou o chat — exatamente a chamada que
// src/lib/aiJuridica.ts (runAiGeneration) já faz a partir do frontend para a
// "Excelência". Isso reaproveita 100% da lógica existente (prompt builders em
// ai-gemini-assistant/prompts/*.ts, validação de anexo, rate limit próprio,
// log em ai_generations) sem duplicar nem reescrever nada — e evita depender
// de import entre diretórios de função, que não funciona neste projeto (ver
// comentário no topo de tools.ts).
//
// Diferente das tools de escrita da milestone 3 (que criam registros no
// banco e exigem confirmação do usuário antes de executar), estas duas
// geram texto e não gravam nada — por isso rodam direto, sem fluxo de
// confirmação, igual às 5 tools de consulta da milestone 2.
// ============================================================================

export const GERAR_MINUTA_TIPOS = [
  'peticao_inicial', 'cumprimento_despacho', 'impugnacao_recurso', 'parecer_juridico',
] as const
type GerarMinutaTipo = typeof GERAR_MINUTA_TIPOS[number]

// Teto de tamanho pra qualquer texto livre que entra nestas ferramentas
// (mensagem do chat, contexto de gerar_minuta, texto colado em
// analisar_documento). ai-gemini-assistant/attachmentValidation.ts só cobre o
// anexo (15MB); nada limitava o texto solto até aqui — sem isso um texto
// colado gigante ia inteiro pro Gemini a cada rodada, sem necessidade (o
// modelo já trunca/ignora o que não cabe no contexto, mas o custo de
// tokens/latência é pago mesmo assim). Não há teto equivalente em
// ai-gemini-assistant pra espelhar; 50k caracteres cobre confortavelmente uma
// petição inicial ou decisão longa colada à mão.
export const MAX_TEXT_INPUT_CHARS = 50_000

export const MINUTA_DISCLAIMER =
  'MINUTA PARA REVISÃO DO ADVOGADO — texto gerado por IA. NUNCA deve ser tratada como protocolada ou definitiva: revise, complete os placeholders entre colchetes e valide todo o conteúdo antes de qualquer uso profissional.'

export const ANALISE_DOCUMENTO_DISCLAIMER =
  'Esta análise foi gerada por IA a partir do texto/anexo fornecido. Trechos marcados como "[interpretação da IA]" são leitura/opinião do modelo, não conteúdo literal do documento — revise antes de usar profissionalmente.'

export interface AttachmentInput {
  mime_type: string
  data_base64: string
  filename: string
}

interface AiGeminiAssistantOk { output_text: string }
interface AiGeminiAssistantErr { error: string }

async function invokeAiGeminiAssistant(
  supabaseUrl: string,
  userToken: string,
  body: { tipo: string; processo_id?: string | null; input_context: Record<string, unknown>; attachment?: AttachmentInput },
): Promise<AiGeminiAssistantOk | AiGeminiAssistantErr> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/ai-gemini-assistant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${userToken}` },
      body: JSON.stringify(body),
    })
    const data = await resp.json().catch(() => null) as { output_text?: string; error?: string } | null
    if (!resp.ok || !data || data.error) {
      return { error: (data && data.error) || 'Erro ao gerar conteúdo via IA Jurídica.' }
    }
    if (!data.output_text) return { error: 'A IA retornou uma resposta vazia.' }
    return { output_text: data.output_text }
  } catch (err: unknown) {
    console.error('invokeAiGeminiAssistant error:', err)
    return { error: 'Erro ao chamar a IA Jurídica.' }
  }
}

// --- gerar_minuta -----------------------------------------------------

export async function gerarMinuta(
  supabaseUrl: string,
  userToken: string,
  profile: CallerProfile,
  args: { tipo?: string; contexto?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const tipo = args?.tipo
  if (!tipo || !GERAR_MINUTA_TIPOS.includes(tipo as GerarMinutaTipo)) {
    return { error: `tipo inválido. Valores aceitos: ${GERAR_MINUTA_TIPOS.join(', ')}` }
  }

  const contexto: Record<string, unknown> = { ...(args?.contexto || {}) }
  // Preenche o advogado responsável com o perfil de quem está conversando,
  // se o usuário não tiver informado outro nome na conversa.
  if (!contexto.advogado_nome && profile.name) contexto.advogado_nome = profile.name

  if (JSON.stringify(contexto).length > MAX_TEXT_INPUT_CHARS) {
    return { error: `Contexto muito longo (máx. ${MAX_TEXT_INPUT_CHARS.toLocaleString('pt-BR')} caracteres). Reduza o texto e tente novamente.` }
  }

  const result = await invokeAiGeminiAssistant(supabaseUrl, userToken, {
    tipo,
    input_context: contexto,
  })
  if ('error' in result) return { error: result.error }

  return { aviso: MINUTA_DISCLAIMER, minuta: result.output_text }
}

// --- analisar_documento -------------------------------------------------

export async function analisarDocumento(
  supabaseUrl: string,
  userToken: string,
  args: { texto?: string; titulo?: string },
  attachment: AttachmentInput | null,
): Promise<Record<string, unknown>> {
  const texto = (args?.texto || '').trim()
  if (!texto && !attachment) {
    return { error: 'Nenhum texto de documento ou anexo foi fornecido para análise. Peça ao usuário para colar o texto ou anexar um PDF/imagem.' }
  }
  if (texto.length > MAX_TEXT_INPUT_CHARS) {
    return { error: `Texto muito longo (máx. ${MAX_TEXT_INPUT_CHARS.toLocaleString('pt-BR')} caracteres). Reduza o texto ou envie como anexo.` }
  }

  const result = await invokeAiGeminiAssistant(supabaseUrl, userToken, {
    tipo: 'analise_documento',
    input_context: {
      documento_titulo: args?.titulo || null,
      documento_texto: texto,
    },
    attachment: attachment ?? undefined,
  })
  if ('error' in result) return { error: result.error }

  return { aviso: ANALISE_DOCUMENTO_DISCLAIMER, analise: result.output_text }
}

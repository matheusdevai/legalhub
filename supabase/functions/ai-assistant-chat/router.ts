import type { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  consultarPrazos, consultarTarefas, consultarAgenda, consultarProcessos, consultarClientes,
  type CallerProfile,
} from './tools.ts'
import {
  gerarMinuta, analisarDocumento, GERAR_MINUTA_TIPOS, type AttachmentInput,
} from './generation.ts'

// ============================================================================
// Roteamento de ferramentas do chat (function calling do Gemini) — extraído
// de index.ts pra poder ser testado sem precisar importar Deno.serve/`jsr:`
// runtime (index.ts não roda sob Vitest/Node; ver router.test.ts). index.ts
// continua sendo o único lugar que sabe de HTTP/CORS/auth/rate limit; aqui só
// entra "dado o nome da tool escolhida pelo Gemini e os args, qual função
// chamar e com que assinatura" — o mesmo runTool que o loop de tool-calling
// de index.ts usa de verdade.
// ============================================================================

export const TOOL_DECLARATIONS = [
  {
    name: 'consultar_prazos',
    description: 'Consulta prazos processuais críticos (vencidos ou vencendo hoje) e próximos (até 7 dias) dos processos ativos do escritório.',
    parameters: {
      type: 'object',
      properties: {
        escopo: { type: 'string', enum: ['criticos', 'proximos', 'todos'], description: 'Qual recorte de prazos retornar. Padrão: todos.' },
      },
    },
  },
  {
    name: 'consultar_tarefas',
    description: 'Consulta tarefas pendentes e/ou atrasadas do usuário (ou do escritório, se ele for admin/financeiro/super_admin).',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pendentes', 'atrasadas', 'todas'], description: 'Qual recorte de tarefas retornar. Padrão: todas.' },
      },
    },
  },
  {
    name: 'consultar_agenda',
    description: 'Consulta compromissos da agenda (audiências, reuniões, prazos) de hoje, da semana ou do mês.',
    parameters: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'Janela de tempo a consultar. Padrão: hoje.' },
      },
    },
  },
  {
    name: 'consultar_processos',
    description: 'Consulta processos ativos que exigem atenção (prioridade alta/urgente ou prazo vencido/vencendo hoje).',
    parameters: {
      type: 'object',
      properties: {
        apenas_atencao: { type: 'boolean', description: 'Se true (padrão), retorna só os que exigem atenção; se false, retorna todos os processos ativos.' },
      },
    },
  },
  {
    name: 'consultar_clientes',
    description: 'Busca clientes pelo nome, ou processos por número/título, para responder perguntas sobre um cliente ou caso específico.',
    parameters: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Nome do cliente ou número/parte do título do processo a buscar.' },
      },
      required: ['busca'],
    },
  },
  {
    name: 'gerar_minuta',
    description: 'Gera o TEXTO de uma minuta de peça jurídica (petição inicial, cumprimento de despacho, impugnação/recurso ou parecer jurídico) a partir dos dados que o usuário forneceu na conversa. NUNCA protocola, envia ou salva a peça em lugar nenhum — apenas gera o texto para o usuário revisar. Sempre venha acompanhada do aviso de que é uma minuta para revisão do advogado.',
    parameters: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: [...GERAR_MINUTA_TIPOS],
          description: 'Tipo de peça a gerar: peticao_inicial, cumprimento_despacho, impugnacao_recurso ou parecer_juridico.',
        },
        contexto: {
          type: 'object',
          description:
            'Dados da peça extraídos da conversa, nas chaves esperadas por cada tipo (sempre em português, mesmos nomes de campo do formulário da "Excelência"). ' +
            'peticao_inicial: autor_nome, autor_qualificacao, reu_nome, reu_qualificacao, juizo_comarca, tipo_acao, fatos, fundamentos_adicionais, pedidos_especificos, valor_causa, provas, advogado_nome, advogado_oab, processo_numero. ' +
            'cumprimento_despacho: despacho_texto, providencia (juntada_documentos|manifestacao_laudo|cumprimento_geral|outro), detalhes, documentos_juntados, prazo_info, processo_numero, advogado_nome, advogado_oab. ' +
            'impugnacao_recurso: subtipo (impugnacao_cumprimento_sentenca|apelacao|agravo), decisao_texto, data_ciencia, razoes, preparo_info, processo_numero, advogado_nome, advogado_oab. ' +
            'parecer_juridico: consulente, questao_juridica, fatos_relevantes, posicao_desejada, processo_numero, processo_titulo, area, tipo_acao. ' +
            'Deixe de fora qualquer campo que o usuário não tenha informado — não invente valor.',
        },
      },
      required: ['tipo', 'contexto'],
    },
  },
  {
    name: 'analisar_documento',
    description: 'Analisa um documento jurídico (petição, decisão, contrato, notificação) e devolve resumo executivo, pontos-chave, implicações jurídicas e riscos. Use o texto colado pelo usuário na conversa, ou o anexo enviado junto com a mensagem, se houver. NUNCA grava nada — apenas gera a análise para leitura.',
    parameters: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Texto do documento a analisar, se o usuário colou/descreveu o conteúdo na conversa. Deixe vazio se a análise deve se basear só no anexo enviado.' },
        titulo: { type: 'string', description: 'Título/tipo do documento, se mencionado (ex: "Contrato de honorários", "Decisão interlocutória").' },
      },
    },
  },
] as const

export const TOOL_NAMES = TOOL_DECLARATIONS.map(t => t.name)
export type ToolName = typeof TOOL_NAMES[number]

// gerar_minuta/analisar_documento devolvem o texto final pronto (já com o
// "aviso" de revisão embutido pela própria tool, ver generation.ts) — tratadas
// como terminais no loop de function calling: o resultado é a resposta final
// da rodada, sem voltar pro Gemini resumir/reescrever (ver runChatTurn em
// index.ts).
export const GENERATION_TOOL_NAMES = new Set<ToolName>(['gerar_minuta', 'analisar_documento'])

export interface ChatToolContext {
  supabaseUrl: string
  userToken: string
  attachment: AttachmentInput | null
}

export async function runTool(
  db: ReturnType<typeof createClient>,
  profile: CallerProfile,
  name: ToolName,
  args: Record<string, unknown>,
  ctx: ChatToolContext,
): Promise<unknown> {
  switch (name) {
    case 'consultar_prazos': return consultarPrazos(db, profile, args as any)
    case 'consultar_tarefas': return consultarTarefas(db, profile, args as any)
    case 'consultar_agenda': return consultarAgenda(db, profile, args as any)
    case 'consultar_processos': return consultarProcessos(db, profile, args as any)
    case 'consultar_clientes': return consultarClientes(db, profile, args as any)
    // supabaseUrl/userToken sempre da requisição autenticada atual (nunca de
    // args do modelo) — gerarMinuta/analisarDocumento chamam ai-gemini-assistant
    // com o Bearer do próprio usuário, que resolve tenant/rate limit por conta
    // própria (mesmo padrão de auth de tools.ts, um passo adiante).
    case 'gerar_minuta': return gerarMinuta(ctx.supabaseUrl, ctx.userToken, profile, args as any)
    case 'analisar_documento': return analisarDocumento(ctx.supabaseUrl, ctx.userToken, args as any, ctx.attachment)
    default: {
      const _exhaustive: never = name
      throw new Error(`Ferramenta desconhecida: ${_exhaustive}`)
    }
  }
}

export function formatGenerationAnswer(result: Record<string, unknown>): string {
  if (typeof result.error === 'string') return result.error
  const aviso = typeof result.aviso === 'string' ? result.aviso : null
  const texto = typeof result.minuta === 'string' ? result.minuta : typeof result.analise === 'string' ? result.analise : null
  if (!texto) return 'Não consegui gerar o conteúdo — tente novamente.'
  return aviso ? `${aviso}\n\n${texto}` : texto
}

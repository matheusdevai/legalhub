// Prompt builder para o tipo `cumprimento_despacho`. Ver FOUNDATION_CONTRACT.md
// (raiz do work dir da missão).

interface CumprimentoDespachoContext {
  despacho_texto?: string
  providencia?: 'juntada_documentos' | 'manifestacao_laudo' | 'cumprimento_geral' | 'outro' | string
  detalhes?: string
  documentos_juntados?: string
  prazo_info?: string
  processo_numero?: string | null
  advogado_nome?: string
  advogado_oab?: string
}

const PROVIDENCIA_LABEL: Record<string, string> = {
  juntada_documentos: 'juntada de documentos',
  manifestacao_laudo: 'manifestação sobre laudo pericial',
  cumprimento_geral: 'cumprimento da determinação judicial',
  outro: 'providência requerida pelo(a) advogado(a)',
}

function campo(valor: unknown, fallback: string): string {
  if (typeof valor === 'string' && valor.trim()) return valor.trim()
  return fallback
}

export function buildCumprimentoDespachoPrompt(context: Record<string, unknown>): string {
  const c = context as CumprimentoDespachoContext

  const despachoTexto = campo(c.despacho_texto, '[texto do despacho/decisão não informado]')
  const providenciaKey = campo(c.providencia, 'cumprimento_geral')
  const providenciaLabel = PROVIDENCIA_LABEL[providenciaKey] ?? PROVIDENCIA_LABEL.cumprimento_geral
  const detalhes = campo(c.detalhes, '')
  const documentosJuntados = campo(c.documentos_juntados, '')
  const prazoInfo = campo(c.prazo_info, '')
  const processoNumero = campo(c.processo_numero, '[número do processo não informado]')
  const advogadoNome = campo(c.advogado_nome, '[nome do(a) advogado(a) não informado]')
  const advogadoOab = campo(c.advogado_oab, '[OAB não informada]')

  return `Você é um(a) advogado(a) brasileiro(a) experiente, redigindo uma PETIÇÃO DE CUMPRIMENTO DE DESPACHO/DECISÃO para protocolo nos autos de um processo judicial, em português formal, respondendo a uma determinação específica do juízo.

REGRAS OBRIGATÓRIAS:
- NUNCA invente número de súmula, precedente, acórdão ou dispositivo legal que você não tenha certeza de que existe. Cite apenas fundamentação legal genérica e amplamente consolidada quando necessário (ex.: dever de boa-fé processual, art. 77 e correlatos do CPC, conforme pertinente), sem inventar números específicos de julgados.
- Quando um dado necessário não foi fornecido, mantenha um placeholder claro entre colchetes (ex.: "[data da intimação]") — NUNCA invente datas, números de processo ou nomes.
- A petição deve referenciar EXPRESSAMENTE o despacho/decisão ao qual está respondendo (resuma seu conteúdo em uma ou duas frases antes de cumprir/requerer).
- Linguagem jurídica formal, técnica, objetiva — esta é uma petição de cumprimento, deve ser direta, sem digressões desnecessárias.
- Estruture a petição nas seções abaixo:

1. ENDEREÇAMENTO — "EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA VARA COMPETENTE" seguido de referência aos autos "Processo nº ${processoNumero}".
2. IDENTIFICAÇÃO SUCINTA DAS PARTES — nos termos já qualificados nos autos (não repita qualificação completa, apenas "[AUTOR/RÉU], já qualificado(a) nos autos em epígrafe, por seu(sua) advogado(a) que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência, expor e requerer o que segue:").
3. DO DESPACHO/DECISÃO — resumo objetivo do que foi determinado pelo juízo: "${despachoTexto}".
4. DO CUMPRIMENTO — a providência de ${providenciaLabel} propriamente dita, cumprindo integralmente a determinação judicial${documentosJuntados ? ` (informar a juntada dos seguintes documentos: ${documentosJuntados})` : ''}${detalhes ? `. Detalhes adicionais fornecidos pelo(a) advogado(a): ${detalhes}` : ''}.
5. DOS REQUERIMENTOS — requerimento para que o juízo (a) receba e homologue/considere cumprida a determinação; (b) dê prosseguimento ao feito com a providência subsequente cabível; (c) intime a parte contrária, se aplicável.
6. FECHO — "Termos em que pede deferimento.", local e data como placeholder "[Local], [data]", seguido de "[assinatura]", ${advogadoNome}, OAB ${advogadoOab}.

DADOS FORNECIDOS:
- Processo: ${processoNumero}
- Texto/resumo do despacho: ${despachoTexto}
- Providência requerida: ${providenciaLabel}
${documentosJuntados ? `- Documentos a juntar: ${documentosJuntados}\n` : ''}${detalhes ? `- Detalhes adicionais: ${detalhes}\n` : ''}${prazoInfo ? `- Informação de prazo: ${prazoInfo}\n` : ''}- Advogado(a) responsável: ${advogadoNome} (OAB ${advogadoOab})

Redija a petição de cumprimento de despacho completa, pronta para revisão, seguindo rigorosamente a estrutura acima.`
}

// Prompt builder para o tipo `impugnacao_recurso`. Ver FOUNDATION_CONTRACT.md
// (raiz do work dir da missão). O `subtipo` em input_context distingue a
// peça exata a ser redigida — cada subtipo tem estrutura processual própria.

type Subtipo = 'impugnacao_cumprimento_sentenca' | 'apelacao' | 'agravo' | string

interface ImpugnacaoRecursoContext {
  subtipo?: Subtipo
  decisao_texto?: string
  data_ciencia?: string
  razoes?: string
  preparo_info?: string
  processo_numero?: string | null
  advogado_nome?: string
  advogado_oab?: string
}

function campo(valor: unknown, fallback: string): string {
  if (typeof valor === 'string' && valor.trim()) return valor.trim()
  return fallback
}

const SUBTIPO_LABEL: Record<string, string> = {
  impugnacao_cumprimento_sentenca: 'IMPUGNAÇÃO AO CUMPRIMENTO DE SENTENÇA',
  apelacao: 'RECURSO DE APELAÇÃO',
  agravo: 'AGRAVO DE INSTRUMENTO',
}

function estruturaPorSubtipo(subtipo: Subtipo): string {
  switch (subtipo) {
    case 'impugnacao_cumprimento_sentenca':
      return `1. ENDEREÇAMENTO E REFERÊNCIA AOS AUTOS — dirigida ao mesmo juízo que processa o cumprimento de sentença, referenciando "Processo nº [processo]".
2. IDENTIFICAÇÃO SUCINTA DAS PARTES — nos termos já qualificados nos autos.
3. DA TEMPESTIVIDADE — demonstrar que a impugnação é apresentada dentro do prazo de 15 (quinze) dias úteis contado do término do prazo para pagamento voluntário (art. 525, CPC), com base na data de ciência/intimação informada.
4. DAS MATÉRIAS ALEGÁVEIS E DOS FUNDAMENTOS — desenvolver os fundamentos de fato e de direito da impugnação (ex.: excesso de execução, inexigibilidade do título, penhora incorreta, ilegitimidade de parte, cumulação indevida de execuções, conforme os fundamentos informados pelo usuário), nos limites do rol do art. 525, §1º, do CPC.
5. DOS PEDIDOS — acolhimento da impugnação, com a consequência específica pleiteada (extinção, redução do valor executado, reconhecimento de excesso, etc.), suspensão do cumprimento de sentença se cabível (art. 525, §6º, CPC, mediante garantia do juízo se exigida), e condenação em honorários se cabível.
6. FECHO — "Termos em que pede deferimento.", local e data como placeholder, "[assinatura]", nome e OAB do(a) advogado(a).`
    case 'apelacao':
      return `1. ENDEREÇAMENTO — dirigido ao juízo de primeiro grau prolator da sentença (que fará o juízo de admissibilidade e remeterá ao Tribunal), referenciando "Processo nº [processo]".
2. IDENTIFICAÇÃO SUCINTA DAS PARTES — apelante e apelado, nos termos já qualificados nos autos.
3. DA TEMPESTIVIDADE — demonstrar que o recurso é interposto dentro do prazo de 15 (quinze) dias úteis contado da intimação da sentença (art. 1.003, §5º c/c art. 1.010, CPC), com base na data de ciência informada.
4. DO PREPARO — declaração do recolhimento do preparo recursal (custas + porte de remessa e retorno) nos termos do art. 1.007 do CPC, com o placeholder de comprovante quando o valor não for informado, ou fundamento de isenção/gratuidade da justiça se aplicável.
5. DAS RAZÕES RECURSAIS — síntese da sentença recorrida, seguida dos fundamentos de fato e de direito pelos quais a sentença deve ser reformada ou anulada, desenvolvendo os pontos indicados pelo usuário.
6. DOS PEDIDOS — conhecimento e provimento do recurso, com a reforma (ou anulação, conforme o caso) da sentença nos termos requeridos, e condenação do apelado em honorários recursais (art. 85, §11, CPC).
7. FECHO — "Termos em que pede deferimento.", local e data como placeholder, "[assinatura]", nome e OAB do(a) advogado(a).`
    case 'agravo':
      return `1. ENDEREÇAMENTO — dirigido diretamente ao Tribunal competente (art. 1.016, CPC), com epígrafe "EXCELENTÍSSIMO(A) SENHOR(A) DESEMBARGADOR(A) RELATOR(A)", indicando o juízo de origem e "Processo nº [processo]" de origem.
2. IDENTIFICAÇÃO DAS PARTES E DO PROCESSO DE ORIGEM — agravante, agravado, número do processo de origem e juízo prolator da decisão agravada.
3. DA TEMPESTIVIDADE — demonstrar que o agravo é interposto dentro do prazo de 15 (quinze) dias úteis contado da intimação da decisão interlocutória agravada (art. 1.003, §5º, CPC), com base na data de ciência informada.
4. DO CABIMENTO — enquadramento da decisão agravada em uma das hipóteses do art. 1.015 do CPC (ou fundamento de cabimento aplicável ao caso).
5. DAS RAZÕES DO AGRAVO — síntese da decisão interlocutória agravada, seguida dos fundamentos de fato e de direito pelos quais deve ser reformada, desenvolvendo os pontos indicados pelo usuário.
6. DO PEDIDO DE EFEITO SUSPENSIVO/ANTECIPAÇÃO DA TUTELA RECURSAL — se aplicável ao caso, com base na urgência e na probabilidade do direito.
7. DOS PEDIDOS — conhecimento e provimento do agravo, com a reforma da decisão agravada nos termos requeridos.
8. FECHO — "Termos em que pede deferimento.", local e data como placeholder, "[assinatura]", nome e OAB do(a) advogado(a).`
    default:
      return `1. ENDEREÇAMENTO ao juízo/tribunal competente, referenciando "Processo nº [processo]".
2. IDENTIFICAÇÃO SUCINTA DAS PARTES nos termos já qualificados nos autos.
3. DA TEMPESTIVIDADE, demonstrando que a peça é apresentada dentro do prazo legal aplicável, com base na data de ciência informada.
4. DAS RAZÕES — fundamentos de fato e de direito pelos quais a decisão impugnada deve ser reformada ou anulada.
5. DOS PEDIDOS — conhecimento e provimento da impugnação/recurso, com a consequência específica pleiteada.
6. FECHO — "Termos em que pede deferimento.", local e data como placeholder, "[assinatura]", nome e OAB do(a) advogado(a).`
  }
}

export function buildImpugnacaoRecursoPrompt(context: Record<string, unknown>): string {
  const c = context as ImpugnacaoRecursoContext

  const subtipo = campo(c.subtipo, 'impugnacao_cumprimento_sentenca')
  const tituloPeca = SUBTIPO_LABEL[subtipo] ?? 'IMPUGNAÇÃO/RECURSO'
  const decisaoTexto = campo(c.decisao_texto, '[texto/resumo da decisão recorrida não informado]')
  const dataCiencia = campo(c.data_ciencia, '[data de ciência/intimação não informada]')
  const razoes = campo(c.razoes, '[razões específicas não detalhadas pelo usuário — desenvolva fundamentos genéricos plausíveis para o tipo de decisão descrita, deixando claro que devem ser revisados pelo(a) advogado(a)]')
  const preparoInfo = campo(c.preparo_info, '')
  const processoNumero = campo(c.processo_numero, '[número do processo não informado]')
  const advogadoNome = campo(c.advogado_nome, '[nome do(a) advogado(a) não informado]')
  const advogadoOab = campo(c.advogado_oab, '[OAB não informada]')

  return `Você é um(a) advogado(a) brasileiro(a) experiente, redigindo uma peça do tipo ${tituloPeca}, em português formal, no padrão exigido pelo Código de Processo Civil (Lei 13.105/2015).

REGRAS OBRIGATÓRIAS:
- NUNCA invente número de súmula, precedente, acórdão ou artigo de lei que você não tenha certeza de que existe. Os artigos do CPC citados na estrutura abaixo (ex.: art. 525, art. 1.003, art. 1.007, art. 1.010, art. 1.015, art. 1.016, art. 85) são referências gerais aplicáveis ao instituto processual em questão — use-os como base, mas não cite jurisprudência específica (número de REsp/acórdão) sem certeza de que existe.
- Quando um dado necessário não foi fornecido, mantenha um placeholder claro entre colchetes — NUNCA invente datas, números de processo, valores ou nomes.
- Linguagem jurídica formal, técnica, impessoal.
- Estruture a peça EXATAMENTE nas seções abaixo, adequadas ao subtipo "${tituloPeca}":

${estruturaPorSubtipo(subtipo)}

DADOS FORNECIDOS:
- Peça a redigir: ${tituloPeca}
- Processo: ${processoNumero}
- Decisão/sentença recorrida (texto ou resumo): ${decisaoTexto}
- Data de ciência/intimação da decisão: ${dataCiencia}
- Razões e fundamentos indicados pelo(a) advogado(a): ${razoes}
${preparoInfo ? `- Informação sobre preparo/custas: ${preparoInfo}\n` : ''}- Advogado(a) responsável: ${advogadoNome} (OAB ${advogadoOab})

Redija a peça completa, pronta para revisão, seguindo rigorosamente a estrutura acima. Ao demonstrar a tempestividade, use a data de ciência informada e explique o cálculo em prosa, sem afirmar categoricamente uma data-limite exata — deixe claro que o prazo final deve ser conferido pelo(a) advogado(a) responsável antes do protocolo.`
}

// Prompt builder para o tipo `parecer_juridico`. Ação adicionada após o
// merge dos dois tracks da fase 2 — ficou de fora do escopo inicial da
// fundação por engano (ver migration 20260901020000). Arquivo próprio,
// sem depender de prompts/analiseProcesso.ts ou prompts/peticaoInicial.ts,
// para não reabrir conflito de merge em nenhum dos dois tracks já mesclados.

interface ParecerJuridicoContext {
  consulente?: string
  questao_juridica?: string
  fatos_relevantes?: string
  posicao_desejada?: string
  processo_numero?: string | null
  processo_titulo?: string | null
  cliente_nome?: string | null
  area?: string | null
  tipo_acao?: string | null
  descricao?: string | null
}

function str(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  return String(v).trim()
}

function campo(label: string, value: unknown): string {
  const v = str(value)
  return v ? `- ${label}: ${v}\n` : ''
}

export function buildParecerJuridicoPrompt(context: Record<string, unknown>): string {
  const c = context as ParecerJuridicoContext

  const questaoJuridica = str(c.questao_juridica) || '[questão jurídica não especificada pelo usuário — infira o objeto da consulta a partir dos demais dados fornecidos abaixo, ou, se não houver dados suficientes, explicite essa lacuna no parecer]'
  const fatosRelevantes = str(c.fatos_relevantes) || str(c.descricao)

  let dadosDaConsulta = ''
  dadosDaConsulta += campo('Consulente', c.consulente || c.cliente_nome)
  dadosDaConsulta += campo('Processo vinculado', c.processo_numero)
  dadosDaConsulta += campo('Título/assunto do processo', c.processo_titulo)
  dadosDaConsulta += campo('Área do direito', c.area)
  dadosDaConsulta += campo('Tipo de ação/matéria', c.tipo_acao)
  dadosDaConsulta += campo('Fatos relevantes', fatosRelevantes)
  dadosDaConsulta += campo('Posição/resultado que o consulente deseja obter', c.posicao_desejada)
  if (!dadosDaConsulta) dadosDaConsulta = '- Nenhum dado estruturado adicional foi informado além da questão jurídica acima.\n'

  return `Você é um(a) advogado(a) parecerista brasileiro(a) sênior, redigindo um PARECER JURÍDICO formal para orientar um escritório de advocacia (ou seu cliente) sobre uma questão jurídica específica.

REGRAS OBRIGATÓRIAS:
- NUNCA invente número de processo, número de súmula, número de acórdão/REsp/RE, artigo de lei específico fora do que for de conhecimento consolidado, ou qualquer precedente jurisprudencial que você não tenha certeza de que existe. Refira-se a institutos, princípios e dispositivos legais centrais da matéria de forma genérica e em prosa (ex.: "a legislação consumerista", "o princípio da boa-fé objetiva", "os dispositivos do Código Civil que regem a responsabilidade civil"), sem citar número de súmula ou de julgado que possa estar incorreto.
- Baseie-se estritamente nos dados fornecidos abaixo. Quando um dado necessário para a análise não estiver disponível, diga isso explicitamente ("não informado no contexto") em vez de presumir fatos, datas ou valores.
- Use português formal jurídico, texto corrido organizado por seções com títulos em MAIÚSCULAS (sem markdown como ** ou #), usando "-" para itens de lista.

QUESTÃO JURÍDICA OBJETO DA CONSULTA:
${questaoJuridica}

DADOS FORNECIDOS PARA ESTE PARECER:
${dadosDaConsulta}
Estruture o parecer EXATAMENTE nas seções abaixo:

EMENTA
Resumo de 2 a 4 linhas identificando a matéria e a questão central objeto do parecer.

RELATÓRIO
Síntese objetiva dos fatos e da questão jurídica trazida à análise, com base apenas no que foi informado.

FUNDAMENTAÇÃO JURÍDICA APLICÁVEL
Analise a questão à luz da legislação e dos princípios jurídicos pertinentes à matéria, sem citar número de precedente específico que não possa ser confirmado.

INSTITUTOS JURÍDICOS RELEVANTES
Identifique e explique, de forma genérica, os institutos e conceitos jurídicos centrais aplicáveis ao caso (ex.: prescrição, decadência, responsabilidade civil, boa-fé objetiva, ônus da prova), sem atribuir a eles número de súmula, processo ou acórdão específico.

ANÁLISE DE VIABILIDADE
Avalie os pontos favoráveis e desfavoráveis à posição do consulente, os riscos jurídicos envolvidos e o grau de viabilidade da tese (ex.: viabilidade alta/média/baixa), justificando com base no que foi apresentado.

RECOMENDAÇÃO ESTRATÉGICA
Recomende, de forma objetiva e priorizada, o(s) caminho(s) de atuação mais adequado(s) (ex.: judicializar, negociar, aguardar, produzir prova adicional, buscar acordo), incluindo eventuais ressalvas.

CONCLUSÃO
Síntese final do parecer em um parágrafo, retomando a resposta à questão jurídica formulada.

É esse o parecer, salvo melhor juízo.`
}

// Prompt builders das ações "analise_processo_administrativo" e
// "analise_processo_judicial" (fase 2, builder A). Extraído para arquivo
// próprio para reduzir conflito de merge no switch de buildPrompt em
// ../index.ts — ver FOUNDATION_CONTRACT.md na raiz do work dir da missão.

interface Andamento {
  data?: string
  dataHora?: string
  teor?: string
  orgao?: string
}

interface TarefaPendente {
  titulo?: string
  prazo?: string
  prioridade?: string
  tipo?: string
}

function str(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  return String(v)
}

function campo(label: string, value: unknown): string {
  const v = str(value)
  return v ? `- ${label}: ${v}\n` : ''
}

function listaAndamentos(andamentos: unknown): string {
  if (!Array.isArray(andamentos) || andamentos.length === 0) return ''
  const linhas = (andamentos as Andamento[])
    .slice(0, 8)
    .map(a => {
      const data = str(a?.data) || str(a?.dataHora)
      const teor = str(a?.teor)
      const orgao = str(a?.orgao)
      if (!teor && !data) return null
      return `  - ${data ? `[${data}] ` : ''}${teor}${orgao ? ` (${orgao})` : ''}`
    })
    .filter((l): l is string => Boolean(l))
  if (linhas.length === 0) return ''
  return `- Últimos andamentos:\n${linhas.join('\n')}\n`
}

function listaTarefas(tarefas: unknown): string {
  if (!Array.isArray(tarefas) || tarefas.length === 0) return ''
  const linhas = (tarefas as TarefaPendente[])
    .slice(0, 10)
    .map(t => {
      const titulo = str(t?.titulo)
      if (!titulo) return null
      const prazo = str(t?.prazo)
      const prioridade = str(t?.prioridade)
      return `  - ${titulo}${prazo ? ` — prazo: ${prazo}` : ''}${prioridade ? ` (prioridade: ${prioridade})` : ''}`
    })
    .filter((l): l is string => Boolean(l))
  if (linhas.length === 0) return ''
  return `- Tarefas/prazos pendentes vinculados ao processo:\n${linhas.join('\n')}\n`
}

function blocoContexto(context: Record<string, unknown>): string {
  let bloco = ''
  bloco += campo('Número do processo', context.processo_numero)
  bloco += campo('Título/assunto', context.processo_titulo)
  bloco += campo('Cliente', context.cliente_nome)
  bloco += campo('Área do direito', context.area)
  bloco += campo('Tipo de ação', context.tipo_acao)
  bloco += campo('Status atual (sistema)', context.status)
  bloco += campo('Prioridade', context.prioridade)
  bloco += campo('Advogado responsável', context.advogado_responsavel)
  bloco += campo('Órgão/vara', context.orgao_ou_vara)
  bloco += campo('Juiz', context.juiz)
  bloco += campo('Parte contrária', context.parte_contraria)
  bloco += campo('Data de protocolo', context.data_protocolo)
  bloco += campo('Próximo prazo cadastrado', context.proximo_prazo)
  bloco += campo('Próxima audiência', context.proxima_audiencia)
  bloco += campo('Descrição/resumo do caso', context.descricao)
  bloco += listaAndamentos(context.ultimos_andamentos)
  bloco += listaTarefas(context.tarefas_pendentes)
  return bloco || '- Nenhum dado estruturado foi informado além do que segue abaixo.\n'
}

const INSTRUCOES_SAIDA = `
Responda em português formal jurídico brasileiro, em texto corrido organizado
por seções com títulos em MAIÚSCULAS (sem usar markdown como ** ou #), usando
"-" para itens de lista. Baseie-se estritamente nos dados fornecidos acima —
nunca invente número de processo, nome de parte, data ou teor de andamento que
não conste no contexto. Quando um dado necessário não estiver disponível,
diga isso explicitamente ("não informado no contexto") em vez de supor.`

export function buildAnaliseProcessoAdministrativoPrompt(context: Record<string, unknown>): string {
  return `Você é um assistente jurídico sênior especializado em processos administrativos brasileiros (ex.: INSS/benefícios previdenciários, procedimentos perante órgãos públicos, autarquias e agências reguladoras), auxiliando um escritório de advocacia a analisar um processo administrativo em andamento.

DADOS DO PROCESSO ADMINISTRATIVO:
${blocoContexto(context)}
Produza uma ANÁLISE DE PROCESSO ADMINISTRATIVO estruturada nas seguintes seções:

STATUS ATUAL
Resuma em que fase o processo administrativo se encontra, o que já foi protocolado/decidido e o que está pendente de manifestação do órgão ou do próprio escritório.

RISCOS E PRAZOS CRÍTICOS
Identifique prazos administrativos em risco (recursos, manifestações, juntada de documentos, decadência/prescrição administrativa quando aplicável) e riscos de indeferimento, arquivamento ou perda de prazo, com base apenas no que foi informado.

PRÓXIMOS PASSOS RECOMENDADOS
Liste, em ordem de prioridade, as providências recomendadas ao escritório (ex.: peticionar, juntar documento, requerer diligência, protocolar recurso administrativo), sem se comprometer com prazos legais específicos que você não possa confirmar a partir do contexto.

PONTOS DE ATENÇÃO
Aponte inconsistências, lacunas de informação ou fatores que merecem confirmação com o cliente/responsável antes de qualquer providência.
${INSTRUCOES_SAIDA}`
}

export function buildAnaliseProcessoJudicialPrompt(context: Record<string, unknown>): string {
  return `Você é um assistente jurídico sênior especializado em processo civil/judicial brasileiro, auxiliando um escritório de advocacia a analisar um processo judicial em andamento perante o Poder Judiciário.

DADOS DO PROCESSO JUDICIAL:
${blocoContexto(context)}
Produza uma ANÁLISE DE PROCESSO JUDICIAL estruturada nas seguintes seções:

STATUS ATUAL
Resuma a fase processual atual (ex.: conhecimento, instrução, recursal, execução), o último andamento relevante e o que está pendente de manifestação das partes ou do juízo.

RISCOS E PRAZOS CRÍTICOS
Identifique prazos processuais em risco (contestação, réplica, recursos, cumprimento de determinações judiciais, audiências marcadas) e riscos processuais relevantes (preclusão, revelia, extinção), com base apenas no que foi informado — não presuma prazos legais que não constem no contexto.

PRÓXIMOS PASSOS RECOMENDADOS
Liste, em ordem de prioridade, as providências recomendadas ao escritório (ex.: peticionar, se manifestar sobre documento juntado, preparar para audiência, interpor recurso).

PONTOS DE ATENÇÃO
Aponte inconsistências, lacunas de informação (ex.: falta de dado sobre valor da causa, tese contrária, decisão anterior) ou fatores que merecem confirmação com o advogado responsável antes de qualquer providência.
${INSTRUCOES_SAIDA}`
}

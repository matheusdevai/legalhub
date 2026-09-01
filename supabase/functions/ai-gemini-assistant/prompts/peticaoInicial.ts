// Prompt builder para o tipo `peticao_inicial`. Ver FOUNDATION_CONTRACT.md
// (raiz do work dir da missão) — cada builder da fase 2 tem seu(s) próprio(s)
// arquivo(s) em prompts/ para minimizar conflito de merge em index.ts.

interface PeticaoInicialContext {
  autor_nome?: string
  autor_qualificacao?: string
  reu_nome?: string
  reu_qualificacao?: string
  juizo_comarca?: string
  tipo_acao?: string
  fatos?: string
  fundamentos_adicionais?: string
  pedidos_especificos?: string
  valor_causa?: string
  provas?: string
  advogado_nome?: string
  advogado_oab?: string
  processo_numero?: string | null
  cliente?: string | null
  area?: string | null
}

function campo(valor: unknown, fallback: string): string {
  if (typeof valor === 'string' && valor.trim()) return valor.trim()
  return fallback
}

export function buildPeticaoInicialPrompt(context: Record<string, unknown>): string {
  const c = context as PeticaoInicialContext

  const autorNome = campo(c.autor_nome, campo(c.cliente, '[NOME DO AUTOR NÃO INFORMADO]'))
  const autorQualificacao = campo(c.autor_qualificacao, '[qualificação completa do autor não informada pelo usuário — mantenha um placeholder claro entre colchetes no texto final, ex: "[qualificação completa: nacionalidade, estado civil, profissão, RG, CPF, endereço]"]')
  const reuNome = campo(c.reu_nome, '[NOME DO RÉU NÃO INFORMADO]')
  const reuQualificacao = campo(c.reu_qualificacao, '[qualificação completa do réu não informada — mantenha placeholder claro entre colchetes]')
  const juizo = campo(c.juizo_comarca, '[Comarca/Juízo competente não informado — mantenha placeholder claro]')
  const tipoAcao = campo(c.tipo_acao, campo(c.area, '[tipo de ação não informado]'))
  const fatos = campo(c.fatos, '[fatos não informados pelo usuário]')
  const fundamentosAdicionais = campo(c.fundamentos_adicionais, '')
  const pedidosEspecificos = campo(c.pedidos_especificos, '')
  const valorCausa = campo(c.valor_causa, '[valor da causa não informado]')
  const provas = campo(c.provas, 'documental, testemunhal e demais provas admitidas em direito')
  const advogadoNome = campo(c.advogado_nome, '[nome do(a) advogado(a) não informado]')
  const advogadoOab = campo(c.advogado_oab, '[OAB não informada]')
  const processoNumero = campo(c.processo_numero, '')

  return `Você é um(a) advogado(a) brasileiro(a) experiente, redigindo uma PETIÇÃO INICIAL para protocolo em processo judicial, em português formal, no padrão exigido pelo Código de Processo Civil (Lei 13.105/2015).

REGRAS OBRIGATÓRIAS:
- NUNCA invente número de processo, número de súmula, número de lei específica de artigo, precedente ou jurisprudência que você não tenha certeza de que existe. Se for citar fundamentação legal, use apenas dispositivos legais amplamente consolidados e genéricos aplicáveis ao caso (ex: princípios e artigos centrais do CPC, CC, CDC conforme a matéria) SEM inventar número de acórdão/REsp/súmula específico. Se não tiver certeza sobre um número exato, descreva o fundamento em prosa em vez de citar um número que pode estar errado.
- Quando um dado necessário não foi fornecido pelo usuário, mantenha um placeholder claro entre colchetes (ex.: "[CPF do autor]") no texto final — NUNCA invente CPF, RG, endereço, datas ou valores.
- Use linguagem jurídica formal, técnica, impessoal, em terceira pessoa.
- Estruture a petição EXATAMENTE nas seções abaixo, com títulos em caixa alta/negrito conforme o padrão forense:

1. ENDEREÇAMENTO — "EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA [VARA] DA COMARCA DE ${juizo}" (ajuste conforme a competência aplicável ao caso).
2. QUALIFICAÇÃO DAS PARTES — autor e réu, completa, seguida de breve introdução do tipo de ação ("vem, respeitosamente, à presença de Vossa Excelência, propor a presente AÇÃO DE ${tipoAcao.toUpperCase()} em face de [réu], pelos fatos e fundamentos a seguir expostos:").
3. DOS FATOS — narrativa clara, cronológica e objetiva dos fatos fornecidos.
4. DO DIREITO — fundamentação jurídica aplicável à matéria (${tipoAcao}), correlacionando os fatos narrados aos institutos jurídicos pertinentes, SEM números de precedentes inventados.
5. DOS PEDIDOS — lista numerada incluindo, no mínimo: (a) citação do réu para, querendo, apresentar contestação, sob pena de revelia; (b) os pedidos de mérito específicos do caso; (c) produção de provas (${provas}); (d) condenação do réu ao pagamento das custas processuais e honorários advocatícios; (e) requerimento de procedência total dos pedidos.
6. DO VALOR DA CAUSA — "Dá-se à causa o valor de ${valorCausa}, nos termos do art. 292 do CPC."
7. FECHO — local e data (use "[Local], [data]" como placeholder), seguido de "[assinatura]", nome do(a) advogado(a) e número da OAB.

DADOS FORNECIDOS PARA ESTA PETIÇÃO:
- Autor: ${autorNome}
- Qualificação do autor: ${autorQualificacao}
- Réu: ${reuNome}
- Qualificação do réu: ${reuQualificacao}
- Juízo/Comarca: ${juizo}
- Tipo de ação: ${tipoAcao}
- Fatos: ${fatos}
${fundamentosAdicionais ? `- Fundamentos jurídicos que o(a) advogado(a) deseja destacar: ${fundamentosAdicionais}\n` : ''}${pedidosEspecificos ? `- Pedidos específicos adicionais: ${pedidosEspecificos}\n` : ''}- Valor da causa: ${valorCausa}
- Provas a produzir: ${provas}
- Advogado(a) responsável: ${advogadoNome} (OAB ${advogadoOab})
${processoNumero ? `- Processo/pasta interna vinculado: ${processoNumero}\n` : ''}
Redija a petição inicial completa, pronta para revisão, seguindo rigorosamente a estrutura acima.`
}

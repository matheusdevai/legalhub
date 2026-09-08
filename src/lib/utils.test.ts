import { describe, it, expect } from 'vitest'
import { computeMonthlyChangePercent, sanitizeFileName, GRUPOS_ACAO, AREA_PREVIDENCIARIO } from './utils'

describe('computeMonthlyChangePercent', () => {
  it('calcula a variação percentual normal entre dois meses', () => {
    expect(computeMonthlyChangePercent(15, 10)).toBe(50)
    expect(computeMonthlyChangePercent(5, 10)).toBe(-50)
  })

  it('arredonda o resultado', () => {
    expect(computeMonthlyChangePercent(7, 3)).toBe(133)
  })

  it('sem mudança retorna 0%', () => {
    expect(computeMonthlyChangePercent(10, 10)).toBe(0)
  })

  it('sem mês anterior (0) mas com produção este mês, considera +100%', () => {
    expect(computeMonthlyChangePercent(5, 0)).toBe(100)
  })

  it('sem mês anterior e sem produção este mês, considera 0%', () => {
    expect(computeMonthlyChangePercent(0, 0)).toBe(0)
  })
})

describe('sanitizeFileName', () => {
  it('remove acentos preservando o resto do nome e a extensão', () => {
    expect(sanitizeFileName('Procuração.pdf')).toBe('Procuracao.pdf')
    expect(sanitizeFileName('Contestação Final.docx')).toBe('Contestacao_Final.docx')
  })

  it('troca espaços e caracteres especiais por underscore', () => {
    expect(sanitizeFileName('petição (rascunho) #1.pdf')).toBe('peticao_rascunho_1.pdf')
  })

  it('mantém nomes já seguros intactos', () => {
    expect(sanitizeFileName('relatorio-2026_v2.xlsx')).toBe('relatorio-2026_v2.xlsx')
  })
})

// GRUPOS_ACAO é a única fonte de verdade compartilhada pelos <select> fechados de
// ClientsPage (Área do Direito), ProcessesPage e TasksPage (Grupo de ação) — antes
// desses campos serem select fechado, cada tela tinha sua própria lista de sugestões
// em texto livre, que acumulava variantes/erros de digitação da mesma área pra
// sempre (bug reportado: "Direito Previdenciário" duplicado com 4 grafias). Estes
// testes existem pra pegar cedo qualquer edição futura que dessincronize a lista
// (ex: item removido/renomeado sem atualizar as três telas).
describe('GRUPOS_ACAO / AREA_PREVIDENCIARIO', () => {
  it('não tem itens duplicados', () => {
    expect(new Set(GRUPOS_ACAO).size).toBe(GRUPOS_ACAO.length)
  })

  it('inclui "Outro" como opção de escape', () => {
    expect(GRUPOS_ACAO).toContain('Outro')
  })

  it('inclui "Consumidor" — área legítima já usada antes do select fechado, mantida pra não perder granularidade', () => {
    expect(GRUPOS_ACAO).toContain('Consumidor')
  })

  it('AREA_PREVIDENCIARIO é exatamente um dos valores de GRUPOS_ACAO', () => {
    expect(GRUPOS_ACAO).toContain(AREA_PREVIDENCIARIO)
    expect(AREA_PREVIDENCIARIO).toBe('Previdenciário')
  })
})

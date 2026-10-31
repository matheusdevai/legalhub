import { describe, expect, it } from 'vitest'
import { parseAiSuggestion, suggestFromText, wordsToNumber } from './suggest'

describe('wordsToNumber', () => {
  it('lê números por extenso usados em prazos', () => {
    expect(wordsToNumber('quinze')).toBe(15)
    expect(wordsToNumber('Três')).toBe(3)
    expect(wordsToNumber('trinta e cinco')).toBe(35)
    expect(wordsToNumber('10')).toBe(10)
    expect(wordsToNumber('vários')).toBeNull()
  })
})

describe('suggestFromText', () => {
  it('ato e prazo escritos e iguais ao legal: confiança alta', () => {
    const s = suggestFromText('Fica a parte autora intimada para, no prazo de 15 (quinze) dias, apresentar réplica à contestação.')
    expect(s).toMatchObject({ actType: 'Réplica', amount: 15, unit: 'dias_uteis', confidence: 'alta' })
    expect(s.evidence.join(' ')).toContain('réplica')
  })

  it('número só por extenso', () => {
    const s = suggestFromText('Intime-se o réu para, no prazo de cinco dias, opor embargos de declaração, querendo.')
    expect(s).toMatchObject({ actType: 'Embargos de declaração', amount: 5, confidence: 'alta' })
  })

  it('sem prazo escrito: sugere o legal e avisa', () => {
    const s = suggestFromText('Cite-se a parte ré para apresentar contestação.')
    expect(s).toMatchObject({ actType: 'Contestação', amount: 15, confidence: 'media' })
    expect(s.notes.join(' ')).toContain('CPC, art. 335')
  })

  it('prazo do juiz diferente do legal: mantém o escrito e avisa', () => {
    const s = suggestFromText('Concedo à parte ré o prazo de 30 (trinta) dias para contestar, dada a complexidade.')
    expect(s).toMatchObject({ actType: 'Contestação', amount: 30, confidence: 'media' })
    expect(s.notes.join(' ')).toMatch(/diferente do prazo legal/)
  })

  it('regime muda o prazo legal (recurso ordinário trabalhista: 8 dias)', () => {
    expect(suggestFromText('Publicada a sentença, intimem-se as partes para, querendo, interpor recurso ordinário.', { regime: 'trabalhista' }).amount).toBe(8)
    expect(suggestFromText('Intime-se o recorrido para contrarrazões.', { regime: 'juizado' }).amount).toBe(10)
  })

  it('contrarrazões não é confundido com apelação', () => {
    expect(suggestFromText('Intime-se o apelado para apresentar contrarrazões de apelação no prazo legal.').actType).toBe('Contrarrazões')
  })

  it('dias corridos e meses', () => {
    expect(suggestFromText('Apresente recurso administrativo em 30 (trinta) dias corridos.').unit).toBe('dias_corridos')
    expect(suggestFromText('Suspendo o processo pelo prazo de 6 (seis) meses.').unit).toBe('meses')
  })

  it('prazo em horas e mais de um prazo: confiança baixa', () => {
    const h = suggestFromText('Manifeste-se a parte em 48 (quarenta e oito) horas.')
    expect(h.confidence).toBe('baixa')
    expect(h.notes.join(' ')).toContain('horas')
    const two = suggestFromText('Prazo de 15 dias para a autora e prazo de 10 dias para o Ministério Público se manifestarem.')
    expect(two.confidence).toBe('baixa')
    expect(two.amount).toBeNull()
  })

  it('avisa sobre prazo em dobro', () => {
    expect(suggestFromText('Intime-se a Fazenda Pública para contestar.').notes.join(' ')).toContain('em dobro')
  })

  it('texto sem nada reconhecível', () => {
    expect(suggestFromText('Juntada de petição.')).toMatchObject({ actType: null, amount: null, confidence: 'baixa' })
    expect(suggestFromText('').notes[0]).toContain('Sem texto')
  })

  it('"dar ciência" sozinho não vira prazo de manifestação', () => {
    expect(suggestFromText('Dê-se ciência às partes do retorno dos autos.').actType).toBeNull()
  })
})

describe('parseAiSuggestion', () => {
  const text = 'Fica a parte autora intimada para, no prazo de 15 (quinze) dias, apresentar réplica.'
  it('aceita resposta válida, com trecho que existe no texto, e nunca dá confiança alta', () => {
    const s = parseAiSuggestion('```json\n{"ato":"Réplica","prazo":15,"unidade":"dias_uteis","trecho":"no prazo de 15 (quinze) dias, apresentar réplica","observacoes":[]}\n```', text)
    expect(s).toMatchObject({ actType: 'Réplica', amount: 15, unit: 'dias_uteis', confidence: 'media' })
    expect(s.evidence).toHaveLength(1)
  })
  it('descarta trecho inventado e unidade inválida', () => {
    const s = parseAiSuggestion('{"ato":"Réplica","prazo":15,"unidade":"semanas","trecho":"prazo de quinze dias para tréplica","observacoes":["x"]}', text)
    expect(s.amount).toBeNull()
    expect(s.evidence).toHaveLength(0)
    expect(s.confidence).toBe('baixa')
    expect(s.notes.join(' ')).toContain('não aparece literalmente')
  })
  it('resposta ilegível', () => {
    expect(parseAiSuggestion('não sei', text).notes[0]).toContain('não devolveu')
  })
})

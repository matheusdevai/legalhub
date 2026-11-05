import { describe, expect, it } from 'vitest'
import {
  calcIntimacaoPrazo, canAssignTaskTo, countyFromOrgan, courtOfIntimacao, intimacaoDate,
  intimacaoRef, intimacaoTaskDescription, suggestRegime,
} from './intimacaoPrazo'
import { calendarForProcess, type CourtCalendarRow } from './deadlines/courtCalendar'

describe('data da intimação', () => {
  it('data pura do DJEN fica como está', () => {
    expect(intimacaoDate('2026-10-20')).toBe('2026-10-20')
  })
  it('data com hora em UTC vira o dia de Brasília (01h UTC = 22h do dia anterior)', () => {
    expect(intimacaoDate('2026-10-20T01:00:00.000Z')).toBe('2026-10-19')
    expect(intimacaoDate('2026-10-20T15:00:00.000Z')).toBe('2026-10-20')
  })
  it('vazio/ inválido', () => {
    expect(intimacaoDate(null)).toBeNull()
    expect(intimacaoDate('ontem')).toBeNull()
  })
})

describe('tribunal da intimação', () => {
  it('usa a sigla do DJEN e, sem ela, o número CNJ', () => {
    expect(courtOfIntimacao('TRT13', null)).toBe('trt13')
    expect(courtOfIntimacao(null, '0800071-75.2025.8.15.0041')).toBe('tjpb')
    expect(courtOfIntimacao('', '00035530620264058201')).toBe('trf5')
  })
})

describe('regime sugerido — não há regra única para todo prazo', () => {
  it('Justiça do Trabalho → CLT', () => {
    expect(suggestRegime({ court: 'trt13', organ: '4ª Vara do Trabalho de João Pessoa' }).regime).toBe('trabalhista')
    expect(suggestRegime({ court: 'tst' }).regime).toBe('trabalhista')
  })
  it('órgão/classe criminal → CPP (dias corridos)', () => {
    expect(suggestRegime({ court: 'tjpb', organ: '2ª Vara Criminal da Capital' }).regime).toBe('penal')
    expect(suggestRegime({ court: 'tjpb', organ: 'Vara Única', classe: 'AÇÃO PENAL - PROCEDIMENTO ORDINÁRIO' }).regime).toBe('penal')
    expect(suggestRegime({ court: 'tjpb', organ: 'Juizado de Violência Doméstica' }).regime).toBe('penal')
  })
  it('juizado cível/federal → Lei 9.099 / 10.259', () => {
    expect(suggestRegime({ court: 'tjpb', organ: '1º Juizado Especial Cível de Campina Grande' }).regime).toBe('juizado')
    const jef = suggestRegime({ court: 'trf5', organ: '7ª Vara Federal (Juizado Especial Federal)' })
    expect(jef.regime).toBe('juizado')
    expect(jef.reason).toMatch(/10\.259/)
  })
  it('resto → CPC', () => {
    expect(suggestRegime({ court: 'tjpe', organ: '3ª Vara Cível do Recife' }).regime).toBe('civel')
    expect(suggestRegime({}).regime).toBe('civel')
  })
})

describe('comarca pelo nome do órgão', () => {
  it.each([
    ['4ª Vara do Trabalho de João Pessoa', 'João Pessoa'],
    ['Vara Única de Alagoa Nova', 'Alagoa Nova'],
    ['1º Juizado Especial Cível da Comarca de Campina Grande', 'Campina Grande'],
    ['Vara do Trabalho de Catolé do Rocha', 'Catolé do Rocha'],
    ['04ª VARA DO TRABALHO DE SÃO JOSÉ DOS PINHAIS', 'SÃO JOSÉ DOS PINHAIS'],
  ])('%s → %s', (organ, county) => {
    expect(countyFromOrgan(organ)).toBe(county)
  })
  it('sem município reconhecível → null (sem feriado local = data mais cedo)', () => {
    expect(countyFromOrgan('Vara de Família')).toBeNull()
    expect(countyFromOrgan('')).toBeNull()
  })
})

describe('cálculo ponta a ponta (motor + calendário do tribunal)', () => {
  const rows: CourtCalendarRow[] = [
    { scope: 'court', court: 'trt13', county: 'Patos', date_from: '2026-11-11', date_to: '2026-11-11', kind: 'holiday', label: 'Feriado municipal de Patos', source_ref: 'Ato TRT13', version: 1 },
  ]

  it('feriado municipal só vale para a comarca dele', () => {
    const base = { disponibilizacao: '2026-11-05', regime: 'trabalhista' as const, amount: 5, unit: 'dias_uteis' as const, doubled: false, applyRecess: true, internalMarginDays: 2 }
    // publicação 06/11 · 09, 10, 11, 12, 13
    const jp = calcIntimacaoPrazo({ ...base, calendar: calendarForProcess(rows, { court: 'trt13', county: countyFromOrgan('1ª Vara do Trabalho de João Pessoa') }) })
    expect(jp.result?.fatalDate).toBe('2026-11-13')
    // Patos: 11/11 não conta → 16/11
    const patos = calcIntimacaoPrazo({ ...base, calendar: calendarForProcess(rows, { court: 'trt13', county: countyFromOrgan('Vara do Trabalho de Patos') }) })
    expect(patos.result?.fatalDate).toBe('2026-11-16')
  })

  it('15 dias úteis (CPC) contados da PUBLICAÇÃO, não da disponibilização', () => {
    // Disponibilizado qua 04/11 → publicado qui 05/11 → conta de sex 06/11.
    // 06 (1) · 09–13 (6) · 16–19 (10) · 20 feriado · 23–27 (15) → 27/11
    const r = calcIntimacaoPrazo({ disponibilizacao: '2026-11-04', regime: 'civel', amount: 15, unit: 'dias_uteis', doubled: false, applyRecess: true, internalMarginDays: 2, calendar: [] })
    expect(r.result?.referenceDate).toBe('2026-11-05')
    expect(r.result?.startDate).toBe('2026-11-06')
    expect(r.result?.fatalDate).toBe('2026-11-27')
    expect(r.result?.internalDate).toBe('2026-11-25')
  })

  it('prazo em dobro (Fazenda, CPC art. 183)', () => {
    const r = calcIntimacaoPrazo({ disponibilizacao: '2026-11-04', regime: 'civel', amount: 15, unit: 'dias_uteis', doubled: true, applyRecess: true, internalMarginDays: 2, calendar: [] })
    expect(r.result?.amount).toBe(30)
  })

  it('penal: 5 dias corridos, vencendo no sábado prorroga para segunda', () => {
    // Disponibilizado seg 09/11 → publicado ter 10/11 → 11,12,13,14 (sáb) ... 5º = dom 15/11 (feriado) → seg 16/11
    const r = calcIntimacaoPrazo({ disponibilizacao: '2026-11-09', regime: 'penal', amount: 5, unit: 'dias_corridos', doubled: false, applyRecess: true, internalMarginDays: 0, calendar: [] })
    expect(r.result?.fatalDate).toBe('2026-11-16')
  })

  it('data inválida devolve erro, não uma data inventada', () => {
    const r = calcIntimacaoPrazo({ disponibilizacao: '2026-02-30', regime: 'civel', amount: 5, unit: 'dias_uteis', doubled: false, applyRecess: true, internalMarginDays: 2, calendar: [] })
    expect(r.result).toBeNull()
    expect(r.error).toMatch(/inválida/)
  })

  it('a descrição registra publicação, início, fatal e interno', () => {
    const r = calcIntimacaoPrazo({ disponibilizacao: '2026-11-04', regime: 'civel', amount: 15, unit: 'dias_uteis', doubled: false, applyRecess: true, internalMarginDays: 2, calendar: [] }).result!
    const d = intimacaoTaskDescription({ tribunal: 'TJPB', result: r, regimeLabel: 'Cível', amount: 15, unit: 'dias_uteis', doubled: false })
    expect(d).toMatch(/disponibilizada no DJEN em 04\/11\/2026/)
    expect(d).toMatch(/Publicação: 05\/11\/2026 · início da contagem: 06\/11\/2026/)
    expect(d).toMatch(/FATAL: 27\/11\/2026 · prazo interno: 25\/11\/2026/)
  })
})

describe('chave da intimação e permissões', () => {
  it('chave estável pelo id do DJEN', () => {
    expect(intimacaoRef('p1', { idComunicacao: 761663256 }, 3)).toBe('djen:761663256')
    expect(intimacaoRef('p1', { hash: 'abc' }, 3)).toBe('djen:h:abc')
    expect(intimacaoRef('p1', {}, 3)).toBe('mov:p1:3')
  })

  it('admin/advogado atribuem a qualquer um; estagiário/financeiro só a si; cliente nunca', () => {
    expect(canAssignTaskTo('admin', 'a', 'b')).toBe(true)
    expect(canAssignTaskTo('lawyer', 'a', 'b')).toBe(true)
    expect(canAssignTaskTo('intern', 'a', 'b')).toBe(false)
    expect(canAssignTaskTo('intern', 'a', 'a')).toBe(true)
    expect(canAssignTaskTo('financial', 'a', 'a')).toBe(true)
    expect(canAssignTaskTo('client', 'a', 'a')).toBe(false)
    expect(canAssignTaskTo(null, 'a', 'a')).toBe(false)
  })
})
